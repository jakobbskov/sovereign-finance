# Architecture

## Overview

Sovereign Finance is designed as a lightweight, self-hosted application focused on clarity, local control, and understandable financial logic.

The architecture favors simplicity and maintainability rather than layered complexity. The system is intended to remain readable and modifiable by a single operator.

## Runtime environment

The application currently runs on the **Beelink host**, separate from the Raspberry Pi infrastructure that hosts the public Nextcloud node.

This separation keeps financial tooling independent of the cloud-facing node.

## Main components

### 1. Frontend

The frontend contains the user-facing logic and interface.

Current known file location:

`/opt/sovereign-finance/static/app.js`

The frontend is responsible for:

- rendering the interface
- capturing user inputs
- executing client-side financial logic
- interacting with the internal application state

### 2. Application logic

The core financial logic is rule-based and designed to remain transparent.

Typical logic includes:

- strategy selection
- budget reasoning
- financial trade-off evaluation
- decision-support feedback

The system intentionally favors **deterministic rules** over opaque algorithmic systems.

### 3. Data layer

Application data should remain structured, inspectable, and easy to back up.

The long-term goal is a file-based or clearly structured storage model that supports:

- financial categories
- strategy definitions
- budget states
- rule evaluation

Further structure is documented in `docs/data-model.md`.

### 4. Platform integration

Sovereign Finance is part of the broader **Sovereign application ecosystem**, which includes:

- Sovereign Planta
- Sovereign Strength

These applications share architectural principles but remain operationally independent.

## Architecture principles

The system follows these principles:

- local-first operation
- self-hosted infrastructure
- minimal external dependencies
- readable logic
- deterministic behavior
- operational transparency

## Logical flow

Typical execution flow:

1. User opens the financial interface
2. Frontend loads relevant state and configuration
3. Financial logic evaluates conditions
4. Results are presented as structured feedback to the user

The goal is a system that behaves more like an **explainable tool** than an opaque application.

## Operational goals

The architecture should remain:

- understandable
- portable
- easy to back up
- easy to debug
- easy to evolve

## v0.3 implementation baseline

The repository now contains a minimal runnable application structure.

### Runtime files

- `app.py` - Flask application and API routes
- `static/index.html` - minimal user interface
- `static/app.js` - frontend interaction logic
- `data/decisions.example.json` - non-private example data
- `tests/test_app_contract.py` - API contract tests

### API surface

Current API routes:

- `GET /api/health`
- `GET /api/decisions`
- `POST /api/decisions`

### Design constraint

The decision history feature is intentionally narrow. It records structured financial decisions, but does not import bank data, connect to external APIs, or store real financial records in the repository.

## Live runtime reconciliation notes

The current production runtime in `/opt/sovereign-finance` has been reconciled into the repository as the baseline for future work.

Known technical debt imported from the live runtime:

- `static/app.js` is large and patch-heavy and should not be expanded further without isolating new logic.
- `app.py` contains historical compatibility layers and duplicated route registrations.
- `/api/strategies` currently has two GET handlers registered.
- `/api/strategy/params` currently has two POST handlers registered.
- Runtime data, secrets, backups, snapshots, and `.bak` files remain outside Git.

This reconciliation commit is intentionally a snapshot of the live application state, not a refactor.

## Runtime and repository contract

Sovereign Finance now treats Git as the source of truth for code and `/opt/sovereign-finance` as the live runtime directory.

### Source of truth

Repository checkout:

    /home/jakob/github/sovereign-finance

Runtime directory:

    /opt/sovereign-finance

The runtime directory may contain local operational state that must not be committed, including data files, secrets, backups, snapshots, `.bak` files, virtual environments, and Python cache files.

### Current live baseline

The current repository baseline was reconciled from the live runtime so that future development can happen through normal Git branches and pull requests.

This does not mean the code is structurally clean. It means the repository now reflects the application that is actually running.

Known imported technical debt remains documented separately and should be handled through focused follow-up issues.

### Development rule

New work should follow this order:

1. Start from `main` in the Git checkout.
2. Create a branch.
3. Make one focused change.
4. Validate locally.
5. Commit and open a pull request.
6. Merge after review.
7. Deploy from the Git checkout to the runtime directory.
8. Smoke test live behavior.

Live is the target, not the workspace.
