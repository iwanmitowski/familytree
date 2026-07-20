#!/usr/bin/env bash
# Brings up the E2E backend stack (idea.md §23): builds the API image, applies
# migrations, starts Postgres + the API, and waits for the API health check.
# The web app is started separately by Playwright's webServer (see
# apps/web/playwright.config.ts).
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.e2e.yml}"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
API_URL="${API_URL:-http://127.0.0.1:8787}"

echo "Building API image…"
$COMPOSE build

echo "Starting Postgres…"
$COMPOSE up -d postgres

echo "Applying migrations…"
$COMPOSE run --rm migrate

echo "Starting API…"
$COMPOSE up -d api

echo "Waiting for the API to become healthy…"
for _ in $(seq 1 30); do
  if curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
    echo "API is up at ${API_URL}."
    exit 0
  fi
  sleep 2
done

echo "API did not become healthy in time." >&2
$COMPOSE logs api >&2 || true
exit 1
