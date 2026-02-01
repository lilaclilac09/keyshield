# On-Chain Integration Complete

## What Changed

KeyShield now stores encrypted API key hashes on-chain with dual-path storage:

1. **Primary: Light Protocol ZK Compression** (95% cheaper)
   - Uses compressed accounts via Light Protocol SDK
   - Cost: ~15,000 lamports per key reference
   - Requires Helius RPC with ZK Compression support

2. **Fallback: KeyShield Solana Program** (standard PDAs)
   - Uses custom KeyShield program: `59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW`
   - Stores up to 8 keys in a 472-byte vault PDA
   - Works with any Solana RPC

## Storage Architecture

```
User Input (API Key)
     ↓
Lit Protocol Encryption
     ↓
Ciphertext → IndexedDB (off-chain)
     ├─ Lit Hash (from encryptWithLit)
     ├─ Plain Hash (SHA-256)
     └─ Light Hash (bn254 field hash)
     ↓
On-Chain Storage (hash reference only):
     ├─ Light Protocol (compressed account) [PRIMARY]
     └─ KeyShield Program (vault PDA) [FALLBACK]
```

## Setup

### 1. Environment Variables

Create `frontend/.env.local` with:

```bash
# Clerk Auth (required)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_key

# Helius RPC (recommended for Light Protocol)
VITE_HELIUS_API_KEY=your_helius_api_key

# KeyShield Program (already deployed)
VITE_PROGRAM_ID=59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW

# Network
VITE_NETWORK=devnet
```

Get a free Helius API key at: https://helius.dev

### 2. Run the App

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## Usage

1. **Connect Wallet** - Click "Select Wallet" button in header
2. **Save API Key** - Click "+", enter details, click "SAVE"
3. **View On-Chain Status** - Dashboard shows badge:
   - ⚡ COMPRESSED (Light Protocol)
   - 📦 ON-CHAIN (KeyShield Program)
4. **Verify on Solscan** - Click badge to view transaction

## How It Works

### Saving a Key

1. **Encrypt**: Lit Protocol encrypts the API key with wallet-based access control
2. **Hash**: Generate three hashes:
   - Lit hash (from `encryptWithLit`)
   - Plain hash (SHA-256 of plaintext)
   - Light hash (`hashvToBn254FieldSizeBe` for Light Protocol)
3. **Store Off-Chain**: Ciphertext + hashes → IndexedDB `keyshield_ciphertext` store
4. **Store On-Chain**: Hash reference via:
   - **Light Protocol** (if `VITE_HELIUS_API_KEY` set): Compressed account with ZK proof
   - **KeyShield Program** (fallback): Standard vault PDA
5. **Dashboard Update**: Item appears immediately with on-chain status badge

### Retrieving a Key

1. **Click Reveal/Copy**: Dashboard calls `decryptItem()`
2. **Fetch**: Get ciphertext from IndexedDB by hash
3. **Decrypt**: Lit Protocol decrypts (requires wallet signature)
4. **Display**: Plaintext shown in UI (auto-hides after 15 seconds)

## On-Chain Verification

### Light Protocol (Compressed)

- Transaction on Solscan: `https://solscan.io/tx/{signature}?cluster=devnet`
- Compressed accounts require RPC with indexer support (Helius, Triton)
- Uses state Merkle trees for verification

### KeyShield Program (Standard)

- Transaction: `https://solscan.io/tx/{signature}?cluster=devnet`
- Vault PDA: `https://solscan.io/account/{vaultPDA}?cluster=devnet`
- View vault structure and stored key hashes in account data

## Files Changed

| File | Change |
|------|--------|
| `frontend/types.ts` | Added `txSignature`, `onChainMethod` to `VaultItem` |
| `frontend/lib/keyshield-client.ts` | **NEW** - KeyShield program client |
| `frontend/lib/light-compression.ts` | Implemented Light Protocol integration |
| `frontend/hooks/useVaults.ts` | Wired dual on-chain storage with fallback |
| `frontend/components/VaultItemCard.tsx` | Added on-chain status badges |
| `frontend/vite.config.ts` | Added env var exposure, removed debug logs |

## Testing

### Test Light Protocol Path

1. Add `VITE_HELIUS_API_KEY` to `.env.local`
2. Restart dev server
3. Connect wallet
4. Save a key
5. Check console for "✅ Stored in Light Protocol compressed account"
6. Click ⚡ COMPRESSED badge to view on Solscan

### Test KeyShield Program Fallback

1. Remove `VITE_HELIUS_API_KEY` from `.env.local` (or set invalid key)
2. Restart dev server
3. Save a key
4. Check console for "✅ Stored in KeyShield vault (fallback)"
5. Click 📦 ON-CHAIN badge to view on Solscan

### Verify Persistence

1. Refresh page
2. Items should reload from IndexedDB
3. On-chain badges should persist
4. Decryption should work (requires wallet signature)

## Resources

- **Lit Protocol Docs**: https://litprotocol.com/docs/
- **ZK Compression API**: https://www.zkcompression.com/api-reference/json-rpc-methods/methods
- **ZK on Solana**: https://www.zkcompression.com/zk/overview
- **KeyShield Program**: https://solscan.io/account/59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW?cluster=devnet

## Summary

- ✅ Wallet connection required (WalletMultiButton in header)
- ✅ Encryption with Lit Protocol (wallet-based access control)
- ✅ Off-chain storage in IndexedDB (ciphertext + hashes)
- ✅ On-chain storage with dual path (Light Protocol + KeyShield)
- ✅ Dashboard updates immediately after save
- ✅ On-chain status badges with Solscan links
- ✅ Decryption on reveal/copy (requires wallet signature)
