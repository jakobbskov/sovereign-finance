#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
fi

"$PYTHON_BIN" -m py_compile app.py
node --check static/app.js
node --check static/sf-format.js
"$PYTHON_BIN" -m unittest discover -s tests -v

echo "Prestart checks passed."
