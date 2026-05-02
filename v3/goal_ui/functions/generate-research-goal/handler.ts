/**
 * generate-research-goal — pure handler, framework-agnostic.
 *
 * Calls Anthropic Messages API directly via `_lib/llm.ts`. No Lovable
 * gateway. API key resolved through `_lib/secrets.ts` (env var or
 * Google Cloud Secret Manager). Returns a normalized `{status, body}`
 * envelope so it can wrap under either Hono (LOCAL_FN dev) or GCF (prod)
 * without re-implementing transport.
 *
 * Security:
 *   - User-supplied strings wrapped in `<user_input>` delimiters
 *     (ADR-093 §S3 / Step 22c)
 *   - Tool-call output validated against a Zod schema; malformed
 *     responses → 502 (no leakage of unsafe content)
 *
 * Mock mode: when no API key resolves (no env var, Secret Manager
 * unavailable / unset), returns 3 canned goals tagged with the
 * category. The caller is expected to surface the `mock: true` flag
 * to operators.
 */
import { z } from 'zod';
import { IdentifierSchema } from '@claude-flow/security';
import { wrapUserInput, UserPromptInputSchema } from '../_lib/sanitize';
import { callLlmWithTool, isLlmAvailable } from '../_lib/llm';
import { getTemplate } from '../_lib/templates';

const ToolOutputSchema = z.object({
  goals: z
    .array(z.object({ title: z.string().min(1), category: z.string().optional() }))
    .min(1),
});

const SYSTEM_PROMPT = `You are an expert research consultant and futurist who helps formulate cutting-edge, innovative research objectives that push boundaries.

Generate 3 HIGHLY DIVERSE and NOVEL research goals for the given category. Each goal should be:
- Innovative and forward-thinking (explore emerging trends, novel applications, or unconventional angles)
- Specific and actionable (clear research direction, not vague exploration)
- Current and relevant to 2024-2025 cutting-edge developments
- Professionally articulated with compelling detail
- DIFFERENT from each other (vary the approach, scale, application, or methodology)
- Boundary-pushing (challenge conventional thinking, explore unexplored intersections)

CRITICAL: Generate VARIETY across the 3 goals by varying:
- Scale (micro vs macro, individual vs enterprise vs societal)
- Application domain (different industries, use cases, or contexts)
- Approach (technical implementation, business impact, ethical considerations, future predictions)
- Time horizon (near-term practical vs long-term transformative)

Push the boundaries. Be specific. Be innovative.`;

// ADR-102 Phase 1: prompt fragments now live in `_lib/templates.ts`.
// Lookup happens via `getTemplate(category)` below. The inline fallback
// for unknown categories stays in the user-prompt construction site.

const TOOL_PARAMS = {
  type: 'object',
  properties: {
    goals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A concise, specific research goal (1-2 sentences max)' },
          category: { type: 'string', description: 'The category this goal belongs to' },
        },
        required: ['title', 'category'],
      },
      minItems: 3,
      maxItems: 3,
    },
  },
  required: ['goals'],
} as const;

export interface GenerateResearchGoalRequest {
  category: string;
  customContext?: string;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

export async function generateResearchGoalHandler(
  req: GenerateResearchGoalRequest,
): Promise<HandlerResult> {
  const { category, customContext } = req;
  // R-1.3: Validate via shared IdentifierSchema from @claude-flow/security.
  // Allows our known category slugs (`finance`, `ai-ml`, etc.) and rejects
  // strings with shell metacharacters or whitespace — which would never be
  // legitimate categories anyway.
  const categoryValidated = IdentifierSchema.safeParse(category);
  if (!categoryValidated.success) {
    return {
      status: 400,
      body: { error: `category must be a valid identifier: ${categoryValidated.error.issues[0]?.message ?? 'invalid'}` },
    };
  }
  if (customContext !== undefined && customContext !== null) {
    const ctxValidated = UserPromptInputSchema.safeParse(customContext);
    if (!ctxValidated.success) {
      return {
        status: 400,
        body: { error: `customContext invalid: ${ctxValidated.error.issues[0]?.message ?? 'invalid'}` },
      };
    }
  }

  // Mock mode — no upstream credentials → return canned goals so the
  // wiring can be exercised without secrets. Operators see `mock: true`.
  if (!(await isLlmAvailable())) {
    return {
      status: 200,
      body: {
        goals: [
          `[mock] Investigate emerging ${category} research direction A`,
          `[mock] Analyze novel ${category} application area B`,
          `[mock] Benchmark a cross-cutting ${category} approach C`,
        ],
        mock: true,
      },
    };
  }

  const safeCategory = wrapUserInput(category);
  const safeContext = wrapUserInput(customContext ?? category);
  const template = getTemplate(category);
  const userPrompt = template
    ? template.goalGenerationPrompt
    : `Generate 3 innovative, boundary-pushing research goals based on: ${safeContext}. Category hint: ${safeCategory}.`;

  const result = await callLlmWithTool({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    tool: { name: 'generate_goals', description: 'Generate 3 specific research goals for the given category', parameters: TOOL_PARAMS },
  });

  if (result.status !== 200) return { status: result.status, body: { error: result.error } };

  const validated = ToolOutputSchema.safeParse(result.input);
  if (!validated.success) {
    return { status: 502, body: { error: 'AI tool-call output failed schema validation' } };
  }
  const goals = validated.data.goals.map((g) => g.title).filter(Boolean);
  return { status: 200, body: { goals } };
}
