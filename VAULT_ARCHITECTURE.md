# KeyShield Vault Architecture

## ✅ Corrected Architecture (ONE Wallet → ONE Vault → MULTIPLE Keys)

This document explains the **correct** architecture of KeyShield's vault system.

---

## Visual Overview

```
Clerk User (user_123)
  │
  ├─ Wallet 1 (9xyz...abc)
  │   └─ Vault PDA ["vault", 9xyz...abc]  ← ONE vault per wallet (On-chain, 472 bytes)
  │       ├─ Key Entry 1: hash_abc123... (GitHub API Key)
  │       ├─ Key Entry 2: hash_def456... (Helius API Key)
  │       └─ Key Entry 3: hash_ghi789... (Generic API Key)
  │
  ├─ Wallet 2 (5def...ghi)
  │   └─ Vault PDA ["vault", 5def...ghi]  ← ONE vault per wallet (On-chain, 472 bytes)
  │       ├─ Key Entry 1: hash_xyz999...
  │       └─ Key Entry 2: hash_uvw888...
  │
  └─ Wallet 3 (7uvw...xyz)
      └─ Vault PDA ["vault", 7uvw...xyz]  ← ONE vault per wallet (On-chain, 472 bytes)
          └─ Key Entry 1: hash_rst777...
```

---

## Key Concepts

### 1. ONE Wallet → ONE Vault PDA

- Each Solana wallet derives **exactly ONE** vault PDA
- PDA derivation: `["vault", owner.publicKey]` → deterministic address
- The vault is created on-chain when the **first** API key is stored
- The vault persists even if all keys are deleted (can be reclaimed for rent)

### 2. ONE Vault → MULTIPLE Keys (up to 8)

- Each vault can store **up to 8 API keys**
- Keys are stored as `KeyEntry` structs within the vault
- Each `KeyEntry` contains:
  - `encrypted_key_hash`: 32-byte reference to off-chain ciphertext
  - `key_type`: Type of key (GitHub, Helius, etc.)
  - `access_flags`: Access control flags

### 3. Off-Chain Ciphertext Storage

- **Full ciphertexts** (1-5 KB from Lit Protocol) are stored in **IndexedDB**
- **Only 32-byte hashes** are stored on-chain (in the vault)
- Storage key: `ciphertext:<hash>` → `{ ciphertext, walletPubkey, metadata }`

---

## On-Chain Structure (Solana)

### Vault Account (472 bytes)

```rust
pub struct Vault {
    discriminator: [u8; 8],        // "keyshld\0"
    owner: Pubkey,                 // Wallet that owns this vault (32 bytes)
    key_count: u8,                 // Number of keys stored (0-8)
    keys: [KeyEntry; 8],           // Array of 8 key entries (272 bytes)
    created_at: u64,               // Timestamp when vault was created
    vault_flags: u8,               // Vault-level access flags
    _reserved: [u8; 150],          // Reserved for future use
}
```

### KeyEntry (34 bytes each)

```rust
pub struct KeyEntry {
    encrypted_key_hash: [u8; 32],  // Hash of Lit Protocol ciphertext
    key_type: u8,                  // 0=Generic, 1=GitHub, 2=Helius, 3=GoogleGemini
    access_flags: u8,              // Access control flags for this key
}
```

### Vault Size Breakdown

- Discriminator: 8 bytes
- Owner: 32 bytes
- Key Count: 1 byte
- Keys Array: 8 × 34 = 272 bytes
- Created At: 8 bytes
- Vault Flags: 1 byte
- Reserved: 150 bytes
- **Total: 472 bytes**

---

## Off-Chain Structure (IndexedDB)

### Ciphertext Storage

```typescript
// IndexedDB: keyshield_ciphertext
{
  key: "ciphertext:hash_abc123...",
  value: {
    ciphertext: "U2FsdGVkX1...",        // Lit Protocol encrypted data (1-5 KB)
    dataToEncryptHash: "hash_abc123...", // 32-byte hash (Base64)
    walletPubkey: "9xyz...abc",          // Wallet that owns this key
    createdAt: 1704067200000,            // Timestamp
    metadata: {
      name: "GitHub API Key",
      domain: "github.com",
      type: "api_key"
    }
  }
}
```

---

## Data Flow

### Adding a New API Key

1. **User Input**: User enters API key in UI
2. **Encrypt with Lit**: 
   - Call `encryptWithLit(apiKey, walletAddress)`
   - Returns: `{ ciphertext, dataToEncryptHash }`
3. **Store Ciphertext Off-Chain**:
   - Save to IndexedDB: `ciphertext:<hash>` → full ciphertext + metadata
4. **Store Hash On-Chain**:
   - Call Solana program instruction: `StoreKey`
   - If vault doesn't exist: Create vault PDA (472 bytes)
   - Add key entry to vault: `{ hash, key_type, access_flags }`
5. **Update UI**:
   - Add key to local state
   - Update wallet key count

### Retrieving an API Key

1. **User Clicks Decrypt**: User requests to view API key
2. **Fetch Ciphertext**:
   - Read from IndexedDB: `ciphertext:<hash>`
3. **Decrypt with Lit**:
   - Call `decryptWithLit(ciphertext, hash, wallet)`
   - Requires wallet signature (proof of ownership)
4. **Display**: Show decrypted API key to user

### Deleting an API Key

1. **User Clicks Delete**: User removes API key
2. **Remove from Vault**:
   - Call Solana program instruction: `RemoveKey` (TODO: implement)
   - Remove key entry from vault's `keys` array
   - Decrement `key_count`
3. **Remove Ciphertext**:
   - Delete from IndexedDB: `ciphertext:<hash>`
4. **Update UI**:
   - Remove key from local state
   - Update wallet key count

---

## Storage Costs

### On-Chain (Solana)

- **Vault**: 472 bytes × 0.00000696 SOL/byte ≈ **0.0033 SOL** (~$0.33 USD)
- **Per Key**: No additional cost (keys stored in vault's array)
- **Total for 8 keys**: Still 0.0033 SOL (same vault)

### Off-Chain (IndexedDB)

- **Ciphertext**: ~1-5 KB per key
- **Storage**: Free (browser storage)
- **No blockchain fees** for off-chain storage

### Comparison

| Storage Method | Cost per Vault | Keys per Vault | Cost per Key |
|---|---|---|---|
| **KeyShield (Current)** | 0.0033 SOL | 8 | 0.0004 SOL |
| **Old Architecture** | 0.002 SOL | 1 | 0.002 SOL |
| **Savings** | - | - | **80% cheaper** |

---

## Program Instructions

### StoreKey (Create/Append)

- **Accounts**:
  - Owner (signer) - Wallet storing the key
  - Vault (writable) - PDA: `["vault", owner]`
  - System Program
- **Data**:
  - `encrypted_key_hash`: 32 bytes
  - `timestamp`: 8 bytes
  - `key_type`: 1 byte
  - `vault_bump`: 1 byte
- **Logic**:
  1. If vault doesn't exist: Create vault PDA with 0 keys
  2. Add key entry to vault's `keys` array
  3. Increment `key_count`
  4. Fail if vault is full (8 keys max)

### RemoveKey (TODO: Implement)

- **Accounts**:
  - Owner (signer)
  - Vault (writable)
- **Data**:
  - `encrypted_key_hash`: 32 bytes (to identify key)
- **Logic**:
  1. Find key in vault's `keys` array
  2. Zero out the key entry
  3. Decrement `key_count`
  4. Optionally: Reclaim rent if vault becomes empty

### AccessKey (Audit Log)

- **Accounts**:
  - Owner (signer)
  - Vault (read-only)
- **Logic**:
  - Verify owner matches vault owner
  - Log access event (for audit trail)
  - Return success

---

## Frontend Integration

### Updated Hook: `useVaults.ts`

```typescript
// OLD (Incorrect): Each API key = one "vault"
const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);

// NEW (Correct): Each API key = one entry in vault
const [apiKeys, setApiKeys] = useState<VaultItem[]>([]);
```

### Terminology Clarification

| Old Term | New Term | Meaning |
|---|---|---|
| "Vault" | "Vault PDA" | On-chain container (ONE per wallet) |
| "Vault Item" | "API Key" | Individual encrypted key entry |
| "Create Vault" | "Add Key to Vault" | Store new key (creates vault if needed) |
| "Delete Vault" | "Delete Key" | Remove key from vault |

---

## Migration Notes

### Breaking Changes

1. **Vault Structure**: Changed from 288 bytes → 472 bytes
2. **StoreKey Instruction**: Data format changed (no longer includes `zk_commit`/`mpc_hash`)
3. **Multiple Keys**: Vault now supports multiple keys (max 8)

### Migration Path

For existing deployments:

1. **Old vaults** (288 bytes) will fail discriminator check
2. **New vaults** (472 bytes) use new format
3. **Recommendation**: Redeploy program with new structure
4. **Data Migration**: Export old keys → Re-import to new vault format

---

## Future Enhancements

### Compression (Light Protocol)

- **Goal**: Reduce vault size from 472 bytes → ~14 bytes (95% savings)
- **Status**: Planned (Light Protocol integration pending)
- **Benefit**: 0.0033 SOL → 0.0001 SOL per vault

### Dynamic Arrays

- **Goal**: Support unlimited keys per vault
- **Challenge**: Solana account reallocation complexity
- **Alternative**: Multiple vaults per wallet (not recommended for UX)

### Key Sharing

- **Goal**: Share individual keys with other wallets
- **Implementation**: `ShareKey` instruction creates separate PDA
- **Status**: Already implemented in `share_key.rs`

---

## Summary

✅ **Correct Architecture**:
- ONE Wallet → ONE Vault PDA (on-chain, 472 bytes)
- ONE Vault → MULTIPLE Keys (up to 8 key entries)
- Each key stored as 34-byte entry (hash + metadata)
- Full ciphertexts stored off-chain in IndexedDB

✅ **Benefits**:
- 80% cheaper than old one-vault-per-key model
- Cleaner UX (one vault per wallet)
- Scalable (up to 8 keys per wallet)
- Rent-efficient (single account rent)

✅ **Trade-offs**:
- Limited to 8 keys per wallet (can extend in future)
- Requires redeployment for existing users

---

**Last Updated**: 2026-02-01  
**Author**: KeyShield Team
