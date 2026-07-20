#!/usr/bin/env bash
# Remote deploy of the API on the Oracle VM (idea.md §20). Executed over SSH by
# the deploy workflow. Idempotent: pulls the target image, runs migrations
# first, restarts, then gates on the health endpoint and rolls forward only when
# healthy — printing the exact rollback command otherwise.
#
#   IMAGE_TAG=<commit-sha> API_DOMAIN=api.rod.mitovski.example ./deploy.sh
set -euo pipefail

: "${IMAGE_TAG:?IMAGE_TAG is required (a commit SHA, never only 'latest')}"
: "${API_DOMAIN:?API_DOMAIN is required}"

APP_DIR="${APP_DIR:-/opt/familytree}"
REGISTRY="${REGISTRY:-ghcr.io/iwanmitowski/familytree-api}"
cd "$APP_DIR"

COMPOSE="docker compose -f docker-compose.prod.yml"
export API_IMAGE="${REGISTRY}:${IMAGE_TAG}"

PREV_TAG="$(cat .deploy-tag 2>/dev/null || echo '')"
echo "Deploying ${API_IMAGE} (previous: ${PREV_TAG:-none})"

# 1. Pull the target image.
$COMPOSE pull api

# 2. Run migrations to completion BEFORE the new API starts.
$COMPOSE --profile ops run --rm migrate

# 3. Restart the API (and Caddy) with the new image.
$COMPOSE up -d api caddy

# 4. Health gate.
for attempt in $(seq 1 10); do
  if curl -fsS --max-time 5 "https://${API_DOMAIN}/health" >/dev/null 2>&1; then
    echo "$IMAGE_TAG" > .deploy-tag
    echo "Deploy OK: ${IMAGE_TAG}"
    exit 0
  fi
  echo "Health check attempt ${attempt}/10 failed; retrying..."
  sleep 3
done

echo "ERROR: health check failed after deploy of ${IMAGE_TAG}." >&2
if [ -n "$PREV_TAG" ]; then
  echo "Rollback: re-run the deploy workflow with image_tag=${PREV_TAG}, or on the VM:" >&2
  echo "  IMAGE_TAG=${PREV_TAG} API_DOMAIN=${API_DOMAIN} ${APP_DIR}/deploy.sh" >&2
fi
exit 1
