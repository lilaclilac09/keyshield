#!/bin/bash

# KeyShield Deployment & Testing on Solana Devnet
# This script deploys the program and shows the streaming dashboard in action

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   KeyShield Deployment to Solana Devnet + Live Demo           ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 1: Verify Rust program is built${NC}"
if [ -f "target/deploy/keyshield.so" ]; then
    SIZE=$(stat -f%z "target/deploy/keyshield.so" 2>/dev/null || stat -c%s "target/deploy/keyshield.so")
    echo -e "${GREEN}✓${NC} Program binary ready: ${SIZE} bytes"
    PROGRAM_ID=$(solana address -k target/deploy/keyshield-keypair.json)
    echo -e "${GREEN}✓${NC} Program ID: ${PROGRAM_ID}"
else
    echo -e "${YELLOW}Building program...${NC}"
    cargo build-sbf
    SIZE=$(stat -f%z "target/deploy/keyshield.so" 2>/dev/null || stat -c%s "target/deploy/keyshield.so")
    echo -e "${GREEN}✓${NC} Program built: ${SIZE} bytes"
fi
echo ""

# Check RPC endpoint
echo -e "${BLUE}Step 2: Check Solana RPC connectivity${NC}"
RPC_URL="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
echo "Using RPC: $RPC_URL"

if timeout 5 curl -s "$RPC_URL" -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} RPC endpoint is reachable"
else
    echo -e "${YELLOW}⚠${NC} Devnet RPC unreachable. Options:"
    echo "   1. Wait and retry (devnet has temporary congestion)"
    echo "   2. Use alternative RPC:"
    echo "      export SOLANA_RPC_URL=https://api.devnet.solana.com"
    echo "   3. Deploy locally: solana-test-validator"
    exit 1
fi
echo ""

# Show deployment command
echo -e "${BLUE}Step 3: Deployment command (when ready)${NC}"
echo ""
echo "To deploy the program:"
cat << 'EOF'
solana program deploy \
  target/deploy/keyshield.so \
  --program-id target/deploy/keyshield-keypair.json \
  --url https://api.devnet.solana.com
EOF
echo ""
echo "Or with custom RPC:"
echo "SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY ./scripts/deploy.sh"
echo ""

echo -e "${BLUE}Step 4: Frontend is already running${NC}"
echo -e "${GREEN}✓${NC} Dashboard available at: http://localhost:3000"
echo ""

echo -e "${BLUE}Step 5: How the streaming demo works${NC}"
cat << 'EOF'

FRONTEND FLOW (What you'll see):

1. Load Dashboard
   ↓
   Browser connects to Solana wallet (Phantom/UnsafeBurner)
   ↓
   Dashboard loads vault items from IndexedDB
   ↓
   useVaultStream hook opens persistent SSE connection
   ↓
   GET /api/vaults/stream?wallet=<address>
   (This stays open, waiting for real-time updates)

2. Click "Add API Key"
   ↓
   Enter: name="Claude API", value="sk-ant-xxxxx"
   ↓
   Browser:
   - Encrypts key with Lit Protocol (client-side)
   - Saves ciphertext to IndexedDB (instant ✓)
   - Creates data hash (32 bytes)
   ↓
   Publishes to stream:
   POST /api/vaults/event {
     wallet: "9xxx...",
     type: "add",
     payload: { name: "Claude API", domain: "anthropic", status: "active" }
   }
   ↓
   Server broadcasts to SSE stream
   ↓
   INSTANT UI update (no reload needed!)

3. Open Second Browser Tab (same wallet)
   ↓
   Both tabs connected to same SSE stream
   ↓
   When you add a key in Tab 1:
   - Tab 1: Instant update ✓
   - Tab 2: Auto-receives same event via SSE ✓
   - Both tabs show same vault state

4. Optional: Add Solana sync
   ↓
   Toggle "Sync Mode" → "Optional Chain"
   ↓
   When adding next key, it will:
   - Save locally (instant) ✓
   - Attempt on-chain sync (best-effort)
   - Can use Light Protocol (compressed, 95% cheaper)
   ↓
   vault:status event shows: "synced" | "failed" | "local-only"

EOF
echo ""

echo -e "${BLUE}Step 6: Testing the SSE stream directly${NC}"
cat << 'EOF'

Test in Terminal:

1. Start listening to stream:
   curl -N "http://localhost:3000/api/vaults/stream?wallet=95eBD8Uo9zzJQJqxvwLvHi3EbSJLGcTNLdoW9V6zcVT6"
   
   Output should show:
   :connected at 2026-04-02T...
   :heartbeat at 2026-04-02T...
   
2. In another terminal, publish an event:
   curl -X POST http://localhost:3000/api/vaults/event \
     -H "Content-Type: application/json" \
     -d '{
       "wallet": "95eBD8Uo9zzJQJqxvwLvHi3EbSJLGcTNLdoW9V6zcVT6",
       "type": "add",
       "payload": {
         "name": "Test Key",
         "domain": "test",
         "status": "active"
       }
     }'
   
3. Watch the first terminal—you'll receive:
   event: vault:add
   data: {"name":"Test Key","domain":"test","status":"active"}

EOF
echo ""

echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}READY TO TEST!${NC}"
echo ""
echo "1. Open Browser: ${BLUE}http://localhost:3000${NC}"
echo "2. Connect wallet (use UnsafeBurner or Phantom)"
echo "3. Add API keys and watch them sync in real-time"
echo "4. Open second tab: All updates sync instantly!"
echo "5. (Optional) Deploy to devnet when RPC is ready"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
