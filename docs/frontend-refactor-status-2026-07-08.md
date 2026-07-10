# Frontend Refactor Status

Date: 2026-07-08

## Purpose

This refactor round reduced frontend review risk before any broader UI overhaul. The work focused on documenting risk, containing visual styling, and extracting tiny dashboard helpers without changing finance calculations, data shape, persistence, or API contracts.

This documentation PR must not change runtime behavior. No deploy is required for this documentation PR.

## Completed Changes

- `AGENTS.md`: added project rules for simple, deterministic, reversible changes; clarified frontend boundaries and validation expectations.
- UI overhaul audit: added `docs/ui-overhaul-audit-2026-07-08.md` to map frontend screens, high-risk flows, listener risks, persistence boundaries, and a phased PR plan.
- CSS containment in `static/index.html`: moved repeated inline styling into contained CSS classes while preserving existing markup, IDs, data attributes, and flow behavior.
- Dashboard DOM map helper: added a small dashboard element lookup helper to reduce repeated DOM queries in dashboard rendering.
- `btnStatus` listener guard: added a guard around status listener installation to reduce duplicate-handler risk.
- `buildDashboardMetaText` helper: extracted dashboard meta text construction into a focused helper.
- `buildDashboardDeviationText` helper: extracted dashboard deviation text construction into a focused helper.

## Confirmed Deploy Model

- Docker container: `sovereign-finance`
- Host/container port mapping: host port `5155` -> container port `5055`
- Static bind mount: `/opt/sovereign-finance/static` -> `/app/static` read-only in container
- Runtime frontend deploy path: `/opt/sovereign-finance/static/`

## Validation Pattern Used

- `node --check static/app.js`
- `git diff --check`
- `git diff main..HEAD`
- Live copy to `/opt/sovereign-finance/static/`
- `cmp` checks for `LIVE_MATCHES_BRANCH` / `LIVE_MATCHES_MAIN`
- `curl` smoke checks
- Browser smoke checks

## Remaining Risk

- `window.renderDash` wrappers still make dashboard rendering order-sensitive.
- Repeated dashboard async fetches still increase timing and fallback-state risk.
- `btnWizNext` listeners remain a high-risk area for duplicate saves or duplicate UI transitions.
- `/api/finance` still accepts full-object writes, so frontend writes can accidentally alter persisted shape.
- Dashboard render paths that write `strategy_eval` keep some rendering paths non-read-only.
- Text parsing from the DOM/body still makes copy and layout changes risky.
- `static/app.js` remains large, patch-heavy, and expensive to review.

## Recommended Next PRs

1. `docs/dashboard-risk-map`: document exact dashboard render wrappers, async reads, DOM text parsing, and persistence writes before more runtime edits.
2. `ui/dashboard-builder-3`: only if pure and tiny; continue extracting helper text/build functions without changing formulas, API calls, or render timing.
3. `ui/status-flow-test-notes` or a manual test checklist: capture expected status, check-in, dashboard, and strategy smoke checks.
4. Async read consolidation: only later, after risk mapping and helper extraction, because consolidating dashboard reads can change timing and fallback behavior.
