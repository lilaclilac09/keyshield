#!/bin/bash
# Simple deployment script with better error handling

set -e

echo "🚀 KeyShield Simple Deploy to Devnet"
echo "====================================="
echo ""

# Build
echo "📦 Building program..."
cargo build-sbf
echo ""

# Get program ID
PROGRAM_ID=$(solana address -k target/deploy/keyshield-keypair.json)
echo "📍 Program ID: $PROGRAM_ID"
echo ""

# Check wallet
WALLET=$(solana address)
echo "👤 Your Wallet: $WALLET"
echo ""

echo "💰 Checking balance..."
BALANCE=$(solana balance --url devnet 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "0")
echo "Balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 1" | bc -l 2>/dev/null || echo "1") )); then
    echo ""
    echo "⚠️  Low balance. Requesting airdrop..."
    solana airdrop 2 --url devnet 2>&1 || echo "Airdrop failed (may be rate limited)"
    echo ""
fi

echo "📤 Deploying to devnet..."
echo ""
echo "This may take a while if the network is congested..."
echo "If it times out, try:"
echo "  1. Wait a few minutes and retry"
echo "  2. Use: solana config set --url https://api.devnet.solana.com"
echo "  3. Or use an alternative RPC (see DEPLOY_GUIDE.md)"
echo ""

# Deploy with better error handling
if solana program deploy \
    target/deploy/keyshield.so \
    --program-id target/deploy/keyshield-keypair.json \
    --url devnet \
    --max-sign-attempts 100 2>&1; then
    
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "───────────────────────────────────────────────────────"
    echo "🔍 VIEW YOUR PROGRAM ON EXPLORERS"
    echo "───────────────────────────────────────────────────────"
    echo ""
    echo "Solana Explorer:"
    echo "https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
    echo ""
    echo "Solscan (better UI, shows all transactions):"
    echo "https://solscan.io/account/$PROGRAM_ID?cluster=devnet"
    echo ""
    echo "───────────────────────────────────────────────────────"
    echo ""
    echo "Next step: Run a test transaction"
    echo "  node scripts/test-store-key.mjs"
    echo ""
else
    echo ""
    echo "❌ Deployment failed!"
    echo ""
    echo "Possible causes:"
    echo "  1. Network congestion - Try again in a few minutes"
    echo "  2. Insufficient funds - Run: solana airdrop 2 --url devnet"
    echo "  3. RPC timeout - Try alternative RPC (see DEPLOY_GUIDE.md)"
    echo ""
    echo "Troubleshooting:"
    echo "  - Check Solana status: https://status.solana.com"
    echo "  - Try: solana config set --url https://api.devnet.solana.com"
    echo "  - See DEPLOY_GUIDE.md for alternative RPC endpoints"
    echo ""
    exit 1
fi
