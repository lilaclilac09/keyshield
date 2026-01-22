# How to Test KeyShield - Quick Guide

## 🚀 Quick Test Steps

### 1. Automated Setup (Recommended)

```bash
cd keyshield
./test-setup.sh
```

This script will:
- ✅ Check prerequisites
- ✅ Configure Solana for devnet
- ✅ Build the program
- ✅ Deploy the program
- ✅ Setup frontend environment
- ✅ Create/update `.env.local`

### 2. Manual Setup (If script fails)

#### Step 1: Build Program
```bash
cd keyshield
cargo build-sbf
```

#### Step 2: Deploy Program
```bash
solana program deploy target/deploy/keyshield.so
# Copy the Program ID from output
```

#### Step 3: Configure Frontend
```bash
cd frontend
npm install

# Create .env.local
cat > .env.local << EOF
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=YOUR_PROGRAM_ID_HERE
NEXT_PUBLIC_LIT_NETWORK=datil
NEXT_PUBLIC_ARCIUM_CLUSTER=testnet
EOF

# Edit .env.local and replace YOUR_PROGRAM_ID_HERE
```

#### Step 4: Start Frontend
```bash
npm run dev
```

## 🧪 Testing the App

### Test 1: Connect Wallet
1. Open `http://localhost:3000`
2. Click "Connect Wallet"
3. Select your wallet (Phantom/Solflare)
4. Approve connection

**✅ Success**: Wallet address shows in header

### Test 2: Store API Key
1. Click "Store Key" button
2. Enter test API key: `sk_test_1234567890`
3. Click "Store Key"
4. Approve transaction in wallet

**✅ Success**: 
- Transaction confirms
- Vault appears in dashboard
- Shows encryption status

### Test 3: View Vault
After storing, verify:
- ✅ Vault card displays
- ✅ Shows "Secure Vault" status
- ✅ Shows encryption: "Lit Protocol ✓"
- ✅ Shows ZK Commit (hex value)
- ✅ Shows MPC Hash (hex value)
- ✅ Shows creation timestamp

### Test 4: Share Key
1. Click "Share Key" button
2. Enter recipient address (another wallet)
3. Click "Share Key"
4. Approve transaction

**✅ Success**: Transaction confirms, share created

## 🔍 Verify On-Chain

### Check Transaction
```bash
# Get your wallet address
solana address

# View in explorer (replace YOUR_ADDRESS)
# https://explorer.solana.com/address/YOUR_ADDRESS?cluster=devnet
```

### Check Program
```bash
# View program (replace PROGRAM_ID)
solana program show PROGRAM_ID
```

## 🐛 Troubleshooting

### "Program ID not found"
- Check `.env.local` has correct `NEXT_PUBLIC_PROGRAM_ID`
- Restart dev server: `npm run dev`

### "Account not found"
- Verify program is deployed
- Check program ID matches
- Ensure wallet has SOL: `solana balance`

### "Transaction failed"
- Check wallet balance: `solana balance`
- Get more SOL: `solana airdrop 2`
- Check transaction in Solana Explorer

### "Wallet connection failed"
- Clear browser cache
- Try different wallet
- Check wallet is on Devnet

## 📋 Test Checklist

Use [TEST_CHECKLIST.md](./TEST_CHECKLIST.md) for comprehensive testing.

## 📚 Full Documentation

- **Complete Testing**: [TESTING_GUIDE.md](./TESTING_GUIDE.md)
- **Setup Details**: [SETUP.md](./SETUP.md)
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)

## ✅ Quick Verification

After testing, verify:
- [ ] Wallet connects
- [ ] Can store key
- [ ] Vault displays
- [ ] Can share key
- [ ] Transactions confirm
- [ ] No console errors

---

**Need Help?** Check [TESTING_GUIDE.md](./TESTING_GUIDE.md) for detailed instructions.
