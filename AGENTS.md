# Sovereign Finance – Codex Instructions

## Project principle

This project must remain simple, deterministic, and reversible.

Do not make broad architectural changes unless explicitly asked.
Do not add frameworks unless the project already uses them.
Do not change business logic, calculations, persistence, data shape, or API contracts during UI work.

## Change discipline

Work GitHub-first.
Use small, reviewable changes.
Prefer isolated helper functions over copy-paste.
Avoid expanding global state.
Avoid new global variables.
Avoid hardcoded debug strings.
Avoid duplicate event listeners.
Avoid uncontrolled async calls.

## Frontend constraints

Before changing UI, identify:
- affected screen/component/function
- whether the change touches data flow
- whether it affects forecast, check-in, plan, review, dashboard, or persistence

For UI overhaul work:
- visual/layout changes are allowed
- finance calculations are not allowed to change
- data schema is not allowed to change
- API behavior is not allowed to change
- existing flow must keep working

## Validation

After JavaScript edits, run:
node --check <changed-js-file>

If Python is touched, run:
python3 -m py_compile <changed-python-file>

Before final response, summarize:
- files changed
- what changed
- why it is safe
- validation run
- risks or manual tests needed
