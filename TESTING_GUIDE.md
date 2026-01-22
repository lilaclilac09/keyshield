# KeyShield Testing Guide

## 🧪 Complete Testing Guide

This guide walks you through testing the KeyShield application end-to-end.

## Prerequisites

Before testing, ensure you have:

1. ✅ Rust installed (`rustc --version`)
2. ✅ Node.js 18+ installed (`node --version`)
3. ✅ Solana CLI installed (`solana --version`)
4. ✅ Wallet extension (Phantom or Solflare)
5. ✅ Devnet SOL (for transaction fees)

## Step 1: Environment Setup

### 1.1 Configure Solana CLI

```bash
# Set to devnet
solana config set --url devnet

# Check your keypair
solana address

# Get devnet SOL (if needed)
solana airdrop 2
solana balance
```

### 1.2 Build the Program

```bash
cd keyshield

# Build the Solana program
cargo build-sbf

# Verify build succeeded
ls -lh target/deploy/keyshield.so
```

Expected output: You should see `keyshield.so` file created.

### 1.3 Deploy the Program

```bash
# Deploy to devnet
solana program deploy target/deploy/keyshield.so

# Save the Program ID from the output
# Example output: Program Id: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
```

**IMPORTANT**: Copy the Program ID - you'll need it for the frontend!

### 1.4 Setup Frontend Environment

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local file
cat > .env.local << EOF
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=YOUR_PROGRAM_ID_HERE
NEXT_PUBLIC_LIT_NETWORK=datil
NEXT_PUBLIC_ARCIUM_CLUSTER=testnet
EOF

# Replace YOUR_PROGRAM_ID_HERE with the Program ID from step 1.3
```

Edit `.env.local` and replace `YOUR_PROGRAM_ID_HERE` with your deployed program ID.

### 1.5 Start Frontend

```bash
# Start development server
npm run dev
```

Expected output: `Ready on http://localhost:3000`

## Step 2: Basic Functionality Tests

### Test 2.1: Wallet Connection

1. Open browser: `http://localhost:3000`
2. Click "Connect Wallet" button
3. Select your wallet (Phantom/Solflare)
4. Approve connection in wallet popup

**Expected Result**: 
- ✅ Wallet address displayed in header
- ✅ Dashboard shows "No Vault Found" or existing vault
- ✅ "Store Key" button visible

**If it fails**:
- Check browser console for errors
- Verify wallet is connected to Devnet
- Try disconnecting and reconnecting

### Test 2.2: Store API Key

1. Click "Store Key" button
2. Fill in the form:
   - **Key Name**: `Test API Key` (optional)
   - **API Key**: `sk_test_1234567890abcdef` (use a test key)
   - **Time Lock**: Leave unchecked for now
3. Click "Store Key" button
4. Approve transaction in wallet

**Expected Result**:
- ✅ Transaction submitted successfully
- ✅ Loading indicator shows "Storing..."
- ✅ Modal closes after success
- ✅ Vault appears in dashboard
- ✅ Vault shows encryption status, ZK commit, MPC hash

**If it fails**:
- Check wallet has enough SOL: `solana balance`
- Check browser console for errors
- Verify program ID is correct in `.env.local`
- Check transaction in Solana Explorer: `https://explorer.solana.com/tx/SIGNATURE?cluster=devnet`

### Test 2.3: View Vault

After storing a key, verify the vault display:

**Expected Result**:
- ✅ Vault card shows "Secure Vault" status
- ✅ Encryption shows "Lit Protocol ✓"
- ✅ ZK Commit shows hex value (first 8 bytes)
- ✅ MPC Hash shows hex value (first 8 bytes)
- ✅ Created timestamp displays correctly
- ✅ "Share Key" button is visible

### Test 2.4: Access Key (Owner)

1. Click on vault (if there's an access button) or verify owner can see vault
2. As the owner, you should have direct access

**Expected Result**:
- ✅ Owner can view vault without ZK proof
- ✅ Vault data is accessible

**Note**: Full access/decryption UI may need to be added. Currently, the program verifies owner access.

### Test 2.5: Share Key

1. Click "Share Key" button
2. Fill in the form:
   - **Recipient Address**: Enter another wallet address (or generate a test one)
   - **Time Lock**: Leave empty or set future date
3. Click "Share Key"
4. Approve transaction in wallet

**Expected Result**:
- ✅ Transaction submitted successfully
- ✅ Share account created on-chain
- ✅ Modal closes after success

**If it fails**:
- Verify recipient address is valid Solana address
- Check wallet has enough SOL
- Check transaction in Solana Explorer

## Step 3: Advanced Tests

### Test 3.1: Multiple Keys

1. Store a second API key (will update existing vault)
2. Verify vault shows latest data

**Expected Result**:
- ✅ Vault updates with new key data
- ✅ Timestamp updates

### Test 3.2: Time-Locked Key

1. Store a new key with "Time Lock" checked
2. Verify access flags are set

**Expected Result**:
- ✅ Vault shows "Time-locked access enabled"
- ✅ Access flags bit 0 is set

### Test 3.3: Transaction Verification

After each transaction:

```bash
# Get your wallet address
solana address

# Check recent transactions
solana confirm -v SIGNATURE

# Or view in explorer
# https://explorer.solana.com/address/YOUR_ADDRESS?cluster=devnet
```

**Expected Result**:
- ✅ Transactions show as "Finalized"
- ✅ Program logs visible in transaction details
- ✅ Account data shows vault structure

## Step 4: Program Verification

### Test 4.1: Verify On-Chain Data

```bash
# Get your wallet address
MY_ADDRESS=$(solana address)

# Derive vault PDA (you'll need to calculate this)
# Or use Solana Explorer to view account

# Check account exists
solana account VAULT_PDA_ADDRESS
```

**Expected Result**:
- ✅ Account exists with 288 bytes
- ✅ Data starts with discriminator: `keyshld`
- ✅ Owner matches your wallet address

### Test 4.2: Program Logs

Check program execution logs:

```bash
# View recent program transactions
solana program show YOUR_PROGRAM_ID

# Or check specific transaction
solana confirm -v TRANSACTION_SIGNATURE
```

**Expected Result**:
- ✅ Program executed successfully
- ✅ Logs show "Vault initialized" or "API key stored privately"
- ✅ No error messages

## Step 5: Error Handling Tests

### Test 5.1: Invalid Input

1. Try to store key with empty API key
2. Try to share with invalid address

**Expected Result**:
- ✅ Form validation prevents submission
- ✅ Error messages displayed

### Test 5.2: Insufficient SOL

1. Use wallet with < 0.1 SOL
2. Try to store key

**Expected Result**:
- ✅ Transaction fails with clear error
- ✅ Error message about insufficient funds

### Test 5.3: Duplicate Vault

1. Store a key (creates vault)
2. Try to store another key immediately

**Expected Result**:
- ✅ Program returns "VaultAlreadyExists" error
- ✅ Transaction fails gracefully

## Step 6: Integration Tests

### Test 6.1: Lit Protocol Encryption

Verify encryption is working:

1. Store a key
2. Check browser console for Lit Protocol logs
3. Verify ciphertext is different from plaintext

**Expected Result**:
- ✅ Lit client connects successfully
- ✅ Encryption produces ciphertext
- ✅ Ciphertext stored on-chain (not plaintext)

### Test 6.2: Multiple Wallets

1. Connect with Wallet A, store key
2. Disconnect, connect with Wallet B
3. Verify Wallet B cannot access Wallet A's vault

**Expected Result**:
- ✅ Each wallet has separate vault
- ✅ Vaults are isolated by owner

## Step 7: Performance Tests

### Test 7.1: Transaction Speed

Measure transaction confirmation time:

1. Store a key
2. Note time from submission to confirmation

**Expected Result**:
- ✅ Transaction confirms within 30 seconds (devnet)
- ✅ UI updates promptly

### Test 7.2: Concurrent Operations

1. Open app in multiple tabs
2. Store key in one tab
3. Verify other tabs update

**Expected Result**:
- ✅ All tabs show updated vault
- ✅ No race conditions

## Troubleshooting

### Common Issues

#### Issue: "Program ID not found"
**Solution**: 
- Verify `.env.local` has correct `NEXT_PUBLIC_PROGRAM_ID`
- Restart dev server: `npm run dev`

#### Issue: "Account not found"
**Solution**:
- Verify program is deployed
- Check program ID matches
- Ensure wallet has SOL

#### Issue: "Transaction failed"
**Solution**:
- Check wallet balance: `solana balance`
- Verify RPC endpoint is accessible
- Check transaction in Solana Explorer for details

#### Issue: "Wallet connection failed"
**Solution**:
- Clear browser cache
- Try different wallet
- Check wallet is on Devnet network

#### Issue: "Lit Protocol error"
**Solution**:
- Check `NEXT_PUBLIC_LIT_NETWORK` is set to `datil`
- Verify network connectivity
- Check browser console for detailed errors

## Test Checklist

Use this checklist to verify all functionality:

- [ ] Wallet connects successfully
- [ ] Store key works
- [ ] Vault displays correctly
- [ ] Share key works
- [ ] Owner access works
- [ ] Time-lock option works
- [ ] Multiple keys can be stored
- [ ] Transactions confirm successfully
- [ ] On-chain data is correct
- [ ] Error handling works
- [ ] UI updates in real-time
- [ ] Lit Protocol encryption works

## Next Steps After Testing

1. **Fix any bugs** found during testing
2. **Integrate Bonsol** for ZK proof generation
3. **Integrate Arcium** for MPC sharing
4. **Add access/decrypt UI** for viewing stored keys
5. **Security audit** before mainnet
6. **Deploy to mainnet** after thorough testing

## Test Scripts

### Quick Test Script

```bash
#!/bin/bash
# Quick test script

echo "=== KeyShield Quick Test ==="

# Check prerequisites
echo "1. Checking prerequisites..."
rustc --version || exit 1
node --version || exit 1
solana --version || exit 1

# Build program
echo "2. Building program..."
cd keyshield
cargo build-sbf || exit 1

# Deploy program
echo "3. Deploying program..."
PROGRAM_ID=$(solana program deploy target/deploy/keyshield.so --output json | jq -r '.programId')
echo "Program ID: $PROGRAM_ID"

# Update .env.local
echo "4. Updating .env.local..."
cd ../frontend
sed -i.bak "s/NEXT_PUBLIC_PROGRAM_ID=.*/NEXT_PUBLIC_PROGRAM_ID=$PROGRAM_ID/" .env.local

echo "=== Setup Complete ==="
echo "Program ID: $PROGRAM_ID"
echo "Start frontend: cd frontend && npm run dev"
```

Save as `test-setup.sh`, make executable: `chmod +x test-setup.sh`, then run: `./test-setup.sh`

## Manual Testing Steps Summary

1. **Setup**: Build, deploy, configure
2. **Connect**: Wallet connection test
3. **Store**: Store API key test
4. **View**: Vault display test
5. **Share**: Share key test
6. **Verify**: On-chain verification
7. **Errors**: Error handling test
8. **Integration**: SDK integration test

---

**Happy Testing!** 🚀

If you encounter any issues, check the troubleshooting section or review the logs in browser console and Solana Explorer.
