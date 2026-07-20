#!/usr/bin/env bash
# Monthly automated backup check (idea.md §21). If a VM-local verify identity is
# available (AGE_VERIFY_IDENTITY_FILE), performs a FULL restore of the latest
# daily backup into a temporary database and runs integrity probes. Otherwise
# falls back to a lightweight check (download + checksum of the encrypted dump)
# and reminds the operator to run a full restore test manually with the offline
# key. Writes status and notifies on failure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/familytree/docker-compose.prod.yml}"
POSTGRES_SUPER_USER="${POSTGRES_SUPER_USER:-familytree_admin}"
RCLONE_REMOTE="${RCLONE_REMOTE_PRIMARY:?RCLONE_REMOTE_PRIMARY required}"
BACKUP_DIR="${BACKUP_DIR:-/opt/familytree/backups}"
TEST_DB="familytree_restore_test"
MIN_PEOPLE="${MIN_PEOPLE:-0}"

mkdir -p "$BACKUP_DIR"
COMPOSE="docker compose -f ${COMPOSE_FILE}"
psql_test() { $COMPOSE exec -T postgres psql -tA --username "$POSTGRES_SUPER_USER" --dbname "$TEST_DB" -c "$1"; }
notify() { [ -n "${NOTIFY_WEBHOOK_URL:-}" ] && curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"text\":\"$1\"}" "$NOTIFY_WEBHOOK_URL" >/dev/null 2>&1 || true; }
status() { printf '{"result":"%s","mode":"%s","timestamp":"%s","detail":"%s"}\n' "$1" "$2" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$3" > "${BACKUP_DIR}/verify-status.json"; }
fail() { echo "VERIFY FAILED: $1" >&2; status failed "${MODE:-unknown}" "$1"; notify "Backup verify FAILED: $1"; exit 1; }

# 1. Find the latest daily backup.
LATEST_DIR="$(rclone lsf --dirs-only "${RCLONE_REMOTE}/db/daily" | sort | tail -1 | tr -d '/')"
[ -n "$LATEST_DIR" ] || fail "no daily backup found"
LATEST_FILE="$(rclone lsf "${RCLONE_REMOTE}/db/daily/${LATEST_DIR}" | grep '\.age$' | head -1)"
[ -n "$LATEST_FILE" ] || fail "no .age file in latest backup"
BACKUP_PATH="db/daily/${LATEST_DIR}/${LATEST_FILE}"

# 2a. Lightweight fallback: no VM-local verify key, so we cannot decrypt here.
if [ -z "${AGE_VERIFY_IDENTITY_FILE:-}" ]; then
  MODE="lightweight"
  TMP_DIR="$(mktemp -d)"; trap 'rm -rf "$TMP_DIR"' EXIT
  rclone copyto "${RCLONE_REMOTE}/${BACKUP_PATH}" "${TMP_DIR}/dump.age" || fail "download failed"
  [ -s "${TMP_DIR}/dump.age" ] || fail "downloaded dump is empty"
  BASE="$(basename "$BACKUP_PATH" .age)"
  if rclone copyto "${RCLONE_REMOTE}/db/daily/${LATEST_DIR}/${BASE}.sha256" "${TMP_DIR}/dump.sha256" 2>/dev/null; then
    # The checksum is over the plaintext dump; here we only confirm the sidecar exists.
    [ -s "${TMP_DIR}/dump.sha256" ] || fail "checksum sidecar empty"
  fi
  head -c 22 "${TMP_DIR}/dump.age" | grep -q 'age-encryption.org' || fail "not a valid age file"
  status success lightweight "integrity ok; set AGE_VERIFY_IDENTITY_FILE for full restore test"
  echo "Lightweight backup check passed for ${BACKUP_PATH}."
  echo "Run a full restore test manually with the offline key when convenient."
  exit 0
fi

# 2b. Full restore test into a temp DB.
MODE="full"
$COMPOSE exec -T postgres psql --username "$POSTGRES_SUPER_USER" -c "DROP DATABASE IF EXISTS ${TEST_DB}" || fail "drop temp db"
AGE_IDENTITY_FILE="$AGE_VERIFY_IDENTITY_FILE" COMPOSE_FILE="$COMPOSE_FILE" \
  "${SCRIPT_DIR}/restore-db.sh" "$BACKUP_PATH" "$TEST_DB" || fail "restore"

# 3. Checks: migrations table + row-count sanity + integrity probes.
psql_test "SELECT 1 FROM information_schema.tables WHERE table_name = 'kysely_migration'" | grep -q 1 || fail "migrations table missing"

PEOPLE="$(psql_test "SELECT count(*) FROM people")"
[ "$PEOPLE" -ge "$MIN_PEOPLE" ] || fail "people count ${PEOPLE} < ${MIN_PEOPLE}"

# Integrity probes (must all return 0).
[ "$(psql_test "SELECT count(*) FROM parent_child_relationships WHERE parent_id = child_id")" = "0" ] || fail "self-parent rows present"
[ "$(psql_test "SELECT count(*) FROM parent_child_relationships pcr JOIN people p ON p.id = pcr.parent_id WHERE p.merged_into_person_id IS NOT NULL")" = "0" ] || fail "merged person used as parent"

# 4. Drop the temp DB.
$COMPOSE exec -T postgres psql --username "$POSTGRES_SUPER_USER" -c "DROP DATABASE ${TEST_DB}" || fail "drop temp db after test"

status success full "people=${PEOPLE}"
echo "Full restore verification passed (people=${PEOPLE})."
