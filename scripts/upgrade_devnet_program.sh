#!/usr/bin/env bash
#
# Force-build the pinocchio program and upgrade the live Devnet id
# `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j` when the upgrade
# authority keypair is present.
#
# This is the operator path for ixs 40–43. The runner at
# scripts/run_devnet_zk_vault.ts fail-fasts if the live program still
# rejects disc 40 — it will not pretend the upgrade landed.
#
# Usage:
#   bash scripts/upgrade_devnet_program.sh
#   KS_UPGRADE_AUTHORITY_KEYPAIR=/path/id.json bash scripts/upgrade_devnet_program.sh
#   bash scripts/upgrade_devnet_program.sh --build-only
#
# Required:
#   - cargo-build-sbf + solana CLI
#   - funded payer (default: .keyshield-devnet/mpp-settler-devnet.json)
#   - upgrade authority for 41P2wHK… (currently 74Xuc5…) to actually
#     replace the on-chain .so. Without it the script builds, writes a
#     buffer, and exits 2 with a machine-readable artifact.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROGRAM_ID="${KS_KEYSHIELD_PROGRAM_ID:-41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j}"
RPC="${KS_SOLANA_RPC_URL:-https://api.devnet.solana.com}"
PAYER="${KS_MPP_SETTLER_KEY:-$REPO_ROOT/.keyshield-devnet/mpp-settler-devnet.json}"
AUTHORITY_KEY="${KS_UPGRADE_AUTHORITY_KEYPAIR:-}"
PROGRAM_DIR="$REPO_ROOT/src/programs/keyshield"
SO="$REPO_ROOT/target/deploy/keyshield.so"
ARTIFACT_DIR="${KS_UPGRADE_ARTIFACT_DIR:-/opt/cursor/artifacts}"
BUILD_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=1 ;;
    -h|--help)
      sed -n '2,24p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

die() { echo "[upgrade-devnet] $*" >&2; exit 1; }
log() { echo "[upgrade-devnet] $*" >&2; }

require() { command -v "$1" >/dev/null 2>&1 || die "missing required tool: $1"; }
require solana
require cargo-build-sbf
require python3

if [[ ! -f "$PAYER" ]]; then
  die "payer keypair missing: $PAYER"
fi

PAYER_PUB="$(solana address -k "$PAYER")"
log "RPC=$RPC"
log "program=$PROGRAM_ID"
log "payer=$PAYER_PUB"
log "building $PROGRAM_DIR (cargo-build-sbf)"

(
  cd "$REPO_ROOT"
  cargo-build-sbf --manifest-path "$PROGRAM_DIR/Cargo.toml"
) >&2

[[ -f "$SO" ]] || die "expected $SO after cargo-build-sbf"
SO_BYTES="$(stat -c %s "$SO")"
SO_SHA="$(sha256sum "$SO" | awk '{print $1}')"
log "built $SO bytes=$SO_BYTES sha256=$SO_SHA"

mkdir -p "$ARTIFACT_DIR"
SHOW="$(solana program show "$PROGRAM_ID" --url "$RPC" --keypair "$PAYER" 2>/dev/null || true)"
ONCHAIN_LEN="$(printf '%s\n' "$SHOW" | awk '/Data Length:/ {print $3; exit}')"
ONCHAIN_AUTH="$(printf '%s\n' "$SHOW" | awk '/Authority:/ {print $2; exit}')"
ONCHAIN_SLOT="$(printf '%s\n' "$SHOW" | awk '/Last Deployed In Slot:/ {print $5; exit}')"
log "on-chain data_len=${ONCHAIN_LEN:-unknown} authority=${ONCHAIN_AUTH:-unknown} slot=${ONCHAIN_SLOT:-unknown}"

resolve_authority() {
  local candidate
  local pub
  local wanted="${ONCHAIN_AUTH:-}"
  local extras=()
  [[ -n "$AUTHORITY_KEY" ]] && extras+=("$AUTHORITY_KEY")
  extras+=(
    "$REPO_ROOT/.keyshield-devnet/upgrade-authority.json"
    "$HOME/.config/solana/id.json"
  )
  for candidate in "${extras[@]}"; do
    [[ -f "$candidate" ]] || continue
    pub="$(solana address -k "$candidate" 2>/dev/null || true)"
    [[ -z "$pub" ]] && continue
    if [[ -z "$wanted" || "$pub" == "$wanted" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    log "skip $candidate (pubkey $pub ≠ authority $wanted)"
  done
  return 1
}

AUTH_FILE=""
if AUTH_FILE="$(resolve_authority)"; then
  AUTH_PUB="$(solana address -k "$AUTH_FILE")"
  log "upgrade authority keypair matched $AUTH_PUB"
else
  AUTH_PUB=""
  log "upgrade authority keypair not found (need ${ONCHAIN_AUTH:-unknown})"
fi

write_report() {
  local status="$1"
  local note="$2"
  local buffer="${3:-}"
  local sig="${4:-}"
  python3 - "$status" "$note" "$buffer" "$sig" <<'PY'
import json, os, sys
status, note, buffer, sig = sys.argv[1:5]
report = {
  "programId": os.environ.get("KS_REPORT_PROGRAM_ID"),
  "rpc": os.environ.get("KS_REPORT_RPC"),
  "soPath": os.environ.get("KS_REPORT_SO"),
  "soBytes": int(os.environ.get("KS_REPORT_SO_BYTES") or 0),
  "soSha256": os.environ.get("KS_REPORT_SO_SHA"),
  "onChainDataLen": int(os.environ["KS_REPORT_ONCHAIN_LEN"]) if os.environ.get("KS_REPORT_ONCHAIN_LEN") else None,
  "onChainAuthority": os.environ.get("KS_REPORT_ONCHAIN_AUTH") or None,
  "onChainSlot": int(os.environ["KS_REPORT_ONCHAIN_SLOT"]) if os.environ.get("KS_REPORT_ONCHAIN_SLOT") else None,
  "payer": os.environ.get("KS_REPORT_PAYER"),
  "authorityMatched": os.environ.get("KS_REPORT_AUTH_MATCHED") == "1",
  "status": status,
  "note": note,
  "buffer": buffer or None,
  "upgradeSignature": sig or None,
}
out = os.path.join(os.environ.get("KS_REPORT_ARTIFACT_DIR", "."), "devnet-program-upgrade.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2)
    f.write("\n")
print(out)
PY
}

export KS_REPORT_PROGRAM_ID="$PROGRAM_ID"
export KS_REPORT_RPC="$RPC"
export KS_REPORT_SO="$SO"
export KS_REPORT_SO_BYTES="$SO_BYTES"
export KS_REPORT_SO_SHA="$SO_SHA"
export KS_REPORT_ONCHAIN_LEN="${ONCHAIN_LEN:-}"
export KS_REPORT_ONCHAIN_AUTH="${ONCHAIN_AUTH:-}"
export KS_REPORT_ONCHAIN_SLOT="${ONCHAIN_SLOT:-}"
export KS_REPORT_PAYER="$PAYER_PUB"
export KS_REPORT_AUTH_MATCHED="$([[ -n "$AUTH_FILE" ]] && echo 1 || echo 0)"
export KS_REPORT_ARTIFACT_DIR="$ARTIFACT_DIR"

if (( BUILD_ONLY )); then
  OUT="$(write_report "built" "build-only; no buffer or upgrade attempted" "" "")"
  log "wrote $OUT"
  exit 0
fi

if [[ -n "$ONCHAIN_LEN" && "$SO_BYTES" -gt "$ONCHAIN_LEN" && -z "$AUTH_FILE" ]]; then
  NEED=$((SO_BYTES - ONCHAIN_LEN + 1024))
  log "on-chain program data ($ONCHAIN_LEN) is smaller than new .so ($SO_BYTES); extend needs +${NEED} bytes from authority"
fi

log "writing upgrade buffer from $SO (payer=$PAYER_PUB)"
BUFFER_OUT="$(solana program write-buffer "$SO" --url "$RPC" --keypair "$PAYER" 2>&1)" || {
  log "$BUFFER_OUT"
  OUT="$(write_report "buffer-failed" "solana program write-buffer failed" "" "")"
  log "wrote $OUT"
  exit 1
}
printf '%s\n' "$BUFFER_OUT" >&2
BUFFER="$(printf '%s\n' "$BUFFER_OUT" | awk '/Buffer Address:/ {print $3; exit}')"
[[ -n "$BUFFER" ]] || die "write-buffer succeeded but no Buffer Address parsed"
log "buffer=$BUFFER"

if [[ -z "$AUTH_FILE" ]]; then
  NOTE="Live program $PROGRAM_ID authority is ${ONCHAIN_AUTH:-unknown}. Buffer $BUFFER is ready. Set KS_UPGRADE_AUTHORITY_KEYPAIR to that keypair and re-run to finish the upgrade. Not claiming ixs 40–43 are live."
  OUT="$(write_report "buffer-ready-authority-missing" "$NOTE" "$BUFFER" "")"
  log "$NOTE"
  log "wrote $OUT"
  exit 2
fi

if [[ -n "$ONCHAIN_LEN" && "$SO_BYTES" -gt "$ONCHAIN_LEN" ]]; then
  EXTRA=$((SO_BYTES - ONCHAIN_LEN + 4096))
  log "extending program data by $EXTRA bytes"
  solana program extend "$PROGRAM_ID" "$EXTRA" \
    --url "$RPC" \
    --keypair "$PAYER" \
    --upgrade-authority "$AUTH_FILE" >&2 \
    || die "solana program extend failed"
fi

log "upgrading $PROGRAM_ID from buffer $BUFFER"
UP_OUT="$(solana program deploy "$SO" \
  --program-id "$PROGRAM_ID" \
  --buffer "$BUFFER" \
  --upgrade-authority "$AUTH_FILE" \
  --keypair "$PAYER" \
  --url "$RPC" 2>&1)" || {
  log "$UP_OUT"
  OUT="$(write_report "upgrade-failed" "solana program deploy --buffer failed" "$BUFFER" "")"
  log "wrote $OUT"
  exit 1
}
printf '%s\n' "$UP_OUT" >&2
SIG="$(printf '%s\n' "$UP_OUT" | awk '/Signature:/ {print $2; exit}')"
OUT="$(write_report "upgraded" "program upgraded from buffer; next: npm run live:zk-vault" "$BUFFER" "$SIG")"
log "upgrade complete sig=${SIG:-unknown}"
log "wrote $OUT"
