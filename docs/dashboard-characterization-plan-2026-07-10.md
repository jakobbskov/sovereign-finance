# Dashboard characterization plan (2026-07-10)

## 1. Purpose and scope

This is a documentation and test plan for observing the current dashboard before any runtime refactor. It changes no behavior, calculations, persistence, data shape, API contract, or UI. No deploy is required. Do not introduce automated tests in this PR.

## 2. Characterization goals

Record enough evidence to preserve:

- Current visible dashboard output, including exact labels, values, fallbacks, and layout.
- Current API read/write behavior, including the existing render-time strategy write if observed.
- Current `renderDash`/`renderDashboard` wrapper order and delayed-render behavior until an explicitly approved refactor changes them.
- Check-in, status, and dashboard interactions, including refreshes and listener behavior.

Capture screenshots, console output, and a browser network trace against a known finance/events fixture or recorded live state. Record browser, viewport, auth state, date/time, data state, branch/commit, and whether advanced mode is open.

## 3. Manual browser smoke checklist

- [ ] An unauthenticated visit follows the expected login/auth redirect; an authenticated visit returns to the app.
- [ ] Dashboard loads without console errors or unhandled promise rejections.
- [ ] Available amount appears in `dashAvailable`.
- [ ] Expected end appears in `dashExpectedEnd` and/or the moved `dashExpectedLine`.
- [ ] Deviation appears in `dashDeviation` and/or the moved `dashExpectedLine`.
- [ ] Cashflow/meta content appears in `dashCashflow` and `dashMeta`.
- [ ] Check-in wizard opens; back/next navigation works; a check-in can be completed once.
- [ ] Dashboard values and check-in/trend information refresh after completion.
- [ ] Strategy summary/top guidance still appears.
- [ ] Advanced/read-only layout, advanced toggle, and expected-end/deviation line do not visibly break at desktop and mobile widths.
- [ ] Status action still completes once and does not disrupt dashboard or check-in behavior.

For each check, record expected and actual text, a screenshot where useful, and pass/fail. Use a disposable or backed-up data state because completing check-in can write finance data and events.

## 4. API/network observations before refactors

Use DevTools with the network log preserved and cache disabled. Record a fresh authenticated dashboard load and one completed check-in:

- Exact count and chronological order of `GET /api/finance` reads during dashboard load.
- Exact count and chronological order of `GET /api/events` reads during dashboard load.
- Whether dashboard/strategy rendering sends a `POST /api/finance`; record timing and whether `strategy_eval` is the changed field, without publishing sensitive payload data.
- HTTP status code for every relevant request, including redirects and failed/fallback requests.
- Requests triggered after check-in, with duplicate finance reads, event reads, finance writes, or event writes called out explicitly.

Do not normalize request counts yet: separate reads may observe different snapshots, and Strategy V2 currently may POST the whole finance object during rendering.

## 5. DOM and label observations

Record final text, initial placeholder, later updates, visibility, and parent/order for these core IDs:

- Core: `dashAvailable`, `dashExpectedEnd`, `dashDeviation`, `dashMeta`, `dashCashflow`.
- Check-in/derived: `dashCheckinInfo`, `dashDeviationInfo`, `dashMonthTrend`, `dashReason`, `dashStatusText`, `dashRisk`, `dashDaily`, `dashPressure`, `dashDaysLeft`.
- History/mode: `dashTempo`, `dashPressureZone`, `dashNextPressureZone`, `dashRhythm`, `dashRealisticEnd`, `dashShockType`, `dashFirstMonth`, `dashWeather`, `dashDaysTop`.
- Strategy: `dashStrategyTop`, `dashStrategyAdvice`, `dashStrategyList`, `strategySummaryOverall`, `strategySummaryAdvice`, `strategySummaryList`, `strategySummaryDetails`.

Preserve and record labels parsed from rendered text: `Afvigelse`, `Til rådighed nu`, `Forventet slut`, the rendered daily-budget label, and the days-money-lasts text. Also record parsing of `dashPressureZone.textContent` and expected-line markup.

Dynamic elements to inventory are `dashReasonStatus`, `dashCalmState`, `dashExpectedLine`, and `roModeCss`. Known layout mutations are read-only/advanced class application, movement/removal of the expected-end/deviation markup, conditional hiding of `dashExpectedLine`, calm-state insertion, and advanced-toggle visibility/class changes. Capture a post-settle DOM snapshot rather than treating newly generated markup as a new contract.

## 6. Timing observations

Record screen video or timestamped DOM/network observations from navigation through at least 2.5 seconds after network idle. Preserve the known ladder:

- Wrapper follow-ups: forced deviation at 50 ms; monthly trend at 60 ms.
- Startup: reason 250; status 350; risk 400; daily 450; pressure/days/risk-period 500; tempo 550; pressure zone 700; next pressure zone 800; rhythm 900; shock 1000; first-month 1100; calm state 1200; weather 1300; days top 1400; Strategy V2 1600; human strategy summary 1800 ms.
- After wizard next: check-in info, deviation info, and monthly trend at 900 ms.

Record which core values appear first, which derived/history/strategy values update later, and every visible intermediate placeholder or replacement. Repeat with throttled/slow networking and note stale, partial, reordered, or never-updated values. Do not remove or reorder timers as part of characterization.

## 7. Minimal future test harness

The first step is observation and a checked-in evidence summary, not an automated rewrite. Later, a small local static/JavaScript characterization script may snapshot required IDs, labels, mutations, and request order. It needs no framework and must not alter runtime behavior, timing, payloads, or data. Do not introduce that script or any tests in this PR.

## 8. Stop conditions for future runtime PRs

Stop, investigate, and do not merge or deploy when any of these occurs without explicit approval:

- Visible dashboard text, formatting, fallback, value, order, or visibility changes.
- API request count or order changes.
- A new `POST /api/finance` or a changed finance payload/write trigger appears.
- Duplicate check-in or status listeners/actions are observed.
- Console errors or unhandled rejections appear.
- Deployed runtime files do not match the reviewed branch.
- Any browser smoke check fails.

## 9. Recommended next PR

Choose one small follow-up:

- `ui/dashboard-builder-3`: extract one pure helper only, preserving exact inputs, output text, formulas, call sites, API behavior, and timing; or
- `docs/status-flow-test-notes`: map status/check-in listeners, requests, writes, and refresh behavior first if the characterization evidence remains ambiguous.

Do not begin async consolidation, wrapper reordering, timer removal, DOM-label parsing removal, or layout overhaul in either PR.
