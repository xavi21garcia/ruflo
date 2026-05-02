/**
 * list-templates — GET handler exposing the research template registry
 * (ADR-102, Phase 1) to the SPA.
 *
 * No LLM call, no auth-bound secrets, no rate-limit pressure — the
 * response is deploy-pinned and safe to cache aggressively. The router
 * marks it GET (vs the POST handlers in the rest of the suite) precisely
 * because the response is pure metadata.
 *
 * The handler intentionally returns `TemplateSummary[]` (not the full
 * `ResearchTemplate[]`) so `goalGenerationPrompt` — which contains the
 * exact prompt fragment we send to Anthropic — never reaches the SPA.
 */

import { listTemplateSummaries, type TemplateSummary } from '../_lib/templates';

export interface HandlerResult {
  status: number;
  body: unknown;
}

export interface ListTemplatesResponse {
  templates: TemplateSummary[];
  /** Phase tag so callers can detect the registry source. Phase 1 =
   *  bundled; Phase 2 will surface 'ipfs' when the IPFS-pinned manifest
   *  resolves successfully. */
  source: 'bundled' | 'ipfs';
  /** Total count for SPA pagination / "N templates available" UI. */
  total: number;
}

export async function listTemplatesHandler(): Promise<HandlerResult> {
  const templates = listTemplateSummaries();
  const body: ListTemplatesResponse = {
    templates,
    source: 'bundled',
    total: templates.length,
  };
  return { status: 200, body };
}
