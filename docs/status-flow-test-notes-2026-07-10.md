# Status and check-in flow test notes (2026-07-10)

## Scope

- Documentation-only characterization of the current `static/app.js` flow.
- No behavior, calculation, persistence, data-shape, or API change.
- No deploy required.

## Status flow map

- `init()` initially installs a `btnStatus` click listener that prevents default and awaits `doStatus()`.
- `doStatus()` reads month, start balance, current balance, and note, sends `POST /api/status`, then passes the response to `renderStatusResult()` for feedback/dashboard output. The debounced `currentBalance` input path also calls `doStatus()` after 450 ms with a "Live status" heading.
- Historical prompt blocks also install `btnStatus` or document-level click hooks with 50, 120, or 250 ms delays. They inspect the resulting deviation and may open a deviation-kind prompt.
- The effective duplicate-listener guard is `window.__sf_btnstatus_single_fix`. Its installer clones and replaces `btnStatus`, removing listeners attached directly to the old node, then installs one awaited `doStatus()` handler. Document-level delegated hooks are not removed by cloning.
- A status action can therefore cause `POST /api/status`, followed by `GET /api/events` in `getLatestStatus()`. If the deviation prompt opens and a choice is made, it sends `POST /api/event` with a `deviation-kind` event. The status endpoint itself may persist/log status server-side; preserve that contract.
- Status renders feedback and can update deviation-related dashboard content. Large deviations can trigger prompt behavior after status. No explicit full dashboard refresh is owned by the final status handler, so changing prompt or render timing is unsafe.

## Check-in flow map

- `btnWizard` opens `wizardOverlay`, resets `window.__sf_wiz_step` to 1, and renders the first step. `btnWizardClose` closes it.
- `btnWizBack` decrements the step, bounded at 1. The shell `btnWizNext` listener advances steps 1-4; at step 5 it displays a temporary saving message and closes the overlay after 700 ms.
- Two separate wiring blocks each install a capture-phase step-5 save listener and a step-4 summary listener on `btnWizNext`; these installations have no explicit once/installed guard. Both save paths read `GET /api/finance`, mutate `finance.checkin`, and send the entire object with `POST /api/finance`.
- Completion also sends `POST /api/event` for `checkin`, and conditionally for `surprise` and `extra-save`. The later save block contains an additional `extra-save` submission, so non-zero extra saving has an explicit duplicate-action risk in addition to the duplicate save listeners.
- Each save block closes the wizard and calls a local no-op `renderDashboard()`. Independent hooks refresh `dashCheckinInfo`, `dashDeviationInfo`, and month trend 900 ms after every next-button click. Those hooks use element-local guards: `__sf_checkininfo_hooked`, `__sf_devinfo_hooked`, and `__sf_monthtrend_hooked`.
- The 900 ms hooks read finance, and month trend also reads events. They fire on every next click, not only successful completion, and can race the 700/1200 ms wizard timers and the broader dashboard timer/wrapper chain.
- Main duplicate-action risks are multiple step-5 save listeners, repeated full-finance writes, repeated check-in/surprise/extra-save events, double clicks while async work is pending, and delayed refreshes observing different snapshots.

## Shared risks

- Duplicate listeners and actions on historically patched controls.
- Delayed refreshes that are not tied to successful completion.
- `setTimeout`-based update order and stale/intermediate UI reads.
- Full-object `POST /api/finance` writes that can overwrite persisted shape or newer state.
- Accidental changes to dashboard refresh calls, wrappers, request counts, or timing.
- Current evidence is CLI/mobile-only; authenticated desktop and mobile browser behavior, DevTools requests, and console output remain unobserved.

## Manual test checklist

Use disposable or backed-up finance data and preserve the DevTools network log.

- [ ] One click on Status produces exactly one status action and one expected `POST /api/status`.
- [ ] Status below/above the configured threshold produces no duplicate deviation prompts.
- [ ] One click on Check-in opens one wizard at step 1.
- [ ] Back/Next moves exactly one step per click, respects bounds, and builds the step-5 summary once.
- [ ] Completion sends the expected full-finance write once and each expected event write once.
- [ ] Dashboard check-in, deviation, and trend content refresh after successful completion and settles correctly.
- [ ] Network log shows no duplicate POSTs, prompts, closes, step transitions, or other actions.
- [ ] Console shows no errors or unhandled promise rejections throughout both flows.
- [ ] Reload succeeds and persisted status/check-in/dashboard output remains correct.

## Stop conditions for future runtime PRs

Stop, investigate, and do not merge when any of these occurs without explicit approval:

- Any new listener on `btnStatus` or `btnWizNext` without an explicit installation/duplicate-action guard.
- Any changed status, finance, or event write trigger, payload, count, order, or API behavior.
- Any duplicate POST.
- Any changed dashboard refresh trigger or timing.
- Any failed authenticated desktop or mobile browser smoke check.
- Any runtime file changed in a documentation PR.

## Recommended next PR

Choose only one:

- `ui/dashboard-builder-5`, only for one pure, tiny helper extraction with identical output, calls, and timing; or
- `docs/check-in-evidence`, after a real authenticated browser/DevTools observation using safe data.

Do not start a status or check-in listener refactor yet.
