#!/bin/bash

# KeyShield Deployment Script
# Usage: ./scripts/deploy.sh [devnet|mainnet]

set -e

NETWORK=${1:-devnet}
PROGRAM_NAME="keyshield"
LOG_PATH="/Users/aileen/Downloads/privacy_hack/keyshield/.cursor/debug.log"

log_ndjson() {
    local location="$1"
    local message="$2"
    local data="$3"
    printf '{"sessionId":"debug-session","runId":"pre-fix","hypothesisId":"%s","location":"%s","message":"%s","data":%s,"timestamp":%s}\n' \
        "$4" "$location" "$message" "$data" "$(date +%s000)" >> "$LOG_PATH"
}

echo "🚀 Deploying KeyShield to $NETWORK..."

# #region agent log
log_ndjson "scripts/deploy.sh:11" "deploy.start" "{\"network\":\"$NETWORK\",\"program\":\"$PROGRAM_NAME\"}" "H1"
# #endregion agent log

# Set Solana cluster
solana config set --url $NETWORK

# #region agent log
RPC_URL="$(solana config get | awk -F': ' '/RPC URL/{print $2}')"
log_ndjson "scripts/deploy.sh:18" "deploy.configured" "{\"rpcUrl\":\"$RPC_URL\"}" "H2"
# #endregion agent log

# Build the program
echo "📦 Building program..."
cargo build-sbf

# #region agent log
log_ndjson "scripts/deploy.sh:24" "deploy.build.complete" "{\"status\":\"ok\"}" "H3"
# #endregion agent log

# Get program keypair path
KEYPAIR_PATH="./target/deploy/${PROGRAM_NAME}-keypair.json"

# Check if keypair exists, create if not
if [ ! -f "$KEYPAIR_PATH" ]; then
    echo "🔑 Generating program keypair..."
    solana-keygen new --outfile "$KEYPAIR_PATH" --no-bip39-passphrase
fi

# #region agent log
KEYPAIR_EXISTS="false"
if [ -f "$KEYPAIR_PATH" ]; then KEYPAIR_EXISTS="true"; fi
log_ndjson "scripts/deploy.sh:35" "deploy.keypair" "{\"path\":\"$KEYPAIR_PATH\",\"exists\":$KEYPAIR_EXISTS}" "H4"
# #endregion agent log

# Deploy
echo "📤 Deploying program..."
 
# #region agent log
log_ndjson "scripts/deploy.sh:40" "deploy.before.program" "{\"rpcUrl\":\"$RPC_URL\"}" "H5"
# #endregion agent log

solana program deploy \
    target/deploy/${PROGRAM_NAME}.so \
    --program-id "$KEYPAIR_PATH" \
    --url $NETWORK

# Get program ID
PROGRAM_ID=$(solana address -k "$KEYPAIR_PATH")
echo "✅ Program deployed!"
echo "📍 Program ID: $PROGRAM_ID"
echo ""
echo "📝 Update your .env.local with:"
echo "NEXT_PUBLIC_PROGRAM_ID=$PROGRAM_ID"
