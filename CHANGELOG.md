# Changelog

All notable changes to this repository should be documented in this file.

The format is intentionally simple and human-readable.

## [0.1.0] - 2026-03-12

### Added
- initial repository structure
- initial `README.md`
- `docs/architecture.md`
- `docs/deployment.md`
- `docs/data-model.md`
- `.gitignore`

### Notes
- repository created as the initial GitHub documentation baseline for Sovereign Finance
- current version documents architecture and deployment structure rather than full source code history

## 0.3.0 - Decision history baseline

- Added minimal Flask application skeleton.
- Added `/api/health`.
- Added `/api/decisions` GET/POST contract.
- Added local JSON persistence for decision history.
- Added minimal static frontend for saving and viewing decisions.
- Added example decision data without real financial records.
- Added unittest contract coverage for the initial API.
