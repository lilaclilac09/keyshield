#!/usr/bin/env bash
# Set all MPP / on-chain env vars on Railway.
# Usage:
#   railway login          # one-time, opens browser
#   railway link           # pick project=keyshield, service=Python backend
#   bash scripts/set_railway_env.sh

set -e

echo "Setting Railway environment variables for KeyShield backend..."
echo ""

# ── MPP / Solana on-chain ─────────────────────────────────────────────────────
railway variables --set "KS_MPP_SETTLER_KEY=5qJffg9bkEudQ2G6tWnzgpzqaYRwHkCqRyuFDmmtkW6trCSuVib92ni82gg9n81yJSJkNn1MnunAyLFZ1H1sQxEr"
echo "✓ KS_MPP_SETTLER_KEY"

railway variables --set "KS_PLATFORM_USDC_ATA=5XkmKe6giGYgEgmiNdnwVJrsQMKEc3HJbvy2ACspAMqG"
echo "✓ KS_PLATFORM_USDC_ATA"

railway variables --set "KS_KEYSHIELD_PROGRAM_ID=41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j"
echo "✓ KS_KEYSHIELD_PROGRAM_ID"

# Vault PDA for settler GHpd6gf… (NOT 8QBVXySk… which belongs to a different owner)
railway variables --set "KS_VAULT_PDA=Axzwa7otsDGowxQSCcA7YvBpXgDZ2nTerzkRTc5m923M"
echo "✓ KS_VAULT_PDA"

railway variables --set "KS_SOLANA_RPC_URL=https://api.devnet.solana.com"
echo "✓ KS_SOLANA_RPC_URL"

railway variables --set "KS_RPC_URL=https://api.devnet.solana.com"
echo "✓ KS_RPC_URL"

railway variables --set "KS_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
echo "✓ KS_USDC_MINT"

railway variables --set "KS_MPP_SETTLER_PUBKEY=GHpd6gfZZhQHojxp7y7rQtivbksT7zJhC2Rv4N468Jvi"
echo "✓ KS_MPP_SETTLER_PUBKEY"

# ── Session security ──────────────────────────────────────────────────────────
# Generate a fresh secret if not already set
EXISTING=$(railway variables 2>/dev/null | grep SERVER_SECRET | head -1)
if [ -z "$EXISTING" ]; then
  SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  railway variables --set "SERVER_SECRET=${SECRET}"
  echo "✓ SERVER_SECRET (generated: ${SECRET:0:8}…)"
else
  echo "· SERVER_SECRET already set — skipping"
fi

# ── X402 (disabled by default — enable when ready) ───────────────────────────
railway variables --set "KS_X402_ENABLED=0"
echo "✓ KS_X402_ENABLED=0  (set to 1 when x402 receiver is ready)"

# ── Convenience ───────────────────────────────────────────────────────────────
railway variables --set "KS_PROGRAM_ID=41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j"
echo "✓ KS_PROGRAM_ID"

echo ""
echo "All variables set. Triggering redeploy..."
railway up --detach 2>/dev/null || echo "(run 'railway up' manually if needed)"
echo ""
echo "Done! Check Railway dashboard for deploy status."
