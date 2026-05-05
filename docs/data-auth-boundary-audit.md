# Finance data/auth boundary audit

Related issue: #40

## Purpose

This audit documents the current boundary between authentication and data ownership in Sovereign Finance.

The key point is simple:

Sovereign Core Auth can authenticate a user, but the current Finance data model does not yet provide per-user budget separation.

Hybrid auth is access control.
It is not multi-user data isolation.

## Current runtime data model

Sovereign Finance currently uses shared JSON files under the runtime data directory.

In app.py:

- DATA_DIR is based on the application directory
- FINANCE_PATH points to data/finance.json
- EVENTS_PATH points to data/events.json
- DECISIONS_PATH points to data/decisions.json

In Docker runtime:

- /opt/sovereign-finance/data is mounted into the container as /app/data

Live runtime files observed:

- data/finance.json
- data/events.json
- data/decisions.json
- backup variants of finance.json and events.json

These files are shared instance-level data files. They are not scoped by Core Auth user_id.

## Current API surface

The following routes read or write shared Finance state:

- GET /api/finance
- POST /api/finance
- GET /api/events
- POST /api/event
- POST /api/close-month
- GET /api/strategies
- POST /api/plan
- POST /api/plan_detail
- GET /api/months
- POST /api/strategy/select
- POST /api/goals
- POST /api/month/start
- POST /api/month/close
- GET /api/questions
- POST /api/month/refine
- POST /api/simulate
- POST /api/strategy/activate
- GET /api/baseline
- POST /api/baseline
- POST /api/status
- POST /api/scenario/evaluate
- GET /api/decisions
- POST /api/scenario/save

These endpoints are protected by the auth guard, but they do not currently select data files or records based on authenticated user identity.

## Current auth model

Finance supports:

- local Finance session auth using session["finance_auth"]
- optional hybrid Core Auth validation through AUTH_MODE=hybrid
- /api/whoami for auth inspection

The Core Auth adapter extracts user metadata such as:

- user_id
- username
- role

At the time of this audit, that identity is used for authentication and introspection only.

It is not used to scope:

- finance.json
- events.json
- decisions.json
- scenario decisions
- monthly state
- strategy state
- baseline data

## Important boundary

Current safe statement:

Sovereign Finance can accept a Core Auth login in hybrid mode, while still using one shared Finance dataset for the instance.

Unsafe statement:

Sovereign Finance supports multiple users with separate private budgets.

That is not currently true.

## Risk if misunderstood

If multiple Core Auth users are allowed into the same Finance instance today, they will access the same shared Finance data.

That may be acceptable for a single trusted household/admin context.

It is not acceptable as a general multi-user privacy model.

## What real multi-user support would require

A safe multi-user Finance model would need an explicit migration plan.

At minimum it would require:

- a user-scoped data path or database schema
- a clear owner field or user_id relationship for each persisted object
- migration from shared JSON to user-scoped storage
- authorization checks on every read and write endpoint
- tests proving one user cannot read or write another user's data
- backup and restore rules per user or per instance
- explicit UI wording about active user/context
- a decision on admin visibility and support access
- audit/recovery behavior for accidental cross-user writes

Possible future storage models:

1. Per-user JSON files
   - data/users/<user_id>/finance.json
   - data/users/<user_id>/events.json
   - data/users/<user_id>/decisions.json

2. SQLite with user_id columns
   - better for migrations and integrity
   - more work than the current JSON model

3. Keep shared-instance model
   - simplest
   - safe only if the instance is intentionally single-user or household/admin scoped

## Recommended wording

Use this wording in documentation:

Sovereign Finance currently supports shared-instance data. Core Auth integration controls access to the app, but does not yet create separate per-user budgets.

Avoid this wording:

Sovereign Finance is multi-user.

Avoid this wording:

Each Core Auth user has private Finance data.

## Current conclusion

The current Finance data model is single-user/shared-instance.

Hybrid auth can be used as a login mechanism, but not as proof of multi-user data separation.

Before allowing multiple independent users into the same Finance instance, the data model must be redesigned or explicitly scoped by user identity.

## Follow-up candidates

Potential future issues:

- Design user-scoped Finance storage model
- Add user_id ownership checks to Finance API endpoints
- Migrate shared JSON storage to per-user storage
- Add cross-user isolation tests
- Add UI copy clarifying shared-instance mode
- Decide whether Sovereign Finance should remain single-user by design
