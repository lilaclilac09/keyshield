#!/usr/bin/env bash
# KeyShield record-demo harness (~2 minutes, zero prompts).
#
#   A  mock upstream (SSE / 502 / drop)
#   B  ks-proxy (RUST_LOG=info) pointed at the mock
#   C  timed client — scenes 1–4
#   D  OpenRouter Nemotron plug-in (live if a key is set, else mock)
#
#   bash scripts/record_demo.sh
#   bash scripts/record_demo.sh --fast
#   bash scripts/record_demo.sh --split
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PACE_MS=2500
SPLIT=0
for arg in "$@"; do
  case "$arg" in
    --fast) PACE_MS=200 ;;
    --split) SPLIT=1 ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
  esac
done

WORKDIR="${KS_RECORD_WORKDIR:-$(mktemp -d /tmp/ks-record-demo.XXXXXX)}"
MOCK_PORT="${KS_RECORD_MOCK_PORT:-18765}"
PROXY_PORT="${KS_RECORD_PROXY_PORT:-18000}"
MOCK_URL="http://127.0.0.1:${MOCK_PORT}"
PROXY_URL="http://127.0.0.1:${PROXY_PORT}"
LOG_DIR="$WORKDIR/logs"
mkdir -p "$LOG_DIR" "$WORKDIR/vault/dev-bypass" "$WORKDIR/sessions"

KS_PROXY_BIN="${KS_PROXY_BIN:-$ROOT/src/proxy/target/debug/ks-proxy}"
if [[ ! -x "$KS_PROXY_BIN" ]]; then
  KS_PROXY_BIN="$ROOT/src/proxy/target/debug/ks-proxy"
fi

TS() { date -u +"%H:%M:%S"; }
say() { printf '\033[2m%s\033[0m \033[36m%-6s\033[0m %s\n' "$(TS)" "$1" "$2"; }
ok()  { printf '\033[2m%s\033[0m \033[32m%-6s\033[0m %s\n' "$(TS)" "OK" "$1"; }
err() { printf '\033[2m%s\033[0m \033[31m%-6s\033[0m %s\n' "$(TS)" "FAIL" "$1"; }

MOCK_PID=""
PROXY_PID=""
cleanup() {
  if [[ -n "${PROXY_PID}" ]] && kill -0 "$PROXY_PID" 2>/dev/null; then
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
  if [[ -n "${MOCK_PID}" ]] && kill -0 "$MOCK_PID" 2>/dev/null; then
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$MOCK_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo
printf '\033[1mKeyShield record-demo harness\033[0m\n'
say "INIT" "workdir $WORKDIR"
say "INIT" "pace ${PACE_MS}ms  split=$SPLIT"

# ── Component A ──────────────────────────────────────────────────────────────
say "A" "starting mock upstream on :${MOCK_PORT}"
KS_RECORD_MOCK_PORT="$MOCK_PORT" node "$ROOT/scripts/record_demo_mock_upstream.mjs" \
  >"$LOG_DIR/mock.log" 2>&1 &
MOCK_PID=$!
for i in $(seq 1 40); do
  if curl -sf "$MOCK_URL/health" >/dev/null; then
    ok "mock upstream ready  pid=$MOCK_PID"
    break
  fi
  if [[ "$i" -eq 40 ]]; then
    err "mock upstream did not become ready"
    cat "$LOG_DIR/mock.log" || true
    exit 1
  fi
  sleep 0.1
done

# ── Component B ──────────────────────────────────────────────────────────────
say "B" "preparing ks-proxy vault + session db"
python3 - <<'PY' "$WORKDIR/sessions/sessions.db"
import sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
conn.execute(
    "CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT, enc_pass TEXT, expires_at INTEGER)"
)
conn.commit()
conn.close()
PY
node "$ROOT/scripts/record_demo_write_vault.mjs" \
  "$WORKDIR/vault/dev-bypass/openai.enc" \
  "dev-bypass" \
  "sk-record-demo-vault"

if [[ ! -x "$KS_PROXY_BIN" ]]; then
  say "B" "building ks-proxy (one-time)"
  cargo build -p ks-proxy --manifest-path "$ROOT/src/proxy/Cargo.toml" --offline 2>/dev/null \
    || cargo build -p ks-proxy --manifest-path "$ROOT/src/proxy/Cargo.toml"
  KS_PROXY_BIN="$ROOT/src/proxy/target/debug/ks-proxy"
fi

say "B" "starting ks-proxy on :${PROXY_PORT}  RUST_LOG=info"
env \
  RUST_LOG=info \
  KS_BIND="127.0.0.1:${PROXY_PORT}" \
  KS_STEALTH=0 \
  KS_TLS_MODE=off \
  KS_VAULT_DIR="$WORKDIR/vault" \
  KS_SESSION_DB="$WORKDIR/sessions/sessions.db" \
  KS_UPSTREAM_OVERRIDE_BASE="$MOCK_URL" \
  PYTHON_BACKEND_URL="${KS_API_BASE:-http://127.0.0.1:8001}" \
  KS_INTERNAL_SECRET="" \
  OPENAI_API_KEY="sk-record-demo-platform" \
  "$KS_PROXY_BIN" >"$LOG_DIR/ks-proxy.log" 2>&1 &
PROXY_PID=$!

for i in $(seq 1 50); do
  if curl -sf "$PROXY_URL/health" >/dev/null; then
    ok "ks-proxy ready  pid=$PROXY_PID"
    break
  fi
  if ! kill -0 "$PROXY_PID" 2>/dev/null; then
    err "ks-proxy exited"
    tail -n 40 "$LOG_DIR/ks-proxy.log" || true
    exit 1
  fi
  if [[ "$i" -eq 50 ]]; then
    err "ks-proxy did not become ready"
    tail -n 40 "$LOG_DIR/ks-proxy.log" || true
    exit 1
  fi
  sleep 0.15
done

if [[ "$SPLIT" -eq 1 ]] && command -v tmux >/dev/null 2>&1; then
  say "UI" "tmux session ks-record-demo (logs only — client stays in this pane)"
  tmux -f /exec-daemon/tmux.portal.conf has-session -t "=ks-record-demo" 2>/dev/null \
    && tmux -f /exec-daemon/tmux.portal.conf kill-session -t "ks-record-demo" || true
  tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "ks-record-demo" -c "$ROOT" -- \
    "${SHELL:-bash}" -lc "tail -f '$LOG_DIR/mock.log'"
  tmux -f /exec-daemon/tmux.portal.conf split-window -t "ks-record-demo" -h -- \
    "${SHELL:-bash}" -lc "tail -f '$LOG_DIR/ks-proxy.log'"
fi

# ── Components C + D ─────────────────────────────────────────────────────────
say "C" "running timed client (scenes 1–4 + OpenRouter plug-in)"
export KS_RECORD_MOCK_URL="$MOCK_URL"
export KS_RECORD_PROXY_URL="$PROXY_URL"
export KS_RECORD_WORKDIR="$WORKDIR"
export KS_RECORD_PACE_MS="$PACE_MS"
export KS_RECORD_CLIPBOARD="${KS_RECORD_CLIPBOARD:-}"
npx --yes tsx "$ROOT/scripts/record_demo_client.ts"

# Stage 3 fault-injection suite (same mock contract as the recording)
say "C" "npm run test:fault  (scvd.store / 502 / truncated SSE)"
npm run test:fault

ok "record-demo complete"
say "LOGS" "mock     $LOG_DIR/mock.log"
say "LOGS" "ks-proxy $LOG_DIR/ks-proxy.log"
say "ENV"  "bad.env  $WORKDIR/exposed.env"
echo
