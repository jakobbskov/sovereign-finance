# Frontend API helper audit

## Purpose

This note documents the first pass over frontend API helper extraction.

The goal was to determine whether one shared API helper could be safely moved out of `static/app.js` without behavior changes.

## Current finding

Extraction should wait.

`static/app.js` currently contains several API access patterns:

- top-level `api(path, opts)`
- multiple local `apiJson(path, opts)` helpers
- raw `fetch(...)` calls
- helper variants with different request options
- calls with and without `credentials: "same-origin"`
- JSON parsing helpers with different error behavior

At the time of this audit, `static/app.js` contained 27 raw `fetch(...)` calls.

## Why not extract yet

The top-level `api(path, opts)` helper is a possible future extraction candidate, but it currently calls `dbg(...)` for error reporting.

Moving it into a separate classic script now would either:

- introduce a load-order dependency on `dbg(...)`
- require a new global debug hook
- risk changing error behavior

That would violate the current frontend refactor rule: no behavior change.

## Safe next step

Before extracting API helpers, first map active API usage by flow:

- baseline loading and saving
- strategy loading and activation
- check-in wizard
- dashboard rendering
- event/history reads
- scenario evaluation and save

Then consolidate one flow at a time.

## Decision

Do not extract API helpers in this slice.

This issue should close as an audit result rather than a code movement.
