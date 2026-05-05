# Deployment

## Overview

Sovereign Finance is deployed as a self-hosted application running on the **Beelink host**.

The deployment is intentionally simple and designed to remain understandable and maintainable by a single operator.

## Runtime host

**Host machine:** Beelink mini-PC  
**Operating environment:** Linux

The application is separated from the Raspberry Pi node that hosts public-facing services such as Nextcloud.

## Application location

The application directory is:

`/opt/sovereign-finance/`

Typical structure:

/opt/sovereign-finance/
│
├── static/
│   └── app.js
│
└── other application files

The frontend logic currently resides in:

`/opt/sovereign-finance/static/app.js`

## Runtime model

The current runtime model is intentionally lightweight.

The application can run as:

- a local web interface
- a static frontend with internal logic
- a lightweight service layer if expanded later

The exact runtime method may evolve as the application matures.

## Operational workflow

Typical operational tasks include:

- updating application files
- testing logic changes
- verifying application behavior in the browser
- maintaining backups of application data

Example maintenance workflow:

1. edit application files
2. verify syntax and logic
3. reload or restart the runtime environment if required
4. verify behavior in the browser

## Backup considerations

Critical elements to back up:

- application source code
- configuration files
- internal financial data
- documentation

Backups should be versioned and stored separately from the runtime host.

## Repository boundary

The Git repository should contain:

- application source code
- documentation
- example configuration

The repository should NOT contain:

- personal financial data
- production configuration secrets
- environment-specific private data

## Future deployment improvements

Possible future improvements include:

- containerized deployment
- reproducible installation scripts
- automated backups
- health monitoring
- environment templates

## v0.3 local runtime

The application can be run locally from the repository root:

    python3 app.py

Default local address:

`http://127.0.0.1:5055`

### Environment variables

See `.env.example`.

- `SOVEREIGN_FINANCE_DATA_DIR`
- `SOVEREIGN_FINANCE_HOST`
- `SOVEREIGN_FINANCE_PORT`

### Sanity checks

    python3 -m py_compile app.py
    node --check static/app.js
    python3 -m unittest discover -s tests -v

### Production note

Production deployment should place runtime data outside Git and use the configured data directory, for example:

`/opt/sovereign-finance/data`

## Live runtime contract

Sovereign Finance has two separate filesystem roles.

### Git checkout

Authoritative source code checkout:

    /home/jakob/github/sovereign-finance

This directory is used for:

- Git branches
- pull requests
- code review
- documentation updates
- local validation before deployment

Development must start from this directory, not from the live runtime directory.

### Live runtime

Current live runtime directory:

    /opt/sovereign-finance

This directory is used by the running Docker-based application.

The live runtime currently contains:

- `app.py`
- `static/`
- `Dockerfile`
- `docker-compose.yml`
- runtime `data/`
- `.env`
- backup scripts
- local backups and historical `.bak` files

Runtime data and secrets are intentionally not tracked in Git.

## Safe deployment direction

The safe direction is:

    Git checkout -> validation -> controlled copy to /opt/sovereign-finance -> container restart -> live smoke test

Never edit `/opt/sovereign-finance` as the primary development workspace.

If a live emergency edit is unavoidable, it must be reconciled back into Git on a dedicated branch before any further development continues.

## Files excluded from Git

The following must remain outside Git:

- `.env`
- `.nextcloud-backup.env`
- `data/*.json`
- `backups/`
- `_snapshots/`
- `*.bak*`
- `__pycache__/`
- `.venv/`

The repository may contain example files, documentation, source code, Docker configuration, and test fixtures without real financial data.

## Deployment validation

Before copying changes to `/opt/sovereign-finance`, run from the Git checkout:

    python -m py_compile app.py
    node --check static/app.js

If endpoint behavior is affected, also run the relevant regression tests when present.

After deployment, validate the live app with:

    docker compose ps
    curl -i http://127.0.0.1:5155/api/health

If the app is exposed through a reverse proxy, validate the public route separately.

## Rollback principle

Rollback must prefer a known working state.

Recommended rollback order:

1. Restore the previous `/opt/sovereign-finance` code snapshot or backup.
2. Restart the container.
3. Validate `/api/health`.
4. Validate the affected user flow.
5. Only then continue debugging.

Do not debug by repeatedly editing live files without bringing changes back into Git.
