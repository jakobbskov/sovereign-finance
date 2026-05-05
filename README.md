# Sovereign Finance

Sovereign Finance is a local-first, self-hosted web application for personal financial overview, structured decision support, and everyday money management.

The application is designed to be practical, understandable, and independent of unnecessary platform dependence. The goal is not financial gamification or behavioral manipulation, but a calm and transparent system for managing financial life with readable logic and controlled data.

## Purpose

Sovereign Finance helps the user:

- maintain an overview of personal finances
- support structured financial decisions
- track categories, priorities, and trade-offs
- use a self-hosted solution with understandable logic
- keep control over data, rules, and development direction

## Design principles

- local-first
- self-hosted
- no tracking
- readable and controllable logic
- practical rather than bloated
- transparent data structures
- long-term maintainability

## Operational overview

**Host:** `Beelink`  
**Base path:** `/opt/sovereign-finance/`  
**Frontend file:** `/opt/sovereign-finance/static/app.js`

## Architecture

Sovereign Finance consists of a lightweight application structure centered around self-hosted code and controlled data flow.

### Frontend

The frontend is served from the application directory and includes the user-facing interface logic.

Known frontend file:

- `/opt/sovereign-finance/static/app.js`

### Backend

The backend and runtime structure should be documented further as the repository is expanded.

### Data

The application uses structured internal data and rule-based logic. The exact live data model is documented in more detail in `docs/data-model.md`.

Sovereign Finance currently uses one shared dataset per deployment. Login controls access to the app, but does not create separate budgets or private financial data per user. See `docs/data-auth-boundary-audit.md` for the current auth/data boundary.

## Expected functional scope

The application is intended to support, among other things:

- financial overview
- categorized expenses and priorities
- strategy-based reasoning
- decision support
- rule-based personal finance logic
- self-hosted data control

## Repository scope

This repository is intended to document:

- application code
- architecture
- deployment
- data model
- version history

Production data, secrets, credentials, and environment-specific runtime files must not be stored in the repository.

## Documentation

Additional documentation is stored in `docs/`:

- `docs/architecture.md`
- `docs/deployment.md`
- `docs/data-model.md`

## Status

Sovereign Finance is under active development as part of the Sovereign family of self-hosted tools.

The repository currently serves as the initial documentation and structure baseline for the application.
