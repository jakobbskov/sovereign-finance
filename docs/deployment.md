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
