# UI Element Inventory — `v3/goal_ui/`

> Source of truth for Playwright e2e selectors. Generated for ADR-093 Step 02. Update when UI changes.

**Convention** — selectors use Playwright's role-based queries where stable, fall back to text or `data-testid`. Where no `data-testid` exists today, the "Selector" column proposes the one to ADD as part of Step 16 (UI element coverage tests).

## Routes (4)

| Path | Page component | Auth | Notes |
|------|----------------|------|-------|
| `/` | `pages/Index.tsx` | none | Goal input + agent plan tree (main app) |
| `/demo` | `pages/Demo.tsx` | none | Static demo / showcase view |
| `/agents` | `pages/Agents.tsx` | none | Agent swarm management |
| `*` | `pages/NotFound.tsx` | none | 404 fallback |

Routing wired in `src/App.tsx` via `react-router-dom` `<BrowserRouter>`.

---

## Page: Index (`/`) — `src/pages/Index.tsx`

| # | Element | Role / Type | Visible text | Selector | Notes |
|---|---------|-------------|--------------|----------|-------|
| I-01 | Goal input textarea | textarea | placeholder "Define Research Objective" | `getByRole('textbox', { name: /goal|objective/i })` | Owned by `GoalInput` (see G-* below) |
| I-02 | Reset all button | button | "Reset" | `getByTestId('reset-all-btn')` ← TODO add | Calls `resetAll()`, clears state |
| I-03 | Demo page link | link | "Demo" | `getByRole('link', { name: /demo/i })` | RouterLink → `/demo` |
| I-04 | Agents page link | link | "Agents" | `getByRole('link', { name: /agents/i })` | RouterLink → `/agents` |
| I-05 | Customize widget button | button | "Customize" | `getByTestId('toggle-customizer-btn')` ← TODO | Toggles `WidgetCustomizer` dialog |
| I-06 | Widget customization dialog | dialog | title "Widget Customization" | `getByRole('dialog', { name: /widget customization/i })` | Modal, see WC-* |
| I-07 | Plan tree tabs (4 triggers) | tab | "Plan" / "State" / "Config" / "Output" | `getByRole('tab').nth(N)` | Each tab triggers a `TabsContent` block |
| I-08 | Open report modal button | button | "View Report" | `getByTestId('open-report-modal-btn')` ← TODO | Opens `ResearchReportModal` |
| I-09 | Revise research dialog | dialog | title "Revise Research" | `getByRole('dialog', { name: /revise research/i })` | Modal, see R-* |
| I-10 | Advanced settings dialog | dialog | title "Advanced Settings" | `getByRole('dialog', { name: /advanced settings/i })` | Modal hosting `ReviseResearchForm` |

---

## Page: Agents (`/agents`) — `src/pages/Agents.tsx`

| # | Element | Role / Type | Visible text | Selector | Notes |
|---|---------|-------------|--------------|----------|-------|
| A-01 | Goal definition card | card | "Define what you want the agent swarm to build" | `getByRole('heading', { name: /agent swarm/i }).locator('xpath=..')` | CardHeader |
| A-02 | Generate plan button | button | "Generate Plan" | `getByTestId('generate-plan-btn')` ← TODO | Triggers GOAP planner |
| A-03 | Continue to development button | button | "Continue to Development" | `getByTestId('continue-to-development-btn')` ← TODO | Stage transition |
| A-04 | Research task breakdown card | card | "Research Task Breakdown" | `getByRole('heading', { name: /research task breakdown/i })` | Display only |
| A-05+ | Per-agent step cards | card[] | one per agent | `getByTestId(/^agent-step-/)` ← TODO add per-row testid | Renders `AgentStep` components |

---

## Page: Demo (`/demo`) — `src/pages/Demo.tsx`

| # | Element | Role / Type | Notes |
|---|---------|-------------|-------|
| D-01 | Demo container | section | Static showcase content |
| D-02 | Back-to-app link | link | RouterLink to `/` |
| D-03 | Embed code snippet | code block | Copy-to-clipboard target |

---

## Page: NotFound (`*`) — `src/pages/NotFound.tsx`

Currently no interactive elements detected. Recommend adding a "back to home" link when Step 22 branding pass runs.

---

## Component: `GoalInput.tsx` — used in Index `/`

| # | Element | Role / Type | Visible text | Selector | Notes |
|---|---------|-------------|--------------|----------|-------|
| G-01 | Section heading | heading h2 | "Define Research Objective" | `getByRole('heading', { name: /define research objective/i })` | |
| G-02 | Advanced settings button (header) | button | "Advanced" | `getByTestId('goal-advanced-btn')` ← TODO | Opens advanced settings dialog |
| G-03 | Goal text textarea | textarea | placeholder "Define Research Objective" | `getByRole('textbox', { name: /goal/i })` | Controlled state, submit on form |
| G-04 | Submit goal button | button | "Generate Plan" / similar | `getByTestId('goal-submit-btn')` ← TODO | Calls `onSubmit(goal.trim())` |
| G-05 | Category: Finance | button | "Finance" + 📈 icon | `getByRole('button', { name: /finance/i })` | Triggers `generateGoals('finance')` → Supabase edge fn |
| G-06 | Category: Business | button | "Business" + 🏢 icon | `getByRole('button', { name: /business/i })` | Triggers `generateGoals('business')` |
| G-07 | Category: Marketing | button | "Marketing" + 📣 icon | `getByRole('button', { name: /marketing/i })` | Triggers `generateGoals('marketing')` |
| G-08 | Category: Medical | button | "Medical" + ❤️ icon | `getByRole('button', { name: /medical/i })` | Triggers `generateGoals('medical')` |
| G-09 | Category: Education | button | "Education" + 🎓 icon | `getByRole('button', { name: /education/i })` | Triggers `generateGoals('education')` |
| G-10 | Category: Coding | button | "Coding" + `</>` icon | `getByRole('button', { name: /coding/i })` | Triggers `generateGoals('coding')` |
| G-11 | Category: Technical | button | "Technical" + 💻 icon | `getByRole('button', { name: /technical/i })` | Triggers `generateGoals('technical')` |
| G-12 | Category: AI & ML | button | "AI & ML" + 🧠 icon | `getByRole('button', { name: /ai.*ml/i })` | Triggers `generateGoals('ai-ml')` |

**Backend coupling** — G-05 through G-12 each fire two `supabase.functions.invoke()` calls in parallel: `generate-research-goal` + `optimize-research-config`. Will become `LOCAL_FN`/`GCF` calls per ADR-093 Step 19.

---

## Component: `WidgetCustomizer.tsx` — opened from Index I-05

Hosted inside dialog I-06. Tab structure with 4 panes.

| # | Element | Role / Type | Visible text | Selector | Notes |
|---|---------|-------------|--------------|----------|-------|
| WC-01 | Colors tab | tab | "Colors" | `getByRole('tab', { name: 'Colors' })` | First tab, default selected |
| WC-02 | Content tab | tab | "Content" | `getByRole('tab', { name: 'Content' })` | |
| WC-03 | Layout tab | tab | "Layout" | `getByRole('tab', { name: 'Layout' })` | |
| WC-04 | AI Settings tab | tab | "AI Settings" | `getByRole('tab', { name: /ai settings/i })` | |
| WC-05 | Title input | textbox | placeholder "Goal-Oriented Action Planning" | `getByPlaceholder(/goal-oriented action/i)` | Content tab |
| WC-06 | Description input | textbox | placeholder "AI-powered research planning..." | `getByPlaceholder(/ai-powered research/i)` | Content tab |
| WC-07 | Brand name input | textbox | placeholder "Your Company" | `getByPlaceholder(/your company/i)` | Content tab |
| WC-08 | Default goal input | textbox | placeholder "Research latest AI advancements" | `getByPlaceholder(/research latest ai/i)` | Content tab |
| WC-09 | Font family select | combobox | (current value) | `getByRole('combobox', { name: /font/i })` | 6 options: System UI, Inter, Roboto, Open Sans, Poppins, Monospace |
| WC-10 | Border radius select | combobox | (current value) | `getByRole('combobox', { name: /radius|border/i })` | 5 options: None, Small, Medium, Large, XLarge |
| WC-11 | Color pickers (8) | color input | per-color swatch | `getByLabel(/primary color|accent color|...|success color/i)` | 8 color inputs total |
| WC-12 | "Show Metrics" switch | switch | toggles `showMetrics` | `getByRole('switch', { name: /metrics/i })` | |
| WC-13 | "Show Stats" switch | switch | toggles `showStats` | `getByRole('switch', { name: /stats/i })` | |
| WC-14 | "Compact Mode" switch | switch | toggles `compactMode` | `getByRole('switch', { name: /compact/i })` | |
| WC-15 | "Enable AI" switch | switch | toggles `enableAI` | `getByRole('switch', { name: /enable ai/i })` | AI tab |
| WC-16 | AI model select | combobox | (current model) | `getByRole('combobox', { name: /model/i })` | AI tab |

---

## Component: `ReviseResearchForm.tsx` — used in Index I-09 (revise) and I-10 (advanced settings)

| # | Element | Role / Type | Visible text | Selector | Notes |
|---|---------|-------------|--------------|----------|-------|
| R-01 | Goal textarea | textarea | placeholder "Enter your research objective..." | `getByPlaceholder(/research objective/i)` | Controlled |
| R-02 | Add focus area input | textbox | placeholder "e.g., quantum algorithms..." | `getByPlaceholder(/quantum algorithms/i)` | |
| R-03 | Add focus area button | button | "Add" | `getByTestId('add-focus-area-btn')` ← TODO | `addFocusArea()` handler |
| R-04 | Focus area chips (N) | chip / badge | dynamic | `getByTestId(/^focus-area-chip-/)` ← TODO | Removable on click |
| R-05 | Add exclude topic input | textbox | placeholder "e.g., theoretical only..." | `getByPlaceholder(/theoretical only/i)` | |
| R-06 | Add exclude topic button | button | "Add" (variant outline) | `getByTestId('add-exclude-topic-btn')` ← TODO | `addExcludeTopic()` handler |
| R-07 | Exclude topic chips (N) | chip / badge | dynamic | `getByTestId(/^exclude-topic-chip-/)` ← TODO | |
| R-08 | Depth select | combobox | "Surface" / "Moderate" / "Deep" | `getByRole('combobox', { name: /depth/i })` | 3 options |
| R-09 | Perspective select | combobox | "Technical" / "Business" / "Academic" / "Practical" | `getByRole('combobox', { name: /perspective/i })` | 4 options |
| R-10 | Timeframe select | combobox | "Recent" / "Standard" / "Historical" / "All time" | `getByRole('combobox', { name: /timeframe/i })` | 4 options |
| R-11 | Submit / save button | button | "Apply" or "Save Changes" | `getByTestId('revise-submit-btn')` ← TODO | Triggers config update |

---

## Component: `ResearchReportModal.tsx` — opened from Index I-08

| # | Element | Role / Type | Visible text | Selector | Notes |
|---|---------|-------------|--------------|----------|-------|
| RM-01 | Modal dialog | dialog | (dynamic title) | `getByRole('dialog', { name: /report/i })` | |
| RM-02 | Download button | button | "Download" + ⬇ icon | `getByTestId('report-download-btn')` ← TODO | `handleDownload()` |
| RM-03 | Revise button | button | "Revise" | `getByTestId('report-revise-btn')` ← TODO | Calls `onRevise()` (closes + opens revise dialog) |
| RM-04 | Close button | button | (X icon, aria-label "Close") | `getByRole('button', { name: /close/i })` | |
| RM-05 | Summary tab | tab | "Summary" | `getByRole('tab', { name: 'Summary' })` | |
| RM-06 | Findings tab | tab | "Findings" | `getByRole('tab', { name: 'Findings' })` | |
| RM-07 | Methodology tab | tab | "Methodology" | `getByRole('tab', { name: 'Methodology' })` | |
| RM-08+ | Additional report tabs | tab | dynamic | `getByRole('tab')` | Tab list extends per report content |

---

## Component: `AgentStep.tsx` — rendered in Index plan tree

| # | Element | Role / Type | Visible text | Selector | Notes |
|---|---------|-------------|--------------|----------|-------|
| AS-01 | Step card | article | step name + status | `getByTestId(/^agent-step-/)` ← TODO | Status: pending / running / done / blocked |

## Component: `DevelopmentStep.tsx` — rendered in Agents page

| # | Element | Role / Type | Notes |
|---|---------|-------------|-------|
| DS-01 | Development step card | article | Single interactive (toggle / expand) |

## Component: `ResearchReviewCard.tsx`

| # | Element | Role / Type | Notes |
|---|---------|-------------|-------|
| RV-01..05 | Review actions (5) | button | Approve / reject / comment / re-run / details |

## Component: `StateAssessmentCard.tsx`

Read-only display. No interactive elements.

## Component: `GOAPConfigDisplay.tsx`

Read-only display. No interactive elements.

---

## Summary

| Category | Count |
|----------|-------|
| Routes | 4 |
| Page-level interactive elements | 18 (Index 10 + Agents 5 + Demo 3) |
| `GoalInput` | 12 (1 textarea + 1 submit + 1 advanced + 8 categories + 1 heading) |
| `WidgetCustomizer` | 16 (4 tabs + 4 inputs + 2 selects + 8 colors + 4 switches) — note WC-11 expands to 8 distinct color pickers |
| `ReviseResearchForm` | 11 |
| `ResearchReportModal` | 8 |
| `AgentStep` / `DevelopmentStep` / `ResearchReviewCard` | 7 |
| **Total interactive elements** | **76** |

Comfortably exceeds the DoD threshold of ≥30.

## TODO for Step 16 (UI element coverage tests)

Many rows above mark `← TODO add` for `data-testid`. Step 16 should:

1. Walk this inventory.
2. Add `data-testid="..."` attributes to JSX where the selector column says `← TODO`.
3. Write Playwright assertions covering every row (visible, enabled, has expected text/aria).

This keeps the e2e harness resilient against text/style changes.

## Backend coupling map (preview — finalized in Step 03)

| UI element | Backend call | Migrating to |
|-----------|--------------|--------------|
| G-05..G-12 (categories) | `supabase.functions.invoke('generate-research-goal')` + `optimize-research-config` | `LOCAL_FN` / `GCF` |
| Plan generation (A-02, I-01 submit) | `goapPlanner.ts` (local) + `supabase.functions.invoke('research-step')` | local + `LOCAL_FN` / `GCF` |
| Report rendering (I-08, RM-*) | reads from local plan state + `supabase.from(...)` | `RVF_BROWSER` (IndexedDB) |
| Revise form (R-*) | writes to local config state + `supabase.functions.invoke('optimize-research-config')` | local + `LOCAL_FN` / `GCF` |


<!-- auto-regen-footer:start -->
<!-- This file is regenerated nightly by
     `.github/workflows/goal_ui-nightly-doc.yml` (R-7.2 / ADR-100).
     Last regenerated: 2026-05-02T16:35:13Z -->
