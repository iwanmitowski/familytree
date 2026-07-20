#!/usr/bin/env bash
# Resets the E2E database to an empty (migrated) state between specs.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.e2e.yml}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U familytree -d familytree_e2e < "${SCRIPT_DIR}/e2e-reset-db.sql"

echo "E2E database reset."
