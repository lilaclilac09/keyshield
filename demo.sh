#!/bin/bash

echo "🚀 KeyShield Demo"
echo "=================="
echo ""
echo "📍 Application URL: http://localhost:3000"
echo "📍 Program ID: 59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW"
echo "📍 Solana Explorer: https://explorer.solana.com/address/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet"
echo ""
echo "✅ Server Status:"
curl -s http://localhost:3000 > /dev/null && echo "   ✓ Frontend server is running" || echo "   ✗ Server not running"
echo ""
echo "✅ Program Status:"
solana program show 59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW 2>/dev/null | grep -q "Program Id" && echo "   ✓ Program deployed" || echo "   ✗ Program not found"
echo ""
echo "✅ Wallet Status:"
WALLET=$(solana address 2>/dev/null)
if [ -n "$WALLET" ]; then
  echo "   ✓ Wallet: $WALLET"
  BALANCE=$(solana balance 2>/dev/null | awk '{print $1}')
  echo "   ✓ Balance: $BALANCE SOL"
else
  echo "   ✗ No wallet configured"
fi
echo ""
echo "📖 Demo Steps:"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Click 'Select Wallet' and connect (WalletConnect for Safari)"
echo "   3. Click 'Store Key' and enter a test API key"
echo "   4. Approve transaction in wallet"
echo "   5. View your vault!"
echo ""
echo "Opening browser..."
open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null || echo "Please open http://localhost:3000 manually"
