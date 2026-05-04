# Data model

## Overview

Sovereign Finance uses a structured data model intended to remain transparent, inspectable, and easy to back up.

The design goal is not hidden persistence layers but understandable financial state that can be inspected and reasoned about.

## Data philosophy

The system follows several principles:

- data should be human-readable
- structures should remain simple
- logic should be explainable
- financial state should be inspectable
- backups should be straightforward

## Core entity types

The application is centered around several conceptual entities.

### Financial categories

Categories represent areas of spending or allocation.

Examples:

- housing
- food
- transport
- savings
- investments
- discretionary spending

Categories allow the system to group financial flows and reason about priorities.

### Budget states

Budget state represents the current financial situation.

Typical elements may include:

- income level
- fixed expenses
- discretionary spending capacity
- savings allocation
- investment allocation

These states provide the baseline used by decision-support logic.

### Strategies

Strategies represent higher-level financial approaches.

Examples:

- conservative savings
- debt reduction
- investment-focused growth
- buffer-first financial stability

Strategies influence how financial decisions are evaluated.

### Decision rules

Decision rules define how the system evaluates financial choices.

Examples include:

- affordability checks
- budget allocation logic
- trade-off reasoning
- long-term vs short-term prioritization

The application favors deterministic rules rather than opaque algorithmic outputs.

## Relationships

The logical relationships between entities are:

- budget state references categories
- strategies influence decision rules
- decision rules evaluate financial actions
- results are presented as structured feedback to the user

## Operational considerations

Because Sovereign Finance deals with personal financial information, the following operational principles apply:

- financial data must remain private
- backups must be secure
- repository data must never contain real financial records

## Repository boundary

The Git repository may contain:

- schema examples
- documentation of financial entities
- example rule structures
- development test data

The repository must NOT contain:

- real financial records
- exported personal data
- secrets or credentials

## Future improvements

Future versions of this document may include:

- concrete JSON schemas
- rule configuration examples
- strategy definitions
- example financial scenarios

## v0.3 concrete data file: decisions.json

Runtime decision history is stored outside Git in:

`data/decisions.json`

The repository only includes:

`data/decisions.example.json`

### Decision object

Example shape:

    {
      "id": "decision-example",
      "createdAt": "2026-05-04T00:00:00Z",
      "title": "Prioritize emergency buffer before investing",
      "decision": "Keep monthly surplus in buffer until target is reached.",
      "status": "planned",
      "amountDkk": 5000,
      "tags": ["buffer", "strategy"],
      "rationale": "Reduces short-term risk before increasing investment exposure."
    }

### Status values

Allowed status values:

- `planned`
- `active`
- `done`
- `rejected`

### Repository boundary

`data/*.json` is ignored by Git, except example files. Real financial records must remain runtime data only.
