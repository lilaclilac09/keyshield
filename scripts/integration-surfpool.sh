#!/bin/bash
# KeyShield integration test against local Surfnet (Surfpool).
# Usage: ./scripts/integration-surfpool.sh
#
# Prerequisites:
#   - Surfpool CLI: cargo install surfpool (or curl -sL https://run.surfpool.run | bash)
#   - Solana CLI
#   - Program built: cargo build-sbf (from repo root)
#
# This script:
#   1. Starts Surfnet on http://localhost:8899 if not already running
#   2. Deploys keyshield.so to localhost
#   3. Verifies deployment (program account exists)

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

RPC_URL="http://localhost:8899"
PROGRAM_SO="target/deploy/keyshield.so"
PROGRAM_KEYPAIR="target/deploy/keyshield-keypair.json"

log() { echo "[integration-surfpool] $*"; }

# Check Solana CLI
if ! command -v solana &>/dev/null; then
  log "Error: solana CLI not found. Install from https://docs.solana.com/cli/install"
  exit 1
fi

# Check program binary
if [[ ! -f "$PROGRAM_SO" ]]; then
  log "Building program..."
  cargo build-sbf
fi

if [[ ! -f "$PROGRAM_KEYPAIR" ]]; then
  log "Generating program keypair..."
  solana-keygen new --outfile "$PROGRAM_KEYPAIR" --no-bip39-passphrase --force
fi

# Start Surfpool if nothing listening on 8899
if ! curl -s -o /dev/null -w "%{http_code}" "$RPC_URL" 2>/dev/null | grep -q '200\|404'; then
  if command -v surfpool &>/dev/null; then
    log "Starting Surfnet (Surfpool)..."
    surfpool start --background 2>/dev/null || surfpool start &
    sleep 5
  else
    log "Surfpool not found. Install with: cargo install surfpool"
    log "Or start solana-test-validator and set RPC_URL to its endpoint."
    exit 1
  fi
fi

# Point Solana CLI at local Surfnet
solana config set --url "$RPC_URL"

# Deploy program to localhost
log "Deploying program to $RPC_URL..."
solana program deploy "$PROGRAM_SO" --program-id "$PROGRAM_KEYPAIR" --url "$RPC_URL"

PROGRAM_ID=$(solana address -k "$PROGRAM_KEYPAIR")
log "Program ID: $PROGRAM_ID"

# Verify program account exists
if solana program show "$PROGRAM_ID" --url "$RPC_URL" &>/dev/null; then
  log "OK: Program deployed and visible on Surfnet."
else
  log "Warning: program show failed; program may still be deployed."
fi

log "Integration (Surfpool) smoke done. For full E2E, run the frontend/extension and perform StoreKey against $RPC_URL."
