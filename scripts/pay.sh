#!/usr/bin/env bash
#
# pay.sh — KeyShield payment-flow demo script.
#
# Walks through every payment-related path the product exposes, against a
# locally running stack (`bash scripts/dev.sh` first):
#
#   1. Login (passphrase auth) → bearer token
#   2. x402 proof topup → /billing/topup with tx_hash; second-claim 409
#   3. MPP stream lifecycle:
#        a. POST /mpp/streams (open)
#        b. POST /mpp/streams/{id}/record (log usage; auto-settle)
#        c. POST /mpp/streams/{id}/settle (manual settle)
#        d. (optional) POST /mpp/streams/{id}/build-open-tx
#                       → demonstrates the wallet-sign payload shape
#        e. POST /mpp/streams/{id}/close
#   4. /mpp/events listing + /usage/stats summary
#
# Stub-fallback friendly: if KS_MPP_SETTLER_KEY etc. aren't set, settle
# returns 0 rather than submitting a real Solana ix; the script still
# completes successfully and prints the env you'd need for the real path.
#
# Usage:
#   bash scripts/pay.sh                       # full demo against :8000
#   KS_API_BASE=http://127.0.0.1:8001 \
#     bash scripts/pay.sh                     # bypass Rust proxy
#   KS_DEMO_USER=alice KS_DEMO_PW=pw \
#     bash scripts/pay.sh                     # custom test user
#   bash scripts/pay.sh --build-tx-only       # just print the build-tx
#                                             # JSON payloads (for frontend
#                                             # wallet-adapter wiring)
#
# Exit codes: 0 success, 1 setup error, 2 endpoint failure.

set -euo pipefail

API_BASE="${KS_API_BASE:-http://127.0.0.1:8000}"
DEMO_USER="${KS_DEMO_USER:-alice}"
DEMO_PW="${KS_DEMO_PW:-pw}"
DEMO_AGENT_PUBKEY="${KS_DEMO_AGENT_PUBKEY:-AgentPubkeyDemo11111111111111111111111111111}"
DEMO_AGENT_NAME="${KS_DEMO_AGENT_NAME:-trading-bot-demo}"
DEMO_UPSTREAM="${KS_DEMO_UPSTREAM:-anthropic}"

BUILD_TX_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --build-tx-only) BUILD_TX_ONLY=1 ;;
    -h|--help)
      sed -n '1,/^set -euo/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "unknown flag: $arg"; exit 1 ;;
  esac
done

# ── color helpers ───────────────────────────────────────────────────────────

c() { printf '\033[%sm%s\033[0m' "$1" "$2"; }
section() { printf '\n%s %s\n' "$(c '36;1' "▶")" "$(c '36;1' "$*")"; }
ok()      { printf '%s %s\n' "$(c '32' "✓")" "$*"; }
info()    { printf '%s %s\n' "$(c '34' "·")" "$*"; }
warn()    { printf '%s %s\n' "$(c '33' "!")" "$*" >&2; }
die()     { printf '%s %s\n' "$(c '31' "✗")" "$*" >&2; exit 2; }

# Pretty-print JSON if jq is available, else cat.
jpp() {
  if command -v jq >/dev/null 2>&1; then
    jq .
  else
    cat
  fi
}

# Extract a single JSON field via jq (or python fallback).
jget() {
  local field=$1
  if command -v jq >/dev/null 2>&1; then
    jq -r ".$field // empty"
  else
    python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('$field',''))" 2>/dev/null || true
  fi
}

# ── 0. preflight ────────────────────────────────────────────────────────────

section "0. preflight — checking stack at $API_BASE"
if ! curl -sf "$API_BASE/health" >/dev/null 2>&1; then
  die "$API_BASE/health unreachable. Run \`bash scripts/dev.sh\` first."
fi
ok "stack is up"

# ── 1. login ────────────────────────────────────────────────────────────────

section "1. login as $DEMO_USER"
LOGIN_BODY=$(curl -sf -X POST "$API_BASE/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"userId\":\"$DEMO_USER\",\"password\":\"$DEMO_PW\"}")
TOKEN=$(echo "$LOGIN_BODY" | jget token)
if [[ -z "$TOKEN" ]]; then
  die "login returned no token; body was: $LOGIN_BODY"
fi
ok "got bearer token (${TOKEN:0:12}…)"

AUTH=(-H "authorization: Bearer $TOKEN")

# ── 2. x402 topup demo ──────────────────────────────────────────────────────

section "2. x402 payment proof + idempotency"

DEMO_PROOF="0xdemo-proof-$(date +%s)"
info "first claim with payment_proof=$DEMO_PROOF"
TOPUP1=$(curl -sf -X POST "$API_BASE/billing/topup" "${AUTH[@]}" \
  -H 'content-type: application/json' \
  -d "{\"amount_usd\": 2.0, \"payment_proof\": \"$DEMO_PROOF\"}")
echo "$TOPUP1" | jpp

MODE=$(echo "$TOPUP1" | jget verified_mode)
if [[ "$MODE" == "stub-fallback" ]]; then
  warn "verified_mode=stub-fallback — KS_X402_BASE_RPC_URL not set"
  warn "for real on-chain verification, set:"
  warn "  KS_X402_BASE_RPC_URL=https://mainnet.base.org"
  warn "  KS_X402_RECEIVER_ADDRESS=0xYourAddress"
  warn "  KS_X402_VERIFY_REQUIRED=1"
elif [[ "$MODE" == "real" ]]; then
  ok "real on-chain verification succeeded"
fi

info "second claim with same proof → expect 409 Conflict"
HTTP_STATUS=$(curl -s -o /tmp/topup2.json -w '%{http_code}' \
  -X POST "$API_BASE/billing/topup" "${AUTH[@]}" \
  -H 'content-type: application/json' \
  -d "{\"amount_usd\": 2.0, \"payment_proof\": \"$DEMO_PROOF\"}")
if [[ "$HTTP_STATUS" == "409" ]]; then
  ok "duplicate claim rejected (409)"
else
  warn "expected 409, got $HTTP_STATUS — body:"
  cat /tmp/topup2.json | jpp
fi

# ── 3. MPP stream lifecycle ────────────────────────────────────────────────

section "3. MPP stream — open → record → settle → close"

info "3a. open stream"
OPEN=$(curl -sf -X POST "$API_BASE/mpp/streams" "${AUTH[@]}" \
  -H 'content-type: application/json' \
  -d "{
    \"agentPubkey\": \"$DEMO_AGENT_PUBKEY\",
    \"agentName\": \"$DEMO_AGENT_NAME\",
    \"upstream\": \"$DEMO_UPSTREAM\",
    \"ratePerTokenMicroUsdc\": 15,
    \"ratePerCallMicroUsdc\": 0,
    \"settlementIntervalSecs\": 60
  }")
STREAM_ID=$(echo "$OPEN" | jget stream | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("id",""))' 2>/dev/null || echo "$OPEN" | jq -r '.stream.id')
if [[ -z "$STREAM_ID" || "$STREAM_ID" == "null" ]]; then
  die "open stream failed; body: $OPEN"
fi
ok "stream id = $STREAM_ID"

if (( BUILD_TX_ONLY == 1 )); then
  section "3a-extra. build-open-tx payload (frontend wallet-adapter input)"
  curl -sf -X POST "$API_BASE/mpp/streams/$STREAM_ID/build-open-tx" "${AUTH[@]}" \
    -H 'content-type: application/json' \
    -d "{
      \"ownerPubkey\": \"$(printf 'O%.0s' {1..32})\",
      \"streamPda\":   \"$(printf 'P%.0s' {1..32})\",
      \"bump\": 254,
      \"usdcAta\":     \"$(printf 'A%.0s' {1..32})\",
      \"maxTotalMicroUsdc\": 10000000,
      \"costPerUnitMicroUsdc\": 1,
      \"maxRateUsdPerMinBits\": 0
    }" | jpp || warn "build-open-tx returned non-200 (likely 503 — KS_VAULT_PDA / KS_KEYSHIELD_PROGRAM_ID not set)"
  ok "build-tx-only mode complete; skipping record/settle/close"
  exit 0
fi

info "3b. record 100 calls × 5000 tokens"
RECORD=$(curl -sf -X POST "$API_BASE/mpp/streams/$STREAM_ID/record" "${AUTH[@]}" \
  -H 'content-type: application/json' \
  -d '{"tokens": 5000, "calls": 100}')
echo "$RECORD" | jpp
ok "usage recorded"

info "3c. manual settle"
SETTLE=$(curl -sf -X POST "$API_BASE/mpp/streams/$STREAM_ID/settle" "${AUTH[@]}")
echo "$SETTLE" | jpp
SETTLED=$(echo "$SETTLE" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("stream",{}).get("settled_micro_usdc",0))' 2>/dev/null || echo 0)
ok "settled_micro_usdc = $SETTLED (stub-fallback shows DB-only debit)"

info "3d. close stream"
CLOSE=$(curl -sf -X POST "$API_BASE/mpp/streams/$STREAM_ID/close" "${AUTH[@]}")
echo "$CLOSE" | jpp
ok "stream closed"

# ── 4. summary ──────────────────────────────────────────────────────────────

section "4. summary — events + usage"

info "4a. recent MPP events for $DEMO_USER"
curl -sf "$API_BASE/mpp/events?limit=10" "${AUTH[@]}" | jpp

info "4b. usage stats"
curl -sf "$API_BASE/usage/stats" "${AUTH[@]}" | jpp

info "4c. balance"
curl -sf "$API_BASE/billing/balance" "${AUTH[@]}" | jpp

section "done"
ok "demo flow complete — to drive real on-chain settlements set:"
echo "    export KS_MPP_SETTLER_KEY=<base58 64-byte secret>"
echo "    export KS_PLATFORM_USDC_ATA=<your platform USDC ATA pubkey>"
echo "    export KS_KEYSHIELD_PROGRAM_ID=<deployed program id>"
echo "    export KS_VAULT_PDA=<owner UniversalVault PDA>"
echo "    export KS_SOLANA_RPC_URL=https://api.devnet.solana.com   # for testing"
echo
echo "  then re-run: bash scripts/pay.sh"
