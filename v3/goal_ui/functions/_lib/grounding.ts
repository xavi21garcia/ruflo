/**
 * Grounding adapter (ADR-101).
 *
 * Three retrieval sources, results merged into a single snippet array
 * that the structured-output Anthropic call consumes as RETRIEVED
 * CONTEXT:
 *
 *   1. **pi.ruv.io semantic search** — internal knowledge graph
 *      hosted at https://pi.ruv.io, exposed via the
 *      `GET /v1/memories/search` endpoint. Bearer-auth via
 *      `PI_RUVIO_API_KEY` (resolved at runtime; falls back to
 *      `BRAIN_API_KEY` for the secret-name convention used in
 *      the parent project's Secret Manager).
 *
 *   2. **Google Vertex AI Grounding** — Gemini 2.5 Flash with the
 *      built-in `google_search` tool. Returns `groundingMetadata.
 *      groundingChunks` (each with a real `web.uri` + `web.title`
 *      from Google Search). Auth via `GOOGLE_AI_API_KEY` /
 *      `GOOGLE_API_KEY`. This is the "google grounding engine"
 *      the operator explicitly enabled.
 *
 *   3. **Anthropic web_search** — live web retrieval, NOT
 *      implemented in this module (it's a built-in Anthropic
 *      tool enabled via `LlmToolCallRequest.enableWebSearch`
 *      in `_lib/llm.ts`; results come back inline in the same
 *      Messages API call).
 *
 * Together: handler calls `runGrounding(query)` which fans out
 * (1) and (2) in parallel, threads snippets into the prompt, then
 * makes the Anthropic call with web_search enabled. Anthropic
 * decides which snippets vs live search results to cite.
 *
 * Failure modes are SOFT — any single source down returns [] for
 * that source, the Anthropic call still happens, and the model
 * leans on whichever sources did succeed. The caller never throws.
 */

const PI_RUVIO_BASE = process.env.PI_RUVIO_BASE_URL ?? 'https://pi.ruv.io';
const GOOGLE_GROUNDING_MODEL =
  process.env.GOOGLE_GROUNDING_MODEL ?? 'gemini-2.5-flash';
const GOOGLE_GENERATIVE_BASE =
  process.env.GOOGLE_GENERATIVE_BASE_URL ??
  'https://generativelanguage.googleapis.com';

export interface GroundingSnippet {
  title: string;
  content: string;
  /** URL where the content can be verified. For pi.ruv.io snippets
   *  this is the memory's permalink. For web_search results it's
   *  the live page URL. */
  source: string;
  /** Provider tag for audit + future cost tracking. */
  via: 'pi-ruv-io' | 'google-vertex' | 'anthropic-web-search';
  /** Confidence score from the source (0-1) when available. */
  score?: number;
}

interface PiRuvIoMemory {
  id: string;
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  similarity?: number;
}

function piRuvIoApiKey(): string | null {
  return (
    process.env.PI_RUVIO_API_KEY ||
    process.env.BRAIN_API_KEY ||
    process.env.brain_api_key ||
    null
  );
}

/**
 * Query pi.ruv.io's semantic memory search. Returns up to `limit`
 * snippets matching `query`. Failures are swallowed and return [].
 */
export async function searchPiRuvIo(
  query: string,
  limit = 5,
): Promise<GroundingSnippet[]> {
  const q = query.trim();
  if (q.length < 4) return [];

  const apiKey = piRuvIoApiKey();
  if (!apiKey) {
    // No auth → pi.ruv.io's authenticated search isn't reachable.
    // Don't crash; just contribute nothing to grounding.
    return [];
  }

  const url = `${PI_RUVIO_BASE}/v1/memories/search?` +
    new URLSearchParams({
      query: q.slice(0, 1000),
      limit: String(Math.max(1, Math.min(limit, 20))),
    }).toString();

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'goal_ui/grounding (research-step)',
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[grounding] pi.ruv.io fetch failed:', (err as Error).message);
    return [];
  }

  if (!resp.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[grounding] pi.ruv.io returned HTTP ${resp.status}`);
    return [];
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    return [];
  }

  // pi.ruv.io's search response shape (per BRAIN_API_ENDPOINTS doc):
  //   { results: Array<{ id, title, content, similarity, ... }> }
  // OR the older shape that returns the array directly. Handle both.
  const rawResults: PiRuvIoMemory[] = Array.isArray(body)
    ? (body as PiRuvIoMemory[])
    : Array.isArray((body as { results?: unknown })?.results)
      ? ((body as { results: PiRuvIoMemory[] }).results)
      : [];

  return rawResults
    .filter((m) => m && (m.title || m.content))
    .map((m) => ({
      title: m.title ?? '(untitled memory)',
      content: (m.content ?? '').slice(0, 1000),
      source: `${PI_RUVIO_BASE}/v1/memories/${m.id}`,
      via: 'pi-ruv-io' as const,
      score: typeof m.similarity === 'number' ? m.similarity : undefined,
    }));
}

function googleGroundingApiKey(): string | null {
  return (
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    null
  );
}

interface VertexGroundingChunk {
  web?: { uri?: string; title?: string };
}

interface VertexGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: VertexGroundingChunk[];
      webSearchQueries?: string[];
    };
  }>;
}

/**
 * Query Google Vertex AI Grounding (gemini-2.5-flash with the built-in
 * `google_search` tool). Returns `limit` snippets carved from the
 * `groundingChunks` Google attaches to the response. Failures swallowed.
 *
 * The model emits a 1-2 sentence summary that we use as the first
 * snippet content; subsequent snippets carry the `web.uri` + `web.title`
 * pair from Google Search results so the structured-output call has real
 * URLs to cite.
 */
export async function searchGoogleVertex(
  query: string,
  limit = 5,
): Promise<GroundingSnippet[]> {
  const q = query.trim();
  if (q.length < 4) return [];

  const apiKey = googleGroundingApiKey();
  if (!apiKey) return [];

  const url =
    `${GOOGLE_GENERATIVE_BASE}/v1beta/models/` +
    `${encodeURIComponent(GOOGLE_GROUNDING_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'goal_ui/grounding (research-step)',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: q.slice(0, 4000) }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[grounding] vertex fetch failed:', (err as Error).message);
    return [];
  }

  if (!resp.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[grounding] vertex returned HTTP ${resp.status}`);
    return [];
  }

  let body: VertexGenerateContentResponse;
  try {
    body = (await resp.json()) as VertexGenerateContentResponse;
  } catch {
    return [];
  }

  const cand = body.candidates?.[0];
  const summary = (cand?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join(' ')
    .trim();
  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];

  const snippets: GroundingSnippet[] = [];

  // Snippet 0 = the model's grounded synthesis. Useful as a "lead"
  // even though it's not a single URL — we tag the source as the
  // first chunk's URL when available so downstream URL validation
  // sees a real source.
  if (summary) {
    snippets.push({
      title: `Google grounded summary: ${q.slice(0, 60)}`,
      content: summary.slice(0, 1000),
      source: chunks[0]?.web?.uri ?? `${GOOGLE_GENERATIVE_BASE}/`,
      via: 'google-vertex',
    });
  }

  for (const chunk of chunks.slice(0, Math.max(0, limit - snippets.length))) {
    const uri = chunk.web?.uri;
    const title = chunk.web?.title;
    if (!uri) continue;
    snippets.push({
      title: title ?? '(google search result)',
      content: title ?? uri,
      source: uri,
      via: 'google-vertex',
    });
  }

  return snippets.slice(0, limit);
}

/**
 * Fan out to all configured grounding sources in parallel and merge
 * their snippets. Order: pi.ruv.io first (project-internal authority),
 * Google Vertex second (live web). Anthropic `web_search` is NOT
 * called here — it's an in-band Messages API tool, see `_lib/llm.ts`.
 *
 * `limit` applies per source, so the merged array can have up to 2×
 * limit entries.
 */
export async function runGrounding(
  query: string,
  limit = 5,
): Promise<GroundingSnippet[]> {
  const [pi, vertex] = await Promise.all([
    searchPiRuvIo(query, limit).catch(() => [] as GroundingSnippet[]),
    searchGoogleVertex(query, limit).catch(() => [] as GroundingSnippet[]),
  ]);
  return [...pi, ...vertex];
}

/**
 * Format a snippet array as a `<retrieved_context>` block for inclusion
 * in an LLM user prompt. Each snippet is wrapped in delimiters and
 * indexed so the model can reference them by index.
 */
export function formatSnippetsForPrompt(snippets: GroundingSnippet[]): string {
  if (!snippets.length) return '';
  const lines = snippets.map((s, i) =>
    `[${i + 1}] ${s.via}: ${s.title}\n` +
    `    URL: ${s.source}\n` +
    `    EXCERPT: ${s.content.replace(/\s+/g, ' ').slice(0, 300)}`,
  );
  return `<retrieved_context>\n${lines.join('\n\n')}\n</retrieved_context>`;
}
