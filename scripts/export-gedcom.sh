#!/usr/bin/env bash
# Runs a data export inside the API container to a mounted output directory.
# Used by the backup script (Task 33). Usage:
#   OUT_DIR=/opt/familytree/backups ./export-gedcom.sh [--public]
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infra/oracle/docker-compose.prod.yml}"
OUT_DIR="${OUT_DIR:-./exports}"
PUBLIC_FLAG="${1:-}"
STAMP="$(date -u +%Y%m%d)"

mkdir -p "$OUT_DIR"

run() {
  docker compose -f "$COMPOSE_FILE" run --rm \
    -v "$(realpath "$OUT_DIR"):/exports" \
    api node dist/export.js "$1" --out "/exports/$2" ${PUBLIC_FLAG:+--public}
}

run gedcom "family-${STAMP}.ged"
run json "family-${STAMP}.json"
run csv-people "people-${STAMP}.csv"
run csv-relationships "relationships-${STAMP}.csv"

echo "Exports written to ${OUT_DIR}"
