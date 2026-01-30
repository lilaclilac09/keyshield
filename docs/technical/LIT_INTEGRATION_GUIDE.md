# Lit Protocol Integration Guide

**Conditional Encryption and Decryption for KeyShield**

This guide covers how KeyShield uses Lit Protocol for threshold encryption with wallet and time-lock conditions, and how ciphertext is stored off-chain with only a hash on-chain.

---

## 1. Why Lit Protocol

- **Threshold crypto**: Decrypt only if N/M Lit nodes agree that conditions are met (no single point of failure).
- **Conditions**: Wallet address, time-lock, NFT/token ownership, on-chain state.
- **Use case**: API key decryptable only by owner wallet and (optionally) after a 48hr time-lock.

**vs local AES**: Local encryption cannot enforce “decrypt only when wallet X signs” or “after time T” without a trusted server. Lit provides this via a decentralized network.

---

## 2. On-Chain vs Off-Chain Storage

| Storage | Content | Size | Location |
|---------|---------|------|----------|
| **On-chain** | `dataToEncryptHash` (reference) | 32 bytes | Solana Vault account |
| **Off-chain** | Full Lit ciphertext | 1–5 KB | IndexedDB |

**Flow**:
1. Encrypt with Lit → get `ciphertext` + `dataToEncryptHash`.
2. Store `ciphertext` in IndexedDB keyed by hash (e.g. `ciphertext:${hashBase64}`).
3. Store only `dataToEncryptHash` in the Vault account on Solana.
4. On decrypt: read hash from vault → fetch ciphertext from IndexedDB → Lit decrypt with session signatures.

---

## 3. Install

```bash
npm i @lit-protocol/lit-node-client
# or
npm i lit-js-sdk
```

Use the SDK version that matches your frontend (see [ARCHITECTURE.md](../../ARCHITECTURE.md) for Lit v4).

---

## 4. Encryption with Conditions (Conceptual)

```typescript
// frontend/lib/lit-protocol.ts (conceptual)
import * as LitJsSdk from '@lit-protocol/lit-node-client';

export async function encryptWithLitAndConditions(
  apiKey: string,
  walletPubkey: string,
  timeLockSeconds?: number
) {
  const litNodeClient = new LitJsSdk.LitNodeClient({ litNetwork: 'datil' });
  await litNodeClient.connect();

  // Condition 1: Wallet must match
  const walletCondition = {
    conditionType: 'solanaWallet',
    chain: 'solana',
    returnValueTest: { comparator: '=', value: walletPubkey },
  };

  // Condition 2: Time-lock (optional)
  const conditions = timeLockSeconds
    ? [
        walletCondition,
        {
          conditionType: 'time',
          chain: 'solana',
          returnValueTest: {
            comparator: '>',
            value: Date.now() + timeLockSeconds * 1000,
          },
        },
      ]
    : [walletCondition];

  const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString({
    dataToEncrypt: apiKey,
    accessControlConditions: conditions,
  });

  // Store full ciphertext in IndexedDB (existing ciphertext-storage layer)
  await storeCiphertext(dataToEncryptHash, ciphertext);

  // Return hash (32 bytes) for on-chain storage
  return { hashForOnchain: dataToEncryptHash, ciphertext };
}
```

---

## 5. Decryption (Conceptual)

```typescript
export async function decryptWithLit(hashBytes: Uint8Array, wallet: any) {
  // 1. Retrieve full ciphertext from IndexedDB
  const ciphertext = await getCiphertext(hashBytes);
  if (!ciphertext) throw new Error('Ciphertext not found for hash');

  const litNodeClient = new LitJsSdk.LitNodeClient({ litNetwork: 'datil' });
  await litNodeClient.connect();

  // 2. Wallet signs message to prove ownership (session signatures)
  const sessionSigs = await litNodeClient.getSessionSigs({
    chain: 'solana',
    walletAddress: wallet.publicKey.toString(),
    signMessage: (msg: Uint8Array) => wallet.signMessage(msg),
  });

  // 3. Lit network verifies conditions; if met, returns decrypted string
  const decrypted = await LitJsSdk.decryptString({ ciphertext, sessionSigs });
  return decrypted;
}
```

---

## 6. IndexedDB Helpers (Conceptual)

```typescript
// frontend/lib/ciphertext-storage.ts (conceptual)
const DB_NAME = 'keyshield_ciphertext';
const STORE_NAME = 'ciphertext';

export async function storeCiphertext(
  hash: Uint8Array | string,
  ciphertext: string
): Promise<void> {
  const key =
    typeof hash === 'string'
      ? hash
      : btoa(String.fromCharCode(...hash));
  const idb = await openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
  await idb.put(STORE_NAME, ciphertext, `ciphertext:${key}`);
  idb.close();
}

export async function getCiphertext(
  hashBytes: Uint8Array
): Promise<string | null> {
  const key = btoa(String.fromCharCode(...hashBytes));
  const idb = await openDB(DB_NAME, 1);
  const value = await idb.get(STORE_NAME, `ciphertext:${key}`);
  idb.close();
  return value ?? null;
}
```

(Use your actual DB library, e.g. `idb`, and align key format with your codebase.)

---

## 7. On-Chain Vault Layout

Vault account stores only the hash ([programs/keyshield/src/state.rs](../../programs/keyshield/src/state.rs)):

```rust
// Relevant fields
pub struct Vault {
    pub discriminator: [u8; 8],   // "keyshld"
    pub owner: Pubkey,
    pub encrypted_key_hash: [u8; 32],  // dataToEncryptHash from Lit
    pub zk_commit: [u8; 32],
    pub mpc_hash: [u8; 32],
    pub created_at: u64,
    pub access_flags: u8,
    // ...
}
```

Client builds StoreKey instruction with the 32-byte hash; full ciphertext never touches the chain.

---

## 8. Condition Types (Reference)

- **Wallet**: `solanaWallet` with `returnValueTest: { comparator: '=', value: walletPubkey }`.
- **Time**: `time` with `returnValueTest: { comparator: '>', value: timestampMs }`.
- **NFT/Token**: Lit supports token/NFT ownership conditions; can be added for “only if user holds token X”.

---

## 9. Error Handling

- **Ciphertext not found**: Ensure IndexedDB was written after encrypt and that you use the same hash (e.g. same base64/bytes) when reading.
- **Conditions not met**: Lit will not return decryption; check wallet and time-lock.
- **Network**: Lit requires network; handle offline/retry in UI.

---

## 10. Related Files

| File | Role |
|------|------|
| `frontend/lib/solana.ts` | Vault PDA, metadata, `loadVaultList` |
| `programs/keyshield/src/state.rs` | Vault layout, `encrypted_key_hash` |
| `ARCHITECTURE.md` | Lit ciphertext storage pattern, data flow |

---

*KeyShield uses Lit Protocol for threshold encryption; only a 32-byte hash is stored on-chain.*
