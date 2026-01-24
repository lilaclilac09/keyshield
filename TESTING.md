# KeyShield Testing Guide

## Overview

This guide covers testing the on-chain encryption workflow for KeyShield. The system uses Lit Protocol for client-side encryption, stores encrypted key hashes on-chain, and full ciphertexts in IndexedDB.

## Architecture Verification

### On-Chain Storage
- **Vault Account**: 288 bytes total
- **encrypted_key_hash**: 32 bytes (reference to full ciphertext)
- **Full ciphertext**: 1-5 KB stored in IndexedDB (key: `ciphertext:${hashBase64}`)

### Encryption Flow
1. Client encrypts API key with Lit Protocol → `{ ciphertext, dataToEncryptHash }`
2. Full `ciphertext` stored in IndexedDB
3. Only `dataToEncryptHash` (32 bytes) stored on-chain
4. Decryption requires Lit Protocol session signatures matching access conditions

## Prerequisites

### 1. Program Deployment

Build and deploy the program to devnet:

```bash
# Build the program
cargo build-sbf

# Deploy (replace with your keypair path)
solana program deploy target/deploy/keyshield.so \
  --program-id keyshield-keypair.json \
  --url devnet

# Note the Program ID from deployment output
```

### 2. Frontend Environment Setup

Create `frontend/.env.local`:

```bash
cd frontend
cp .env.local.example .env.local  # If example exists, or create new
```

Required environment variables:

```env
NEXT_PUBLIC_PROGRAM_ID=YourDeployedProgramIdHere
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_LIT_NETWORK=datil
NEXT_PUBLIC_ARCIUM_CLUSTER=testnet
```

### 3. Install Dependencies

```bash
cd frontend
npm install
```

## Testing Workflow

### Test 1: Basic Store & Retrieve

**Objective**: Verify encryption, on-chain storage, and decryption work end-to-end.

**Steps**:

1. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

2. Open browser: `http://localhost:3000`

3. Connect wallet (Phantom/Solflare on devnet)

4. Airdrop SOL if needed:
   ```bash
   solana airdrop 5 <your-wallet-address> --url devnet
   ```

5. Store a test API key:
   - Enter: `sk-test-dummykey123456789`
   - Access condition: Your wallet address (default)
   - Submit transaction

6. Verify transaction on Solana Explorer:
   - Go to: https://explorer.solana.com/?cluster=devnet
   - Search for your transaction signature
   - Check the vault account data

7. **Verify on-chain storage**:
   - Vault account should show:
     - `encrypted_key_hash`: 32 bytes (NOT the plaintext key)
     - `owner`: Your wallet public key
     - `discriminator`: "keyshld"
   - **Important**: The account data should NOT contain the plaintext API key

8. Retrieve the key:
   - Click "Retrieve" or "Access Key" in the UI
   - Should decrypt and display: `sk-test-dummykey123456789`

9. **Verify off-chain storage**:
   - Open browser DevTools → Application → IndexedDB
   - Look for key: `ciphertext:${hashBase64}`
   - Should contain the full Lit Protocol ciphertext (1-5 KB)

**Expected Results**:
- ✅ Transaction succeeds
- ✅ On-chain vault shows hash (32 bytes), not plaintext
- ✅ Full ciphertext stored in IndexedDB
- ✅ Decryption returns original key

### Test 2: Access Control

**Objective**: Verify only authorized wallets can decrypt keys.

**Steps**:

1. Store a key with Wallet A (as in Test 1)

2. Switch to a different wallet (Wallet B) in the browser

3. Try to retrieve the key stored by Wallet A:
   - Should fail with access denied error
   - Lit Protocol should reject decryption request

4. Switch back to Wallet A

5. Retrieve the key:
   - Should succeed and display the key

**Expected Results**:
- ✅ Wallet B cannot decrypt (access denied)
- ✅ Wallet A can decrypt successfully
- ✅ Error message is clear and user-friendly

### Test 3: On-Chain Data Verification

**Objective**: Verify the vault account structure matches expectations.

**Steps**:

1. After storing a key, get the vault PDA address:
   ```typescript
   // In browser console or frontend code
   const [vaultPDA] = PublicKey.findProgramAddressSync(
     [Buffer.from('vault'), ownerPubkey.toBuffer()],
     programId
   );
   console.log('Vault PDA:', vaultPDA.toString());
   ```

2. Query the account data:
   ```bash
   solana account <vault-pda-address> --url devnet --output json
   ```

3. Parse the account data:
   - First 8 bytes: discriminator ("keyshld")
   - Next 32 bytes: owner public key
   - Next 32 bytes: encrypted_key_hash (NOT plaintext!)
   - Next 32 bytes: zk_commit
   - Next 32 bytes: mpc_hash
   - Next 8 bytes: created_at timestamp
   - Next 1 byte: access_flags
   - Remaining 143 bytes: reserved

**Expected Results**:
- ✅ Account size: 288 bytes
- ✅ Discriminator: "keyshld\0"
- ✅ encrypted_key_hash: 32 bytes of hash (not plaintext key)
- ✅ Owner matches your wallet

### Test 4: IndexedDB Storage Verification

**Objective**: Verify full ciphertext is stored off-chain.

**Steps**:

1. Store a key (as in Test 1)

2. Open browser DevTools:
   - Chrome/Edge: F12 → Application → IndexedDB
   - Firefox: F12 → Storage → IndexedDB

3. Find the KeyShield database/object store

4. Look for key pattern: `ciphertext:${hashBase64}`

5. Verify the value:
   - Should be a base64 string (1-5 KB)
   - This is the full Lit Protocol ciphertext

6. Try retrieving the key:
   - The frontend should read from IndexedDB using the hash
   - Then decrypt with Lit Protocol

**Expected Results**:
- ✅ Ciphertext stored in IndexedDB
- ✅ Key format: `ciphertext:${hashBase64}`
- ✅ Value is base64-encoded ciphertext
- ✅ Decryption uses this stored ciphertext

## Troubleshooting

### Common Issues

**1. Program ID Mismatch**
- **Error**: "Invalid program ID" or transaction fails
- **Fix**: Verify `NEXT_PUBLIC_PROGRAM_ID` matches deployed program ID

**2. RPC Connection Issues**
- **Error**: "Failed to send transaction" or timeout
- **Fix**: 
  - Check `NEXT_PUBLIC_RPC_URL` is correct
  - Try alternative RPC: `https://api.devnet.solana.com`
  - Or use Helius: `https://devnet.helius-rpc.com/?api-key=YOUR_KEY`

**3. Lit Protocol Connection**
- **Error**: "Lit client not connected" or decryption fails
- **Fix**:
  - Verify `NEXT_PUBLIC_LIT_NETWORK=datil` (testnet)
  - Check browser console for Lit errors
  - Ensure wallet is connected before decryption

**4. Access Denied on Decryption**
- **Error**: "Access denied" when trying to decrypt
- **Fix**:
  - Verify wallet matches access conditions
  - Check Lit Protocol session signatures
  - Ensure same wallet used for encryption and decryption

**5. IndexedDB Not Found**
- **Error**: Ciphertext not found in IndexedDB
- **Fix**:
  - Check browser allows IndexedDB (not in private/incognito)
  - Verify `storeCiphertext()` was called during encryption
  - Check browser console for storage errors

## Verification Checklist

After completing tests, verify:

- [ ] On-chain vault stores 32-byte hash, not plaintext
- [ ] Full ciphertext stored in IndexedDB
- [ ] Decryption works with authorized wallet
- [ ] Decryption fails with unauthorized wallet
- [ ] Transaction succeeds on devnet
- [ ] Account structure matches `Vault` struct (288 bytes)
- [ ] Discriminator is "keyshld"
- [ ] Owner field matches wallet public key

## Next Steps

1. **Time-Lock Testing** (Optional):
   - Test time-locked access conditions
   - Verify immediate access fails
   - Verify access succeeds after lock period

2. **Extension Testing** (If applicable):
   - Test browser extension key detection
   - Verify cross-tab synchronization
   - Test auto-fill functionality

3. **Integration Testing**:
   - Test with real API keys (GitHub, Helius, Google Gemini)
   - Verify oracle service integration
   - Test key sharing with MPC (when Arcium is ready)

## Code References

Key files for testing:

- `frontend/src/lib/lit-protocol.ts` - Lit Protocol encryption/decryption
- `frontend/src/lib/ciphertext-storage.ts` - IndexedDB storage
- `frontend/src/hooks/useVault.ts` - Vault interaction hooks
- `frontend/src/lib/keyshield-client.ts` - On-chain program client
- `programs/keyshield/src/state.rs` - Vault account structure
- `programs/keyshield/src/instructions/store_key.rs` - Store instruction
