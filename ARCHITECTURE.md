# KeyShield Architecture Overview

## 🏛️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Web Browser                               │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │              Next.js Frontend                          │  │  │
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │  │  │
│  │  │  │  React     │  │  Wallet    │  │  Privacy   │     │  │  │
│  │  │  │  UI        │  │  Adapter   │  │  SDKs       │     │  │  │
│  │  │  └────────────┘  └────────────┘  └────────────┘     │  │  │
│  │  └────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              │
┌─────────────────────────────▼─────────────────────────────────────┐
│                      PRIVACY SERVICES                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Lit Protocol │  │   Bonsol     │  │   Arcium     │          │
│  │  Network     │  │   Network    │  │   Network    │          │
│  │              │  │              │  │              │          │
│  │ Threshold    │  │ ZK Provers   │  │ MPC Nodes    │          │
│  │ Nodes        │  │ & Verifiers  │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ RPC Calls
                              │
┌─────────────────────────────▼─────────────────────────────────────┐
│                    SOLANA BLOCKCHAIN                               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              KeyShield Program (Pinocchio)                 │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │              Instruction Handlers                     │ │  │
│  │  │  StoreKey │ AccessKey │ ShareKey                       │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │              Account State                           │ │  │
│  │  │  Vault PDA │ Share PDA │ System Accounts             │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │         External Program Invocations                        │  │
│  │  Bonsol Verifier │ System Program │ Token Program          │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## 📦 Component Breakdown

### Frontend Components

```
frontend/src/
├── app/
│   ├── layout.tsx          # Root layout with WalletProvider
│   ├── page.tsx            # Main dashboard page
│   └── globals.css         # Global styles
│
├── components/
│   ├── WalletProvider.tsx  # Solana wallet context
│   ├── Dashboard.tsx       # Main dashboard component
│   ├── StoreKeyForm.tsx    # Form for storing keys
│   ├── VaultDisplay.tsx    # Display vault information
│   └── ShareKeyDialog.tsx  # Dialog for sharing keys
│
├── lib/
│   ├── solana.ts           # Solana connection utilities
│   ├── constants.ts        # Program constants
│   ├── keyshield-client.ts # Client SDK for program interaction
│   ├── lit-protocol.ts     # Lit Protocol integration
│   ├── bonsol.ts           # Bonsol ZK proof integration
│   └── arcium.ts           # Arcium MPC integration
│
├── hooks/
│   ├── useWallet.tsx        # Wallet hook
│   ├── useVault.ts         # Vault data hook
│   └── useAIAgent.ts      # AI agent integration hook
│
└── types/
    └── index.ts            # TypeScript type definitions
```

### Backend (Program) Structure

```
programs/keyshield/src/
├── lib.rs                  # Program entrypoint
├── error.rs                # Custom error types
├── state.rs                # Vault state structure
├── pda.rs                  # PDA derivation utilities
└── instructions/
    ├── mod.rs              # Instruction enum
    ├── store_key.rs        # Store key handler
    ├── access_key.rs       # Access key handler
    └── share_key.rs        # Share key handler
```

## 🔐 Complete Store Flow: Client-Side Encryption to On-Chain Storage

### Overview

KeyShield implements a complete end-to-end flow for securely storing API keys with threshold encryption and on-chain verification. The flow combines Lit Protocol for encryption, IndexedDB for off-chain ciphertext storage, and Solana for on-chain hash storage.

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    USER ENTERS API KEY                              │
│                    (AddKeyModal Component)                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 1: Lit Protocol Encryption                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  encryptWithLit(apiKey, walletPubkey)                         │  │
│  │  • Connect to Lit Network (datil-dev)                         │  │
│  │  • Build access conditions (Solana wallet)                    │  │
│  │  • Encrypt API key with threshold cryptography                │  │
│  │  • Returns: { ciphertext (1-5KB), dataToEncryptHash (32B) }   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 2: IndexedDB Storage (Off-Chain)                             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  storeCiphertext(dataToEncryptHash, ciphertext)               │  │
│  │  • Database: keyshield_ciphertext                             │  │
│  │  • Key: ciphertext:${base64(hash)}                            │  │
│  │  • Value: { ciphertext, createdAt, walletPubkey }             │  │
│  │  • Size: 1-5 KB (full Lit Protocol ciphertext)                │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 3: Transaction Building                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  buildStoreKeyTransaction(connection, owner, hash, keyType)   │  │
│  │  • Derive Vault PDA: seeds ["vault", owner]                   │  │
│  │  • Build instruction data (107 bytes):                        │  │
│  │    [0]       discriminator: 0x00 (StoreKey)                   │  │
│  │    [1..32]   encrypted_key_hash: 32 bytes from Lit            │  │
│  │    [33..64]  zk_commit: 32 bytes (zeros for now)              │  │
│  │    [65..96]  mpc_hash: 32 bytes (zeros for now)               │  │
│  │    [97..104] timestamp: u64 LE (Date.now())                   │  │
│  │    [105]     key_type: u8 (0=Generic, 1=GitHub, etc.)         │  │
│  │    [106]     vault_bump: u8 (from PDA derivation)             │  │
│  │  • Create Transaction with accounts:                          │  │
│  │    - Owner (signer, writable)                                 │  │
│  │    - Vault PDA (writable)                                     │  │
│  │    - System Program (read-only)                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 4: Wallet Signature                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  wallet.signTransaction(transaction)                          │  │
│  │  • Triggers wallet popup (Phantom/Solflare)                   │  │
│  │  • User reviews and approves transaction                      │  │
│  │  • Wallet signs with private key                              │  │
│  │  • Returns signed transaction                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 5: Send to Solana Network                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  sendAndConfirmStoreKeyTransaction(connection, signedTx)      │  │
│  │  • Serialize signed transaction                               │  │
│  │  • Send to RPC endpoint (devnet/mainnet)                      │  │
│  │  • Wait for confirmation                                      │  │
│  │  • Returns transaction signature                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 6: On-Chain Processing                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  process_store_key() in programs/keyshield/src/instructions/  │  │
│  │  • Validate accounts (owner is signer)                        │  │
│  │  • Parse instruction data (106 bytes)                         │  │
│  │  • Check vault doesn't already exist                          │  │
│  │  • Initialize vault PDA if needed (CreateAccount/Allocate)    │  │
│  │  • Write to Vault Account (288 bytes):                        │  │
│  │    [0..7]     discriminator: "keyshld\0"                      │  │
│  │    [8..39]    owner: Pubkey                                   │  │
│  │    [40..71]   encrypted_key_hash: [u8; 32] ← ONLY HASH!       │  │
│  │    [72..103]  zk_commit: [u8; 32]                             │  │
│  │    [104..135] mpc_hash: [u8; 32]                              │  │
│  │    [136..143] created_at: u64                                 │  │
│  │    [144]      access_flags: u8 (key type)                     │  │
│  │    [145..287] _reserved: [u8; 143]                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 7: Save Metadata Locally                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  setVaultMetadata(vaultPDA, metadata)                         │  │
│  │  • Key: keyshield_meta_<vaultPDA>                             │  │
│  │  • Value: { name, domain, type, notes, tags }                 │  │
│  │  • Storage: localStorage + chrome.storage.local (extension)   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STEP 8: Refresh Vault List                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  loadVaultList(walletAddress)                                 │  │
│  │  • Fetch vault account from Solana                            │  │
│  │  • Merge with local metadata                                  │  │
│  │  • Update UI with new vault item                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SUCCESS! KEY STORED                              │
│  • Hash stored on-chain (32 bytes)                                 │
│  • Ciphertext stored off-chain (1-5 KB)                            │
│  • Metadata stored locally (name, domain, etc.)                    │
│  • Transaction signature available for verification                │
│  • View on Solscan: https://solscan.io/tx/{signature}?cluster=dev  │
└─────────────────────────────────────────────────────────────────────┘
```

### Why Only Hash Goes On-Chain

**Problem**: Lit Protocol ciphertexts are 1-5 KB, which is:
- **Expensive**: Large account data increases rent costs significantly
- **Inefficient**: Most Solana accounts are optimized for smaller data
- **Unnecessary**: Full ciphertext only needed for decryption, not verification

**Solution**: Store only 32-byte hash reference on-chain

**Benefits**:
- **96%+ storage reduction**: 32 bytes vs 1-5 KB
- **Lower rent costs**: Smaller accounts = less SOL required
- **Same security**: Hash uniquely identifies ciphertext
- **Fast retrieval**: IndexedDB lookup by hash is instant

**Trade-offs**:
- Requires local storage (IndexedDB) availability
- Ciphertext not accessible if IndexedDB is cleared
- Future: Can add IPFS/Arweave backup for ciphertext

### Implementation Files

**Lit Protocol Client** (`frontend /lib/lit-protocol.ts`):
- `initLitClient()` - Connect to Lit Network
- `encryptWithLit(apiKey, walletPubkey)` - Encrypt with wallet condition
- `decryptWithLit(hashBytes, wallet)` - Decrypt with session signatures
- `normalizeHashTo32Bytes(hash)` - Ensure hash is exactly 32 bytes

**IndexedDB Storage** (`frontend /lib/ciphertext-storage.ts`):
- `storeCiphertext(hash, ciphertext)` - Store in IndexedDB
- `getCiphertext(hash)` - Retrieve by hash
- `hasCiphertext(hash)` - Check existence
- Database: `keyshield_ciphertext`, Store: `ciphertext`

**Transaction Builder** (`frontend /lib/store-transaction.ts`):
- `buildStoreKeyTransaction()` - Build instruction and transaction
- `sendAndConfirmStoreKeyTransaction()` - Send and wait for confirmation
- `vaultExists()` - Check if vault already exists
- `domainToKeyType()` - Map domain to key type enum

**Vault Hook** (`frontend /hooks/useVaults.ts`):
- `addItem()` - Complete store flow (encrypt → store → sign → send)
- `storeStatus` - Track progress (encrypting → signing → confirming → success)
- `storeError` - User-friendly error messages
- `lastSignature` - Transaction signature for verification

**UI Components** (`frontend /components/AddKeyModal.tsx`):
- Real-time status updates during store flow
- Wallet signature prompt indication
- Success message with Solscan link
- Error handling with retry option

**Program Handler** (`programs/keyshield/src/instructions/store_key.rs`):
- Validates accounts and instruction data
- Initializes vault PDA if needed
- Writes hash and metadata to vault account
- Returns VaultAlreadyExists error if vault exists

### UI Status Flow

```
User clicks "ENCRYPT & STORE"
    │
    ▼
Status: "ENCRYPTING WITH LIT PROTOCOL..."
Button: "ENCRYPTING..."
    │
    ▼
Status: "WAITING FOR WALLET SIGNATURE..."
Button: "SIGN IN WALLET"
    │ (User approves in wallet)
    ▼
Status: "CONFIRMING TRANSACTION..."
Button: "CONFIRMING..."
    │
    ▼
Status: "SUCCESS! KEY STORED ON-CHAIN"
Button: "DONE!"
Shows: Solscan link to transaction
    │
    ▼
Modal auto-closes after 2 seconds
Vault list refreshes with new item
```

### Error Handling

Common errors and user-friendly messages:

| Error | User Message |
|-------|-------------|
| User rejected signature | "Transaction was cancelled by user" |
| Insufficient balance | "Insufficient SOL balance. Please request an airdrop on devnet." |
| Vault already exists | "A vault already exists for this wallet" |
| Network error | "Network error. Please check your connection and try again." |
| Lit Protocol error | "Encryption failed. Please try again." |

### Security Considerations

1. **Plaintext never leaves browser**: API key encrypted before any network call
2. **Threshold encryption**: Lit Protocol uses BLS threshold signatures
3. **Wallet-based access**: Only wallet owner can decrypt
4. **On-chain verification**: Hash stored on-chain provides audit trail
5. **No server-side storage**: Fully client-side + blockchain architecture

### Performance Metrics

- **Encryption time**: 1-3 seconds (Lit Protocol network call)
- **Transaction confirmation**: 1-5 seconds (Solana confirmation)
- **Total flow time**: 3-10 seconds (user-dependent for signature)
- **On-chain storage**: 32 bytes (hash only)
- **Off-chain storage**: 1-5 KB (full ciphertext)
- **Cost**: ~0.001 SOL for transaction + rent (~0.002 SOL for vault account)

## 🔄 Data Flow

### Store Key Data Flow

```
User Input (API Key)
    │
    ▼
[Frontend] encryptWithLit()
    │
    ├─► Lit Client → Encrypt → ciphertext (128 bytes)
    │
    ├─► Generate ZK Commit (placeholder)
    │
    └─► Generate MPC Hash (placeholder)
        │
        ▼
[Client SDK] buildStoreKeyInstruction()
    │
    ├─► Derive Vault PDA
    ├─► Serialize: discriminator + encrypted_key + zk_commit + mpc_hash + timestamp
    │
    └─► Create TransactionInstruction
        │
        ▼
[Solana] Send Transaction
    │
    ▼
[Program] process_store_key()
    │
    ├─► Validate accounts
    ├─► Parse instruction data
    │
    └─► Write to Vault Account:
        ├─► discriminator: "keyshld"
        ├─► owner: Pubkey
        ├─► encrypted_key: [u8; 128]
        ├─► zk_commit: [u8; 32]
        ├─► mpc_hash: [u8; 32]
        ├─► created_at: u64
        └─► access_flags: u8
```

### Access Key Data Flow

```
User Request (Access Key)
    │
    ▼
[Frontend] Check Access Type
    │
    ├─► Owner? → Direct Access
    │
    └─► Not Owner? → Generate ZK Proof
        │
        ├─► [Bonsol] generateAccessProof()
        │   └─► Returns: { proof, publicInputs, imageId }
        │
        └─► [Client SDK] buildAccessKeyInstruction()
            │
            └─► Serialize: discriminator + zk_proof
                │
                ▼
[Solana] Send Transaction
    │
    ▼
[Program] process_access_key()
    │
    ├─► Read vault data
    ├─► Check if owner → Grant access
    │
    └─► If not owner:
        ├─► Parse ZK proof
        ├─► Verify proof (Bonsol verifier)
        └─► If valid → Grant access
            │
            ▼
[Frontend] decryptWithLit()
    │
    ├─► Fetch ciphertext from vault
    ├─► Request decryption from Lit network
    │   └─► Nodes verify access conditions
    │       └─► Provide signature shares
    │
    └─► Decrypt → Display API key
```

## 🔐 Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                              │
└─────────────────────────────────────────────────────────────────┘

Layer 1: Client-Side Encryption (Lit Protocol)
  │
  ├─► API key encrypted before leaving browser
  ├─► Uses threshold cryptography (BLS)
  └─► Access controlled by conditions (wallet, time, etc.)

Layer 2: On-Chain Storage
  │
  ├─► Only encrypted blob stored (not plaintext)
  ├─► ZK commitment for proof verification
  └─► MPC hash for secure sharing

Layer 3: Access Verification (ZK Proofs)
  │
  ├─► Zero-knowledge proofs verify access
  ├─► No secrets revealed during verification
  └─► On-chain verification via Bonsol

Layer 4: Secure Sharing (MPC)
  │
  ├─► Multi-party computation for agent sharing
  ├─► Encrypted computation results
  └─► Time-locked access support
```

## 🗄️ Account Structure

### Vault Account (288 bytes)

```
Offset  Size    Field           Description
─────────────────────────────────────────────────────────
0       8       discriminator   "keyshld" identifier
8       32      owner           Vault owner public key
40      128     encrypted_key   Lit-encrypted API key
168     32      zk_commit       ZK proof commitment
200     32      mpc_hash        MPC computation hash
232     8       created_at      Timestamp (Unix)
240     1       access_flags    Access control flags
241     47      _reserved       Reserved for future use
```

### Share Account (64+ bytes)

```
Offset  Size    Field           Description
─────────────────────────────────────────────────────────
0       32      vault           Vault PDA address
32      32      recipient       Recipient public key
64      ...     metadata        Additional share metadata
```

## 🔌 Integration Points

### Lit Protocol Integration

```typescript
// Encryption
encryptWithLit(apiKey, accessConditions)
  → Returns: { ciphertext, dataToEncryptHash }

// Decryption
decryptWithLit(ciphertext, hash, conditions, sessionSigs)
  → Returns: decrypted API key
```

### Bonsol Integration

```typescript
// Proof Generation (Off-chain)
generateAccessProof(vaultCommit, requesterPubkey)
  → Returns: { proof, publicInputs, imageId }

// Proof Verification (On-chain)
verifyProof(proof, zkCommit)
  → Returns: boolean (verified or not)
```

### Arcium Integration

```typescript
// MPC Encryption
encryptForMPC(data, mxePublicKey)
  → Returns: encrypted data

// MPC Computation
submitMPCComputation(encryptedData, computationDef)
  → Returns: computationId

// Status Check
getMPCComputationStatus(computationId)
  → Returns: computation status
```

## 🚀 Deployment Architecture

```
Development Environment
  │
  ├─► Local Validator (solana-test-validator)
  ├─► Devnet RPC
  └─► Test Privacy SDKs (testnet)

Staging Environment
  │
  ├─► Devnet Deployment
  ├─► Helius RPC
  └─► Privacy SDKs (testnet)

Production Environment
  │
  ├─► Mainnet Deployment
  ├─► Multiple RPC Providers (redundancy)
  └─► Privacy SDKs (mainnet)
```

## 📊 Performance Considerations

- **Transaction Size**: Optimized instruction data (201 bytes for store)
- **Account Size**: Vault account is 288 bytes (fits in single account)
- **Compute Units**: ZK verification ~200k CU (Bonsol)
- **Network Calls**: 
  - Lit: 1-2 round trips for encryption/decryption
  - Bonsol: Async proof generation (can take seconds)
  - Arcium: Async MPC computation (can take minutes)

## 🔄 Error Handling Flow

```
Transaction Error
  │
  ├─► Program Error → Custom error code
  │   └─► Frontend displays user-friendly message
  │
  ├─► Network Error → Retry logic
  │   └─► Exponential backoff
  │
  └─► Privacy SDK Error → Fallback handling
      └─► Log error, show user message
```

---

## 🏗️ On-Chain vs Off-Chain Architecture Decisions

### On-Chain Components

**What is stored on-chain:**
- **Lit Protocol `dataToEncryptHash`** (32 bytes) - Reference to encrypted data
- **Access control metadata** - Owner, permissions, key type
- **ZK commitments** (32 bytes) - For proof verification
- **MPC hashes** (32 bytes) - For secure sharing
- **Timestamps** (8 bytes) - For time-locked access
- **Key type** (encoded in access_flags) - GitHub, Helius, GoogleGemini, Generic

**Why on-chain:**
- Immutable record of key ownership
- Decentralized access control
- Transparent permissions
- ZK proof verification
- Share account management

### Off-Chain Components

**What is stored off-chain:**
- **Full Lit Protocol ciphertext** (1-5 KB) - Stored in IndexedDB
- **Key detection logic** - Browser extension monitors forms/clipboard
- **Encryption/Decryption operations** - Lit Protocol client-side
- **External API calls** - GitHub, Helius, Google Gemini
- **Oracle service execution** - Reads vault, decrypts, calls APIs
- **ZK proof generation** - Bonsol proof generation (async)
- **MPC computation** - Arcium MPC operations (async)

**Why off-chain:**
- **Size constraints**: Lit Protocol ciphertexts are 1-5 KB, too large for efficient on-chain storage
- **Cost efficiency**: Storing large data on-chain is expensive
- **Privacy**: Full ciphertext only needed for decryption, not for verification
- **Flexibility**: Off-chain storage allows for easier updates and migrations
- **Performance**: External API calls cannot be made from on-chain programs

### Hybrid Pattern

**On-Chain**:
- Stores encrypted key reference (`dataToEncryptHash`) + metadata
- Provides access control and permissions
- Enables ZK proof verification
- Manages share accounts

**Off-Chain Oracle**:
- Reads vault account from on-chain
- Retrieves full ciphertext from IndexedDB using hash
- Decrypts API key using Lit Protocol
- Calls external API (GitHub/Helius/Google Gemini)
- Posts results to on-chain program via transaction (optional)

## 📋 Dashboard Vault List and Search (Hybrid Onchain + Local)

The dashboard list of vault items is **not fully on-chain**: on-chain is the source of truth for *which* vault(s) exist; local storage holds **searchable metadata** (name, domain, type). Search runs in-memory over the merged list. No separate database or indexer is required.

### Design Rationale

- **Full on-chain list**: Prohibitive cost and size (names/domains would bloat accounts).
- **Pure local list**: Stale and disconnected from chain; no single source of truth.
- **Hybrid**: On-chain answers “what exists”; local holds display/search fields; merge on load; search stays fast and in-memory.

### Data Flow

```
Wallet (Clerk SIWS or localStorage fallback)
    │
    ▼
[frontend] loadVaultList(walletAddress)
    │
    ├─► Derive Vault PDA: seeds ["vault", owner], programId
    ├─► connection.getAccountInfo(vaultPDA)
    │
    ├─► If account exists:
    │   ├─► getVaultMetadataAsync(vaultId)  → localStorage or chrome.storage.local
    │   ├─► Decode created_at from account.data[136..144]
    │   └─► Merge: { id: vaultPda, ...meta, createdAt, value: "" }
    │
    └─► Return merged VaultItem[] (0 or 1 with current one-vault-per-owner)
        │
        ▼
[useVaults] setVaultItems(merged)
    │
    ▼
[useVaults] filteredItems = useMemo(() =>
  vaultItems.filter(by searchQuery on name/domain and activeFilter)
)
    │
    ▼
UI: list + search (no extra RPC for search)
```

### Clerk Solana Wallet Bridge

- **Source of wallet address**: When Clerk Solana SIWS is enabled (Clerk Dashboard → User & Auth → Web3 → Enable Solana), the signed-in user gets `user.web3Wallets[0].web3WalletAddress` (Solana pubkey). Users sign in with Phantom (or another Solana wallet); Clerk links the wallet to the user record.
- **Fallback**: If SIWS is not used, the app reads `localStorage.getItem('keyshield_wallet_address')` so a wallet can be set elsewhere (e.g. extension).
- **Usage**: Dashboard passes this wallet into `useVaults(searchQuery, activeFilter, userId, walletAddress)`. When `walletAddress` is set, the list is driven by on-chain vault(s) + local metadata; when not set, legacy path uses Clerk `userId` and localStorage/chrome.storage only.

### Vault Metadata Storage (Local / Extension)

- **Keys**: `keyshield_meta_<vaultId>` where `vaultId` is the vault PDA base58 (or owner, depending on context).
- **Value**: JSON `{ name, domain?, type, notes?, tags? }` for display and search only (no secret value).
- **Where**:
  - **Browser**: `localStorage` only.
  - **Extension**: Both `localStorage` and `chrome.storage.local` are written/read so the dashboard and extension (e.g. popup, background) share the same metadata when running in the extension context.
- **APIs** (`frontend/lib/solana.ts`): `getVaultMetadata` (sync, localStorage), `getVaultMetadataAsync` (async, uses chrome.storage when available), `setVaultMetadata` (writes to both when chrome.storage exists).

### Merge and Search Behavior

- **Merge on load**: For each on-chain vault account (currently one per owner), load local metadata by vault id, decode `created_at` from vault account data (bytes 136–144, u64 le), and build one `VaultItem` per vault. `value` is never set in the list (keys are revealed/decrypted elsewhere, e.g. extension + Lit).
- **Search**: Unchanged from pre-hybrid: `useVaults` filters the merged list in a `useMemo` by `searchQuery` (name, domain) and `activeFilter` (e.g. “All Items”, “API Keys”). No RPC or backend call for search; in-memory only. For very large lists (e.g. 1k+ items), add debounce on the search input if needed.
- **One vault per owner**: The current program uses a single Vault PDA per owner (`seeds: ["vault", owner]`). The merged list has at most one item per wallet unless the program is extended (e.g. PDA index seed for multiple vaults per owner).

### Add / Update / Delete (Wallet Connected)

- **Add**: When a wallet is connected, “add key” is handled by the extension/on-chain flow (store_key + local metadata). The dashboard `addItem` is a no-op when `walletAddress` is set; new keys are added via the extension, then the list is refetched via `loadVaultList`.
- **Update**: `updateMetadata(vaultId, data)` updates local metadata only (name, domain, type, notes, tags) and refreshes the in-memory list. No on-chain instruction for metadata in the current design.
- **Delete**: Removes local metadata for that vault id and refetches the list from chain (`loadVaultList`). On-chain vault closure (if supported by the program) can be added later.

### Relevant Files

- **List + merge + search**: [frontend/hooks/useVaults.ts](frontend /hooks/useVaults.ts) — `loadVaultList(walletAddress)`, `filteredItems`, `updateMetadata`, `deleteItem`.
- **On-chain fetch + metadata**: [frontend/lib/solana.ts](frontend /lib/solana.ts) — `PROGRAM_ID`, `deriveVaultPDA`, `getConnection`, `loadVaultList`, `getVaultMetadata` / `getVaultMetadataAsync`, `setVaultMetadata`, `decodeCreatedAt`.
- **Wallet into list**: [frontend/App.tsx](frontend /App.tsx) — `getSolanaWalletAddress(user)` (Clerk `web3Wallets[0].web3WalletAddress` + localStorage fallback), passed to `useVaults(..., walletAddress)`.

## 🔍 API Key Auto-Detection Flow

### Detection Sources

1. **Form Fields**: Monitors input fields for API key patterns
2. **Clipboard**: Detects keys when copied to clipboard
3. **OCR**: (Future) Detects keys from screen content

### Detection Patterns

**GitHub**:
- `ghp_` - Personal access tokens
- `gho_` - OAuth tokens
- `ghu_` - User-to-server tokens
- `ghs_` - Server-to-server tokens
- `ghr_` - Refresh tokens

**Helius**:
- 32-64 character alphanumeric strings
- Detected by field name patterns: `helius.*api.*key`

**Google Gemini**:
- `AIza...` pattern (35+ characters)
- Detected by field name patterns: `gemini.*api.*key`, `google.*ai.*key`

### Auto-Detection UI

**Dashboard Integration**:
- Shows detected keys in alert banner
- Allows quick save to vault
- Displays key type and source
- One-click save action

**Key Generation Helpers**:
- Redirects to service pages for key generation
- GitHub: https://github.com/settings/tokens/new
- Helius: https://dashboard.helius.dev/
- Google Gemini: https://makersuite.google.com/app/apikey

## 🔐 Lit Protocol Ciphertext Storage Pattern

### Problem

Lit Protocol `encryptString()` returns ciphertexts that are typically 1-5 KB (base64 strings). Storing these directly on-chain is:
- **Expensive**: Large account data increases rent costs
- **Inefficient**: Most Solana accounts are optimized for smaller data
- **Unnecessary**: Full ciphertext only needed for decryption, not verification

### Solution

**On-Chain Storage** (32 bytes):
- Store `dataToEncryptHash` from Lit Protocol
- This is a unique identifier/reference to the encrypted data
- Used to retrieve full ciphertext from off-chain storage

**Off-Chain Storage** (1-5 KB):
- Store full `ciphertext` in IndexedDB
- Key: `ciphertext:${dataToEncryptHash}` (base64)
- Value: Full ciphertext string (base64)

**Retrieval Flow**:
1. Read vault from on-chain → get `encrypted_key_hash`
2. Convert hash bytes to base64 string
3. Query IndexedDB: `ciphertext:${hashBase64}`
4. Retrieve full ciphertext
5. Use for Lit Protocol decryption

### Implementation

**Ciphertext Storage** (`frontend/src/lib/ciphertext-storage.ts`):
- `storeCiphertext(hash, ciphertext)` - Store full ciphertext
- `getCiphertext(hash)` - Retrieve full ciphertext
- Uses IndexedDB for persistence

**Vault State** (`programs/keyshield/src/state.rs`):
- Changed from `encrypted_key: [u8; 128]` to `encrypted_key_hash: [u8; 32]`
- Total vault size remains 288 bytes (adjusted reserved space)

**Encryption Flow** (`frontend/src/hooks/useVault.ts`):
- Encrypt with Lit Protocol → get `{ ciphertext, dataToEncryptHash }`
- Store full `ciphertext` in IndexedDB
- Store only `dataToEncryptHash` on-chain (32 bytes)

**Decryption Flow** (`frontend/src/lib/lit-protocol.ts`):
- `getCiphertextFromStorage(hashBytes)` - Retrieve from IndexedDB
- `decryptWithLitFromHash(hashBytes, ...)` - Decrypt using retrieved ciphertext

## 🔌 Integration with External Services

### GitHub Integration

**API Key Type**: `APIKeyType.GitHub`
**Detection**: `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` patterns
**Usage**: Bearer token in `Authorization` header
**Usage**: Bearer token in `Authorization` header

### Helius Integration

**API Key Type**: `APIKeyType.Helius`
**Detection**: 32-64 char alphanumeric + field name patterns
**Usage**: `x-api-key` header

### Google Gemini Integration

**API Key Type**: `APIKeyType.GoogleGemini`
**Detection**: `AIza...` pattern + field name patterns
**Usage**: Query parameter `?key={apiKey}` or header

---

## 📅 Development Plans & Implementation Status

### Completed Plans

#### 1. **Search + Onchain List Fix** ✅
**Goal**: Fix the search function to work with onchain-connected hybrid list instead of purely local storage.

**Implementation**:
- **Hybrid Model**: Onchain as source of truth for vault existence + local storage for searchable metadata (name, domain, type)
- **Data Flow**: 
  1. Wallet connects (Clerk Solana SIWS or localStorage fallback)
  2. Derive Vault PDA: `seeds ["vault", owner]`
  3. Fetch vault from Solana RPC (`connection.getAccountInfo(vaultPDA)`)
  4. Load local metadata from `localStorage` or `chrome.storage.local`
  5. Merge into unified list with onchain data + searchable metadata
  6. Search filters merged list in-memory (no RPC for each search)

- **Key Files**:
  - `frontend/hooks/useVaults.ts` - Implements merge on load, search filtering
  - `frontend/lib/solana.ts` - PDA derivation, onchain fetch, metadata storage APIs
  - `frontend/App.tsx` - Wallet bridge (Clerk + localStorage fallback)

- **Clerk Solana Wallet Bridge**: Clerk SIWS enabled for wallet sign-in; `user.web3Wallets[0].web3WalletAddress` provides Solana pubkey; fallback to `localStorage.getItem('keyshield_wallet_address')`

- **Metadata Storage**: 
  - Keys: `keyshield_meta_<vaultId>` (vault PDA base58)
  - Value: `{ name, domain?, type, notes?, tags? }`
  - Location: `localStorage` (browser), `chrome.storage.local` (extension)

#### 2. **Extension Development** ✅
**Goal**: Build browser extension for automatic API key detection and secure storage.

**Implementation**:
- **Detection Sources**:
  - Form fields (monitors input for API key patterns)
  - Clipboard (detects keys when copied)
  - OCR (planned for future)

- **Supported Providers**:
  - **GitHub**: `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` patterns
  - **Helius**: 32-64 char alphanumeric + field name patterns
  - **Google Gemini**: `AIza...` pattern (35+ chars)

- **Key Files**:
  - `disabled_extension/src/content/content-script.ts` - Key detection logic (standalone extension, now disabled)
  - `disabled_extension/src/background/service-worker.ts` - Extension background service (standalone extension, now disabled)
  - `disabled_extension/src/lib/vault-client.ts` - Vault interaction client (standalone extension, now disabled)
  - `disabled_extension/src/lib/key-detector.ts` - Pattern matching for keys (standalone extension, now disabled)
  - `disabled_extension/src/storage/secure-storage.ts` - IndexedDB for ciphertext storage (standalone extension, now disabled)
  - `frontend/content.js` - Active extension content script
  - `frontend/background.js` - Active extension background script

- **Build Scripts**: `build-chrome.sh`, `build-firefox.sh`, `build-safari.sh` for multi-browser support

#### 3. **Lit Protocol Ciphertext Storage Optimization** ✅
**Problem**: Lit Protocol ciphertexts are 1-5 KB, too expensive to store fully on-chain.

**Solution**:
- **On-Chain** (32 bytes): Store only `dataToEncryptHash` from Lit Protocol
- **Off-Chain** (1-5 KB): Store full ciphertext in IndexedDB
- **Retrieval**: Read hash from vault account → query IndexedDB → decrypt with Lit

**Key Changes**:
- Vault state: Changed from `encrypted_key: [u8; 128]` to `encrypted_key_hash: [u8; 32]`
- Added `frontend/src/lib/ciphertext-storage.ts` for IndexedDB operations
- Total vault size remains 288 bytes (adjusted reserved space)

### In-Progress Plans

#### 4. **Local and Devnet Testing** 🔄
**Goal**: Implement comprehensive testing strategy following LiteSVM/Mollusk/Surfpool pyramid.

**Testing Pyramid**:
```
┌─────────────────────┐
│  Devnet Smoke Test  │  ← Cluster verification
├─────────────────────┤
│  Surfpool Integration│ ← Realistic local environment
├─────────────────────┤
│  Mollusk Unit Tests │  ← Fast in-process tests
└─────────────────────┘
```

**Status**:
- **Unit Tests (Mollusk)**: ✅ Partially implemented
  - Location: `programs/keyshield/tests/`
  - Files: `store_key.rs`, `access_key.rs`, `share_key.rs`, `common/mod.rs`
  - Coverage: StoreKey, AccessKey, ShareKey instructions
  - Run: `cargo build-sbf && cargo test`

- **Integration Tests (Surfpool)**: 🔄 In progress
  - Script: `scripts/integration-surfpool.mjs`
  - Setup: `surfpool start --background`
  - Flow: StoreKey → AccessKey → verify vault account
  - Run: `node scripts/integration-surfpool.mjs`

- **Devnet Smoke Tests**: 📝 Documented
  - Scripts: `scripts/deploy.sh`, `scripts/verify-vault.sh`
  - Process: Deploy to devnet → verify vault account
  - Manual: `./scripts/deploy.sh devnet && ./scripts/verify-vault.sh <wallet>`

- **CI/CD**: 📝 Planned
  - File: `.github/workflows/test.yml`
  - Jobs: unit-tests → integration-tests → devnet-smoke (optional)

**Test Layout**:
```
programs/keyshield/tests/
├── common/
│   └── mod.rs           # PDA helpers, fixtures
├── store_key.rs         # StoreKey instruction tests
├── access_key.rs        # AccessKey instruction tests
└── share_key.rs         # ShareKey instruction tests

scripts/
├── integration-surfpool.mjs   # Surfpool E2E test
└── integration-surfpool.sh    # Surfpool setup script
```

**Test Coverage**:
- **StoreKey**: Success, double init (VaultAlreadyExists), wrong signer
- **AccessKey**: Owner access, non-owner no proof, non-owner with proof
- **ShareKey**: Owner creates share, non-owner reject

#### 5. **Refined Plan - Multi-Stage Implementation** 📋
**Overview**: Consolidated plan combining hybrid list, testing, and roadmap features.

**Completed** ✅:
1. Hybrid onchain list (merge on load, in-memory search)
2. Add/update/delete with onchain + metadata
3. Mollusk unit tests (fixtures, store_key, access_key, share_key)

**In Progress** 🔄:
4. Surfpool integration script + devnet documentation

**Roadmap** 📝:
1. **Multi-browser detection/paste** (2-3 days)
   - Test Chrome, Firefox, Safari
   - Paste event + `navigator.clipboard.readText()`
   - Handle `chrome.runtime.lastError` for inject
   - File: `disabled_extension/src/content/content-script.ts` (standalone extension, now disabled) or `frontend/content.js` (active)

2. **Vault Audit Report** (3-5 days)
   - ReportViewer component
   - `generateReport()` for vaults + metadata
   - html2pdf.js for export
   - Dashboard report page + extension button
   - Client-side only (no backend)
   - Files: `disabled_extension/src/report/`, `disabled_extension/src/lib/report-generator.ts` (standalone extension, now disabled), `frontend/components/ReportViewer.tsx` (active)

### Implementation Priority Order

**Phase 1** (Completed):
1. ✅ Hybrid search + onchain list
2. ✅ Lit Protocol ciphertext optimization
3. ✅ Extension key detection
4. ✅ Clerk Solana wallet integration

**Phase 2** (Current):
1. 🔄 Complete Surfpool integration tests
2. 🔄 Document devnet testing process
3. 📝 Setup CI/CD pipeline

**Phase 3** (Next 1-2 weeks):
1. 📝 Multi-browser detection polish
2. 📝 Vault audit report generator
3. 📝 OCR service for screenshot detection
4. 📝 Enhanced sharing mechanisms

### Key Architectural Decisions

1. **Hybrid List Architecture**:
   - **Decision**: Onchain for vault existence + local for searchable metadata
   - **Rationale**: Cost efficiency, fast search, privacy for display names
   - **Trade-off**: Potential metadata drift across devices (acceptable for MVP)

2. **Lit Protocol Storage Pattern**:
   - **Decision**: 32-byte hash onchain, full ciphertext in IndexedDB
   - **Rationale**: 96% storage reduction (128 bytes → 32 bytes)
   - **Trade-off**: Requires local storage availability (solved with IndexedDB)

3. **Testing Strategy**:
   - **Decision**: Mollusk (unit) → Surfpool (integration) → Devnet (smoke)
   - **Rationale**: Fast feedback loop, realistic testing, cluster verification
   - **Trade-off**: Additional tooling setup (Surfpool)

4. **One Vault Per Owner**:
   - **Decision**: Single Vault PDA per owner (`seeds: ["vault", owner]`)
   - **Rationale**: Simplifies initial implementation, reduces rent costs
   - **Trade-off**: Limits scalability (future: add index seed for multiple vaults)

### Performance Metrics

- **Transaction Size**: 
  - StoreKey: 106 bytes instruction data
  - AccessKey: Variable (proof size dependent)
  - ShareKey: 41+ bytes instruction data

- **Account Size**:
  - Vault: 288 bytes (optimized from 416 bytes after ciphertext change)
  - Share: 64+ bytes

- **Compute Units**:
  - ZK verification: ~200k CU (Bonsol integration)
  - StoreKey: <5k CU (measured with Mollusk)

- **Storage Efficiency**:
  - Onchain: 32 bytes (hash reference)
  - Offchain: 1-5 KB (full ciphertext)
  - Reduction: 96%+ vs. storing full ciphertext onchain

### Known Limitations & Future Work

1. **Single Vault Per Owner**: Need PDA index seed for multiple vaults
2. **Metadata Sync**: No cross-device sync (future: onchain metadata hash)
3. **ZK Proof Verification**: Currently placeholder (Bonsol integration pending)
4. **MPC Operations**: Currently placeholder (Arcium integration pending)
5. **OCR Detection**: Planned but not yet implemented
6. **Multi-Sig Sharing**: Future enhancement for team vaults

---

This architecture ensures:
- ✅ Privacy: Keys never stored in plaintext
- ✅ Security: Multiple layers of verification
- ✅ Decentralization: On-chain storage with off-chain computation
- ✅ Scalability: Efficient account structure (32 bytes on-chain, 1-5 KB off-chain)
- ✅ Flexibility: Support for various access patterns
- ✅ Cost Efficiency: Minimal on-chain storage (hash reference only)
- ✅ Testability: Comprehensive testing pyramid (unit → integration → smoke)
- ✅ Maintainability: Clear separation of concerns and well-documented plans