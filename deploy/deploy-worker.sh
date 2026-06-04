#!/usr/bin/env bash
#
# Deploy / update the Aether background worker on a Hetzner (or any) VPS.
#
#   ./deploy/deploy-worker.sh [git-ref]      # default ref: main
#
# Steps: fast-forward the repo, rebuild the worker image, restart it (systemd if
# the unit is installed, otherwise docker compose), then poll the health endpoint.
# Safe to re-run; fails loudly (and prints recent logs) if the worker is unhealthy.
#
# Env overrides:
#   AETHER_DIR           repo path on the VPS          (default: /opt/aether)
#   WORKER_HEALTH_PORT   health port to probe          (default: 8080)
set -euo pipefail

REF="${1:-main}"
APP_DIR="${AETHER_DIR:-/opt/aether}"
HEALTH_PORT="${WORKER_HEALTH_PORT:-8080}"
HEALTH_URL="http://127.0.0.1:${HEALTH_PORT}/health"
SERVICE="aether-worker"

log() { printf '\n\033[1m→ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is not installed on this host."
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is not available."
[ -d "$APP_DIR/.git" ] || die "no git repo at $APP_DIR (set AETHER_DIR or clone the repo there)."

cd "$APP_DIR"

log "Updating code to origin/${REF}"
git fetch --prune origin
git checkout "$REF"
git pull --ff-only origin "$REF"

[ -f .env ] || die "missing $APP_DIR/.env — copy .env.example and fill the worker secrets."

log "Building worker image"
docker compose build worker

if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE}\.service"; then
  log "Restarting via systemd (${SERVICE})"
  sudo systemctl restart "${SERVICE}"
else
  log "systemd unit not installed — starting with docker compose"
  docker compose up -d worker
fi

log "Waiting for health at ${HEALTH_URL}"
for _ in $(seq 1 30); do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
    printf '\033[32m✓ Worker healthy.\033[0m\n'
    curl -s "${HEALTH_URL}"; echo
    exit 0
  fi
  sleep 2
done

printf '\033[31m✗ Worker did not become healthy within ~60s. Recent logs:\033[0m\n' >&2
docker compose logs --tail=80 worker || true
exit 1
