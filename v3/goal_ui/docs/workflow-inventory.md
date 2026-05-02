# Workflow Inventory — `v3/goal_ui/`

> Step 03 deliverable. Maps every Supabase callsite + every edge function to a UI workflow. Drives the migration matrix in Step 04 and the Playwright workflow tests in Step 17.

## Conventions

- **Trigger UI** — the user action that fires the call (links into `ui-inventory.md`)
- **API call** — exact method + endpoint at the seam
- **Request shape** — payload fields (truncated to types, full TS interfaces in source)
- **Response shape** — what the caller gets back
- **State mutation** — what client-side state changes after a successful response
- **Error path** — how failures surface to the user

All edge functions follow the same shape:
- `POST /functions/v1/<name>` with JSON body
- CORS: `Access-Control-Allow-Origin: '*'` (will tighten in security Step 22b)
- Auth: relies on Supabase anon key + JWT (will move to a server-side rate-limited token)
- Rate-limit fallback: 429 returned with `{ error: "Rate limits exceeded..." }`
- Quota fallback: 402 returned with `{ error: "AI usage limit reached..." }`
- Backing model (today): `google/gemini-2.5-flash` (configurable via `aiModel` for `research-step` + `research-api`)

## Workflow → Call Map

### W-1 — Generate suggested goal from category

| | |
|---|---|
| Trigger UI | `GoalInput` category buttons G-05 through G-12 (Finance, Business, Marketing, Medical, Education, Coding, Technical, AI & ML) |
| API calls | TWO calls fired in parallel via `Promise.all`:<br>① `supabase.functions.invoke('generate-research-goal')`<br>② `supabase.functions.invoke('optimize-research-config')` |
| Request ① | `{ category: string, customContext?: string }` |
| Request ② | `{ preset: string, currentGoal?: string }` (preset is mapped from category via `categoryToPresetMap`) |
| Response ① | `{ goals: string[] }` (3 goal strings) OR `{ error: string }` (status 402 / 429 / 500) |
| Response ② | `{ config: ResearchConfig }` OR `{ error: string }` |
| State mutation | `setGoal(goals[0])` (uses first generated goal); `onConfigUpdate(config)` if provided + present |
| Toast on success | "Goal & Settings Optimized — Generated research goal and optimized settings for {category}" |
| Toast on error | "Generation Failed — Could not generate research goals. Please try again." (destructive variant) |
| File / line | `src/components/GoalInput.tsx:50–92` |

### W-2 — Run a research step (per-step LLM call during plan execution)

| | |
|---|---|
| Trigger UI | Plan execution pump in `Index.tsx` — fires once per non-terminal step in the GOAP plan (loop in the `useEffect` driving step status transitions) |
| API call | `supabase.functions.invoke('research-step', { body: { goal, stepTitle, stepDescription, stepType, aiModel, config, previousStepsData } })` |
| Request | `{ goal: string, stepTitle: string, stepDescription: string, stepType: string, aiModel?: string, config?: ResearchConfig, previousStepsData?: Array<{stepTitle, data}> }` |
| Response | `Array<DataItem>` (research data items: `{ title, content, source?, confidence?, timestamp? }`) OR `{ error }` (402/429/500) |
| State mutation | Pushes data into the step's `data` array; transitions step status `running → done`; appends to `previousStepsData` for downstream steps; on error + replanning enabled → triggers GOAP replan |
| Latency | ~2-8 s per step (LLM call); parallelism configurable via `parallelAgents` in config |
| File / line | `src/pages/Index.tsx:677` (per-step) and `src/pages/Index.tsx:794` (final-report variant with `stepType: "final-report"`) |

### W-3 — Generate the final research report's action items

| | |
|---|---|
| Trigger UI | "View Report" button I-08 → `ResearchReportModal` opens → call fired on mount when report has findings |
| API call | `supabase.functions.invoke('generate-action-items', { body: { goal, researchContext, totalSteps, totalDataPoints } })` |
| Request | `{ goal: string, researchContext: Array<{stepTitle, findings: Array<{title, content, source?}>}>, totalSteps: number, totalDataPoints: number }` |
| Response | `{ actionItems: Array<{title, description, priority, timeline, ...}> }` OR `{ error }` |
| State mutation | Renders action items in the report's "Recommendations" tab |
| File / line | `src/components/ResearchReportModal.tsx:119` |

### W-4 — Optimize research config from preset (Advanced settings)

| | |
|---|---|
| Trigger UI | Preset selector inside `ReviseResearchForm` (R-* in ui-inventory) — fires on preset change, NOT on every depth/perspective tweak |
| API call | `supabase.functions.invoke('optimize-research-config', { body: { preset, currentGoal } })` |
| Request | `{ preset: string, currentGoal?: string }` |
| Response | `{ config: ResearchConfig }` OR `{ error }` |
| State mutation | Replaces local `researchConfig` state with the LLM-suggested one (preserves `goal` + `stateDefinition`) |
| File / line | `src/components/ReviseResearchForm.tsx:182` |
| Note | This is the same endpoint as W-1 ②, just triggered from a different UI surface. |

### W-5 — Streaming research API (alternative entry point)

| | |
|---|---|
| Trigger UI | NOT WIRED in the current goal_ui. Edge function exists but `grep` shows zero callsites in `src/`. |
| API call | `supabase.functions.invoke('research-api', { body: { goal, config, aiModel, stream } })` |
| Request | `{ goal: string, config?: ResearchConfig, aiModel?: string, stream?: boolean }` |
| Response (non-stream) | Full report payload — currently underspecified (see Step 04 risk) |
| Response (stream) | SSE — incremental `ResearchStep` events |
| State mutation | N/A (unwired) |
| File / line | `supabase/functions/research-api/index.ts` exists; no client callsite |
| Note | Treat as a public API surface, not an internal workflow. Either delete during Step 21 or document as a stable public endpoint. |

## Edge function coverage check (DoD requirement)

| Edge function | Covered by workflow | Will migrate to (preview) |
|---------------|---------------------|---------------------------|
| `generate-research-goal` | W-1 | LOCAL_FN (dev) / GCF (prod) |
| `optimize-research-config` | W-1 ②, W-4 | LOCAL_FN / GCF |
| `research-step` | W-2 | LOCAL_FN / GCF |
| `generate-action-items` | W-3 | LOCAL_FN / GCF |
| `research-api` | W-5 (unwired) | LOCAL_FN / GCF — but decision deferred (delete vs keep public) |

All 5 edge functions have a row.

## State Mutations (no Supabase callsites; pure client state)

These are referenced for completeness — Step 18 (RVF table migration) and Step 11 (POC RVF replacement) replace any *persistent* state here. Today the app uses no Supabase tables (only edge functions); persistence is via in-memory React state + localStorage only.

| State | Today | Migration target |
|-------|-------|------------------|
| `userGoal`, `researchGoal` | React state, lost on reload | `RVF_BROWSER` (IndexedDB) — add a goals collection |
| `researchSteps[]` | React state, lost on reload | `RVF_BROWSER` — plans collection, keyed by goal id |
| `researchConfig` | React state | `RVF_BROWSER` — configs collection (latest-wins) |
| `widgetConfig` | React state + localStorage (TODO confirm) | `RVF_BROWSER` — settings collection |
| `finalRecommendations` | React state | `RVF_BROWSER` — derived from plan, cache only |

## Backend coupling summary

- **5 edge functions**, all LLM-backed (`google/gemini-2.5-flash` via Lovable AI Gateway by default).
- **0 Supabase tables** used directly from `src/` (no `supabase.from(...)` calls, only `.functions.invoke(...)`).
- **6 client callsites** total, across 4 source files (`Index.tsx` 2x, `GoalInput.tsx` 2x, `ReviseResearchForm.tsx` 1x, `ResearchReportModal.tsx` 1x).
- **No server-side persistence** today — every reload starts from scratch. RVF migration ADDS persistence (was a regression risk if removing Supabase but here it's a strict improvement).

## Implications for Step 04 (migration matrix)

The matrix should classify by *both* "what backend feature does this call" AND "where does the persistence live":

- W-1, W-3, W-4 → `LOCAL_FN` / `GCF` (LLM backend swap, same shape)
- W-2 → `LOCAL_FN` / `GCF` (LLM backend swap, hot path — needs streaming or fast LOCAL_FN response)
- W-5 → defer (unwired)
- All client state → `RVF_BROWSER` (NEW persistence, was missing)

## Implications for Step 17 (workflow E2E tests)

Each workflow needs:
- ① Happy-path test: trigger UI → assert state mutation
- ② 429 path: stub endpoint → 429 → assert toast "Rate limits exceeded"
- ③ 402 path: stub endpoint → 402 → assert quota toast
- ④ 5xx path: stub endpoint → 500 → assert generic failure toast
- ⑤ Network error: stub endpoint → reject → assert reconnect / retry behavior

That's 5 × 4 wired workflows = 20 workflow assertions for Step 17. Add a sixth row for cancellation if the UI exposes one.


<!-- auto-regen-footer:start -->
<!-- This file is regenerated nightly by
     `.github/workflows/goal_ui-nightly-doc.yml` (R-7.2 / ADR-100).
     Last regenerated: 2026-05-02T16:35:13Z -->
