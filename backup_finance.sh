#!/usr/bin/env bash
set -euo pipefail

BASE="/opt/sovereign-finance"
DATA="$BASE/data"
BACKUP="$BASE/backups"
STAMP="$(date +%F_%H%M%S)"
DEST="$BACKUP/$STAMP"

mkdir -p "$DEST"

cp -a "$DATA/finance.json" "$DEST/finance.json"
cp -a "$DATA/events.json" "$DEST/events.json"

ls -1dt "$BACKUP"/* 2>/dev/null | tail -n +31 | xargs -r rm -rf

echo "Backup OK: $DEST"
