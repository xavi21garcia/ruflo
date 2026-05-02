/**
 * Research template registry (ADR-102, Phase 1).
 *
 * The 8 category buttons in `GoalInput.tsx` historically resolved to a
 * `Record<string, string>` of prompt fragments inside
 * `generate-research-goal/handler.ts`. This module replaces that inline
 * map with a typed registry so:
 *
 *   1. The SPA can fetch metadata via `GET /functions/v1/list-templates`
 *      and render richer template cards (citation density, swarm depth,
 *      runtime expectation) instead of bare buttons.
 *   2. `research-step` can prepend `template.groundingHints` to its
 *      `runGrounding(query)` call so Vertex / pi.ruv.io get a richer
 *      prior than the goal text alone.
 *   3. Operators can author / version templates without touching the
 *      handler code (Phase 2 moves authoritative source to IPFS).
 *
 * Phase 1 (this file): bundled templates only.
 * Phase 2 (deferred):  IPFS-pinned manifest with a Pinata CID + bundled
 *                      fallback, mirroring `@claude-flow/cli/src/plugins/
 *                      store/discovery.ts`.
 * Phase 3 (deferred):  ReasoningBank pattern reuse via AgentDB HNSW.
 */

export type SwarmPipeline = 'single-call' | 'researcher_critic' | 'full_4agent';

export interface ResearchTemplate {
  id: string;
  displayName: string;
  category: string;
  description: string;
  /** Replaces the inline `CATEGORY_PROMPTS[id]` entry. Drives the
   *  Anthropic call inside `generate-research-goal/handler.ts`. */
  goalGenerationPrompt: string;
  /** Seed queries for `runGrounding`. Prepended to goal+stepDescription
   *  before pi.ruv.io / Vertex retrieval. Keep concise; <=120 chars each. */
  groundingHints: string[];
  /** Hint for the GOAP planner. Currently informational; consumed by
   *  the SPA when rendering the "expected workflow" preview. */
  expectedStepTypes: string[];
  /** Tightens `findings[]` validation server-side when set. */
  schemaRefinements?: {
    minSources?: number;
    requireMetrics?: boolean;
  };
  /** Default pipeline depth for steps using this template. */
  swarmPipeline: SwarmPipeline;
  version: string;
  /** ISO-8601 timestamp; bump when goalGenerationPrompt changes. */
  updatedAt: string;
}

/** Fields the SPA is allowed to see. Strips `goalGenerationPrompt` so
 *  prompt internals don't leak through `list-templates`. */
export type TemplateSummary = Omit<ResearchTemplate, 'goalGenerationPrompt'>;

const NOW = '2026-05-02T00:00:00.000Z';

const BUNDLED: ResearchTemplate[] = [
  {
    id: 'finance',
    displayName: 'Finance',
    category: 'finance',
    description:
      'Cutting-edge financial research — emerging tech (DeFi/AI trading), market mechanisms, behavioral & systemic risk angles.',
    goalGenerationPrompt:
      'Generate 3 cutting-edge, diverse research goals for finance. Vary across: (1) emerging technologies (crypto, DeFi, AI trading), (2) novel market mechanisms or regulations, (3) behavioral/psychological aspects or systemic risks. Include specific metrics, timeframes, or novel applications.',
    groundingHints: [
      'DeFi flash loan exploits 2024-2026',
      'Federal Reserve systemic risk reports',
      'algorithmic trading behavioral models',
    ],
    expectedStepTypes: ['research', 'analysis', 'synthesis'],
    schemaRefinements: { minSources: 2, requireMetrics: true },
    swarmPipeline: 'single-call',
    version: '1.0.0',
    updatedAt: NOW,
  },
  {
    id: 'business',
    displayName: 'Business',
    category: 'business',
    description:
      'Business model innovation, organizational transformation, data-driven decision making.',
    goalGenerationPrompt:
      'Generate 3 innovative, diverse research goals for business. Vary across: (1) emerging business models or platforms, (2) organizational transformation or culture, (3) data-driven decision making or automation. Be specific about industry, scale, and measurable outcomes.',
    groundingHints: [
      'platform business model 2024-2026',
      'organizational change management evidence',
      'enterprise AI adoption case studies',
    ],
    expectedStepTypes: ['research', 'analysis', 'synthesis'],
    swarmPipeline: 'single-call',
    version: '1.0.0',
    updatedAt: NOW,
  },
  {
    id: 'marketing',
    displayName: 'Marketing',
    category: 'marketing',
    description:
      'Boundary-pushing marketing — emerging channels, behavioral science, attribution innovation.',
    goalGenerationPrompt:
      'Generate 3 boundary-pushing, diverse research goals for marketing. Vary across: (1) emerging channels or technologies (AI, AR/VR, Web3), (2) behavioral science or psychology, (3) measurement or attribution innovation. Include specific platforms, demographics, or novel approaches.',
    groundingHints: [
      'AI generative marketing 2024-2026',
      'multi-touch attribution model evidence',
      'consumer behavior post-cookie',
    ],
    expectedStepTypes: ['research', 'analysis'],
    swarmPipeline: 'single-call',
    version: '1.0.0',
    updatedAt: NOW,
  },
  {
    id: 'medical',
    displayName: 'Medical',
    category: 'medical',
    description:
      'Healthcare research — diagnostics, treatment innovations, precision medicine, AI applications.',
    goalGenerationPrompt:
      'Generate 3 cutting-edge, diverse research goals for medical/healthcare. Vary across: (1) emerging diagnostic or treatment technologies, (2) healthcare delivery or access innovations, (3) personalized/precision medicine or AI applications. Be specific about conditions, populations, or technologies.',
    groundingHints: [
      'FDA breakthrough designations 2024-2026',
      'precision oncology biomarker evidence',
      'AI medical imaging clinical trials',
    ],
    expectedStepTypes: ['research', 'literature_review', 'synthesis'],
    schemaRefinements: { minSources: 3, requireMetrics: true },
    swarmPipeline: 'researcher_critic',
    version: '1.0.0',
    updatedAt: NOW,
  },
  {
    id: 'education',
    displayName: 'Education',
    category: 'education',
    description:
      'Pedagogical technology, learning science, equity & accessibility research.',
    goalGenerationPrompt:
      'Generate 3 innovative, diverse research goals for education. Vary across: (1) emerging pedagogical technologies (AI tutors, VR, adaptive learning), (2) learning science or cognitive research, (3) educational equity or accessibility. Include specific age groups, subjects, or measurable learning outcomes.',
    groundingHints: [
      'adaptive learning effect size meta-analysis',
      'AI tutor randomized control trials',
      'educational equity intervention evidence',
    ],
    expectedStepTypes: ['research', 'literature_review'],
    swarmPipeline: 'single-call',
    version: '1.0.0',
    updatedAt: NOW,
  },
  {
    id: 'coding',
    displayName: 'Coding',
    category: 'coding',
    description:
      'Software development research — emerging frameworks, AI-assisted dev, code quality & collaboration tools.',
    goalGenerationPrompt:
      'Generate 3 innovative, diverse research goals for coding/software development. Vary across: (1) emerging languages, frameworks, or paradigms, (2) AI-assisted development or automation, (3) code quality, testing, or collaboration tools.',
    groundingHints: [
      'AI code assistant productivity studies',
      'programming language adoption trends 2026',
      'software testing AI generated tests',
    ],
    expectedStepTypes: ['research', 'comparison'],
    swarmPipeline: 'single-call',
    version: '1.0.0',
    updatedAt: NOW,
  },
  {
    id: 'technical',
    displayName: 'Technical',
    category: 'technical',
    description:
      'Engineering research — architectures, performance breakthroughs, security & reliability.',
    goalGenerationPrompt:
      'Generate 3 cutting-edge, diverse research goals for technical/engineering. Vary across: (1) emerging architectures or paradigms, (2) performance or efficiency breakthroughs, (3) security or reliability innovations.',
    groundingHints: [
      'distributed systems consensus 2024-2026',
      'GPU vs custom silicon performance benchmarks',
      'zero-trust architecture deployment evidence',
    ],
    expectedStepTypes: ['research', 'comparison', 'synthesis'],
    swarmPipeline: 'single-call',
    version: '1.0.0',
    updatedAt: NOW,
  },
  {
    id: 'ai-ml',
    displayName: 'AI & ML',
    category: 'ai-ml',
    description:
      'AI/ML research — agentic systems, novel architectures, real-world applications & societal implications.',
    goalGenerationPrompt:
      'Generate 3 CUTTING-EDGE, diverse research goals for AI, Machine Learning, and Autonomous Agents. MUST vary across: (1) agentic AI systems, (2) novel architectures or training paradigms, (3) real-world applications or societal implications.',
    groundingHints: [
      'agentic AI benchmark evaluations 2026',
      'mixture of experts scaling laws',
      'AI safety alignment empirical results',
    ],
    expectedStepTypes: ['research', 'comparison', 'synthesis'],
    schemaRefinements: { minSources: 2 },
    swarmPipeline: 'researcher_critic',
    version: '1.0.0',
    updatedAt: NOW,
  },
];

const BY_ID = new Map(BUNDLED.map((t) => [t.id, t]));

/** Read-only access to all bundled templates. */
export function listTemplates(): ResearchTemplate[] {
  return BUNDLED.slice();
}

/** Public summaries safe to return from `list-templates` (no prompt
 *  internals). */
export function listTemplateSummaries(): TemplateSummary[] {
  return BUNDLED.map(({ goalGenerationPrompt: _drop, ...rest }) => rest);
}

/** Lookup by id (case-insensitive). Returns null when not found —
 *  callers should fall back to legacy behaviour rather than throwing. */
export function getTemplate(id: string | null | undefined): ResearchTemplate | null {
  if (!id) return null;
  return BY_ID.get(id.toLowerCase()) ?? null;
}
