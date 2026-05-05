# Sovereign Core Auth integration audit

## Purpose

This document prepares the integration of Sovereign Finance with the shared Sovereign Core Auth model.

This is planning only. No runtime behavior is changed by this audit.

Related issue: #25
Implementation issue: #1

## Current Finance auth model

Sovereign Finance currently uses local Flask session auth.

Runtime config:

- FLASK_SECRET_KEY
- FINANCE_PASSWORD
- COOKIE_SECURE
- SOVEREIGN_FINANCE_ENV

Current behavior:

- /login renders a local password form.
- POST /login compares submitted password with FINANCE_PASSWORD.
- successful login sets session finance_auth to true.
- protected API endpoints return 401 with ok false and error unauthorized without local session.
- static assets and health endpoint are allowed without login.

Current local session marker:

session["finance_auth"] = True

## SovereignStrength auth model

SovereignStrength already validates shared auth through Sovereign Core Auth.

Observed config pattern:

- AUTH_VALIDATE_URL
- AUTH_COOKIE_NAME
- AUTH_CACHE_TTL_SECONDS

Observed default validate endpoint:

https://auth.innosocia.dk/api/auth/validate

Observed default cookie name:

sovereign_session

Observed backend behavior:

- read incoming request Cookie header.
- forward cookie header to AUTH_VALIDATE_URL.
- use a short timeout when calling auth service.
- cache auth validation results briefly.
- return 401 unauthorized if no valid auth session exists.
- return 503 auth_unavailable if the auth service cannot be reached.
- expose authenticated identity to endpoint code as user_id, username, and role.

## Main difference

Finance currently asks for its own password.

Strength trusts the central auth service and validates the shared session cookie.

That means Finance should not jump directly from local auth to full shared auth without a compatibility phase.

## Trust boundary

Finance must not decode or trust the cookie directly.

Finance should only trust the central auth service response.

Finance should treat the auth service as authoritative for:

- whether the session is valid
- who the user is
- the user's role

Finance should not hardcode auth domain assumptions directly in route logic.

## Required future runtime config

Recommended future variables:

AUTH_VALIDATE_URL=https://auth.innosocia.dk/api/auth/validate
AUTH_COOKIE_NAME=sovereign_session
AUTH_CACHE_TTL_SECONDS=300
AUTH_MODE=local|core|hybrid

AUTH_MODE should control migration safely:

- local: current Finance password auth only.
- core: shared Sovereign Core Auth only.
- hybrid: accept valid Core Auth first, fallback to local Finance auth.

## Recommended migration path

### Step 1: Add auth adapter without changing behavior

Create isolated backend helpers:

- get_current_core_auth_user()
- require_core_auth_user()
- _get_cached_auth_user()
- _set_cached_auth_user()

Do not wire them into the login guard yet.

Validation:

- unit tests for valid auth response.
- unit tests for invalid auth response.
- unit tests for auth service unavailable.
- no live behavior change.

### Step 2: Add hybrid auth mode

Introduce AUTH_MODE=hybrid.

Guard behavior:

1. allow static assets, health, login, logout.
2. if local Finance session exists, allow.
3. else validate Core Auth cookie.
4. if Core Auth is valid, allow and expose user identity.
5. if Core Auth is unavailable, return 503 for API and a clear message for pages.
6. if Core Auth is invalid, redirect page requests to central login or local login depending on configured mode.

Validation:

- existing local login still works.
- shared auth cookie works.
- invalid session returns 401 for API.
- unavailable auth service returns 503 for API.
- static assets still return 200 without auth.

### Step 3: Switch production to core auth

Only after hybrid is verified:

AUTH_MODE=core

At that point:

- local password login can be disabled or hidden.
- local fallback can remain documented as rollback-only.
- runtime rollback is changing AUTH_MODE back to local.

## Frontend implications

Frontend should not receive or store a new global auth state object.

If needed later, add a small endpoint:

GET /api/whoami

Expected valid session response:

{
  "ok": true,
  "authenticated": true,
  "user": {
    "user_id": "...",
    "username": "...",
    "role": "..."
  }
}

Expected invalid session response:

{
  "ok": false,
  "authenticated": false,
  "error": "unauthorized"
}

Expected auth unavailable response:

{
  "ok": false,
  "error": "auth_unavailable"
}

## Rollback strategy

Before deployment:

- backup /opt/sovereign-finance/app.py
- verify .env
- keep FINANCE_PASSWORD
- keep AUTH_MODE=local as rollback option

Rollback:

1. set AUTH_MODE=local
2. rebuild/restart container
3. verify /api/health
4. verify local login
5. verify /api/finance requires auth

## Risks

### Auth service unavailable

Mitigation:

- short timeout
- return 503 rather than silently allowing access
- cache valid sessions briefly

### Static assets accidentally protected

Mitigation:

- keep regression tests for /static/app.js
- keep regression tests for /static/sf-format.js

### Finance data becomes multi-user without data separation

Finance currently stores household finance data in shared JSON files.

Core Auth identifies a user, but Finance data is not yet clearly scoped per user.

Do not treat Core Auth integration as multi-user support.

First integration should preserve current single-household data model.

### Hardcoded domain assumptions

Mitigation:

- use AUTH_VALIDATE_URL
- do not hardcode auth domain inside route logic

## Decision

Do not implement Core Auth in this audit issue.

Next implementation should be a separate issue that adds a Core Auth adapter while keeping Finance local auth behavior unchanged.
