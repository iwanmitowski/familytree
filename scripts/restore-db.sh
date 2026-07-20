#!/usr/bin/env bash
# Restore an encrypted backup into a target database (idea.md §21).
#
#   ./restore-db.sh <remote-backup-path> <target-db> [--force]
#
# Downloads the .age dump, verifies its checksum, decrypts with the operator's
# age identity (AGE_IDENTITY_FILE — kept OFFLINE, never on the VM), and restores.
# Refuses to touch the production DB name unless --force is given.
set -euo pipefail

BACKUP_PATH="${1:?usage: restore-db.sh <remote-backup-path> <target-db> [--force]}"
TARGET_DB="${2:?target database name required}"
FORCE="${3:-}"

COMPOSE_FILE="${COMPOSE_FILE:-/opt/familytree/docker-compose.prod.yml}"
POSTGRES_SUPER_USER="${POSTGRES_SUPER_USER:-familytree_admin}"
PROD_DB="${POSTGRES_DB:-familytree}"
AGE_IDENTITY_FILE="${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE (offline private key) required}"
RCLONE_REMOTE="${RCLONE_REMOTE_PRIMARY:?RCLONE_REMOTE_PRIMARY required}"

if [ "$TARGET_DB" = "$PROD_DB" ] && [ "$FORCE" != "--force" ]; then
  echo "Refusing to restore into the production database '${PROD_DB}' without --force." >&2
  exit 1
fi

COMPOSE="docker compose -f ${COMPOSE_FILE}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# 1. Download the encrypted dump + checksum.
rclone copyto "${RCLONE_REMOTE}/${BACKUP_PATH}" "${TMP_DIR}/dump.age"
BASE="$(basename "$BACKUP_PATH" .age)"
rclone copyto "${RCLONE_REMOTE}/$(dirname "$BACKUP_PATH")/${BASE}.sha256" "${TMP_DIR}/dump.sha256" || true

# 2. Decrypt.
age -d -i "$AGE_IDENTITY_FILE" -o "${TMP_DIR}/dump" "${TMP_DIR}/dump.age"

# 3. Verify checksum (against the decrypted dump).
if [ -f "${TMP_DIR}/dump.sha256" ]; then
  EXPECTED="$(cut -d' ' -f1 "${TMP_DIR}/dump.sha256")"
  ACTUAL="$(sha256sum "${TMP_DIR}/dump" | cut -d' ' -f1)"
  [ "$EXPECTED" = "$ACTUAL" ] || { echo "Checksum mismatch — refusing to restore." >&2; exit 1; }
fi

# 4. Restore into the target DB.
$COMPOSE exec -T postgres psql --username "$POSTGRES_SUPER_USER" -c "CREATE DATABASE ${TARGET_DB}" 2>/dev/null || true
$COMPOSE exec -T postgres pg_restore --username "$POSTGRES_SUPER_USER" --dbname "$TARGET_DB" --clean --if-exists --no-owner < "${TMP_DIR}/dump"

echo "Restore complete into '${TARGET_DB}'."
