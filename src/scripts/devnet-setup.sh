#!/usr/bin/env bash
#
# devnet-setup.sh — one-command Solana-devnet bootstrap for KeyShield MPP
# end-to-end testing.
#
# What it does (idempotent — re-running on a populated cache reuses
# everything):
#   1. Generates / reuses an MPP-settler keypair under
#      `.keyshield-devnet/mpp-settler-devnet.json`. Override the path
#      with `KS_DEVNET_KEYPAIR_PATH=/abs/path.json`.
#   2. Funds it via `solana airdrop 2 <pubkey> --url devnet` — skipped
#      when the balance is already ≥ 1 SOL.
#   3. Builds (`cargo build-sbf`) and deploys
#      `programs/keyshield` to devnet via `solana program deploy`,
#      capturing the program id. Skipped when the program is already
#      deployed at the recorded program-id.
#   4. Creates a USDC ATA for the platform receiver wallet against the
#      devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
#      Skipped when the ATA already exists.
#   5. Prints an env-block ready to `eval`:
#        export KS_MPP_SETTLER_KEY=<base58>
#        export KS_PLATFORM_USDC_ATA=<ata>
#        export KS_KEYSHIELD_PROGRAM_ID=<program id>
#        export KS_VAULT_PDA=<derived>
#        export KS_SOLANA_RPC_URL=https://api.devnet.solana.com
#        export KS_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
#
# Usage:
#   bash scripts/devnet-setup.sh                         # bootstrap, then print env block
#   eval "$(bash scripts/devnet-setup.sh --quiet)"       # capture env directly into shell
#   bash scripts/devnet-setup.sh --refresh-keypair       # rotate the settler keypair
#   KS_DEVNET_KEYPAIR_PATH=/path/key.json bash scripts/devnet-setup.sh
#
# Requirements:
#   - solana-cli       (>= 1.18) on PATH
#   - cargo + cargo-build-sbf  (Solana SBF toolchain) on PATH
#   - spl-token-cli    (optional — falls back to spl-token if available)
#   - jq               (for parsing JSON outputs)
#
# Notes:
#   - The cache directory is `.keyshield-devnet/` at the repo root; commit-
#     ignored. Delete it to start fresh.
#   - KS_VAULT_PDA is the universal-vault PDA seeded with the settler
#     pubkey as owner. This matches the seed used by `OpenPaymentStream`
#     when called by the MPP settler signer.
#   - Devnet airdrop is rate-limited; you may need to retry or use a
#     web faucet (faucet.solana.com / faucet.quicknode.com/solana/devnet).

set -euo pipefail

# ─── paths + helpers ─────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

CACHE_DIR="${KS_DEVNET_CACHE_DIR:-$REPO_ROOT/.keyshield-devnet}"
mkdir -p "$CACHE_DIR"

DEFAULT_SETTLER_KEYPAIR="$CACHE_DIR/mpp-settler-devnet.json"
SETTLER_KEYPAIR_PATH="${KS_DEVNET_KEYPAIR_PATH:-$DEFAULT_SETTLER_KEYPAIR}"

PROGRAM_DIR="$REPO_ROOT/src/programs/keyshield"
PROGRAM_KEYPAIR="$REPO_ROOT/target/deploy/keyshield-keypair.json"
PROGRAM_SO="$REPO_ROOT/target/deploy/keyshield.so"
PROGRAM_ID_CACHE="$CACHE_DIR/program-id.txt"
PLATFORM_ATA_CACHE="$CACHE_DIR/platform-usdc-ata.txt"

DEVNET_RPC="${KS_SOLANA_RPC_URL:-https://api.devnet.solana.com}"
DEVNET_USDC_MINT="${KS_USDC_MINT:-4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU}"

QUIET=0
REFRESH_KEYPAIR=0
SKIP_DEPLOY=0
FORCE_UPGRADE=0
for arg in "$@"; do
  case "$arg" in
    --quiet)            QUIET=1 ;;
    --refresh-keypair)  REFRESH_KEYPAIR=1 ;;
    --skip-deploy)      SKIP_DEPLOY=1 ;;
    --force-upgrade)    FORCE_UPGRADE=1 ;;
    -h|--help)
      sed -n '1,/^set -euo/p' "$0" | sed 's/^# \?//' | head -n 50
      exit 0
      ;;
    *)
      printf 'unknown arg: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

c() { (( QUIET )) && return 0; printf '\033[%sm%s\033[0m' "$1" "$2"; }
log() { (( QUIET )) && return 0; printf "%s %s\n" "$(c '36' '[devnet-setup]')" "$*" >&2; }
warn() { printf "%s %s\n" "$(c '33' '[devnet-setup]')" "$*" >&2; }
die() { printf "%s %s\n" "$(c '31' '[devnet-setup]')" "$*" >&2; exit 1; }

require() { command -v "$1" >/dev/null 2>&1 || die "missing required tool: $1"; }

# ─── prereq checks ───────────────────────────────────────────────────────────

require solana
require solana-keygen
require cargo
require jq
SPL_TOKEN_CLI=""
if command -v spl-token >/dev/null 2>&1; then SPL_TOKEN_CLI="spl-token"; fi

log "RPC = $DEVNET_RPC"
log "USDC mint = $DEVNET_USDC_MINT"
log "cache    = $CACHE_DIR"

# ─── 1. settler keypair ──────────────────────────────────────────────────────

if (( REFRESH_KEYPAIR )) && [[ -f "$SETTLER_KEYPAIR_PATH" ]]; then
  log "rotating settler keypair (--refresh-keypair) → backup .bak"
  mv "$SETTLER_KEYPAIR_PATH" "$SETTLER_KEYPAIR_PATH.bak.$(date +%s)"
fi

if [[ ! -f "$SETTLER_KEYPAIR_PATH" ]]; then
  log "generating MPP settler keypair → $SETTLER_KEYPAIR_PATH"
  solana-keygen new --no-bip39-passphrase --silent --outfile "$SETTLER_KEYPAIR_PATH" >/dev/null
else
  log "reusing settler keypair at $SETTLER_KEYPAIR_PATH"
fi

SETTLER_PUBKEY="$(solana address -k "$SETTLER_KEYPAIR_PATH")"
log "settler pubkey = $SETTLER_PUBKEY"

# ─── 2. fund settler via airdrop (if low balance) ────────────────────────────

balance_lamports() {
  # `solana balance` outputs e.g. "1.234567890 SOL"; convert to lamports.
  local sol
  sol="$(solana balance "$1" --url "$DEVNET_RPC" 2>/dev/null | awk '{print $1}')"
  [[ -z "$sol" || "$sol" == "0" ]] && { echo 0; return; }
  # multiply by 1e9 with awk (no bc dependency)
  awk -v s="$sol" 'BEGIN{printf "%d", s * 1000000000}'
}

LAMPS="$(balance_lamports "$SETTLER_PUBKEY")"
if (( LAMPS < 1000000000 )); then  # < 1 SOL
  log "airdropping 2 SOL to $SETTLER_PUBKEY (current balance ${LAMPS} lamports)"
  if ! solana airdrop 2 "$SETTLER_PUBKEY" --url "$DEVNET_RPC" >&2; then
    warn "airdrop failed — devnet rate-limit?"
    warn "  retry manually or use https://faucet.solana.com (paste pubkey above)"
    warn "  re-run this script after the wallet has ≥ 1 SOL"
  fi
else
  log "settler already funded ($((LAMPS / 1000000000)) SOL+); skipping airdrop"
fi

# ─── 3. build + deploy program ───────────────────────────────────────────────

PROGRAM_ID=""
if (( SKIP_DEPLOY )); then
  if [[ -s "$PROGRAM_ID_CACHE" ]]; then
    PROGRAM_ID="$(cat "$PROGRAM_ID_CACHE")"
    log "--skip-deploy: reusing cached PROGRAM_ID=$PROGRAM_ID"
  else
    die "--skip-deploy passed but $PROGRAM_ID_CACHE is empty; run a full deploy first"
  fi
elif (( FORCE_UPGRADE )); then
  log "--force-upgrade: rebuild and skip cached program-id"
elif [[ -s "$PROGRAM_ID_CACHE" ]] && [[ -f "$PROGRAM_KEYPAIR" ]]; then
  CACHED_ID="$(cat "$PROGRAM_ID_CACHE")"
  # Confirm the on-chain program account exists at this id; if not, redeploy.
  if solana program show "$CACHED_ID" --url "$DEVNET_RPC" >/dev/null 2>&1; then
    PROGRAM_ID="$CACHED_ID"
    log "program already deployed at $PROGRAM_ID (cached); skipping rebuild"
  else
    log "cached program id $CACHED_ID not found on-chain; redeploying"
  fi
fi

if [[ -z "$PROGRAM_ID" ]]; then
  if [[ ! -f "$PROGRAM_SO" ]]; then
    log "building keyshield program (cargo build-sbf)..."
    (cd "$REPO_ROOT" && cargo build-sbf --manifest-path "$PROGRAM_DIR/Cargo.toml") >&2 \
      || die "cargo build-sbf failed — is the Solana SBF toolchain installed? (sh -c \"\$(curl -sSfL https://release.anza.xyz/stable/install)\")"
  fi

  if [[ ! -f "$PROGRAM_KEYPAIR" ]]; then
    log "generating program keypair → $PROGRAM_KEYPAIR"
    mkdir -p "$(dirname "$PROGRAM_KEYPAIR")"
    solana-keygen new --no-bip39-passphrase --silent --outfile "$PROGRAM_KEYPAIR" >/dev/null
  fi

  # Deploy uses the SETTLER keypair as the upgrade authority + payer so we
  # don't depend on the operator's ~/.config/solana/id.json balance.
  log "deploying $PROGRAM_SO to devnet (payer=$SETTLER_PUBKEY)"
  if ! solana program deploy "$PROGRAM_SO" \
        --program-id "$PROGRAM_KEYPAIR" \
        --keypair "$SETTLER_KEYPAIR_PATH" \
        --url "$DEVNET_RPC" >&2; then
    die "solana program deploy failed — check settler balance + RPC reachability"
  fi

  PROGRAM_ID="$(solana address -k "$PROGRAM_KEYPAIR")"
  printf '%s\n' "$PROGRAM_ID" > "$PROGRAM_ID_CACHE"
  log "deployed → PROGRAM_ID=$PROGRAM_ID"
fi

# ─── 4. derive vault PDA ─────────────────────────────────────────────────────
#
# The universal-vault PDA seeds are ["universal_vault", owner_pubkey].
# Derivation requires hashing — `solana find-program-derived-address` does it
# server-side with `solana program derive` (cli >= 1.18).

derive_pda() {
  # args: program_id seed1 seed2... → prints base58 address
  local pid=$1; shift
  local seeds=()
  for s in "$@"; do
    if [[ "$s" =~ ^[1-9A-HJ-NP-Za-km-z]{32,44}$ ]]; then
      seeds+=("$s" "PUBKEY")
    else
      seeds+=("$s" "STRING")
    fi
  done
  if solana find-program-derived-address "$pid" "${seeds[@]}" 2>/dev/null \
      | awk '{print $1}' | head -n 1 | grep -q '^.'; then
    solana find-program-derived-address "$pid" "${seeds[@]}" \
      | awk '{print $1}' | head -n 1
  else
    return 1
  fi
}

VAULT_PDA=""
if VAULT_PDA="$(derive_pda "$PROGRAM_ID" 'universal_vault' "$SETTLER_PUBKEY" 2>/dev/null)" \
    && [[ -n "$VAULT_PDA" ]]; then
  log "vault PDA = $VAULT_PDA"
else
  warn "could not derive vault PDA via solana CLI (cli too old?); leaving KS_VAULT_PDA empty"
  warn "  derive at runtime with PublicKey.findProgramAddressSync([Buffer.from('universal_vault'), owner], programId)"
fi

# ─── 5. platform USDC ATA ────────────────────────────────────────────────────
#
# Spec 10 has the MPP settler debit the agent's stream-ATA into a
# "platform receiver" ATA that the operator controls. For devnet
# we use the settler wallet itself as the platform receiver — this
# keeps the script self-contained.

PLATFORM_ATA=""
if [[ -s "$PLATFORM_ATA_CACHE" ]]; then
  PLATFORM_ATA="$(cat "$PLATFORM_ATA_CACHE")"
  log "platform USDC ATA cached → $PLATFORM_ATA"
fi

if [[ -z "$PLATFORM_ATA" ]] && [[ -n "$SPL_TOKEN_CLI" ]]; then
  log "creating platform USDC ATA via spl-token (owner=$SETTLER_PUBKEY)"
  if ! "$SPL_TOKEN_CLI" create-account \
        "$DEVNET_USDC_MINT" \
        --owner "$SETTLER_PUBKEY" \
        --fee-payer "$SETTLER_KEYPAIR_PATH" \
        --url "$DEVNET_RPC" >&2 2>/dev/null; then
    log "ATA may already exist — attempting to read its address"
  fi
  PLATFORM_ATA="$("$SPL_TOKEN_CLI" address \
        --token "$DEVNET_USDC_MINT" \
        --owner "$SETTLER_PUBKEY" \
        --verbose --url "$DEVNET_RPC" 2>/dev/null \
        | awk '/Associated token address/ {print $4; exit}')"
  if [[ -n "$PLATFORM_ATA" ]]; then
    printf '%s\n' "$PLATFORM_ATA" > "$PLATFORM_ATA_CACHE"
    log "platform USDC ATA = $PLATFORM_ATA"
  else
    warn "spl-token did not return ATA address — install spl-token-cli or derive manually"
  fi
fi

if [[ -z "$PLATFORM_ATA" ]]; then
  warn "spl-token-cli not on PATH; KS_PLATFORM_USDC_ATA will be empty in env block"
  warn "  install: cargo install spl-token-cli"
  warn "  then re-run: bash scripts/devnet-setup.sh"
fi

# ─── 6. emit env block ───────────────────────────────────────────────────────

# We pass the keypair PATH (not raw base58) for KS_MPP_SETTLER_KEY because
# downstream Python code (anchorpy / solana-py) typically loads keys via
# `Keypair.from_json(open(path).read())`. If you really need the base58
# representation, run:
#   python -c 'import json,base58; k=json.load(open("'"$SETTLER_KEYPAIR_PATH"'")); print(base58.b58encode(bytes(k[:32])).decode())'

cat <<EOF
# ── KeyShield devnet env (eval this in your shell) ──────────────────────────
export KS_MPP_SETTLER_KEY="$SETTLER_KEYPAIR_PATH"
export KS_MPP_SETTLER_PUBKEY="$SETTLER_PUBKEY"
export KS_PLATFORM_USDC_ATA="${PLATFORM_ATA:-}"
export KS_KEYSHIELD_PROGRAM_ID="$PROGRAM_ID"
export KS_VAULT_PDA="${VAULT_PDA:-}"
export KS_SOLANA_RPC_URL="$DEVNET_RPC"
export KS_USDC_MINT="$DEVNET_USDC_MINT"
EOF

if (( ! QUIET )); then
  printf '\n' >&2
  log "$(c '32' '✓') devnet bootstrap complete"
  log "next: eval the block above, then run: bash scripts/devnet-e2e.sh"
fi
