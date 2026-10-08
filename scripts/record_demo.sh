#!/usr/bin/env bash
# KeyShield record-demo harness (~2 minutes, zero prompts).
#
#   A  mock upstream (X-Test-Scenario: stream_success | fault_502)
#   B  ks-proxy / proxy-helius (RUST_LOG=info) pointed at the mock
#   C  timed client — scenes 1–5 (problem, PRF, IPC inject, measured SSE, Devnet/502)
#   D  OpenRouter Nemotron plug-in (saved vault/env key, else mock)
#   E  OpenClaw runtime stand-in (Unix socket IPC — no clipboard / no .env)
#
#   bash scripts/record_demo.sh
#   bash scripts/record_demo.sh --fast
#   bash scripts/record_demo.sh --split
#   bash scripts/record_demo.sh --split --pace 28000
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PACE_MS=2500
SPLIT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --fast) PACE_MS=200; shift ;;
    --split) SPLIT=1; shift ;;
    --pace)
      PACE_MS="${2:?--pace requires milliseconds}"
      shift 2
      ;;
    --pace=*)
      PACE_MS="${1#--pace=}"
      shift
      ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

WORKDIR="${KS_RECORD_WORKDIR:-$(mktemp -d /tmp/ks-record-demo.XXXXXX)}"
MOCK_PORT="${KS_RECORD_MOCK_PORT:-18765}"
PROXY_PORT="${KS_RECORD_PROXY_PORT:-18000}"
MOCK_URL="http://127.0.0.1:${MOCK_PORT}"
PROXY_URL="http://127.0.0.1:${PROXY_PORT}"
LOG_DIR="$WORKDIR/logs"
mkdir -p "$LOG_DIR" "$WORKDIR/vault/dev-bypass" "$WORKDIR/sessions" "$WORKDIR/ipc"

KS_PROXY_BIN="${KS_PROXY_BIN:-$ROOT/src/proxy/target/debug/ks-proxy}"
if [[ ! -x "$KS_PROXY_BIN" ]]; then
  KS_PROXY_BIN="$ROOT/src/proxy/target/debug/ks-proxy"
fi

TS() { date -u +"%H:%M:%S.%6N"; }
say() { printf '\033[2m%s\033[0m \033[36m%-6s\033[0m %s\n' "$(TS)" "$1" "$2"; }
ok()  { printf '\033[2m%s\033[0m \033[32m%-6s\033[0m %s\n' "$(TS)" "OK" "$1"; }
err() { printf '\033[2m%s\033[0m \033[31m%-6s\033[0m %s\n' "$(TS)" "FAIL" "$1"; }

KEYPAIR="${KS_RECORD_WALLET_KEYPAIR:-$ROOT/.keyshield-devnet/user-devnet.json}"
PUBFILE="${KS_RECORD_WALLET_PUB:-$ROOT/.keyshield-devnet/user-devnet.pub}"
if [[ -z "${KS_RECORD_WALLET:-}" ]]; then
  if command -v solana-keygen >/dev/null 2>&1 && [[ -f "$KEYPAIR" ]]; then
    KS_RECORD_WALLET="$(solana-keygen pubkey "$KEYPAIR")"
  elif [[ -f "$PUBFILE" ]]; then
    KS_RECORD_WALLET="$(tr -d '[:space:]' < "$PUBFILE")"
  else
    err "no local wallet (set KS_RECORD_WALLET or $KEYPAIR)"
    exit 1
  fi
fi
export KS_RECORD_WALLET
export KS_RECORD_RPC="${KS_RECORD_RPC:-https://api.devnet.solana.com}"
export KS_RECORD_PROGRAM_ID="${KS_RECORD_PROGRAM_ID:-41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j}"
export KS_RECORD_USDC_MINT="${KS_RECORD_USDC_MINT:-4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU}"
export KS_RECORD_API="${KS_RECORD_API:-http://127.0.0.1:8000}"
if [[ -z "${KS_RECORD_SSE_INTERVAL_MS:-}" ]]; then
  if [[ "$PACE_MS" -le 200 ]]; then
    KS_RECORD_SSE_INTERVAL_MS=4
  else
    KS_RECORD_SSE_INTERVAL_MS=40
  fi
fi
export KS_RECORD_SSE_INTERVAL_MS

MOCK_PID=""
PROXY_PID=""
RUNTIME_PID=""
cleanup() {
  if [[ -n "${PROXY_PID}" ]] && kill -0 "$PROXY_PID" 2>/dev/null; then
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
  if [[ -n "${RUNTIME_PID}" ]] && kill -0 "$RUNTIME_PID" 2>/dev/null; then
    kill "$RUNTIME_PID" 2>/dev/null || true
    wait "$RUNTIME_PID" 2>/dev/null || true
  fi
  if [[ -n "${MOCK_PID}" ]] && kill -0 "$MOCK_PID" 2>/dev/null; then
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$MOCK_PID" 2>/dev/null || true
  fi
  rm -f "${KS_RECORD_IPC_SOCK:-}" "${KS_RECORD_IPC_READY:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo
printf '\033[1mKeyShield record-demo harness\033[0m\n'
say "INIT" "workdir $WORKDIR"
say "INIT" "pace ${PACE_MS}ms  split=$SPLIT  sse_interval=${KS_RECORD_SSE_INTERVAL_MS}ms"
say "INIT" "wallet $KS_RECORD_WALLET"

# ── Component A ──────────────────────────────────────────────────────────────
say "A" "starting mock upstream on :${MOCK_PORT}"
KS_RECORD_MOCK_PORT="$MOCK_PORT" KS_RECORD_SSE_INTERVAL_MS="$KS_RECORD_SSE_INTERVAL_MS" \
  node "$ROOT/scripts/record_demo_mock_upstream.mjs" \
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
# Scene 2 derives a client-side PRF vault. The proxy uses the platform
# key + mock /_internal/balance so scene 3 does not pay PBKDF2 (100k)
# on every request (~500ms in debug builds).
node "$ROOT/scripts/record_demo_write_vault.mjs" \
  "$WORKDIR/vault-demo/dev-bypass/openai.enc" \
  "dev-bypass" \
  "sk-record-demo-vault"

HANDLERS_RS="$ROOT/src/proxy/crates/ks-proxy/src/handlers.rs"
if [[ ! -x "$KS_PROXY_BIN" || ( -f "$HANDLERS_RS" && "$HANDLERS_RS" -nt "$KS_PROXY_BIN" ) ]]; then
  say "B" "building ks-proxy / proxy-helius"
  cargo build -p ks-proxy --manifest-path "$ROOT/src/proxy/Cargo.toml" --offline 2>/dev/null \
    || cargo build -p ks-proxy --manifest-path "$ROOT/src/proxy/Cargo.toml"
  KS_PROXY_BIN="$ROOT/src/proxy/target/debug/ks-proxy"
fi

say "B" "starting proxy-helius (ks-proxy) on :${PROXY_PORT}  RUST_LOG=info"
env \
  RUST_LOG=info \
  KS_BIND="127.0.0.1:${PROXY_PORT}" \
  KS_STEALTH=0 \
  KS_TLS_MODE=off \
  KS_VAULT_DIR="$WORKDIR/vault" \
  KS_SESSION_DB="$WORKDIR/sessions/sessions.db" \
  KS_UPSTREAM_OVERRIDE_BASE="$MOCK_URL" \
  PYTHON_BACKEND_URL="$MOCK_URL" \
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

# ── Component E ──────────────────────────────────────────────────────────────
export KS_RECORD_IPC_SOCK="$WORKDIR/ipc/openclaw.sock"
export KS_RECORD_IPC_READY="$WORKDIR/ipc/ready"
export KS_RECORD_IPC_AUTH="${KS_RECORD_IPC_AUTH:-$(openssl rand -hex 32)}"
rm -f "$KS_RECORD_IPC_SOCK" "$KS_RECORD_IPC_READY"
say "E" "starting OpenClaw runtime stand-in (unix socket IPC)"
env \
  -u OPENAI_API_KEY \
  -u OPENROUTER_API_KEY \
  -u ANTHROPIC_API_KEY \
  -u HELIUS_API_KEY \
  KS_RECORD_IPC_SOCK="$KS_RECORD_IPC_SOCK" \
  KS_RECORD_IPC_AUTH="$KS_RECORD_IPC_AUTH" \
  KS_RECORD_IPC_READY="$KS_RECORD_IPC_READY" \
  node "$ROOT/scripts/record_demo_openclaw_runtime.mjs" \
  >"$LOG_DIR/openclaw.log" 2>&1 &
RUNTIME_PID=$!
for i in $(seq 1 40); do
  if [[ -S "$KS_RECORD_IPC_SOCK" && -f "$KS_RECORD_IPC_READY" ]]; then
    ok "openclaw runtime ready  pid=$RUNTIME_PID  sock=$KS_RECORD_IPC_SOCK"
    break
  fi
  if ! kill -0 "$RUNTIME_PID" 2>/dev/null; then
    err "openclaw runtime exited"
    cat "$LOG_DIR/openclaw.log" || true
    exit 1
  fi
  if [[ "$i" -eq 40 ]]; then
    err "openclaw runtime did not become ready"
    cat "$LOG_DIR/openclaw.log" || true
    exit 1
  fi
  sleep 0.1
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
say "C" "running timed client (scenes 1–5 + OpenRouter plug-in)"
export KS_RECORD_MOCK_URL="$MOCK_URL"
export KS_RECORD_PROXY_URL="$PROXY_URL"
export KS_RECORD_WORKDIR="$WORKDIR"
export KS_RECORD_PACE_MS="$PACE_MS"
# Empty export would force the client onto the env clipboard path.
# Leave it unset so xclip / pbpaste can run.
if [[ -n "${KS_RECORD_CLIPBOARD:-}" ]]; then
  export KS_RECORD_CLIPBOARD
else
  unset KS_RECORD_CLIPBOARD
fi
export KS_VAULT_DB_PATH="${KS_VAULT_DB_PATH:-$ROOT/src/backend/data/vault_shim.db}"
npx --yes tsx "$ROOT/scripts/record_demo_client.ts"

# Stage 3 fault-injection suite (same mock contract as the recording)
say "C" "npm run test:fault  (scvd.store / 502 / truncated SSE)"
npm run test:fault

ok "record-demo complete"
say "LOGS" "mock     $LOG_DIR/mock.log"
say "LOGS" "ks-proxy $LOG_DIR/ks-proxy.log"
say "LOGS" "openclaw $LOG_DIR/openclaw.log"
say "SPEC" "session  $WORKDIR/session-spec.json"
say "ENV"  "bad.env  $WORKDIR/exposed.env"
echo
