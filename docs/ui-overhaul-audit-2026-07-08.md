# Frontend UI Overhaul Audit

Date: 2026-07-08  
Branch: `ui/codex-overhaul-audit`

## Scope

This audit reviews the Sovereign Finance frontend for a future UI overhaul. It is documentation-only and does not propose framework rewrites, business-logic changes, data-shape changes, persistence changes, or API behavior changes.

The current frontend is compact in file count but not in implementation size. Most UI behavior lives in `static/app.js`, which is very large and patch-heavy. Future UI work should first reduce review risk around rendering, event listeners, and persistence boundaries before making broad visual changes.

## Boundaries

Frontend:

- `static/index.html` defines the page shell, inline styles, dashboard markup, check-in wizard, budget item editor, legacy budget sections, strategy summary, and inline error UI.
- `static/app.js` contains most frontend behavior: rendering, event wiring, API calls, dashboard patches, check-in persistence, item editing, and strategy display.
- `static/sf-format.js` contains shared formatting helpers.

Backend:

- `app.py` serves the static frontend and provides the Flask API.
- Key API routes used by the frontend include `/api/finance`, `/api/events`, `/api/event`, `/api/strategies`, `/api/strategy/active`, `/api/strategy/activate`, `/api/strategy/params`, `/api/baseline`, `/api/status`, and month/scenario endpoints.

Data:

- Runtime finance data is stored in JSON files under `data/` at runtime.
- `/api/finance` writes the posted JSON object wholesale. Any frontend code that posts a modified finance object can accidentally change persisted data shape if fields are dropped, renamed, or recomputed.
- `/api/event` appends events and has last-event dedupe, which helps mitigate duplicate frontend event submissions but does not eliminate listener risk.

Auth/proxy:

- The frontend uses same-origin API calls.
- Core Auth validation is handled server-side in `app.py`; there is no separate frontend proxy layer.

## Main Screens And Flows

Dashboard:

- Default screen.
- Shows available amount, expected end/deviation line, dashboard guidance, risk/tempo/rhythm/shock/strategy summaries, and the primary check-in action.
- Rendering is split across inline `index.html` script, the main `renderDash` function, and many later dashboard patch blocks in `static/app.js`.

Check-in wizard:

- Modal flow opened by `btnWizard`.
- Collects current balance, income state, unexpected amount/label, and extra saving.
- Saves to `/api/finance` and logs events to `/api/event`.
- High-risk area because `btnWizNext` has multiple listeners and the final-step save logic appears in more than one patch block.

Budget items:

- Current model uses `items[]` with type, category, payment, interval, and optional start month/pay day.
- The item editor reads and writes the full finance object through `/api/finance`.
- Legacy budget sections still exist and are hidden by frontend patches when `items[]` exists.

Strategy:

- Strategy selector and active strategy display use strategy API routes.
- Dashboard strategy summary also evaluates strategy state on render.
- A dashboard/strategy render path may write `finance.strategy_eval` back to `/api/finance`, so visual rendering is not purely read-only today.

Status and month close:

- Status uses `/api/status`.
- Month close uses `/api/month/close`.
- These are calculation-sensitive flows and should not be changed in visual-only PRs.

## Rendering Implementation

UI rendering is currently implemented in several overlapping ways:

- Static markup in `static/index.html`.
- Inline script in `static/index.html` that renders dashboard values from `/api/finance`.
- `innerHTML` rendering in `static/app.js` for strategy cards, feedback/status output, item lists, modals, and dashboard helper lines.
- A primary `renderDash` function exposed as `window.renderDash`.
- Many patch blocks wrap `window.renderDash` and/or `window.renderDashboard`, then mutate individual dashboard elements after the base render.
- Several dashboard patches parse text back out of `document.body.innerText` instead of receiving structured data.

This makes dashboard UI changes risky. Changing labels, moving elements, hiding elements, or changing render timing can break later patches that depend on specific text, IDs, or previously rendered values.

## Global State And Patch Flags

There is no single large `STATE` object, but there is extensive global state:

- `nowAbs` and `window.nowAbs`.
- `STRATEGIES` and `ACTIVE_ID`.
- `_sf_liveTimer`.
- `window.__sf_wiz_step`.
- Many `window.__sf_*` flags used to prevent repeated patch installation.
- `window.renderDash` and `window.renderDashboard` are repeatedly replaced/wrapped.

Future UI work should avoid adding new global state. If state is needed, prefer local helpers scoped to a single feature.

## Repeated DOM Queries

The frontend repeatedly uses `document.getElementById`, local `$` helper functions, `querySelectorAll`, and document-level text parsing. This is not automatically wrong, but it increases review and regression risk because each patch independently discovers and mutates the DOM.

Low-risk future cleanup:

- Add feature-local DOM lookup helpers.
- Cache dashboard element references inside a dashboard module/helper.
- Preserve all existing IDs and `data-*` attributes while doing so.

## Event Listener Risks

Known listener risks:

- Many separate `DOMContentLoaded` handlers.
- `btnWizNext` is wired by wizard navigation, check-in save handlers, summary handlers, and dashboard refresh hooks.
- `btnStatus` has enough historical duplication risk that a hotfix clones the button to remove previous listeners.
- Document-level delegated click handlers are used for item editing/deletion.
- Backend event dedupe helps, but frontend listener duplication can still affect UI timing, status messages, or multiple API calls.

Before visual overhaul work, `btnWizNext` and `btnStatus` should be treated as high-risk controls.

## Hardcoded Strings

Most UI copy is hardcoded directly in HTML or JavaScript. This includes Danish status text, error text, dashboard explanation text, empty states, strategy advice, and debug/error labels.

For the upcoming UI overhaul, copy changes should be reviewable separately from calculation and persistence changes. Avoid changing text that later dashboard patches parse unless the parser is removed or replaced in the same focused PR.

## Async Calls And Error Handling

The frontend has a mix of robust and silent async behavior:

- The primary `api` helper validates HTTP status and JSON content type.
- Several local `apiJson` helpers parse JSON defensively and throw on failed status.
- Many dashboard patches catch errors silently and show empty or fallback text.
- Many independent patches fetch `/api/finance` and `/api/events` separately.
- Several render patches depend on timers such as `setTimeout(..., 900)` or similar render-delay sequencing.

Risk: changing visual structure or render timing can alter the outcome of async dashboard patches.

## Key High-Risk Areas

Preserve these risks as blockers for broad visual PRs:

- `static/app.js` is very large and should not be expanded further without isolating new logic.
- Dashboard rendering is patched and wrapped in many places through `window.renderDash` and `window.renderDashboard`.
- The check-in wizard has duplicated/listener risk, especially around `btnWizNext`.
- `/api/finance` writes posted JSON wholesale, so frontend writes can accidentally alter persisted data shape.
- Strategy/dashboard render code may write `strategy_eval` into finance data.
- Legacy UI hiding depends on DOM text, headings, IDs, and timing.
- Some dashboard logic parses rendered text from the page instead of structured data.
- Visual UI changes must not alter calculations, data shape, persistence, or API behavior.

## Low-Risk Visual Improvements

Reasonable visual-only improvements, if carefully scoped:

- Improve spacing, typography, and button states in CSS.
- Make the dashboard hierarchy clearer while keeping all existing IDs.
- Improve mobile layout constraints for cards, rows, and buttons.
- Clean up repeated inline style values by adding CSS classes.
- Improve empty/loading/error display without changing when API calls happen.
- Make budget item rows easier to scan while preserving all `data-*` attributes.
- Make advanced sections visually calmer while preserving `.adv` and advanced-toggle behavior.

## Phased PR Plan

1. Documentation PR
   - Add this audit.
   - No runtime behavior changes.

2. CSS containment PR
   - Move safe repeated inline styles into local CSS classes.
   - Preserve all IDs, `data-*` attributes, forms, and API calls.
   - Do not change calculations or persistence.

3. Dashboard DOM map PR
   - Add a small dashboard element lookup helper.
   - Replace repeated dashboard DOM lookups where safe.
   - Do not change render order, formulas, or text parsing yet.

4. Listener safety PR
   - Inventory and guard critical listeners.
   - Focus first on `btnWizNext` and `btnStatus`.
   - Keep behavior identical.

5. Rendering extraction PR
   - Extract pure string/DOM builders for dashboard and item rows.
   - Keep formulas, payloads, and storage unchanged.
   - Avoid new global state.

6. Async consolidation PR
   - Reduce duplicate `/api/finance` and `/api/events` reads inside dashboard rendering.
   - Keep fallback text and derived values equivalent.
   - Treat as higher risk than CSS-only work.

7. Visual overhaul PR
   - Apply the actual visual redesign after the safety PRs.
   - Keep API behavior, persistence, finance calculations, and data shape unchanged.
   - Keep the existing check-in, dashboard, budget, strategy, status, and month flows working.

## Manual Test Areas For Future UI PRs

For every future UI PR, manually test:

- Dashboard initial load.
- Dashboard values after refresh.
- Advanced toggle open/closed state.
- Check-in wizard open, back/next navigation, close.
- Check-in final save creates expected finance/checkin state.
- Check-in final save does not create duplicate events.
- Surprise and extra-save events appear once.
- Budget item add/edit/delete.
- Legacy budget sections remain hidden when `items[]` exists.
- Strategy activation and active strategy display.
- Strategy params save.
- Strategy summary/dashboard strategy lines.
- Status flow.
- Month close flow.
- Empty data/first-month dashboard state.
- API error/fallback display where practical.
- Mobile layout for dashboard, wizard, and budget editor.

## Validation Guidance

For JavaScript changes, run:

```sh
node --check static/app.js
```

For Python changes, run:

```sh
python3 -m py_compile app.py
```

For visual-only PRs, prefer small diffs and include manual test notes in the PR description.
