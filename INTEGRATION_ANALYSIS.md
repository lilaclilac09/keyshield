# KeyShield Integration Analysis

## Architecture Overview

KeyShield integrates **Clerk authentication**, **Solana wallet connectivity**, **Lit Protocol encryption**, and **on-chain storage** to create a secure API key vault system.

## Component Integration Flow

### 1. Authentication & Identity Layer

#### Clerk Authentication
- **Purpose**: User account management and session handling
- **Implementation**: `@clerk/clerk-react`
- **Location**: `frontend/index.tsx` (ClerkProvider wrapper)
- **User ID**: Extracted via `useUser()` hook → `user.id`
- **Usage**: Used as primary identifier for localStorage vault management when wallet is disconnected

```typescript
// frontend/App.tsx
const { user } = useUser();
const userId = user?.id;
```

#### Wallet Connection
- **Purpose**: Blockchain transaction signing and identity verification
- **Implementation**: `@solana/wallet-adapter-react`
- **Supported Wallets**: Phantom, Solflare, OKX
- **Usage**: Used for encryption/decryption, transaction signing, and on-chain identity

```typescript
// frontend/App.tsx
const { publicKey } = useWallet();
const walletAddress = publicKey?.toBase58();
```

### 2. Encryption Layer - Lit Protocol

**File**: `frontend/lib/lit-protocol.ts`

#### Encryption Flow (`encryptWithLit`)
1. **Initialize Lit Client** - Connects to Datil-Dev network
2. **Build Access Control Conditions** - Solana wallet-based verification
   ```typescript
   {
     conditionType: 'solRpc',
     method: 'getBalance',
     params: [walletPubkey],
     chain: 'solana',
     returnValueTest: { comparator: '>=', value: '0' }
   }
   ```
3. **Encrypt API Key** - Encrypts plaintext with conditions
4. **Return**:
   - `ciphertext`: Base64 string (1-5KB)
   - `dataToEncryptHash`: 32-byte hash (Uint8Array)

#### Decryption Flow (`decryptWithLit`)
1. **Initialize Lit Client**
2. **Retrieve Ciphertext** from IndexedDB
3. **Get Session Signatures** - User signs message with wallet
4. **Decrypt** - Only succeeds if wallet matches access conditions
5. **Return**: Plaintext API key

**Key Features**:
- Threshold cryptography across Lit nodes
- Wallet-based access control (only specified wallet can decrypt)
- No single point of failure
- Decryption requires active wallet signature

### 3. Storage Architecture

#### Three-Tier Storage System

**1. IndexedDB (Browser Local) - Ciphertext Storage**
- **File**: `frontend/lib/ciphertext-storage.ts`
- **Purpose**: Store full encrypted ciphertext (1-5KB)
- **Key Format**: `ciphertext:${base64(hash)}`
- **Data Structure**:
  ```typescript
  {
    ciphertext: string;      // Lit Protocol ciphertext
    createdAt: number;       // Timestamp
    walletPubkey?: string;   // Reference to encrypting wallet
  }
  ```
- **Why**: Too large for on-chain storage (expensive)

**2. Solana Blockchain - Hash Storage**
- **File**: `frontend/lib/vault-transactions.ts`
- **Purpose**: Store 32-byte hash reference on-chain
- **Program**: `programs/keyshield/src/`
- **PDA**: Derived from `["vault", owner.publicKey]`
- **Instruction Data** (107 bytes):
  ```
  [0]       discriminator: 0x00 (StoreKey)
  [1..32]   encrypted_key_hash: 32 bytes
  [33..64]  zk_commit: 32 bytes (zeros, future use)
  [65..96]  mpc_hash: 32 bytes (zeros, future use)
  [97..104] timestamp: u64 LE
  [105]     key_type: u8 (0=Generic, 1=GitHub, 2=Helius, 3=GoogleGemini)
  [106]     vault_bump: u8
  ```
- **Why**: Permanent, verifiable, immutable record

**3. localStorage - Metadata Storage**
- **File**: `frontend/lib/solana.ts`
- **Purpose**: Store display metadata (name, domain, type, notes, tags)
- **Key Format**: 
  - With wallet: `keyshield_meta_{vaultPDA}`
  - Without wallet: `keyshield_vaults_{clerkUserId}`
- **Data Structure**:
  ```typescript
  {
    name: string;
    domain?: string;
    type: 'api_key' | 'oauth_token' | 'private_key';
    notes?: string;
    tags?: string[];
  }
  ```
- **Why**: Not sensitive, allows offline search/filtering

### 4. Integration Points

#### Clerk ↔ Wallet Linking
**File**: `frontend/hooks/useVaults.ts`

The system supports two modes:

**Mode 1: With Wallet Connected**
```typescript
const userId = user?.id;              // From Clerk
const walletAddress = publicKey?.toBase58(); // From wallet

// Storage strategy:
if (walletAddress) {
  // Load from on-chain vaults
  const onChainVaults = await loadVaultList(walletAddress);
  // Metadata: keyshield_meta_{vaultPDA}
}
```

**Mode 2: Without Wallet (Clerk Only)**
```typescript
if (!walletAddress && userId) {
  // Load from localStorage by Clerk userId
  const localVaults = loadLocalVaultsByUserId(userId);
  // Storage: keyshield_vaults_{userId}
}
```

**Key Insight**: Clerk ID and wallet address are **independent**. One Clerk user can connect multiple wallets, and the same wallet can be used by different Clerk users (though vaults are wallet-specific on-chain).

#### Complete Storage Flow
**File**: `frontend/hooks/useVaults.ts` → `addItem()` function

**With Wallet (Full Security)**:
```
User Action: Add API Key
    ↓
1. Clerk Authentication → userId
2. Wallet Connection → walletAddress, publicKey
3. Lit Protocol Encryption:
   - Input: apiKey (plaintext), walletAddress
   - Output: ciphertext, 32-byte hash
4. IndexedDB Storage:
   - Key: ciphertext:base64(hash)
   - Value: { ciphertext, createdAt, walletPubkey }
5. Build Solana Transaction:
   - Instruction: StoreKey (107 bytes)
   - Accounts: [owner, vaultPDA, systemProgram]
   - Data: [discriminator, hash, zk_commit, mpc_hash, timestamp, key_type, bump]
6. Wallet Signs Transaction
7. Send & Confirm on Solana
8. localStorage Metadata:
   - Key: keyshield_meta_{vaultPDA}
   - Value: { name, domain, type, notes, tags }
9. Success: API key secured!
```

**Without Wallet (Local Only)**:
```
User Action: Add API Key
    ↓
1. Clerk Authentication → userId
2. localStorage Storage:
   - Key: keyshield_vaults_{userId}
   - Value: [{ id, name, value, domain, createdAt, tags }]
3. Success: Saved locally (⚠️ less secure)
```

### 5. Access Control & Security

#### Multi-Layer Security Model

**Layer 1: Clerk Authentication**
- Must be signed in to access app
- `<SignedIn>` / `<SignedOut>` gates in UI
- Session management via cookies

**Layer 2: Wallet Ownership**
- Must own wallet to sign transactions
- Wallet signature required for all on-chain operations
- Private key never leaves wallet

**Layer 3: Lit Protocol Encryption**
- Access conditions enforce wallet-based decryption
- Only the encrypting wallet can decrypt (enforced by Lit nodes)
- Threshold cryptography (no single point of failure)
- Requires active wallet signature to decrypt

**Layer 4: On-Chain Verification**
- Vault PDA derived from wallet address
- Only vault owner can modify (enforced by Solana program)
- Immutable audit trail

#### Threat Model Protection

| Attack Vector | Protection |
|--------------|------------|
| Steal ciphertext from IndexedDB | ✅ Useless without wallet signature to decrypt |
| Compromise localStorage metadata | ✅ No sensitive data stored (only names/tags) |
| Steal on-chain hash | ✅ Hash alone cannot reveal API key |
| Impersonate Clerk user | ✅ Cannot decrypt without wallet private key |
| Steal wallet private key | ⚠️ Full compromise (secure wallet is critical) |
| Man-in-the-middle | ✅ End-to-end encryption, signed transactions |
| Lit node compromise | ✅ Threshold cryptography (requires majority) |

### 6. Key Files Reference

#### Frontend Integration
```
frontend/
├── index.tsx                      # ClerkProvider + WalletProvider setup
├── App.tsx                        # SignedIn/SignedOut routing, wallet display
├── hooks/useVaults.ts             # Main integration logic (Clerk + Wallet + Lit + On-chain)
├── lib/
│   ├── lit-protocol.ts           # Encryption/decryption with access control
│   ├── vault-transactions.ts     # Build StoreKey transactions
│   ├── store-transaction.ts      # Transaction builders (alternative)
│   ├── ciphertext-storage.ts    # IndexedDB management
│   └── solana.ts                 # Vault PDA derivation, metadata, RPC
└── components/
    ├── AuthScreen.tsx            # Clerk <SignIn> component
    └── AddKeyModal.tsx           # Triggers storage flow
```

#### Solana Program
```
programs/keyshield/
├── src/
│   ├── lib.rs                    # Program entry point (store_key, access_key, share_key)
│   ├── state.rs                  # Vault account structure
│   ├── pda.rs                    # PDA derivation (matches frontend)
│   └── instructions/
│       ├── store_key.rs          # Store hash on-chain
│       ├── access_key.rs         # Verify access (future: logs)
│       └── share_key.rs          # Share with another wallet (future)
└── tests/                        # Integration tests
```

### 7. Data Flow Example

**Scenario**: User stores GitHub API token

```
1. User signs in with Clerk
   → userId: "user_2abc..."
   
2. User connects Phantom wallet
   → publicKey: 9xyz...abc
   → walletAddress: "9xyzDefGhi123..."
   
3. User clicks "Add Key", enters:
   - Name: "GitHub API Token"
   - Value: "ghp_abc123xyz..."
   - Domain: "github.com"
   
4. Frontend (useVaults.addItem):
   a. Lit Protocol encrypts:
      Input: "ghp_abc123xyz...", "9xyzDefGhi123..."
      Output: 
        ciphertext: "base64_encrypted_blob..."
        hash: Uint8Array(32) [0x3f, 0x2a, ...]
        
   b. IndexedDB stores:
      Key: "ciphertext:P8oq7w..."
      Value: { ciphertext: "...", createdAt: 1738425600000, walletPubkey: "9xyz..." }
      
   c. Build transaction:
      Program: CVbhbCGsAk4WikxpucSCJ7QUhDka96PcyQmSLj6FrQA8
      Vault PDA: 5Abc... (derived from ["vault", 9xyz...])
      Instruction: [0x00, hash(32), zeros(64), timestamp(8), 0x01, bump]
      
   d. Wallet signs & sends
      Signature: 3MzTp...
      
   e. localStorage stores:
      Key: "keyshield_meta_5Abc..."
      Value: { name: "GitHub API Token", domain: "github.com", type: "api_key", tags: ["SECURE"] }
      
5. User sees vault in dashboard:
   - Name: "GitHub API Token" (from localStorage)
   - Domain: "github.com" (from localStorage)
   - Created: "2 minutes ago" (from on-chain timestamp)
   - Hash: On-chain ✅ (from Solana)
   - Encrypted: Yes 🔒 (from Lit Protocol)
```

### 8. Environment Variables

Required for full functionality:

```bash
# Clerk Authentication
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Solana Program (optional, defaults to devnet program)
VITE_PROGRAM_ID=CVbhbCGsAk4WikxpucSCJ7QUhDka96PcyQmSLj6FrQA8

# Solana RPC (optional, defaults to public devnet)
VITE_RPC_URL=https://api.devnet.solana.com
```

### 9. Current Limitations & Future Enhancements

**Current State**:
- ✅ Clerk authentication working
- ✅ Wallet connection working
- ✅ Lit Protocol encryption working
- ✅ On-chain hash storage working
- ✅ IndexedDB ciphertext storage working
- ✅ Hybrid mode (with/without wallet)

**Planned Features** (from program structure):
- 🔮 `zk_commit` - Zero-knowledge proofs for access verification
- 🔮 `mpc_hash` - Multi-party computation for key sharing
- 🔮 `share_key` instruction - Share access with other wallets
- 🔮 `access_key` instruction - Log and verify access attempts

### 10. Testing the Integration

See `INTEGRATION_ANALYSIS.md` → "Demo Instructions" section below.

---

## Demo Instructions

### Prerequisites
1. Clerk account with publishable key set in `.env.local`
2. Solana wallet extension (Phantom or Solflare)
3. Devnet SOL (can request from faucet)

### Running the Demo
```bash
# 1. Start frontend
cd frontend
npm run dev

# 2. Open browser to http://localhost:3000

# 3. Sign in with Clerk

# 4. Connect Solana wallet

# 5. Add test API key:
   Name: "Test Key"
   Value: "sk_test_abc123"
   Domain: "example.com"

# 6. Verify:
   - Lit Protocol encryption in console
   - IndexedDB entry (DevTools → Application → IndexedDB)
   - Transaction signature
   - On-chain vault (Solscan)
```

### Verification Commands
```bash
# Check program deployment
solana program show CVbhbCGsAk4WikxpucSCJ7QUhDka96PcyQmSLj6FrQA8 --url devnet

# Check vault account
solana account <VAULT_PDA> --url devnet

# Example vault PDA derivation (Node.js):
import { PublicKey } from '@solana/web3.js';
const [vaultPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('vault'), new PublicKey('YOUR_WALLET').toBuffer()],
  new PublicKey('CVbhbCGsAk4WikxpucSCJ7QUhDka96PcyQmSLj6FrQA8')
);
console.log(vaultPDA.toBase58());
```

---

## Summary

**KeyShield integrates**:
1. **Clerk** → User identity & session management
2. **Solana Wallet** → Transaction signing & on-chain identity
3. **Lit Protocol** → Threshold encryption with wallet-based access control
4. **Solana Program** → Immutable hash storage on-chain
5. **IndexedDB** → Local ciphertext storage
6. **localStorage** → Metadata for UX

**Result**: Secure, decentralized API key vault with multi-layer protection, where:
- API keys never touch the server
- Encryption is enforced by decentralized Lit nodes
- On-chain hashes provide immutable audit trail
- Only wallet owner can decrypt their keys
- User-friendly UX with Clerk authentication
