#!/usr/bin/env bash
#
# One-command dev launcher for keyshield.
#
# Starts:
#   - Python control plane  (v2-mvp/.venv/bin/uvicorn) on :8001
#   - Rust hot-path proxy   (proxy-rs/target/release/ks-proxy) on :8000
#   - Frontend dev server   (frontend/ Vite) on :5173
#
# Frontend talks to :8000 (Rust). Rust handles /proxy/*, /manage/batch,
# /health directly; everything else (passkey, vault CRUD, agents, billing,
# usage) reverse-proxies to Python on :8001. Architecture rationale: see
# proxy-rs/ADR-002-architecture.md.
#
# Usage:
#   bash scripts/dev.sh        # foreground; Ctrl-C cleans up everything
#   bash scripts/dev.sh --no-rust   # skip Rust proxy (frontend → Python directly)
#
# Requirements:
#   - Python 3.13+ with v2-mvp/.venv populated (`pip install -r v2-mvp/requirements.txt`)
#   - cargo + rustc on PATH
#   - Node 20+ + npm
#
# First-run will: build Rust release binary, install frontend deps if missing.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NO_RUST=0
for arg in "$@"; do
  case "$arg" in
    --no-rust) NO_RUST=1 ;;
    -h|--help)
      sed -n '1,/^set -euo/p' "$0" | sed 's/^# \?//' | head -n 25
      exit 0
      ;;
  esac
done

# ─── helpers ──────────────────────────────────────────────────────────────────

c() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
log() { printf "%s %s\n" "$(c '36' "[dev]")" "$*"; }
warn() { printf "%s %s\n" "$(c '33' "[dev]")" "$*" >&2; }
die() { printf "%s %s\n" "$(c '31' "[dev]")" "$*" >&2; exit 1; }

free_port() {
  # Idempotent: kill anything currently bound to $1.
  local pids
  pids=$(lsof -ti :"$1" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    warn "port $1 in use by pid(s) $pids — killing"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.2
  fi
}

wait_for_health() {
  local url=$1 name=$2 deadline=$((SECONDS + 30))
  while (( SECONDS < deadline )); do
    if curl -sf "$url" >/dev/null 2>&1; then
      log "$(c '32' "✓") $name healthy ($url)"
      return 0
    fi
    sleep 0.2
  done
  die "$name did not come up within 30s ($url)"
}

# ─── prereq checks ────────────────────────────────────────────────────────────

[[ -d v2-mvp/.venv ]] || die "v2-mvp/.venv missing — run: cd v2-mvp && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
[[ -d frontend ]] || die "frontend/ missing — wrong repo state"
command -v cargo >/dev/null || die "cargo not on PATH"
command -v npm >/dev/null || die "npm not on PATH"

if (( NO_RUST == 0 )); then
  if [[ ! -x proxy-rs/target/release/ks-proxy ]]; then
    log "building proxy-rs (release, first run only)..."
    cargo build --release --manifest-path proxy-rs/Cargo.toml --bin ks-proxy
  fi
fi

if [[ ! -d frontend/node_modules ]]; then
  log "installing frontend deps (first run only)..."
  npm --prefix frontend ci
fi

# ─── port hygiene ─────────────────────────────────────────────────────────────

free_port 8001  # python
(( NO_RUST == 0 )) && free_port 8000  # rust
free_port 5173  # vite

# ─── child process management ─────────────────────────────────────────────────

pids=()
cleanup() {
  log "stopping..."
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # second-pass SIGKILL for stragglers
  sleep 0.5
  for pid in "${pids[@]}"; do
    kill -9 "$pid" 2>/dev/null || true
  done
}
trap cleanup INT TERM EXIT

prefix() {
  # stdin → prefixed lines on stdout
  local label=$1 color=$2
  awk -v p="$(printf '\033[%sm[%s]\033[0m' "$color" "$label")" '{print p, $0; fflush()}'
}

# ─── 1. Python control plane (uvicorn :8001) ─────────────────────────────────

log "starting python on :8001"
(
  cd v2-mvp
  exec .venv/bin/uvicorn src.server:app --port 8001 --host 127.0.0.1
) > >(prefix "py" "35") 2> >(prefix "py" "35" >&2) &
pids+=($!)

wait_for_health http://127.0.0.1:8001/health "python"

# ─── 2. Rust hot-path proxy (ks-proxy :8000) ──────────────────────────────────

if (( NO_RUST == 0 )); then
  log "starting rust on :8000"
  (
    KS_BIND=127.0.0.1:8000 \
    PYTHON_BACKEND_URL=http://127.0.0.1:8001 \
    KS_VAULT_DIR="$REPO_ROOT/v2-mvp/vault" \
    KS_SESSION_DB="$REPO_ROOT/v2-mvp/sessions.db" \
    exec proxy-rs/target/release/ks-proxy
  ) > >(prefix "rs" "34") 2> >(prefix "rs" "34" >&2) &
  pids+=($!)

  wait_for_health http://127.0.0.1:8000/health "rust"
  FRONTEND_API=http://127.0.0.1:8000
else
  warn "skipping Rust (--no-rust); frontend will hit Python directly"
  FRONTEND_API=http://127.0.0.1:8001
fi

# ─── 3. Frontend (Vite :5173) ─────────────────────────────────────────────────

log "starting frontend on :5173 → API_BASE=$FRONTEND_API"
(
  cd frontend
  exec npm run dev -- --port 5173 --host 127.0.0.1
) > >(prefix "fe" "32") 2> >(prefix "fe" "32" >&2) &
pids+=($!)

# Don't health-check Vite — it doesn't have a /health endpoint and the dev
# server logs its own ready-line. Just wait briefly to let it boot.
sleep 1

# ─── ready ────────────────────────────────────────────────────────────────────

cat <<EOF

$(c '32;1' "✓ keyshield is running")

  Frontend:  http://localhost:5173
  Public:    http://localhost:8000   $([[ $NO_RUST == 0 ]] && echo "(Rust ks-proxy)" || echo "(Python — Rust skipped)")
  Internal:  http://localhost:8001   $([[ $NO_RUST == 0 ]] && echo "(Python control plane)" || echo "(same as public)")

  Press Ctrl-C to stop everything.

EOF

# Block until any child exits or the user hits Ctrl-C. The trap handles cleanup.
wait
