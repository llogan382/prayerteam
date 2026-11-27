#!/usr/bin/env bash
# Blue/green deploy of one server image on the API instance (ADR 0005).
#
#   deploy.sh <sha>
#
# 1. Pull the image for <sha>.
# 2. Run `migrate` from it as a one-off container. On failure, stop.
# 3. Start it in the idle slot.
# 4. Poll the idle slot's /api/health/ready directly. On timeout, stop it.
# 5. Point Caddy at the idle slot and reload (no dropped connections).
# 6. SIGTERM the old slot and wait for its grace period.
# 7. Record the new active slot.
#
# Any failure before step 5 completes leaves the old slot serving and exits
# non-zero. Rollback is `deploy.sh <previous-sha>`; migrations are
# expand-then-contract.
#
# Run by the deploy SSM document (infra/src/app-stack.ts), which sets:
#   AWS_REGION, IMAGE_REPOSITORY, ORIGIN_DOMAIN,
#   ORIGIN_SECRET_PARAMETER  the SecureString Caddy checks against,
#   SERVER_ENV_FILE          the server's environment, written by the document.
# The CI stand-in sets SKIP_ECR_LOGIN=1, ORIGIN_SECRET and COMPOSE_OVERRIDE
# instead of reading AWS.
set -euo pipefail

sha="${1:?usage: deploy.sh <sha>}"
cd "$(dirname "$0")"

: "${IMAGE_REPOSITORY:?}" "${AWS_REGION:?}" "${SERVER_ENV_FILE:?}"
READY_TIMEOUT="${READY_TIMEOUT:-90}"
CADDY_TIMEOUT="${CADDY_TIMEOUT:-30}"
# The port each server slot listens on inside its container (compose.yaml).
export SERVER_PORT=3000
image="$IMAGE_REPOSITORY:$sha"

log() { echo "deploy[$sha]: $*" >&2; }

compose() {
  local files=(-f compose.yaml)
  if [[ -n "${COMPOSE_OVERRIDE:-}" ]]; then files+=(-f "$COMPOSE_OVERRIDE"); fi
  docker compose "${files[@]}" "$@"
}

mkdir -p state
# One deploy at a time. The workflow's concurrency group covers CI, but a
# hand-run rollback could still overlap a workflow deploy.
exec 9> state/deploy.lock
if ! flock --nonblock 9; then
  log "another deploy is running"
  exit 1
fi
active="$(cat state/active-slot 2>/dev/null || true)"
if [[ "$active" == blue ]]; then idle=green; else idle=blue; fi
BLUE_IMAGE="$(cat state/blue.image 2>/dev/null || echo unset)"
GREEN_IMAGE="$(cat state/green.image 2>/dev/null || echo unset)"
export BLUE_IMAGE GREEN_IMAGE
if [[ "$idle" == blue ]]; then BLUE_IMAGE="$image"; else GREEN_IMAGE="$image"; fi
export MIGRATE_IMAGE="$image"
log "active slot: ${active:-none}, deploying to: $idle"

# --- configuration ---------------------------------------------------------
if [[ -z "${ORIGIN_SECRET:-}" ]]; then
  ORIGIN_SECRET="$(aws ssm get-parameter --region "$AWS_REGION" --with-decryption \
    --name "${ORIGIN_SECRET_PARAMETER:?}" --query Parameter.Value --output text)"
fi
if [[ -z "$ORIGIN_SECRET" || "$ORIGIN_SECRET" == None ]]; then
  log "the CloudFront origin secret is empty; refusing to start Caddy without it"
  exit 1
fi
export ORIGIN_SECRET
cp "$SERVER_ENV_FILE" state/server.env.next
mv state/server.env.next state/server.env

# --- 1. pull -----------------------------------------------------------------
if [[ -z "${SKIP_ECR_LOGIN:-}" ]]; then
  aws ecr get-login-password --region "$AWS_REGION" |
    docker login --username AWS --password-stdin "${IMAGE_REPOSITORY%%/*}"
fi
if ! docker image inspect "$image" > /dev/null 2>&1; then
  log "pulling $image"
  docker pull --quiet "$image"
fi

# --- 2. migrate --------------------------------------------------------------
log "running migrations"
if ! compose run --rm --no-deps migrate; then
  log "migration failed; ${active:-no slot} keeps serving"
  exit 1
fi

# --- 3. start the idle slot ----------------------------------------------------
log "starting $idle"
compose up --detach --no-deps --force-recreate "$idle"

# --- 4. readiness --------------------------------------------------------------
# Inside the slot's own container, so it bypasses Caddy and needs no port.
probe="fetch('http://127.0.0.1:$SERVER_PORT/api/health/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
deadline=$((SECONDS + READY_TIMEOUT))
until compose exec -T "$idle" node -e "$probe" > /dev/null 2>&1; do
  if ((SECONDS >= deadline)); then
    log "$idle was not ready after ${READY_TIMEOUT}s; ${active:-no slot} keeps serving"
    compose logs --no-color --tail 50 "$idle" >&2 || true
    compose stop --timeout 5 "$idle" || true
    exit 1
  fi
  sleep 2
done
log "$idle is ready"

# --- 5. switch Caddy -------------------------------------------------------------
previous_upstream="$(cat state/upstream.caddy 2>/dev/null || true)"

# Put back the old upstream, stop the new slot and fail the deploy.
abandon_switch() {
  log "$1; ${active:-no slot} keeps serving"
  if [[ -n "$previous_upstream" ]]; then
    printf '%s\n' "$previous_upstream" > state/upstream.caddy
    compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true
  fi
  compose stop --timeout 5 "$idle" || true
  exit 1
}

printf 'reverse_proxy %s:%s\n' "$idle" "$SERVER_PORT" > state/upstream.caddy.next
mv state/upstream.caddy.next state/upstream.caddy
# Starts Caddy on the first deploy and recreates it only if its compose
# config (image, environment) changed; otherwise a graceful reload.
compose up --detach --no-deps caddy
# A Caddy that has just started needs a moment before its admin API answers.
# 127.0.0.1, not localhost: in the Alpine image localhost resolves to ::1 first.
deadline=$((SECONDS + CADDY_TIMEOUT))
until compose exec -T caddy wget -q -O /dev/null http://127.0.0.1:2019/config/ > /dev/null 2>&1; do
  if ((SECONDS >= deadline)); then abandon_switch "Caddy's admin API did not answer after ${CADDY_TIMEOUT}s"; fi
  sleep 1
done
if ! compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile; then
  abandon_switch "Caddy rejected the new upstream"
fi
log "Caddy now sends traffic to $idle"

# --- 6. retire the old slot -------------------------------------------------------
# Waits for the slot's stop_grace_period (compose.yaml). Caddy no longer
# sends it traffic, so a failed stop is only a warning: it must not skip
# step 7, or the state would name a slot that no longer serves.
if [[ -n "$active" ]]; then
  log "stopping $active"
  compose stop "$active" || log "warning: $active did not stop cleanly"
fi

# --- 7. record ---------------------------------------------------------------------
echo "$image" > "state/$idle.image"
echo "$idle" > state/active-slot

# Keep the 16 GB disk from filling over months of deploys; rollback images
# are re-pulled from ECR when needed.
docker image prune --all --force --filter "until=168h" > /dev/null || true
log "done: $idle serves $image"
