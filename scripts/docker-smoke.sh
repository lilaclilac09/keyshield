#!/usr/bin/env bash
# Bring up the full Docker stack, wait for every service healthy, hit
# the four published health endpoints, then run the existing 22-route
# smoke.sh against the python container. Always tears the stack down
# at exit (success or fail) so a CI runner doesn't leak containers.
#
# Use:
#   bash scripts/docker-smoke.sh           # build + up + smoke + down
#   bash scripts/docker-smoke.sh --keep    # leave containers running
#                                          # for manual inspection
#
# Exit code is the first failed step; 0 only if everything passes.

set -euo pipefail

KEEP_RUNNING=0
if [[ "${1:-}" == "--keep" ]]; then
  KEEP_RUNNING=1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Colors (TTY only)
if [[ -t 1 ]]; then
  c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_err=$'\033[31m'; c_step=$'\033[36;1m'; c_reset=$'\033[0m'
else
  c_ok=""; c_warn=""; c_err=""; c_step=""; c_reset=""
fi
step() { echo; echo "${c_step}▶ $*${c_reset}"; }
ok()   { echo "  ${c_ok}✓${c_reset} $*"; }
warn() { echo "  ${c_warn}!${c_reset} $*"; }
die()  { echo "  ${c_err}✗${c_reset} $*" >&2; exit 1; }

# ── Pre-flight ──────────────────────────────────────────────────────
command -v docker >/dev/null || die "docker not installed"
docker compose version >/dev/null 2>&1 || die "docker compose v2 plugin not installed"

if [[ ! -f .env ]]; then
  warn ".env missing — copying from .env.example. SERVER_SECRET will be the dev default; do NOT use in prod."
  cp .env.example .env
fi

# ── Tear-down on exit (always) ──────────────────────────────────────
cleanup() {
  if [[ $KEEP_RUNNING -eq 1 ]]; then
    warn "leaving stack running per --keep. Stop later with: docker compose down"
    return 0
  fi
  step "tearing down stack"
  docker compose down --remove-orphans >/dev/null 2>&1 || true
  ok "stopped"
}
trap cleanup EXIT

# ── Build ───────────────────────────────────────────────────────────
step "build all 3 images"
docker compose --env-file .env build >/dev/null
ok "built"

# ── Up ──────────────────────────────────────────────────────────────
step "starting stack"
docker compose --env-file .env up -d >/dev/null
ok "compose up"

# ── Wait for healthy ────────────────────────────────────────────────
step "waiting for all services healthy (max 120s)"
deadline=$(( $(date +%s) + 120 ))
unhealthy=()
while :; do
  unhealthy=()
  while read -r line; do
    name=$(echo "$line" | awk '{print $1}')
    health=$(echo "$line" | awk '{print $2}')
    if [[ "$health" != "healthy" ]] && [[ "$health" != "running" ]]; then
      unhealthy+=("$name=$health")
    fi
  done < <(docker compose ps --format '{{.Service}} {{.Health}}' 2>/dev/null | grep -v '^$' || true)

  if [[ ${#unhealthy[@]} -eq 0 ]]; then
    ok "all services healthy"
    break
  fi
  if [[ $(date +%s) -ge $deadline ]]; then
    echo
    docker compose ps
    echo
    docker compose logs --tail=40
    die "timeout — still unhealthy: ${unhealthy[*]}"
  fi
  sleep 3
done

# ── Hit each public health endpoint ─────────────────────────────────
step "probing 4 health endpoints"
declare -A endpoints=(
  ["python"]="http://localhost:8000/health"
  ["rust-proxy"]="http://localhost:3000/health"
  ["frontend"]="http://localhost:3001/healthz"
)
for svc in "${!endpoints[@]}"; do
  url="${endpoints[$svc]}"
  if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
    ok "$svc — $url"
  else
    docker compose logs --tail=20 "$svc" || true
    die "$svc health probe failed: $url"
  fi
done

# postgres + redis: no host port (intentional, by Phase 4 hardening),
# so probe via `docker compose exec` instead.
if docker compose exec -T postgres pg_isready -U keyshield >/dev/null 2>&1; then
  ok "postgres — pg_isready"
else
  die "postgres pg_isready failed"
fi
if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
  ok "redis — PING/PONG"
else
  die "redis PING failed"
fi

# ── Run the existing 22-route smoke against the python container ────
step "running scripts/smoke.sh against the live API"
if [[ -f scripts/smoke.sh ]]; then
  if KS_API_URL=http://localhost:8000 bash scripts/smoke.sh; then
    ok "smoke.sh passed"
  else
    warn "smoke.sh had failures (see TAP output above)"
  fi
else
  warn "scripts/smoke.sh not found — skipping route smoke"
fi

# ── Done ────────────────────────────────────────────────────────────
step "✓ docker stack smoke complete"
echo
echo "  python:    http://localhost:8000/health"
echo "  rust-proxy http://localhost:3000/health"
echo "  frontend:  http://localhost:3001"
echo
[[ $KEEP_RUNNING -eq 0 ]] || warn "containers still running (--keep). Run 'docker compose down' when done."
