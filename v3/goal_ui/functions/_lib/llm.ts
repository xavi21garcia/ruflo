/**
 * llm.ts — Anthropic-direct adapter for tool-call requests.
 *
 * The four wired RuFlo handlers all share the same upstream pattern:
 *   - one system prompt
 *   - one user prompt (already wrapped via wrapUserInput where needed)
 *   - one strict tool schema
 *   - exactly one tool_use response → JSON object → Zod validation
 *
 * This module centralizes the call so we can:
 *   - swap providers without touching handlers
 *   - translate provider-specific status codes consistently
 *   - keep secret resolution + caching in one place
 *
 * Provider: Anthropic Messages API (no Lovable Gateway, no OpenAI).
 * Credentials come from `secrets.ts` (env var or gcloud Secret Manager).
 */

import { getAnthropicApiKey } from './secrets';

export interface LlmToolDef {
  name: string;
  description: string;
  /** JSON-schema object describing the tool input shape. */
  parameters: Record<string, unknown>;
}

export interface LlmToolCallRequest {
  system: string;
  user: string;
  tool: LlmToolDef;
  /** Override `RUFLO_LLM_MODEL`. Default: claude-haiku-4-5-20251001. */
  model?: string;
  /** Default 4096. */
  maxTokens?: number;
  /**
   * When true, attach Anthropic's built-in `web_search_20250305` tool
   * alongside the structured-output tool. The model is still forced to
   * end with our tool (`tool_choice: {type:'tool', name:...}`), but is
   * allowed to call `web_search` first to gather live citations.
   *
   * Adds ~$0.01 per actual search invocation (Anthropic-side billing).
   */
  enableWebSearch?: boolean;
  /** Per-call cap on web_search invocations. Default 3. */
  webSearchMaxUses?: number;
}

/** A live URL the Anthropic web_search tool actually fetched in this
 *  call. Surface them so the handler can backfill any `<UNKNOWN>` /
 *  non-URL `findings[].source` placeholders the model emitted. */
export interface WebSearchCitation {
  url: string;
  title?: string;
}

export type LlmToolCallResult =
  | { status: 200; input: unknown; webSearchCitations?: WebSearchCitation[] }
  | { status: 401 | 402 | 429 | 502 | 503; error: string };

/**
 * Whether the LLM upstream is reachable in the current process. When
 * false, callers should serve their mock-mode branch.
 */
export async function isLlmAvailable(): Promise<boolean> {
  return (await getAnthropicApiKey()) !== null;
}

/**
 * Translate an Anthropic API HTTP status to our normalized envelope.
 * Anthropic doesn't use 402 — quota issues surface as 429 or 401-style
 * billing errors. We surface 402 specifically when the body string looks
 * like a billing exhaustion so the UI's existing 402 handler still fires.
 */
function classifyError(status: number, body: string): LlmToolCallResult {
  if (status === 401) return { status: 401, error: 'AI authentication failed (check ANTHROPIC_API_KEY or Secret Manager).' };
  if (status === 429) {
    if (/credit|quota|usage limit|insufficient|billing/i.test(body)) {
      return { status: 402, error: 'AI usage limit reached. Please add credits to continue.' };
    }
    return { status: 429, error: 'Rate limits exceeded. Please try again later.' };
  }
  if (status >= 500 && status <= 599) return { status: 503, error: `AI provider unavailable (HTTP ${status}).` };
  return { status: 502, error: `AI gateway error: ${status}` };
}

/**
 * Send a single tool-forced request to Anthropic and return the model's
 * tool input as a parsed JSON object. The caller is responsible for Zod
 * validation of `input`.
 */
export async function callLlmWithTool(req: LlmToolCallRequest): Promise<LlmToolCallResult> {
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) {
    return { status: 401, error: 'No API key resolved (set ANTHROPIC_API_KEY or configure Secret Manager).' };
  }

  const model =
    req.model ||
    process.env.RUFLO_LLM_MODEL ||
    'claude-haiku-4-5-20251001';
  const maxTokens = req.maxTokens ?? 4096;

  // Build tools array. Order doesn't matter to Anthropic, but the
  // forced `tool_choice` below ensures the structured-output tool is
  // ALWAYS the last call. web_search runs in earlier turns if useful.
  const tools: Array<Record<string, unknown>> = [
    {
      name: req.tool.name,
      description: req.tool.description,
      input_schema: req.tool.parameters,
    },
  ];
  if (req.enableWebSearch) {
    tools.push({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: req.webSearchMaxUses ?? 3,
    });
  }

  // tool_choice strategy:
  //  - web_search OFF → force the structured tool immediately (cheapest path)
  //  - web_search ON  → allow ANY tool: the model calls web_search first
  //    (Anthropic resolves it server-side, returns results inline), then
  //    calls our structured tool with REAL URLs in scope. Without this,
  //    findings[].source ends up as "<UNKNOWN>" placeholders because
  //    web_search literally never ran.
  const toolChoice: Record<string, unknown> = req.enableWebSearch
    ? { type: 'any' }
    : { type: 'tool', name: req.tool.name };

  let resp: Response;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        tools,
        tool_choice: toolChoice,
      }),
    });
  } catch (err) {
    return { status: 503, error: `AI provider unreachable: ${(err as Error).message}` };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return classifyError(resp.status, text);
  }

  const body = (await resp.json().catch(() => null)) as
    | {
        content?: Array<{
          type?: string;
          name?: string;
          input?: unknown;
          // web_search_tool_result blocks carry an array of search hits
          // under `content[]` (Anthropic schema as of 2025-03-05+).
          content?: Array<{ type?: string; url?: string; title?: string }>;
        }>;
      }
    | null;
  if (!body) return { status: 502, error: 'AI response was not JSON.' };

  // Find the tool_use block matching the requested tool name.
  const toolUse = (body.content ?? []).find(
    (b) => b && b.type === 'tool_use' && b.name === req.tool.name,
  );
  if (!toolUse || toolUse.input === undefined) {
    return { status: 502, error: 'No tool call in AI response.' };
  }

  // Collect any web_search results inline. We only surface URL+title;
  // the snippet text lives in adjacent `text` blocks (citations) which
  // Anthropic emits separately and which we don't need for source repair.
  const webSearchCitations: WebSearchCitation[] = [];
  for (const block of body.content ?? []) {
    if (block?.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r?.type === 'web_search_result' && typeof r.url === 'string') {
          webSearchCitations.push({ url: r.url, title: r.title });
        }
      }
    }
  }

  return {
    status: 200,
    input: toolUse.input,
    webSearchCitations: webSearchCitations.length ? webSearchCitations : undefined,
  };
}
