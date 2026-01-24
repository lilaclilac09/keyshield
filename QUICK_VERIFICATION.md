# KeyShield Quick Verification Guide

Quick reference for verifying KeyShield storage and decryption.

## One-Command Verification

### Browser Console (Recommended)

1. Open DevTools (F12) → Console
2. Paste: `frontend/public/verify-storage.js`
3. Press Enter

**Output**: Shows vault account, hash verification, and IndexedDB status.

### Command Line

```bash
./scripts/verify-vault.sh <wallet-address>
```

**Output**: Verifies on-chain account structure and hash.

## Quick Checks

### ✅ On-Chain Storage is Correct

- [ ] Account size: 288 bytes
- [ ] Discriminator: "keyshld\0"
- [ ] `encrypted_key_hash` (bytes 40-71): 32 bytes
- [ ] Hash is random-looking (NOT readable text)
- [ ] Owner matches your wallet

### ✅ Off-Chain Storage is Correct

- [ ] IndexedDB database: `keyshield-ciphertext`
- [ ] Object store: `ciphertexts`
- [ ] Key format: `ciphertext:<hash-base64>`
- [ ] Ciphertext size: 1-5 KB (base64 string)

### ✅ Decryption Works

- [ ] Click "Reveal" → Key displays
- [ ] Decrypted key matches original
- [ ] Auto-hides after 30 seconds
- [ ] No console errors

### ✅ Access Control Works

- [ ] Authorized wallet can decrypt
- [ ] Unauthorized wallet cannot decrypt
- [ ] Error message is clear

## Common Verification Commands

### Check Program Deployment

```bash
solana program show 59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW --url devnet
```

### Check Wallet Balance

```bash
solana balance <wallet-address> --url devnet
```

### Airdrop SOL (if needed)

```bash
solana airdrop 2 <wallet-address> --url devnet
```

### View Transaction

```bash
solana confirm <transaction-signature> --url devnet
```

## Browser Console Helpers

### Get Vault PDA

```javascript
const { Connection, PublicKey } = require('@solana/web3.js');
const programId = new PublicKey('59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW');
const owner = new PublicKey('<your-wallet-address>');
const [vaultPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('vault'), owner.toBuffer()],
  programId
);
console.log('Vault PDA:', vaultPDA.toString());
```

### Check IndexedDB

```javascript
// Open IndexedDB
const dbRequest = indexedDB.open('keyshield-ciphertext', 1);
dbRequest.onsuccess = () => {
  const db = dbRequest.result;
  const tx = db.transaction(['ciphertexts'], 'readonly');
  const store = tx.objectStore('ciphertexts');
  store.getAll().onsuccess = (e) => {
    console.log('Ciphertexts:', e.target.result);
  };
};
```

### Verify Hash is Not Plaintext

```javascript
// After getting vault account data
const encryptedKeyHash = accountData.slice(40, 72);
const asString = String.fromCharCode(...encryptedKeyHash);
const isReadable = /^[\x20-\x7E]+$/.test(asString) && asString.length > 10;

if (isReadable) {
  console.error('❌ SECURITY ISSUE: Hash appears to be plaintext!');
  console.error('Value:', asString);
} else {
  console.log('✅ Hash is properly encrypted');
}
```

## Quick Test Checklist

1. **Store Key**: Enter test key → Submit → Confirm transaction
2. **Verify On-Chain**: Run browser console helper → Check hash is 32 bytes
3. **Verify Off-Chain**: Check IndexedDB → Should see ciphertext
4. **Test Decryption**: Click Reveal → Should show original key
5. **Test Access Control**: Switch wallet → Should fail to decrypt

## Expected Results

### On-Chain Account
```
Size: 288 bytes
Discriminator: keyshld\0
Owner: <your-wallet>
encrypted_key_hash: <32-byte-hex> (random, not plaintext)
```

### IndexedDB
```
Database: keyshield-ciphertext
Store: ciphertexts
Key: ciphertext:<hash-base64>
Value: <1-5KB-ciphertext>
```

### Decryption
```
Input: encrypted_key_hash (from vault)
  ↓
Retrieve ciphertext from IndexedDB
  ↓
Lit Protocol decrypts
  ↓
Output: Original API key
```

## Security Verification

**Critical**: The `encrypted_key_hash` on-chain should:
- ✅ Be exactly 32 bytes
- ✅ Be a random hex/base64 string
- ✅ NOT contain readable text
- ✅ NOT be the plaintext API key

If you see your API key in plaintext on-chain, that's a **security issue**!

## Links

- **Solana Explorer**: https://explorer.solana.com/?cluster=devnet
- **Program ID**: `59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW`
- **Detailed Guide**: [DECRYPTION_TESTING.md](./DECRYPTION_TESTING.md)
- **Full Testing**: [TESTING.md](./TESTING.md)
