#!/bin/bash

echo "🚀 Deploying to Localnet..."
echo ""

# Set config to localhost
solana config set --url localhost

# Check balance
echo ""
echo "💰 Check balance..."
solana balance

# Deploy program
echo ""
echo "📦 Deploy program..."
solana program deploy target/sbpf-solana-solana/release/keyshield.so --url localhost

echo ""
echo "✅ Deploy complete!"
echo ""
echo "📋 Now edit scripts/demo-on-chain-storage.mjs"
echo "   and replace PROGRAM_ID and NETWORK config"
echo ""
echo "Then run:"
echo "  node scripts/demo-on-chain-storage.mjs --network localhost"

