# ⚡ KeyShield Quick Start

## 🚀 Quick Fix for `make deploy` (Future Upgrades)

Use Helius for devnet so `make deploy CLUSTER=devnet` is faster and more reliable:

```bash
# Add Helius key (persistent) — replace with your key
echo 'export HELIUS_API_KEY=YOUR_HELIUS_API_KEY' >> ~/.zshrc
source ~/.zshrc
```

Then `make deploy CLUSTER=devnet` will auto-use Helius.

---

## 🖥️ Launch the Frontend

In **frontend** (Vite app), set env and run:

1. **Create `frontend/.env.local`** with (use your Helius key in the RPC URL):
   ```
   VITE_PROGRAM_ID=CVbhbCGsAk4WikxpucSCJ7QUhDka96PcyQmSLj6FrQA8
   VITE_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
   ```

2. **Run the app:**
   ```bash
   cd frontend
   npm install   # if needed
   npm run dev
   ```

3. Open **http://localhost:3000** — connect wallet, create vault, store keys, test everything.

---

## 🎯 Deploy & Test in 2 Commands

### Option 1: Automated (Recommended)

```bash
# Build, deploy, and create test transaction
./scripts/deploy-and-test.sh
```

### Option 2: Simple Deploy Only

```bash
# Just deploy the program
./scripts/deploy-simple.sh

# Then test separately
node scripts/test-store-key.mjs
```

---

## 📊 Your Program Information

**Program ID:** `59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW`

### 🔍 View on Solscan (All Transactions)

**Primary Link:**
```
https://solscan.io/account/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet
```

**What you'll see:**
- ✅ All StoreKey/AccessKey/ShareKey transactions
- ✅ Total transaction count
- ✅ Recent activity
- ✅ Program deployment info

### 🔍 View on Solana Explorer

```
https://explorer.solana.com/address/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet
```

---

## 🧪 After Deployment: Create Your First Transaction

```bash
# Run test script
node scripts/test-store-key.mjs
```

This will:
1. Create a StoreKey transaction
2. Store a test API key hash on-chain
3. Show you direct links to:
   - Your transaction on Solscan
   - Your transaction on Solana Explorer
   - Your vault account
   - Your program's transaction history

---

## 🌐 Network Issues?

If devnet RPC is slow, see [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) for:
- Alternative RPC endpoints (Helius, QuickNode, Alchemy)
- Local testing with `solana-test-validator`
- Troubleshooting tips

---

## 📱 Quick Links

| Resource | Link |
|----------|------|
| **Full Deploy Guide** | [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) |
| **Program on Solscan** | https://solscan.io/account/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet |
| **Architecture Docs** | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| **Main README** | [README.md](./README.md) |

---

## 🎉 What's Next?

1. **Test the transaction** → See it on Solscan
2. **Run unit tests** → `cargo test -p keyshield`
3. **Start frontend** → `cd frontend && npm run dev`
4. **Build extension** → `cd disabled_extension && npm run build`

**Remember:** Always include `?cluster=devnet` when viewing on explorers!
