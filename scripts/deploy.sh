#!/bin/bash

# KeyShield Deployment Script
# Usage: ./scripts/deploy.sh [devnet|mainnet]

set -e

NETWORK=${1:-devnet}
PROGRAM_NAME="keyshield"

echo "🚀 Deploying KeyShield to $NETWORK..."

# Set Solana cluster
solana config set --url $NETWORK

# Build the program
echo "📦 Building program..."
cargo build-sbf

# Get program keypair path
KEYPAIR_PATH="./target/deploy/${PROGRAM_NAME}-keypair.json"

# Check if keypair exists, create if not
if [ ! -f "$KEYPAIR_PATH" ]; then
    echo "🔑 Generating program keypair..."
    solana-keygen new --outfile "$KEYPAIR_PATH" --no-bip39-passphrase
fi

# Deploy
echo "📤 Deploying program..."
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
