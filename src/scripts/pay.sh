#!/usr/bin/env bash
#
# pay.sh — KeyShield payment-flow demo script.
#
# Walks through every payment-related path the product exposes, against a
# locally running stack (`bash scripts/dev.sh` first):
#
#   1. Wallet-login (ed25519 challenge — /auth/login is 403)
#   2. x402 proof topup → /billing/topup with tx_hash; second-claim 409
#   3. MPP stream lifecycle:
#        a. POST /mpp/streams (open)
#        b. POST /mpp/streams/{id}/record (fulfillment body required)
#        c. POST /mpp/streams/{id}/capture (session HMAC)
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

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
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

# ── 1. wallet-login (POST /auth/login is 403 — passphrase shim is off) ──

section "1. wallet-login (ed25519 challenge)"
KS_PY="${KS_PYTHON:-$REPO_ROOT/.venv/bin/python3}"
[[ -x "$KS_PY" ]] || KS_PY="python3"
SETTLER_KP="${KS_MPP_SETTLER_KEYPAIR:-$REPO_ROOT/.keyshield-devnet/mpp-settler-devnet.json}"
WALLET_LOGIN=$("$KS_PY" - "$API_BASE" "$SETTLER_KP" <<'PY'
import base64, json, sys, urllib.request
from pathlib import Path
from nacl.signing import SigningKey
import base58

base = sys.argv[1]
kp_path = Path(sys.argv[2])
if kp_path.is_file():
    raw = json.loads(kp_path.read_text())
    if not isinstance(raw, list) or len(raw) != 64:
        raise SystemExit("settler keypair JSON must be 64 bytes")
    sk = SigningKey(bytes(int(b) & 0xFF for b in raw[:32]))
else:
    sk = SigningKey.generate()
wallet = base58.b58encode(bytes(sk.verify_key)).decode()

def http(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        base + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

ch = http("GET", "/auth/wallet-challenge")
challenge = ch["challenge"]
sig = base64.b64encode(sk.sign(challenge.encode()).signature).decode()
login = http(
    "POST",
    "/auth/wallet-login",
    {
        "walletAddress": wallet,
        "challenge": challenge,
        "nonce": ch.get("nonce", challenge),
        "signature": sig,
        "passphrase": "pay-sh",
    },
)
print(json.dumps({"wallet": wallet, "token": login.get("token", "")}))
PY
) || die "wallet-login helper failed (need python3 + nacl + base58)"
TOKEN=$(echo "$WALLET_LOGIN" | jget token)
WALLET=$(echo "$WALLET_LOGIN" | jget wallet)
if [[ -z "$TOKEN" ]]; then
  die "wallet-login returned no token; body was: $WALLET_LOGIN"
fi
if [[ -n "$WALLET" ]]; then
  DEMO_AGENT_PUBKEY="$WALLET"
fi
ok "wallet $WALLET  token ${TOKEN:0:12}…"

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
  cat <<'EOF'
  Wire instructions (2026-05-10): the response now contains TWO things
  the frontend must bundle into ONE Solana Transaction:

    1. prereqIxs[] — list of prerequisite ixs the frontend MUST prepend
       (in order) before the main ix:
         (a) Create the stream-PDA-owned USDC ATA (idempotent — SPL
             Associated Token Program, discriminator 1).
         (b) Transfer maxTotalMicroUsdc from owner's USDC ATA → stream
             ATA (SPL Token TransferChecked, owner signs).
    2. The main ix (programId / keys / data) — open_payment_stream
       itself, also signed by owner in the same Transaction.

  Without (1), mpp_settle's later PDA-signed transfer would hit 0x4
  OwnerMismatch (because the stream record would point at a non-PDA
  ATA the program can't authority-sign).

EOF
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

info "3b. record fulfillment artifact (empty body is not billable)"
RECORD=$(curl -sf -X POST "$API_BASE/mpp/streams/$STREAM_ID/record" "${AUTH[@]}" \
  -H 'content-type: application/json' \
  -d '{"tokens":10,"calls":1,"status_code":200,"body":{"choices":[{"message":{"content":"hello"}}],"usage":{"total_tokens":10}}}')
echo "$RECORD" | jpp
ARTIFACT=$(echo "$RECORD" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("stream",{}).get("artifact_hash",""))')
if [[ -z "$ARTIFACT" ]]; then
  die "record returned no artifact_hash; body: $RECORD"
fi
ok "artifact $ARTIFACT"

info "3c. submit-open-tx (settler-as-owner signs vault/grant/open)"
BUY_MICRO="${KS_BUY_MICRO_USDC:-1000000}"
HTTP_STATUS=$(curl -s -o /tmp/mpp-submit-open.json -w '%{http_code}' \
  -X POST "$API_BASE/mpp/streams/$STREAM_ID/submit-open-tx" "${AUTH[@]}" \
  -H 'content-type: application/json' \
  -d "{\"maxTotalMicroUsdc\": $BUY_MICRO}")
cat /tmp/mpp-submit-open.json | jpp
if [[ "$HTTP_STATUS" == "200" ]]; then
  ok "on-chain open $HTTP_STATUS"
else
  warn "submit-open-tx HTTP $HTTP_STATUS — capture will stay fail-closed until vault/USDC/SOL exist"
fi

info "3d. capture with session HMAC (not a bare /settle)"
CAPTURE_BODY=$(python3 - "$TOKEN" "$ARTIFACT" <<'PY'
import hashlib, hmac, json, sys
token, artifact = sys.argv[1], sys.argv[2]
mac = hmac.new(token.encode(), bytes.fromhex(artifact), hashlib.sha256).hexdigest()
print(json.dumps({"artifactHash": artifact, "signature": mac}))
PY
)
HTTP_STATUS=$(curl -s -o /tmp/mpp-capture.json -w '%{http_code}' \
  -X POST "$API_BASE/mpp/streams/$STREAM_ID/capture" "${AUTH[@]}" \
  -H 'content-type: application/json' \
  -d "$CAPTURE_BODY")
cat /tmp/mpp-capture.json | jpp
if [[ "$HTTP_STATUS" == "200" ]]; then
  SETTLED=$(python3 -c 'import json;print(json.load(open("/tmp/mpp-capture.json")).get("stream",{}).get("settled_micro_usdc",0))')
  ok "captured settled_micro_usdc=$SETTLED"
else
  warn "capture HTTP $HTTP_STATUS — if settler env is loaded, the stream PDA must be wallet-signed on-chain first"
fi

info "3e. close stream"
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
