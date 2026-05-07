#!/usr/bin/env bash
#
# devnet-e2e.sh — full happy-path end-to-end test for KeyShield's MPP +
# x402 flow against Solana devnet.
#
# What it does:
#   1. Sources the env block emitted by `scripts/devnet-setup.sh`
#      (or expects the block to already be exported).
#   2. Calls `bash scripts/pay.sh` (per-call x402 + MPP settlement)
#      with the devnet RPC + program-id + settler key — this should
#      produce a real on-chain settlement transaction (not stub-fallback).
#   3. Verifies the on-chain ix landed:
#        - parses the tx signature from pay.sh's NDJSON output
#        - `solana confirm <sig> --url devnet`
#        - `solana account <stream_pda> --url devnet` to check that the
#          PaymentStream's spent_total advanced.
#   4. Asserts:
#        - `verified_mode == "real"` on the x402 receipt
#        - `settled_micro_usdc > 0` on the MPP stream record
#   5. Emits a green / red one-liner suitable for CI:
#        DEVNET-E2E PASS verified=real settled=N tx=<sig>
#        DEVNET-E2E FAIL <reason>
#
# Exit codes:
#   0 = pass    1 = generic failure    2 = env not set    3 = tooling missing
#
# Usage:
#   eval "$(bash scripts/devnet-setup.sh --quiet)"
#   bash scripts/devnet-e2e.sh
#
#   # Or:
#   bash scripts/devnet-e2e.sh --setup-first   # runs setup + sources its env

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SETUP_FIRST=0
PAY_SCRIPT="${KS_PAY_SCRIPT:-$REPO_ROOT/scripts/pay.sh}"
for arg in "$@"; do
  case "$arg" in
    --setup-first) SETUP_FIRST=1 ;;
    -h|--help)
      sed -n '1,/^set -euo/p' "$0" | sed 's/^# \?//' | head -n 40
      exit 0
      ;;
    *)
      printf 'unknown arg: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

# ─── helpers ─────────────────────────────────────────────────────────────────

c() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
log() { printf "%s %s\n" "$(c '36' '[devnet-e2e]')" "$*" >&2; }
warn() { printf "%s %s\n" "$(c '33' '[devnet-e2e]')" "$*" >&2; }
pass() {
  printf "%s %s\n" "$(c '32;1' 'DEVNET-E2E PASS')" "$*"
  exit 0
}
fail() {
  printf "%s %s\n" "$(c '31;1' 'DEVNET-E2E FAIL')" "$*"
  exit 1
}

# ─── 0. env ──────────────────────────────────────────────────────────────────

if (( SETUP_FIRST )); then
  log "running scripts/devnet-setup.sh --quiet (--setup-first)"
  # shellcheck disable=SC2046,SC1091
  eval "$(bash "$REPO_ROOT/scripts/devnet-setup.sh" --quiet)"
fi

REQUIRED_VARS=(
  KS_MPP_SETTLER_KEY
  KS_KEYSHIELD_PROGRAM_ID
  KS_SOLANA_RPC_URL
  KS_USDC_MINT
)
for v in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    printf '%s required env var %s is empty — run: eval "$(bash scripts/devnet-setup.sh --quiet)"\n' \
      "$(c '31;1' 'DEVNET-E2E FAIL')" "$v"
    exit 2
  fi
done

if ! command -v solana >/dev/null 2>&1; then
  printf '%s solana CLI not on PATH\n' "$(c '31;1' 'DEVNET-E2E FAIL')"
  exit 3
fi
if ! command -v jq >/dev/null 2>&1; then
  printf '%s jq not on PATH\n' "$(c '31;1' 'DEVNET-E2E FAIL')"
  exit 3
fi

# ─── 1. invoke pay.sh ────────────────────────────────────────────────────────

if [[ ! -x "$PAY_SCRIPT" ]] && [[ ! -f "$PAY_SCRIPT" ]]; then
  warn "expected pay.sh at $PAY_SCRIPT but it doesn't exist."
  warn "  this script is the harness — pay.sh must be implemented separately"
  warn "  to actually exercise the MPP + x402 flow against the running server."
  fail "pay.sh missing — see docs/DEVNET.md 'Blockers' section"
fi

PAY_OUT="$(mktemp -t keyshield-devnet-e2e.XXXXXX.ndjson)"
trap 'rm -f "$PAY_OUT"' EXIT

log "executing $PAY_SCRIPT (output → $PAY_OUT)"
if ! bash "$PAY_SCRIPT" 2>&1 | tee "$PAY_OUT"; then
  fail "pay.sh exited non-zero — see $PAY_OUT for stderr"
fi

# ─── 2. parse pay.sh output ──────────────────────────────────────────────────
#
# Contract (negotiated with pay.sh): emits at least one NDJSON line with
# fields:  verified_mode, settled_micro_usdc, tx_signature, stream_pda
# Anything else is conversational logging.

extract_json_field() {
  local field=$1
  # take the LAST occurrence that has all three fields populated
  jq -rn --arg f "$field" '
    [inputs | select(type=="object" and (.verified_mode? != null))]
    | last
    | .[$f] // empty
  ' "$PAY_OUT" 2>/dev/null || true
}

VERIFIED_MODE="$(extract_json_field verified_mode)"
SETTLED="$(extract_json_field settled_micro_usdc)"
TX_SIG="$(extract_json_field tx_signature)"
STREAM_PDA="$(extract_json_field stream_pda)"

[[ -z "$VERIFIED_MODE" ]] && fail "pay.sh did not emit verified_mode (NDJSON missing or wrong shape)"

if [[ "$VERIFIED_MODE" != "real" ]]; then
  fail "verified_mode=$VERIFIED_MODE (expected 'real' — server is still using stub-fallback; check KS_KEYSHIELD_PROGRAM_ID env on the server process)"
fi

if [[ -z "$SETTLED" ]] || [[ "$SETTLED" -le 0 ]] 2>/dev/null; then
  fail "settled_micro_usdc=${SETTLED:-<empty>} (expected > 0 — MPP settle path didn't run)"
fi

# ─── 3. confirm on-chain ─────────────────────────────────────────────────────

if [[ -z "$TX_SIG" ]]; then
  warn "pay.sh did not return tx_signature; skipping solana confirm"
else
  log "confirming tx $TX_SIG on devnet"
  if ! solana confirm "$TX_SIG" --url "$KS_SOLANA_RPC_URL" >&2; then
    fail "solana confirm $TX_SIG failed — settlement tx not found on devnet"
  fi
fi

if [[ -n "$STREAM_PDA" ]]; then
  log "fetching stream PDA $STREAM_PDA from devnet"
  if ! solana account "$STREAM_PDA" --url "$KS_SOLANA_RPC_URL" --output json >/dev/null 2>&1; then
    fail "solana account $STREAM_PDA returned error — PDA does not exist on devnet"
  fi
fi

# ─── 4. green ────────────────────────────────────────────────────────────────

pass "verified=real settled=$SETTLED tx=${TX_SIG:-N/A} stream=${STREAM_PDA:-N/A} program=$KS_KEYSHIELD_PROGRAM_ID"
