# KeyShield Deployment & Testing Guide

## 🚀 Quick Deploy & Test on Devnet

### Your Program Information

**Program ID:** `59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW`

**View on Explorers:**
- Solana Explorer: https://explorer.solana.com/address/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet
- Solscan: https://solscan.io/account/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet

---

## Method 1: One-Command Deploy & Test (Recommended)

```bash
# From project root
./scripts/deploy-and-test.sh
```

This will:
1. ✅ Build the program (`cargo build-sbf`)
2. ✅ Request airdrop if needed
3. ✅ Deploy to devnet
4. ✅ Create a test StoreKey transaction
5. ✅ Display transaction links for Solscan & Solana Explorer

---

## Method 2: Step-by-Step Manual Deploy

### Step 1: Build the Program

```bash
cargo build-sbf
```

### Step 2: Check Your Wallet

```bash
# Get your wallet address
solana address

# Check balance on devnet
solana balance --url devnet

# Request airdrop if needed (max 2 SOL)
solana airdrop 2 --url devnet
```

### Step 3: Deploy to Devnet

```bash
solana program deploy \
  target/deploy/keyshield.so \
  --program-id target/deploy/keyshield-keypair.json \
  --url devnet
```

### Step 4: Run Test Transaction

```bash
node scripts/test-store-key.mjs
```

This creates a StoreKey transaction and shows you all the explorer links!

---

## Method 3: Alternative RPC Endpoints

If the public devnet RPC is slow or unavailable, try these alternatives:

### Helius (Free tier available)

```bash
# Set RPC URL
export RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY"

# Deploy with custom RPC
solana program deploy \
  target/deploy/keyshield.so \
  --program-id target/deploy/keyshield-keypair.json \
  --url $RPC_URL

# Test with custom RPC
RPC_URL=$RPC_URL node scripts/test-store-key.mjs
```

### QuickNode

```bash
export RPC_URL="YOUR_QUICKNODE_DEVNET_URL"
solana program deploy ... --url $RPC_URL
```

### Alchemy

```bash
export RPC_URL="https://solana-devnet.g.alchemy.com/v2/YOUR_KEY"
solana program deploy ... --url $RPC_URL
```

---

## What You'll See After Successful Deployment

```
✅ SUCCESS! Transaction confirmed on devnet!
═══════════════════════════════════════════════════════════

🔑 Transaction Signature:
   5wHu4z... (long string)

───────────────────────────────────────────────────────────
🔍 VIEW YOUR TRANSACTION ON EXPLORERS
───────────────────────────────────────────────────────────

📍 Transaction on Solana Explorer:
   https://explorer.solana.com/tx/YOUR_SIGNATURE?cluster=devnet

📍 Transaction on Solscan:
   https://solscan.io/tx/YOUR_SIGNATURE?cluster=devnet

───────────────────────────────────────────────────────────
🔍 VIEW YOUR PROGRAM
───────────────────────────────────────────────────────────

📍 Program on Solscan (see all transactions):
   https://solscan.io/account/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet
```

---

## Viewing Transactions on Solscan

### 1. View Your Program's All Transactions

Go to: https://solscan.io/account/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet

You'll see:
- **Transactions tab**: All StoreKey, AccessKey, ShareKey calls
- **Holders**: Accounts interacting with your program
- **Program Info**: Deployment details

### 2. View a Specific Transaction

```
https://solscan.io/tx/{YOUR_TRANSACTION_SIGNATURE}?cluster=devnet
```

Shows:
- ✅ Status (Success/Failed)
- ✅ Accounts involved
- ✅ Instruction data
- ✅ Program logs
- ✅ Compute units used
- ✅ Fees paid

### 3. View Your Vault Account

After creating a vault, view it at:
```
https://solscan.io/account/{YOUR_VAULT_PDA}?cluster=devnet
```

Shows:
- ✅ Account data (288 bytes)
- ✅ Owner (your wallet)
- ✅ All transactions to this vault

---

## Troubleshooting

### Error: "Account not found"

The program hasn't been deployed yet. Deploy it first:
```bash
./scripts/deploy-and-test.sh
```

### Error: "Insufficient funds"

Request an airdrop:
```bash
solana airdrop 2 --url devnet
```

### Error: "Network timeout"

The public Solana devnet RPC may be congested. Try:

1. **Wait and retry** - Public RPCs can be slow
2. **Use alternative RPC** - See Method 3 above
3. **Local validator** - See Method 4 below

### Error: "Vault already exists"

Your wallet already has a vault! View it:
```bash
# Get your vault PDA
node scripts/test-store-key.mjs
# (It will show the existing vault links)
```

---

## Method 4: Local Testing with Test Validator

If devnet is unavailable, test locally:

### Start Local Validator

```bash
solana-test-validator
```

### In a new terminal, deploy locally

```bash
# Build
cargo build-sbf

# Deploy to localhost
solana program deploy \
  target/deploy/keyshield.so \
  --program-id target/deploy/keyshield-keypair.json \
  --url localhost

# Test locally
RPC_URL=http://localhost:8899 node scripts/test-store-key.mjs
```

---

## Verifying Your Deployment

### Check if program exists

```bash
solana program show 59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW --url devnet
```

### Get recent transactions

```bash
solana transaction-history 59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW --url devnet
```

### View vault account

```bash
./scripts/verify-vault.sh YOUR_WALLET_ADDRESS
```

---

## Next Steps After Deployment

1. **Update frontend config** with your program ID:
   ```bash
   cd frontend
   echo "VITE_PROGRAM_ID=59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW" >> .env.local
   ```

2. **Start the frontend**:
   ```bash
   npm install
   npm run dev
   ```

3. **Test with browser extension**:
   - Build extension: `cd disabled_extension && npm run build`
   - Load in browser
   - Detect and store API keys

4. **View all transactions on Solscan**:
   - Program page: https://solscan.io/account/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet
   - Click "Transactions" tab to see all activity

---

## Quick Reference

| What to View | Explorer Link |
|-------------|---------------|
| **Program (all txs)** | https://solscan.io/account/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet |
| **Specific Transaction** | https://solscan.io/tx/{SIGNATURE}?cluster=devnet |
| **Your Wallet** | https://solscan.io/account/{YOUR_ADDRESS}?cluster=devnet |
| **Your Vault** | https://solscan.io/account/{VAULT_PDA}?cluster=devnet |

---

## Support

If you continue to have issues:

1. Check Solana status: https://status.solana.com
2. Try alternative RPC: Helius, QuickNode, Alchemy
3. Use local validator for testing
4. Check Discord/forums for devnet status updates

**Remember:** Always include `?cluster=devnet` in explorer URLs!
