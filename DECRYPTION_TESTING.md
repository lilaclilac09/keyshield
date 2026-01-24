# KeyShield Decryption Testing Guide

## Overview

This guide provides step-by-step instructions for testing the decryption workflow in KeyShield. It covers storing keys, verifying on-chain storage, testing decryption, and verifying access control.

## Prerequisites

Before starting, ensure you have:

1. **Frontend running**: `cd frontend && npm run dev`
2. **Wallet installed**: Phantom or Solflare browser extension
3. **Devnet SOL**: Airdrop if needed: `solana airdrop 5 <wallet-address> --url devnet`
4. **Program deployed**: Program ID `59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW` on devnet

## Step 1: Store a Test API Key

### 1.1 Open the Frontend

1. Navigate to `http://localhost:3000` in your browser
2. Connect your wallet (Phantom/Solflare)
3. Ensure you're on **devnet** (not mainnet)

### 1.2 Store a Test Key

1. Click "Store Key" or "Add API Key" button
2. Enter a test API key: `sk-test-dummykey123456789`
3. Enter a key name: `Test Key`
4. Click "Submit" or "Store"

### 1.3 Verify Transaction

1. Approve the transaction in your wallet
2. Wait for confirmation (usually 1-2 seconds on devnet)
3. Note the transaction signature (shown in UI or browser console)

### 1.4 Check Transaction on Solana Explorer

1. Copy the transaction signature
2. Go to: https://explorer.solana.com/?cluster=devnet
3. Paste the signature and search
4. Verify the transaction succeeded
5. Click on the vault account to see account details

**Expected Result**: Transaction should succeed with status "Success"

## Step 2: Verify On-Chain Storage

### 2.1 Using Browser Console Helper

1. Open browser DevTools (F12)
2. Go to Console tab
3. Copy and paste the contents of `frontend/public/verify-storage.js`
4. Press Enter

**Expected Output**:
```
🔍 KeyShield Storage Verification
================================

👤 Wallet Address: <your-wallet-address>
📊 Program ID: 59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW

💾 Checking IndexedDB Storage...
✅ Found 1 ciphertext(s) in IndexedDB

🔗 Fetching Vault Account from On-Chain...
📍 Vault PDA: <vault-pda-address>
✅ Vault account found!

📋 Account Details:
   - Account size: 288 bytes (expected: 288)
   - Owner: <your-wallet-address>
   
✅ Discriminator: keyshld (correct)
👤 Owner from account: <your-wallet-address>
   ✅ Matches your wallet address

🔐 encrypted_key_hash (bytes 40-71):
   - Length: 32 bytes (expected: 32)
   - Hex: <32-byte-hex-string>
   - Base64: <base64-string>

✅ encrypted_key_hash is properly hashed (not plaintext)
   This is correct - only the hash is stored on-chain.
```

**Critical Check**: The `encrypted_key_hash` should be:
- Exactly 32 bytes
- A random-looking hex/base64 string
- **NOT** the plaintext API key (`sk-test-dummykey123456789`)

### 2.2 Using Verification Script

1. Open terminal
2. Run: `./scripts/verify-vault.sh <your-wallet-address>`
3. Review the output

**Expected Result**: Script confirms:
- Account size is 288 bytes
- Discriminator is "keyshld"
- `encrypted_key_hash` is 32 bytes and not plaintext

### 2.3 Using Solana Explorer

1. Go to: https://explorer.solana.com/?cluster=devnet
2. Search for your wallet address
3. Find the vault PDA account (derived from your wallet + program)
4. View account data

**What to Check**:
- Account data should be 288 bytes
- Bytes 40-71 should show a hash (random hex), not readable text
- If you see your API key in plaintext, that's a security issue!

## Step 3: Test Decryption

### 3.1 Decrypt the Stored Key

1. In the frontend UI, find your stored key
2. Click "Retrieve", "Access Key", or "Reveal" button
3. Approve the wallet signature request (Lit Protocol will prompt)
4. Wait for decryption (may take 2-5 seconds)

**Expected Result**:
- Key should be decrypted and displayed
- Decrypted value should match: `sk-test-dummykey123456789`
- Key should auto-hide after 30 seconds (security feature)

### 3.2 Verify Decryption Process

1. Open browser DevTools (F12)
2. Go to Console tab
3. Watch for any errors during decryption

**Expected Console Output**:
- No errors
- Lit Protocol session signature messages
- Decryption success message

**If Errors Occur**:
- Check wallet is connected
- Verify you're using the same wallet that stored the key
- Check Lit Protocol network connection (should be "datil" testnet)
- Ensure IndexedDB has the ciphertext stored

### 3.3 Verify IndexedDB Storage

1. Open DevTools (F12)
2. Go to Application tab (Chrome) or Storage tab (Firefox)
3. Navigate to IndexedDB → `keyshield-ciphertext` → `ciphertexts`
4. You should see an entry with:
   - Key: `ciphertext:<hash-base64>`
   - Value: Full Lit Protocol ciphertext (1-5 KB base64 string)

**Expected Result**: Ciphertext should be stored with the hash as key

## Step 4: Test Access Control

### 4.1 Test with Different Wallet

1. Disconnect current wallet
2. Connect a **different** wallet (or create a new one)
3. Try to decrypt the key stored by the first wallet

**Expected Result**:
- Decryption should **fail**
- Error message: "Access denied" or "Access control conditions not met"
- Lit Protocol should reject the decryption request

### 4.2 Test with Original Wallet

1. Disconnect the second wallet
2. Reconnect the **original** wallet (that stored the key)
3. Try to decrypt again

**Expected Result**:
- Decryption should **succeed**
- Key should be displayed correctly

### 4.3 Verify Access Conditions

The access conditions are set to:
```javascript
{
  conditionType: 'solana',
  method: '',
  params: [':userAddress'],
  chain: 'solana',
  returnValueTest: {
    comparator: '=',
    value: '<wallet-address-that-stored-key>'
  }
}
```

Only the wallet that matches this address can decrypt.

## Step 5: Verify Complete Workflow

### 5.1 End-to-End Verification Checklist

- [ ] Key stored successfully (transaction confirmed)
- [ ] On-chain vault account created (288 bytes)
- [ ] `encrypted_key_hash` is 32 bytes (not plaintext)
- [ ] Full ciphertext stored in IndexedDB
- [ ] Decryption works with authorized wallet
- [ ] Decryption fails with unauthorized wallet
- [ ] Decrypted key matches original
- [ ] No errors in browser console

### 5.2 Security Verification

Verify these security properties:

1. **On-Chain Privacy**: 
   - ✅ Only hash stored on-chain (32 bytes)
   - ✅ No plaintext API key visible on-chain
   - ✅ Account data is encrypted gibberish

2. **Off-Chain Storage**:
   - ✅ Full ciphertext stored in IndexedDB (browser-local)
   - ✅ Ciphertext is encrypted with Lit Protocol
   - ✅ Cannot be decrypted without proper access conditions

3. **Access Control**:
   - ✅ Only authorized wallet can decrypt
   - ✅ Unauthorized wallets are rejected
   - ✅ Lit Protocol enforces access conditions

## Troubleshooting

### Issue: Decryption Fails with "Ciphertext not found"

**Solution**:
1. Check IndexedDB has the ciphertext stored
2. Verify the hash matches between on-chain and IndexedDB
3. Try storing the key again

### Issue: "Access denied" Even with Correct Wallet

**Solution**:
1. Ensure you're using the exact same wallet that stored the key
2. Check wallet address matches the vault owner
3. Verify Lit Protocol session signatures are being generated
4. Check browser console for Lit Protocol errors

### Issue: Transaction Fails

**Solution**:
1. Ensure you have enough SOL (at least 0.01 SOL for rent)
2. Check RPC endpoint is accessible
3. Verify program ID is correct in `.env.local`
4. Try airdropping more SOL: `solana airdrop 2 <wallet> --url devnet`

### Issue: Frontend Shows "Vault not found"

**Solution**:
1. Verify transaction was confirmed
2. Wait a few seconds for RPC to sync
3. Refresh the page
4. Check vault PDA is correct (use browser console helper)

### Issue: TypeScript Build Errors

**Solution**:
1. Run `npm run build` to see specific errors
2. Check that all Lit Protocol types are correct
3. Verify `@lit-protocol/auth-helpers` is installed
4. See `TEST_RESULTS.md` for known issues

## Advanced Testing

### Test with Multiple Keys

1. Store multiple API keys with different names
2. Verify each has its own vault account
3. Test decrypting each one independently

### Test Time-Locked Access (Future)

When time-lock conditions are implemented:
1. Store key with time-lock condition
2. Try immediate decryption → should fail
3. Wait for lock period
4. Try decryption again → should succeed

### Test Key Sharing (Future)

When MPC sharing is implemented:
1. Store key with share permissions
2. Share with another wallet
3. Verify recipient can decrypt
4. Verify non-recipients cannot decrypt

## Verification Scripts

### Quick Verification

Run the browser console helper:
```javascript
// Paste frontend/public/verify-storage.js into browser console
```

### Command Line Verification

```bash
# Verify vault on-chain
./scripts/verify-vault.sh <wallet-address>

# Check program deployment
solana program show 59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW --url devnet
```

## Expected Results Summary

After completing all tests, you should verify:

1. **On-Chain**: 32-byte hash stored (not plaintext) ✅
2. **Off-Chain**: Full ciphertext in IndexedDB ✅
3. **Decryption**: Works with authorized wallet ✅
4. **Access Control**: Fails with unauthorized wallet ✅
5. **Security**: No plaintext visible anywhere ✅

## Next Steps

- Test with real API keys (GitHub, Helius, Google Gemini)
- Test oracle service integration
- Test key sharing (when MPC is ready)
- Test ZK proof access (when Bonsol is ready)

---

For more information, see:
- [TESTING.md](./TESTING.md) - Complete testing guide
- [QUICK_VERIFICATION.md](./QUICK_VERIFICATION.md) - Quick reference
- [TEST_RESULTS.md](./TEST_RESULTS.md) - Test execution results
