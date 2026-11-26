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
# 6. Record the new active slot.
# 7. SIGTERM the old slot and wait for its grace period.
#
# Any failure before step 5 leaves the old slot serving and exits non-zero.
# Rollback is `deploy.sh <previous-sha>`; migrations are expand-then-contract.
#
# Run by the deploy SSM document, which sets the environment below. The CI
# stand-in sets SKIP_ECR_LOGIN=1, SERVER_ENV_FILE, ORIGIN_SECRET and
# COMPOSE_OVERRIDE instead of reading AWS.
set -euo pipefail

sha="${1:?usage: deploy.sh <sha>}"
cd "$(dirname "$0")"

: "${IMAGE_REPOSITORY:?}"
: "${AWS_REGION:=us-east-1}"
READY_TIMEOUT="${READY_TIMEOUT:-90}"
STOP_TIMEOUT="${STOP_TIMEOUT:-40}"
image="$IMAGE_REPOSITORY:$sha"

log() { echo "deploy[$sha]: $*" >&2; }

compose() {
  local files=(-f compose.yaml)
  if [[ -n "${COMPOSE_OVERRIDE:-}" ]]; then files+=(-f "$COMPOSE_OVERRIDE"); fi
  docker compose "${files[@]}" "$@"
}

mkdir -p state
# One deploy at a time, whether from SSM or a manual run.
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
  ORIGIN_SECRET="$(aws ssm get-parameter --region "$AWS_REGION" \
    --name "${SSM_PREFIX:?}/cloudfront-origin-secret" --query Parameter.Value --output text)"
fi
if [[ -z "$ORIGIN_SECRET" || "$ORIGIN_SECRET" == None ]]; then
  log "the CloudFront origin secret is empty; refusing to start Caddy without it"
  exit 1
fi
export ORIGIN_SECRET

if [[ -n "${SERVER_ENV_FILE:-}" ]]; then
  cp "$SERVER_ENV_FILE" state/server.env.next
else
  # The server builds its config from these plus SSM and Secrets Manager.
  cat > state/server.env.next <<EOF
NODE_ENV=production
AWS_REGION=$AWS_REGION
SSM_PREFIX=${SSM_PREFIX:?}
DATABASE_HOST=${DATABASE_HOST:?}
DATABASE_PORT=${DATABASE_PORT:?}
DATABASE_NAME=${DATABASE_NAME:?}
DATABASE_SECRET_ARN=${DATABASE_SECRET_ARN:?}
EOF
fi
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
probe='fetch("http://127.0.0.1:3000/api/health/ready").then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))'
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

# --- 5 and 6. switch Caddy, record -------------------------------------------------------------
previous_upstream="$(cat state/upstream.caddy 2>/dev/null || true)"
printf 'reverse_proxy %s:3000\n' "$idle" > state/upstream.caddy.next
mv state/upstream.caddy.next state/upstream.caddy
# Starts Caddy on the first deploy and recreates it only if its compose
# config (image, environment) changed; otherwise a graceful reload.
compose up --detach --no-deps caddy
if ! compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile; then
  log "Caddy rejected the new upstream; reverting"
  if [[ -n "$previous_upstream" ]]; then printf '%s\n' "$previous_upstream" > state/upstream.caddy; fi
  compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true
  compose stop --timeout 5 "$idle" || true
  exit 1
fi
log "Caddy now sends traffic to $idle"
# Record before retiring the old slot, so a failed stop can't leave the
# state naming a slot that no longer serves.
echo "$image" > "state/$idle.image"
echo "$idle" > state/active-slot

# --- 7. retire the old slot -------------------------------------------------------
if [[ -n "$active" ]]; then
  log "stopping $active"
  compose stop --timeout "$STOP_TIMEOUT" "$active"
fi

# Keep the disk small; rollback images are re-pulled from ECR when needed.
docker image prune --all --force --filter "until=168h" > /dev/null || true
log "done: $idle serves $image"
