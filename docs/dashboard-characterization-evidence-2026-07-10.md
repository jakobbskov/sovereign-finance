# Dashboard characterization evidence (2026-07-10)

## Scope

Documentation-only evidence capture for the current Sovereign Finance dashboard.

No runtime files changed.
No deploy required.

Observed branch/commit: docs/dashboard-characterization-evidence / 03ba4e8

## Environment

- Date/time: 2026-07-14T17:21:33+02:00
- Browser: not tested, mobile-only capture
- Viewport: not tested, mobile-only capture
- Auth state: not tested in browser
- Branch: docs/dashboard-characterization-evidence
- Commit: 03ba4e8
- Data state: live data, not modified by this evidence capture
- Advanced mode open: not tested

## HTTP smoke

### Local

Command:
curl -I http://127.0.0.1:5155/

Result:
HTTP/1.1 302 FOUND
Server: gunicorn
Date: Tue, 14 Jul 2026 15:21:33 GMT
Connection: keep-alive
Content-Type: text/html; charset=utf-8
Content-Length: 345
Location: https://auth.innosocia.dk/login?return_to=https%3A%2F%2Ffinance.innosocia.dk%2F

### External

Command:
curl -I https://finance.innosocia.dk/

Result:
HTTP/2 302 
server: nginx/1.28.0
date: Tue, 14 Jul 2026 15:21:33 GMT
content-type: text/html; charset=utf-8
content-length: 345
location: https://auth.innosocia.dk/login?return_to=https%3A%2F%2Ffinance.innosocia.dk%2F

## Live file match

Command:
cmp -s static/app.js /opt/sovereign-finance/static/app.js && echo LIVE_MATCHES_MAIN || echo LIVE_DIFFERS

Result:
LIVE_MATCHES_MAIN

## Browser smoke checklist

- [ ] Login/auth redirect works as expected. Not tested on mobile in this evidence pass.
- [ ] Dashboard loads. Not tested on mobile in this evidence pass.
- [ ] No console errors. Not tested on mobile in this evidence pass.
- [ ] No unhandled promise rejections. Not tested on mobile in this evidence pass.
- [ ] dashAvailable is populated. Not tested on mobile in this evidence pass.
- [ ] dashExpectedEnd and/or dashExpectedLine is populated. Not tested on mobile in this evidence pass.
- [ ] dashDeviation and/or dashExpectedLine is populated. Not tested on mobile in this evidence pass.
- [ ] dashMeta is populated. Not tested on mobile in this evidence pass.
- [ ] dashCashflow is populated. Not tested on mobile in this evidence pass.
- [ ] Strategy summary appears. Not tested on mobile in this evidence pass.
- [ ] Advanced/read-only layout does not visibly break. Not tested on mobile in this evidence pass.
- [ ] Refresh still works. Not tested on mobile in this evidence pass.

Notes:
Browser characterization is intentionally deferred because this evidence pass was captured from mobile/CLI only.

## Network observations: dashboard load

Use DevTools Network with cache disabled and preserve log enabled.

- GET /api/finance count: not tested on mobile in this evidence pass
- GET /api/events count: not tested on mobile in this evidence pass
- POST /api/finance observed during dashboard render: not tested on mobile in this evidence pass
- Other relevant API requests: not tested on mobile in this evidence pass
- Failed requests: not tested on mobile in this evidence pass
- Redirects: HTTP smoke captured above

Chronological request notes:
Not captured. Requires browser DevTools or a later instrumented observation pass.

## Timing observations

Observe from page load until at least 2.5 seconds after network idle.

- Core values appeared first: not tested on mobile in this evidence pass
- Derived values updated later: not tested on mobile in this evidence pass
- Strategy summary updated later: not tested on mobile in this evidence pass
- Any stale/placeholder/partial values observed: not tested on mobile in this evidence pass

Notes:
Timing characterization is deferred. This pass records deploy/runtime reachability and live static-file parity only.

## Check-in interaction observation

Only complete this section if using a safe/disposable or backed-up data state.

- Check-in wizard opened: not tested
- Back/next worked: not tested
- Completion created one expected write: not tested
- Dashboard refreshed after completion: not tested
- Duplicate requests/actions observed: not tested

Notes:
Not tested to avoid modifying live finance data from mobile.

## Status interaction observation

- Status action completed once: not tested
- Duplicate listener/action observed: not tested
- Dashboard/check-in behavior disrupted: not tested

Notes:
Not tested in this evidence pass.

## Result

Overall characterization result:
Partial CLI evidence only. Runtime files match reviewed main, and HTTP smoke was captured. Browser, network, timing, check-in, and status characterization remain open for a later desktop DevTools pass.

## Follow-up

Recommended next PR:
Do not begin async consolidation yet. Either run a desktop browser characterization pass later, or continue only with one tiny pure helper extraction where output and API behavior are unchanged.
