#!/usr/bin/env bash
# Disk usage alert (idea.md §22). Photos and backups can fill the volume.
# Alerts (and exits non-zero) when usage on the data mount exceeds the
# threshold. Intended for a daily cron entry.
#
#   MOUNT=/ THRESHOLD=80 NOTIFY_WEBHOOK_URL=... ./check-disk.sh
#
# DF_OUTPUT can be injected for testing.
set -euo pipefail

MOUNT="${MOUNT:-/}"
THRESHOLD="${THRESHOLD:-80}"

if [ -n "${DF_OUTPUT:-}" ]; then
  usage="$DF_OUTPUT"
else
  usage="$(df --output=pcent "$MOUNT" | tail -1 | tr -dc '0-9')"
fi

echo "Disk usage on ${MOUNT}: ${usage}% (threshold ${THRESHOLD}%)"

if [ "$usage" -ge "$THRESHOLD" ]; then
  message="ALERT: disk usage ${usage}% on ${MOUNT} (>= ${THRESHOLD}%)"
  echo "$message" >&2
  if [ -n "${NOTIFY_WEBHOOK_URL:-}" ]; then
    curl -fsS -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"${message}\"}" "$NOTIFY_WEBHOOK_URL" >/dev/null || true
  fi
  exit 1
fi
