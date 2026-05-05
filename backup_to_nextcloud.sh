#!/usr/bin/env bash
set -euo pipefail

source /opt/sovereign-finance/.nextcloud-backup.env

BASE="/opt/sovereign-finance"
DATA="$BASE/data"
TMPROOT="$BASE/backups"
STAMP="$(date +%F_%H%M%S)"
WORKDIR="$TMPROOT/$STAMP"
ARCHIVE="$TMPROOT/sovereign-finance-$STAMP.tar.gz"

mkdir -p "$WORKDIR"

cp -a "$DATA/finance.json" "$WORKDIR/finance.json"
cp -a "$DATA/events.json" "$WORKDIR/events.json"

tar -czf "$ARCHIVE" -C "$WORKDIR" finance.json events.json

# sørg for at backup-mappen findes i Nextcloud
curl -sS -u "$NC_USER:$NC_PASS" -X MKCOL \
  "$NC_BASE_URL/$NC_BACKUP_DIR" >/dev/null || true

# upload arkiv
curl -fSs -u "$NC_USER:$NC_PASS" \
  -T "$ARCHIVE" \
  "$NC_BASE_URL/$NC_BACKUP_DIR/$(basename "$ARCHIVE")"

echo "Nextcloud backup OK: $(basename "$ARCHIVE")"

rm -rf "$WORKDIR"
find "$TMPROOT" -maxdepth 1 -type f -name 'sovereign-finance-*.tar.gz' -mtime +30 -delete
