# Dashboard risk map (2026-07-08)

Scope: documentation of dashboard behavior in `static/app.js` as inspected on 2026-07-10. This is a risk map, not a change proposal. It deliberately preserves the current finance calculations, persistence shape, API contracts, and rendering behavior. Line numbers refer to the inspected file and will drift as that file changes.

## Executive summary

The active dashboard is not one renderer. `renderDash` at lines 1585-1697 is the base renderer, after which many IIFEs replace `window.renderDash` with successively nested wrappers. Three early patches also wrap `window.renderDashboard`, but after initial assignment the two globals can become different wrapper chains. Several patches additionally run on `DOMContentLoaded` or an independent `setTimeout`, so one visible dashboard can be produced by overlapping asynchronous reads and rendered-text parsing.

The highest-risk area is therefore orchestration, not the individual formatting and classification functions. Do not reorder wrappers, remove delays, merge fetches, or change the global aliases until an explicit async-read consolidation design defines one finance snapshot, one events snapshot, error behavior, and render ordering.

## 1. `renderDash` / `renderDashboard` assignments, wrappers, and calls

### Earlier local functions and calls

- Lines 702 and 880 define separate, local no-op `renderDashboard()` functions inside two legacy wizard wiring IIFEs. They are called after saves at lines 755 and 968. These are lexically scoped and are not the global dashboard renderer.
- Lines 1585-1695 define the active base `renderDash()`.
- Lines 1696-1697 initially assign both `window.renderDash` and `window.renderDashboard` to that base function.
- Line 1776 directly calls the lexical base `renderDash()` on `DOMContentLoaded`; it does not call the later global wrapper chain.
- Lines 1741-1772 define `renderDash_disabled()`, which is never assigned or called.

### Global wrappers, in source/install order

Every entry below captures the then-current function in `orig`, `orig2`, or `original`, awaits it, and adds work unless noted otherwise.

| Lines | Global replaced | Added work |
|---|---|---|
| 2563-2581 | both globals | last check-in info; each alias gets its own wrapper |
| 2664-2681 | both globals | deviation explanation; each alias gets its own wrapper |
| 2727-2741 | both globals | schedules forced deviation refresh after 50 ms |
| 2825-2842 | both globals | schedules monthly trend after 60 ms |
| 3012-3020 | `renderDash` | reason (`/api/finance` + `/api/events`) |
| 3071-3079 | `renderDash` | status line parsed from rendered text |
| 3142-3150 | `renderDash` | risk text parsed from rendered text |
| 3208-3216 | `renderDash` | daily budget parsed from rendered text |
| 3279-3287 | `renderDash` | pressure parsed from rendered text |
| 3350-3363 | `renderDash` | days money lasts, parsed from rendered text |
| 3402-3415 | `renderDash` | disabled risk-period renderer (still adds a wrapper) |
| 3534-3542 | `renderDash` | tempo (`/api/events` plus rendered daily budget) |
| 3654-3662 | `renderDash` | pressure zone (`/api/events`) |
| 3740-3748 | `renderDash` | next pressure zone from `dashPressureZone.textContent` |
| 3913-3921 | `renderDash` | rhythm/realistic end (`/api/events` plus rendered expected end) |
| 4053-4061 | `renderDash` | shock classifier (`/api/events`) |
| 4141-4149 | `renderDash` | first-month mode (`/api/events`) |
| 4245-4252 | `renderDash` | read-only/advanced-mode classes |
| 4304-4311 | `renderDash` | moves expected-end/deviation line |
| 4327-4338 | `renderDash` | hides the moved line if both values are empty/zero-like |
| 4513-4521 | `renderDash` | calm empty state (`/api/events`) |
| 4631-4639 | `renderDash` | economic weather from rendered text |
| 4678-4686 | `renderDash` | top-level days value from rendered text |
| 4928-4936 | `renderDash` | strategy evaluation; reads both APIs and writes finance |
| 5024-5032 | `renderDash` | human strategy summary (`/api/finance`) |

There are no later direct calls of `window.renderDash()` or `window.renderDashboard()` in this file. Wrapper bodies call their captured predecessor with `apply`. The independent startup calls listed in the timing section are consequently important: they can run even if no consumer invokes the final global wrapper.

## 2. Dashboard-related DOM IDs

IDs directly read, written, created, moved, hidden, or classified by dashboard code are:

| Group | IDs |
|---|---|
| Core values | `dashAvailable`, `dashExpectedEnd`, `dashDeviation`, `dashMeta`, `dashCashflow` |
| Check-in/trend | `dashCheckinInfo`, `dashDeviationInfo`, `dashMonthTrend` |
| Reason/risk/pressure | `dashReason`, `dashReasonStatus` (created dynamically), `dashStatusText`, `dashRisk`, `dashDaily`, `dashPressure`, `dashDaysLeft` |
| Behavioral/history | `dashTempo`, `dashTempoVsPlan`, `dashPressureZone`, `dashNextPressureZone`, `dashRhythm`, `dashRealisticEnd`, `dashShockType`, `dashShockEval` |
| Modes/layout | `dashFirstMonth`, `dashCalmState` (created dynamically), `dashExpectedLine` (created dynamically), `roModeCss` (created dynamically), `btnToggleAdvanced` |
| Derived guidance | `dashGuidance`, `dashWeather`, `dashDaysTop` |
| Strategy | `dashStrategyTop`, `dashStrategyAdvice`, `dashStrategyList`, `strategySummaryOverall`, `strategySummaryAdvice`, `strategySummaryList`, `strategySummaryDetails` |
| Cross-flow trigger | `btnWizNext` (dashboard refresh hooks after wizard activity) |

`dash-advanced-line` and `dash-primary-line` at lines 4195-4212 are CSS classes, not IDs. `legacyBudgetWrap`, `legacyBaselineWrap`, and `itemStartMonth` occur near dashboard code but belong to disabled legacy visibility or wizard/item setup rather than dashboard output.

## 3. Patches that parse rendered text

These paths use the DOM as an implicit data bus and are sensitive to labels, locale formatting, render order, and timing:

- Status line, lines 3050-3068: parses `document.body.innerText` for `Afvigelse`.
- Risk, lines 3123-3137: parses body text for `Afvigelse`, `Til rådighed nu`, and `Forventet slut`.
- Daily budget, lines 3188-3201: parses body text for `Til rådighed nu`.
- Pressure, lines 3263-3274: parses body text for daily budget and deviation.
- Days money lasts, lines 3313-3343: parses body text for available money and daily budget.
- Tempo, lines 3442-3446 and 3489-3529: parses the rendered daily-budget label.
- Rhythm/realistic end, lines 3771-3776 and 3887-3909: parses the rendered expected-end label.
- Economic weather, lines 4538-4545 and 4611-4628: generic body-text parsing for daily budget and days money lasts; also reads `dashFirstMonth.textContent`.
- Days top, lines 4656-4662 and 4664-4674: parses body text for days money lasts.
- Strategy V2, lines 4712-4719 and 4877-4909: parses body text for daily budget, days money lasts, expected end, and deviation before persisting evaluation.
- Next pressure zone, lines 3700-3735: does not scan the body, but parses the previously rendered `dashPressureZone.textContent` and therefore has the same ordering risk.
- Expected-line layout, lines 4264-4290: reads/moves dashboard nodes and rewrites `parent.innerHTML` with a regex over rendered markup. This is rendered-markup coupling even though it is not `innerText`.

The unrelated card parser at lines 2462-2484 uses `card.innerText`; it is not a dashboard patch and is excluded from the dashboard dependency chain.

## 4. Dashboard reads from `/api/finance`

Active dashboard paths are:

- Base renderer, lines 1585-1695: may read through `getFinance()` or `api('/api/finance')`, then always reads again through its local `apiJson('/api/finance')`, and later calls `getFinance()` for deviation (with a nested retry). This can represent multiple snapshots in one render.
- Last check-in info, lines 2524-2558: prefers `window.getFinance`, otherwise fetches `/api/finance`.
- Deviation explanation, lines 2636-2654: prefers `window.getFinance`, otherwise fetches `/api/finance`.
- Forced deviation, lines 2705-2723: prefers lexical `getFinance`, otherwise fetches `/api/finance`.
- Monthly trend, lines 2770-2783: prefers lexical `getFinance`, otherwise fetches `/api/finance`.
- Standalone dashboard summary on `DOMContentLoaded`, lines 2864-2899: fetches `/api/finance` independently of `renderDash`.
- Dashboard reason, lines 2996-3004: reads `/api/finance` and `/api/events`.
- Strategy V2, lines 4877-4909: reads `/api/finance` and `/api/events`, then posts the mutated finance object.
- Human strategy summary, lines 4983-5014: reads `/api/finance`.

Inactive/legacy references worth preserving as landmarks: the returned early duplicate block at lines 1706-1734 and uncalled `renderDash_disabled` at lines 1741-1772 both contain finance reads but do not currently execute. Earlier wizard/status code also reads finance, but is not a dashboard render path unless its output later triggers one of the dashboard hooks.

## 5. Dashboard reads from `/api/events`

- Monthly trend, lines 2785-2814.
- Dashboard reason, lines 2996-3004.
- Tempo, lines 3480-3487.
- Pressure zone, lines 3559-3567.
- Rhythm/realistic end, lines 3794-3802.
- Shock classifier, lines 3938-3946.
- First-month mode, lines 4078-4086.
- Calm empty state, lines 4440-4448.
- Strategy V2, lines 4877-4881.

The next-pressure-zone patch does not fetch events itself; it consumes pressure-zone text. Other `/api/events` reads around lines 2312 and dashboard-adjacent check-in prompting are outside dashboard rendering.

## 6. Dashboard writes to `/api/finance`

The active dashboard write is Strategy V2 at lines 4903-4911. It assigns `finance.strategy_eval` and POSTs the entire finance object to `/api/finance`. Because this is installed both as a `renderDash` wrapper and as a 1600 ms startup task, rendering is not read-only.

Other finance POSTs in the file (for example wizard/item/check-in code around lines 638, 817, 1029, 1300, and 1442) are mutation flows, not dashboard render paths. They should not be conflated with the Strategy V2 render-time write.

## 7. Timing and delayed-render dependencies

Dashboard-specific delays are:

- After wizard next: check-in info and deviation info at 900 ms (lines 2585-2589 and 2684-2688); monthly trend at 900 ms (lines 2845-2849).
- Wrapper follow-ups: forced deviation at 50 ms (2731), monthly trend at 60 ms (2829).
- Independent startup sequence: reason 250 ms (3023), status 350 ms (3082), risk 400 ms (3153), daily budget 450 ms (3219), pressure 500 ms (3290), days-left 500 ms (3368), disabled risk-period 500 ms (3420), tempo 550 ms (3545), pressure zone 700 ms (3665), next pressure zone 800 ms (3751), rhythm 900 ms (3924), shock classifier 1000 ms (4064), first-month mode 1100 ms (4152), calm empty state 1200 ms (4524), weather 1300 ms (4642), days top 1400 ms (4689), Strategy V2 1600 ms (4939), human strategy summary 1800 ms (5035).

These delays encode an implicit dependency ladder: core values → derived daily/risk values → history/mode values → weather/strategy summaries. The wrapper chain also awaits predecessors, but the independent timers can overlap it and each other. A slow network can invert the intended order; text-parsing consumers may observe stale, placeholder, or partially updated labels.

## 8. Safe candidates for future pure-helper extraction

“Safe” means extraction without changing inputs, outputs, constants, rounding, labels, dates, ordering, or call sites. Each should be covered by characterization tests first.

- Formatting/string builders: `fmtKr*`, `buildDashboardMetaText`, `buildDashboardDeviationText`, `describeLastCheckin`, `getDeviationExplanation`, and status/advice text selectors.
- Item arithmetic that already accepts values: `dueThisMonth` and aggregation into income/fixed/debt, provided no calculation is altered or deduplicated across behaviorally different legacy versions.
- Event transformations: event keys/deduplication, date parsing, `buildReason`, pressure-zone calculation, spending-pace calculation, rhythm analysis, shock classification/evaluation, and first-month classification.
- Deterministic presentation decisions: `riskText`, `pressureText`, `nextPressureZoneText`, `weatherText`, strategy severity/worst-status/text/advice, `renderStrategyNames`, and `renderStrategyDetails`.
- Small date helpers such as days-between, phase-of-month, remaining-days, and days-until-day-of-month, while preserving current inclusive/exclusive rules and local-time semantics.

DOM readers, fetchers, wrappers, install functions, and persistence calls should remain outside those helpers. Extraction must not “correct” currently unused helpers or reconcile duplicate formulas as a side effect.

## 9. Sections not to touch before async-read consolidation is planned

- Base `renderDash` and initial aliases (1585-1697), including its repeated finance reads and lexical/global lookup behavior.
- The complete global wrapper installation chain (2491-5038), especially the divergence between `renderDash` and `renderDashboard` after line 1697.
- All `document.body.innerText`, rendered-node-text, and `innerHTML` consumers listed above; their behavior depends on current labels and order.
- The 50-1800 ms timer ladder and `btnWizNext` delayed hooks.
- Standalone finance summary (2863-2903), because it races the base renderer over the same IDs.
- Event-backed patches (reason, trend, tempo, zones, rhythm, shock, first-month, calm state), which currently issue separate reads and may observe different event snapshots.
- Strategy V2 and human summary (4699-5038), because evaluation both consumes rendered text and performs a render-time whole-object finance write that the following summary reads.
- Expected-line DOM relocation and read-only mode patches (4162-4340), because they mutate structure/classes that later text and visibility patches expect.

Async-read consolidation needs an explicit plan for snapshot ownership, refresh triggers, cancellation/staleness, partial API failure, write separation, and a deterministic render phase before any of these sections are modified.

## 10. Recommended order for future dashboard PRs

1. Add characterization coverage and an inventory check for current IDs, labels, wrapper order, timers, finance/event request counts, error fallbacks, and the Strategy V2 POST. No behavior changes.
2. Extract only pure formatting and deterministic classification helpers, one family per small PR, retaining exact call sites and output strings.
3. Define the async-read consolidation design: a single refresh boundary, finance/events snapshot shape, stale-response policy, error semantics, and explicit separation of reads from writes.
4. Consolidate finance reads without changing calculations or API contracts; keep a compatibility entry point for both global renderer names.
5. Consolidate event reads against the same refresh boundary, preserving event filtering, deduplication, and fallbacks.
6. Replace the timer ladder with an explicit ordered render pipeline only after consolidated snapshots exist; preserve visible output with characterization tests.
7. Replace body/label parsing with explicit values passed to pure helpers, one dependency layer at a time (core → daily/risk → history → weather/strategy).
8. Separate Strategy V2 persistence from rendering in a dedicated, explicitly triggered PR; preserve the finance schema and POST contract.
9. Simplify global aliases/wrappers and remove proven-dead dashboard code only after consumers and external callers are inventoried.
10. Make visual/layout dashboard changes last, when data ownership and ordering are deterministic.

No framework rewrite is recommended. The safest direction is small helper extractions followed by a deliberately designed, framework-free orchestration consolidation.
