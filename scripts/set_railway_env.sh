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

# ── X402 topup verification (Base mainnet) ───────────────────────────────────
# /billing/topup verifies payment_proof on-chain via proxy/x402_verify.py.
# Without these it runs in stub-fallback (idempotency only, NO on-chain
# check). For real-money production, set BOTH and flip VERIFY_REQUIRED=1:
#
#   railway variables --set "KS_X402_BASE_RPC_URL=https://mainnet.base.org"
#   railway variables --set "KS_X402_RECEIVER_ADDRESS=0x<your-40-hex-receiver>"
#   railway variables --set "KS_X402_VERIFY_REQUIRED=1"
#
# Optional (defaults shown):
#   railway variables --set "KS_X402_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"  # USDC on Base
#   railway variables --set "KS_X402_MIN_CONFIRMATIONS=5"
echo "· x402 topup verify vars not set (stub-fallback) — see comments in this script"

# ── Agent-signed x402 micropayments (pay_x402 ix #25) ────────────────────────
# POST /agents/{id}/wallet/pay_x402 per-call cap in micro-USDC (default 100000
# = 0.10 USDC). The on-chain stream budget cap is the hard limit.
railway variables --set "KS_X402_AGENT_MAX_PER_CALL=100000"
echo "✓ KS_X402_AGENT_MAX_PER_CALL=100000"

# ── Convenience ───────────────────────────────────────────────────────────────
railway variables --set "KS_PROGRAM_ID=41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j"
echo "✓ KS_PROGRAM_ID"

echo ""
echo "All variables set. Triggering redeploy..."
railway up --detach 2>/dev/null || echo "(run 'railway up' manually if needed)"
echo ""
echo "Done! Check Railway dashboard for deploy status."
