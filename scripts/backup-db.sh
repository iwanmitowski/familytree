#!/usr/bin/env bash
# Encrypted PostgreSQL backup to object storage (idea.md §21). Runs daily on the
# Oracle VM via cron. Never logs the database password. Uploads only after a
# successful dump; cleans temp files on every exit.
#
#   ./backup-db.sh [--remote primary|r2]
#
# Env (see infra/oracle/env.example):
#   COMPOSE_FILE, POSTGRES_DB, POSTGRES_SUPER_USER
#   AGE_RECIPIENT           age public key (encryption)
#   RCLONE_REMOTE_PRIMARY   e.g. oci:familytree-backups
#   RCLONE_REMOTE_SECONDARY e.g. r2:familytree-backups
#   BACKUP_DIR              status/manifest location (default /opt/familytree/backups)
#   NOTIFY_WEBHOOK_URL      optional
#   RETAIN_DAILY=14 RETAIN_WEEKLY=8 RETAIN_MONTHLY=12
set -euo pipefail

REMOTE_KIND="primary"
[ "${1:-}" = "--remote" ] && REMOTE_KIND="${2:-primary}"

COMPOSE_FILE="${COMPOSE_FILE:-/opt/familytree/docker-compose.prod.yml}"
POSTGRES_DB="${POSTGRES_DB:-familytree}"
POSTGRES_SUPER_USER="${POSTGRES_SUPER_USER:-familytree_admin}"
BACKUP_DIR="${BACKUP_DIR:-/opt/familytree/backups}"
RETAIN_DAILY="${RETAIN_DAILY:-14}"
RETAIN_WEEKLY="${RETAIN_WEEKLY:-8}"
RETAIN_MONTHLY="${RETAIN_MONTHLY:-12}"
LOCK_FILE="${LOCK_FILE:-/tmp/familytree-backup.lock}"

if [ "$REMOTE_KIND" = "r2" ]; then
  RCLONE_REMOTE="${RCLONE_REMOTE_SECONDARY:?RCLONE_REMOTE_SECONDARY required}"
else
  RCLONE_REMOTE="${RCLONE_REMOTE_PRIMARY:?RCLONE_REMOTE_PRIMARY required}"
fi

mkdir -p "$BACKUP_DIR"
STATUS_FILE="${BACKUP_DIR}/backup-status.json"
STAMP="$(date -u +%Y-%m-%d)"
DOW="$(date -u +%u)"   # 7 = Sunday
DOM="$(date -u +%d)"

notify() {
  [ -n "${NOTIFY_WEBHOOK_URL:-}" ] || return 0
  curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"text\":\"$1\"}" "$NOTIFY_WEBHOOK_URL" >/dev/null 2>&1 || true
}

write_status() {
  printf '{"result":"%s","timestamp":"%s","remote":"%s"}\n' \
    "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$REMOTE_KIND" > "$STATUS_FILE"
}

fail() {
  echo "ERROR: $1" >&2
  write_status failed
  notify "Backup FAILED: $1"
  exit 1
}

# Single instance only.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another backup is already running; exiting."
  exit 0
fi

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

DUMP="${TMP_DIR}/familytree-${STAMP}.dump"
COMPOSE="docker compose -f ${COMPOSE_FILE}"

# 1. Dump (custom format). PGPASSWORD is passed via the container env, never echoed.
if ! $COMPOSE exec -T postgres pg_dump --format=custom --username "$POSTGRES_SUPER_USER" "$POSTGRES_DB" > "$DUMP"; then
  fail "pg_dump failed"
fi
[ -s "$DUMP" ] || fail "dump is empty"

# 2. Checksum.
( cd "$TMP_DIR" && sha256sum "$(basename "$DUMP")" > "${DUMP}.sha256" ) || fail "checksum failed"

# 3. Encrypt with age. Always to the offline operator key (AGE_RECIPIENT); also
#    to an optional VM-local verify key (AGE_VERIFY_RECIPIENT) so the monthly
#    self-test can decrypt without the offline private key ever touching the VM.
ENC="${DUMP}.age"
[ -n "${AGE_RECIPIENT:-}" ] || fail "AGE_RECIPIENT not set — refusing to upload an unencrypted backup"
AGE_ARGS=(-r "$AGE_RECIPIENT")
[ -n "${AGE_VERIFY_RECIPIENT:-}" ] && AGE_ARGS+=(-r "$AGE_VERIFY_RECIPIENT")
age "${AGE_ARGS[@]}" -o "$ENC" "$DUMP" || fail "age encryption failed"

# 4. Manifest.
MANIFEST="${TMP_DIR}/manifest.json"
printf '{"created":"%s","db":"%s","dump":"%s","sha256":"%s","size_bytes":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$POSTGRES_DB" "$(basename "$ENC")" \
  "$(cut -d' ' -f1 "${DUMP}.sha256")" "$(stat -c%s "$ENC")" > "$MANIFEST"

# 5. Upload (only after a successful dump + encryption).
DEST="${RCLONE_REMOTE}/db/daily/${STAMP}"
rclone copyto "$ENC" "${DEST}/$(basename "$ENC")" || fail "rclone upload failed"
rclone copyto "${DUMP}.sha256" "${DEST}/$(basename "${DUMP}.sha256")" || fail "rclone checksum upload failed"
rclone copyto "$MANIFEST" "${DEST}/manifest.json" || fail "rclone manifest upload failed"

# Promote to weekly (Sunday) and monthly (1st).
[ "$DOW" = "7" ] && rclone copyto "$ENC" "${RCLONE_REMOTE}/db/weekly/${STAMP}/$(basename "$ENC")" || true
[ "$DOM" = "01" ] && rclone copyto "$ENC" "${RCLONE_REMOTE}/db/monthly/${STAMP}/$(basename "$ENC")" || true

# 6. Retention pruning (keep the newest N directories per tier).
prune() {
  local tier="$1" keep="$2"
  rclone lsf --dirs-only "${RCLONE_REMOTE}/db/${tier}" 2>/dev/null | sort | head -n "-${keep}" | while read -r dir; do
    [ -n "$dir" ] && rclone purge "${RCLONE_REMOTE}/db/${tier}/${dir}" || true
  done
}
prune daily "$RETAIN_DAILY"
prune weekly "$RETAIN_WEEKLY"
prune monthly "$RETAIN_MONTHLY"

write_status success
notify "Backup OK: ${STAMP} (${REMOTE_KIND})"
echo "Backup complete: ${DEST}/$(basename "$ENC")"
