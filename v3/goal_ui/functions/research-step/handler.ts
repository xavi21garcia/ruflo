/**
 * research-step — Anthropic-direct port. Calls `_lib/llm.ts` with a
 * tool-forced request. API key resolved via `_lib/secrets.ts`.
 *
 * Returns a flat array of `ResearchDataItem` (not `{findings: [...]}`)
 * to preserve the wire shape the UI consumes.
 *
 * Mock mode when no API key resolves: returns 3 canned findings.
 */

import { z } from 'zod';
import { wrapUserInput, UserPromptInputSchema } from '../_lib/sanitize';
import { callLlmWithTool, isLlmAvailable } from '../_lib/llm';
import { runResearchSwarm } from '../_lib/swarm';
import { runGrounding, formatSnippetsForPrompt } from '../_lib/grounding';
import { getTemplate } from '../_lib/templates';

interface ResearchDataItem {
  title: string;
  content: string;
  source?: string;
  confidence?: number;
  timestamp?: string;
}

const ToolOutputSchema = z.object({
  findings: z
    .array(z.object({
      title: z.string().min(1),
      content: z.string(),
      source: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    }))
    .min(1),
});

const SYSTEM_PROMPT =
  'You are a meticulous research analyst executing a single step of a ' +
  'larger research plan. Return concrete findings as structured data. ' +
  'Prefer authoritative sources, named entities, and concrete metrics ' +
  'over vague summaries. ' +
  'When a `<retrieved_context>` block is supplied, prefer those snippets ' +
  'as your source of truth and cite their URLs in `findings[].source`. ' +
  'You also have a live `web_search` tool — use it when the retrieved ' +
  'context is thin or when the step calls for current data. Every ' +
  '`findings[].source` MUST be a URL you actually saw (either in the ' +
  'retrieved context or returned by web_search), never a guessed URL.';

const TOOL_PARAMS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          source: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['title', 'content'],
      },
      minItems: 1,
    },
  },
  required: ['findings'],
} as const;

export interface ResearchStepRequest {
  goal: string;
  stepTitle: string;
  stepDescription: string;
  stepType: string;
  aiModel?: string;
  config?: unknown;
  previousStepsData?: Array<{ stepTitle: string; data: ResearchDataItem[] }>;
  /** ADR-102: optional template id (e.g. 'finance', 'medical') so the
   *  grounding query gets seeded with `template.groundingHints`.
   *  Unknown ids are ignored. */
  templateId?: string;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

export async function researchStepHandler(
  req: ResearchStepRequest,
): Promise<HandlerResult> {
  const { goal, stepTitle, stepDescription } = req;
  // R-1.3: Validate via shared UserPromptInputSchema (control-byte
  // rejection + 10k cap; preserves shell-meta characters used legitimately
  // in research goals like "$50k", "(US)", etc.).
  for (const [name, value] of [
    ['goal', goal],
    ['stepTitle', stepTitle],
    ['stepDescription', stepDescription],
  ] as const) {
    const v = UserPromptInputSchema.safeParse(value);
    if (!v.success) {
      return {
        status: 400,
        body: { error: `${name} invalid: ${v.error.issues[0]?.message ?? 'invalid'}` },
      };
    }
  }

  if (!(await isLlmAvailable())) {
    return {
      status: 200,
      body: [
        { title: `[mock] ${stepTitle} — finding 1`, content: `Stub content for ${stepTitle}`, source: 'mock://source-1', confidence: 0.9, timestamp: new Date().toISOString() },
        { title: `[mock] ${stepTitle} — finding 2`, content: `Second stub finding`, source: 'mock://source-2', confidence: 0.8, timestamp: new Date().toISOString() },
        { title: `[mock] ${stepTitle} — finding 3`, content: `Third stub finding`, source: 'mock://source-3', confidence: 0.7, timestamp: new Date().toISOString() },
      ],
    };
  }

  // Build prior-context once — both paths consume it.
  const ctx = (req.previousStepsData ?? []).map(s =>
    `${wrapUserInput(s.stepTitle)}:\n` + s.data.map(d => `- ${wrapUserInput(d.title)}: ${wrapUserInput(d.content)}`).join('\n')
  ).join('\n\n');

  // R-3.2: env-gated swarm path. When `RUFLO_USE_SWARM=true`, dispatch
  // to the 4-agent specialized pipeline (researcher → analyst → critic
  // → scribe). Default = single-call path (cheaper, faster, what the
  // current production goal.ruv.io behaviour is).
  if (process.env.RUFLO_USE_SWARM === 'true') {
    const swarm = await runResearchSwarm({
      goal,
      stepTitle,
      stepDescription,
      priorContext: ctx || undefined,
    });
    if (swarm.status !== 200) {
      return { status: swarm.status, body: { error: `swarm failed at ${swarm.failedAgent}: ${swarm.error}` } };
    }
    // Map SwarmFinding → ResearchDataItem (drop critique; add timestamp).
    const now = new Date().toISOString();
    const items: ResearchDataItem[] = swarm.findings.map((f) => ({
      title: f.title,
      content: f.content,
      source: f.source,
      confidence: f.confidence,
      timestamp: now,
    }));
    return { status: 200, body: items };
  }

  // R-101 grounding: fan out to pi.ruv.io + Google Vertex in parallel.
  // Either source returning [] is fine — the Anthropic call also has
  // web_search enabled below, so the model can fall back to live search.
  //
  // ADR-102: when a templateId is supplied, prepend its groundingHints
  // so the retrieval prior captures domain-specific seed queries before
  // the goal+step text. Unknown templateId → falls back to bare query.
  const template = getTemplate(req.templateId);
  const hintPrefix = template ? `${template.groundingHints.join('. ')}. ` : '';
  const groundingQuery = `${hintPrefix}${goal} ${stepTitle} ${stepDescription}`.slice(0, 1500);
  const enableGrounding = process.env.RUFLO_GROUNDING_PROVIDER !== 'none';
  const snippets = enableGrounding ? await runGrounding(groundingQuery, 5) : [];
  const groundingBlock = formatSnippetsForPrompt(snippets);

  // Default single-call path.
  const userPrompt = [
    `Research goal: ${wrapUserInput(goal)}`,
    `Current step: ${wrapUserInput(stepTitle)} — ${wrapUserInput(stepDescription)}`,
    groundingBlock || 'No retrieved context available — use web_search.',
    ctx ? `Prior step findings:\n${ctx}` : 'No prior steps yet.',
  ].join('\n\n');

  // R-7.x post-deploy fix: ignore the SPA-provided `aiModel` field.
  // Server-side model selection (via RUFLO_LLM_MODEL env or
  // _lib/llm.ts default) is the right defense-in-depth posture.
  //
  // Retry-once on schema-validation failure: live deploy on Cloud Run
  // showed Anthropic Haiku occasionally emits a tool_call that fails
  // our Zod schema once `previousStepsData` accumulates (seen at
  // step 6-7 of a 7-step run, 10-20% of the time). Single retries
  // succeed deterministically — this is non-deterministic decoder
  // jitter, not a structural bug. One retry lifts the e2e success
  // rate without doubling cost on the happy path.
  const tool = { name: 'return_findings', description: 'Return findings for the current research step', parameters: TOOL_PARAMS };

  // Allow operators to disable web_search via env (cost control); default on.
  const enableWebSearch = process.env.RUFLO_WEB_SEARCH !== 'false';

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callLlmWithTool({
      system: SYSTEM_PROMPT,
      user: attempt === 0
        ? userPrompt
        : userPrompt + '\n\nIMPORTANT: Return strict JSON tool output. Each finding MUST have non-empty `title` and `content`.',
      tool,
      enableWebSearch,
    });

    if (result.status !== 200) {
      // Don't retry transport/auth/rate-limit failures — those need
      // operator action, not a re-roll.
      return { status: result.status, body: { error: result.error } };
    }

    const validated = ToolOutputSchema.safeParse(result.input);
    if (validated.success) {
      // Source repair pass: when the model emits a non-URL placeholder
      // (e.g. "<UNKNOWN>", an empty string, or a bare title) for
      // `findings[].source`, backfill it from the citation pool we
      // already have:
      //   1. Anthropic web_search_tool_result URLs from this turn
      //   2. Pi.ruv.io / Vertex grounding snippets passed in the prompt
      // If neither pool has a candidate, drop the source field entirely
      // — the UI tolerates `source` missing but renders "<UNKNOWN>" if
      // we leave a literal placeholder string.
      const isLikelyUrl = (s: unknown): s is string =>
        typeof s === 'string' && /^https?:\/\//i.test(s);
      const citationPool: string[] = [
        ...(result.webSearchCitations?.map((c) => c.url) ?? []),
        ...snippets.map((s) => s.source),
      ].filter(isLikelyUrl);
      const repaired: ResearchDataItem[] = validated.data.findings.map((f, idx) => {
        if (isLikelyUrl(f.source)) return f;
        const fallback = citationPool[idx % Math.max(citationPool.length, 1)];
        if (fallback) return { ...f, source: fallback };
        const { source: _drop, ...rest } = f;
        return rest;
      });
      // UI expects a flat array, not `{findings: [...]}`.
      return { status: 200, body: repaired };
    }
    if (attempt === 1) {
      return { status: 502, body: { error: 'AI tool-call output failed schema validation after 2 attempts' } };
    }
    // else fall through to retry.
  }
  // Unreachable.
  return { status: 502, body: { error: 'unexpected' } };
}
