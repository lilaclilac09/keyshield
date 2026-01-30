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

This architecture ensures:
- ✅ Privacy: Keys never stored in plaintext
- ✅ Security: Multiple layers of verification
- ✅ Decentralization: On-chain storage with off-chain computation
- ✅ Scalability: Efficient account structure (32 bytes on-chain, 1-5 KB off-chain)
- ✅ Flexibility: Support for various access patterns
- ✅ Cost Efficiency: Minimal on-chain storage (hash reference only)