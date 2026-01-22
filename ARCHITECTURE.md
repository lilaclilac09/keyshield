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

This architecture ensures:
- ✅ Privacy: Keys never stored in plaintext
- ✅ Security: Multiple layers of verification
- ✅ Decentralization: On-chain storage with off-chain computation
- ✅ Scalability: Efficient account structure
- ✅ Flexibility: Support for various access patterns
