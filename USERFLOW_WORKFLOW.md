# KeyShield User Flow & Workflow Visualization

## 📊 Table of Contents
1. [User Flow Diagrams](#user-flow-diagrams)
2. [Technical Workflow](#technical-workflow)
3. [System Architecture](#system-architecture)
4. [Privacy Flow](#privacy-flow)

---

## 🎯 User Flow Diagrams

### 1. First-Time User: Store API Key

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER JOURNEY                            │
└─────────────────────────────────────────────────────────────────┘

[User Opens App]
        │
        ▼
┌──────────────────┐
│  Landing Page    │
│  "Connect Wallet"│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Wallet Connect  │ ◄─── User clicks "Connect Wallet"
│  (Phantom/Sol)   │      Selects wallet provider
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Wallet Connected│
│  Dashboard Loads │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  "No Vault"      │
│  Empty State     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Click "Store    │ ◄─── User wants to store API key
│  Key" Button     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Store Key Form  │
│  ┌─────────────┐ │
│  │ Key Name   │ │ ◄─── User enters:
│  │ API Key    │ │      - Key name (optional)
│  │ [Time Lock]│ │      - API key value
│  │            │ │      - Time lock (optional)
│  └─────────────┘ │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Encryption      │ ◄─── Frontend encrypts with Lit Protocol
│  (Lit Protocol)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Generate ZK     │ ◄─── Generate ZK commitment (Bonsol)
│  Commitment      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Generate MPC    │ ◄─── Generate MPC hash (Arcium)
│  Hash            │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Build Solana    │ ◄─── Create transaction
│  Transaction     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Sign & Send     │ ◄─── User signs transaction
│  Transaction     │      Transaction sent to Solana
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Vault Created   │ ◄─── Success! Vault displayed
│  Display Vault   │
└──────────────────┘
```

### 2. Accessing Stored Key

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACCESS KEY USER FLOW                         │
└─────────────────────────────────────────────────────────────────┘

[User Opens App]
        │
        ▼
┌──────────────────┐
│  Dashboard       │
│  Vault Displayed │
└────────┬─────────┘
         │
         ├─────────────────┬─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Owner Access │  │ Shared Key   │  │ Time-Locked  │
│ (Direct)     │  │ (ZK Proof)   │  │ (Wait)       │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────────────────────────────────────────────┐
│         ACCESS VERIFICATION                       │
│  ┌────────────────────────────────────────────┐ │
│  │ Owner: Direct access (no proof needed)    │ │
│  │ Others: Generate ZK proof (Bonsol)        │ │
│  │ Time-locked: Check timestamp              │ │
│  └────────────────────────────────────────────┘ │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────┐
│  Build Access    │
│  Transaction     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Sign & Send     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Access Granted  │ ◄─── Program verifies ZK proof
│  Decrypt with Lit│      Decrypts encrypted key
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Display Key     │ ◄─── User sees decrypted API key
│  (Temporary)     │      (Consider masking for security)
└──────────────────┘
```

### 3. Sharing Key with Another User

```
┌─────────────────────────────────────────────────────────────────┐
│                      SHARE KEY USER FLOW                        │
└─────────────────────────────────────────────────────────────────┘

[Vault Owner]
        │
        ▼
┌──────────────────┐
│  Click "Share    │
│  Key" Button     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Share Dialog    │
│  ┌─────────────┐ │
│  │ Recipient   │ │ ◄─── Enter recipient wallet address
│  │ Address     │ │
│  │             │ │
│  │ Time Lock   │ │ ◄─── Optional: Set unlock time
│  │ [Optional]  │ │
│  └─────────────┘ │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  MPC Computation │ ◄─── Arcium MPC for secure sharing
│  (Arcium)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Build Share     │
│  Transaction     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Sign & Send     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Share Created   │ ◄─── Share PDA account created
│  Recipient Notif│      (Optional: Notify recipient)
└──────────────────┘

[Recipient Side]
        │
        ▼
┌──────────────────┐
│  Recipient       │
│  Accesses Key    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Generate ZK     │ ◄─── Recipient generates proof
│  Proof           │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Access Key      │ ◄─── Same access flow as above
│  (with proof)    │
└──────────────────┘
```

---

## ⚙️ Technical Workflow

### 1. Store Key Workflow (Detailed)

```
┌─────────────────────────────────────────────────────────────────┐
│              STORE KEY - TECHNICAL WORKFLOW                      │
└─────────────────────────────────────────────────────────────────┘

Frontend (React/Next.js)
│
├─► User Input: API Key + Metadata
│   │
│   ├─► encryptWithLit()
│   │   │
│   │   ├─► Initialize Lit Client
│   │   ├─► Create Access Control Conditions
│   │   │   └─► Wallet-based: userAddress = owner
│   │   │   └─► Time-based: (optional)
│   │   │
│   │   ├─► Encrypt String (client-side)
│   │   │   └─► Uses BLS threshold crypto
│   │   │
│   │   └─► Returns: { ciphertext, dataToEncryptHash }
│   │
│   ├─► generateZKCommitment() [Placeholder]
│   │   └─► In production: Call Bonsol API
│   │       └─► Generate ZK proof commitment
│   │
│   └─► generateMPCHash() [Placeholder]
│       └─► In production: Call Arcium API
│           └─► Generate MPC computation hash
│
├─► KeyShieldClient.buildStoreKeyInstruction()
│   │
│   ├─► Derive Vault PDA
│   │   └─► seeds: ["vault", owner_pubkey]
│   │
│   ├─► Serialize Instruction Data
│   │   └─► discriminator (1) + encrypted_key (128) + 
│   │       zk_commit (32) + mpc_hash (32) + timestamp (8)
│   │
│   └─► Create TransactionInstruction
│
├─► Build Transaction
│   └─► Add instruction + system program accounts
│
└─► Send Transaction
    │
    └─► Wallet signs → Solana Network

─────────────────────────────────────────────────────────────────

Solana Program (Rust/Pinocchio)
│
├─► process_instruction()
│   │
│   ├─► Parse discriminator (0 = StoreKey)
│   │
│   └─► process_store_key()
│       │
│       ├─► Validate Accounts
│       │   ├─► Owner is signer
│       │   └─► Vault PDA matches
│       │
│       ├─► Check Vault Doesn't Exist
│       │   └─► Return error if already exists
│       │
│       ├─► Parse Instruction Data
│       │   ├─► encrypted_key (128 bytes)
│       │   ├─► zk_commit (32 bytes)
│       │   ├─► mpc_hash (32 bytes)
│       │   └─► timestamp (8 bytes)
│       │
│       └─► Write Vault State
│           ├─► discriminator: "keyshld"
│           ├─► owner: owner_pubkey
│           ├─► encrypted_key: encrypted data
│           ├─► zk_commit: ZK commitment
│           ├─► mpc_hash: MPC hash
│           ├─► created_at: timestamp
│           └─► access_flags: time-lock flag
│
└─► Transaction Confirmed
    └─► Vault account created on-chain
```

### 2. Access Key Workflow (Detailed)

```
┌─────────────────────────────────────────────────────────────────┐
│              ACCESS KEY - TECHNICAL WORKFLOW                    │
└─────────────────────────────────────────────────────────────────┘

Frontend
│
├─► User Clicks "Access Key"
│   │
│   ├─► Check if Owner
│   │   └─► If owner: Direct access (no proof)
│   │
│   └─► If Not Owner:
│       │
│       ├─► generateAccessProof() [Bonsol]
│       │   │
│       │   ├─► Prepare Input
│       │   │   ├─► vault_commit: zkCommit from vault
│       │   │   └─► requester_pubkey: user's wallet
│       │   │
│       │   ├─► Call Bonsol Execution API
│       │   │   └─► Submit ZK program execution
│       │   │
│       │   ├─► Wait for Proof Generation
│       │   │   └─► Bonsol network generates STARK → SNARK
│       │   │
│       │   └─► Receive Proof
│       │       └─► { proof, publicInputs, imageId }
│       │
│       └─► prepareProofForVerification()
│           └─► Serialize proof for on-chain verification
│
├─► KeyShieldClient.buildAccessKeyInstruction()
│   │
│   ├─► Derive Vault PDA (from owner)
│   │
│   ├─► Serialize Instruction
│   │   └─► discriminator (1) + zk_proof (variable)
│   │
│   └─► Create TransactionInstruction
│
└─► Send Transaction

─────────────────────────────────────────────────────────────────

Solana Program
│
├─► process_instruction()
│   │
│   └─► process_access_key()
│       │
│       ├─► Validate Accounts
│       │   ├─► Requester is signer
│       │   └─► Vault exists
│       │
│       ├─► Read Vault Data
│       │   ├─► Verify discriminator
│       │   ├─► Extract owner
│       │   └─► Extract zk_commit
│       │
│       ├─► Check Access
│       │   │
│       │   ├─► If requester == owner:
│       │   │   └─► Grant access (no proof needed)
│       │   │
│       │   └─► Else:
│       │       │
│       │       ├─► Parse ZK Proof from instruction data
│       │       │
│       │       ├─► Verify ZK Proof [Bonsol Verifier]
│       │       │   └─► Call Bonsol verifier program
│       │       │       └─► Verify proof matches zk_commit
│       │       │
│       │       └─► If valid: Grant access
│       │       └─► If invalid: Return AccessDenied error
│       │
│       └─► Return Success
│
└─► Frontend Receives Confirmation
    │
    └─► Decrypt with Lit Protocol
        │
        ├─► decryptWithLit()
        │   ├─► Fetch ciphertext from vault
        │   ├─► Request decryption from Lit network
        │   │   └─► Nodes verify access conditions
        │   │       └─► Provide signature shares
        │   │
        │   └─► Decrypt and return API key
        │
        └─► Display to User (temporarily)
```

### 3. Share Key Workflow (Detailed)

```
┌─────────────────────────────────────────────────────────────────┐
│              SHARE KEY - TECHNICAL WORKFLOW                      │
└─────────────────────────────────────────────────────────────────┘

Frontend (Owner)
│
├─► User Enters Recipient Address + Time Lock
│   │
│   ├─► KeyShieldClient.buildShareKeyInstruction()
│   │   │
│   │   ├─► Derive Vault PDA
│   │   ├─► Derive Share PDA
│   │   │   └─► seeds: ["share", vault_pda, recipient_pubkey]
│   │   │
│   │   └─► Serialize Instruction
│   │       └─► discriminator (2) + recipient (32) + time_lock (8)
│   │
│   └─► Send Transaction

─────────────────────────────────────────────────────────────────

Solana Program
│
├─► process_instruction()
│   │
│   └─► process_share_key()
│       │
│       ├─► Validate Owner
│       │   └─► Verify owner is signer and matches vault owner
│       │
│       ├─► Parse Instruction
│       │   ├─► recipient_pubkey
│       │   └─► time_lock timestamp
│       │
│       ├─► Verify Share PDA
│       │
│       ├─► Get MPC Hash from Vault
│       │   └─► Used for MPC computation
│       │
│       └─► Create Share Account
│           ├─► vault: vault_pda
│           ├─► recipient: recipient_pubkey
│           └─► metadata: time_lock, access_flags
│
└─► Transaction Confirmed

─────────────────────────────────────────────────────────────────

MPC Computation (Arcium) [Off-Chain]
│
├─► Owner Initiates MPC Share
│   │
│   ├─► encryptForMPC()
│   │   ├─► Get MXE Public Key
│   │   ├─► Generate x25519 keypair
│   │   ├─► Derive shared secret
│   │   └─► Encrypt vault data with RescueCipher
│   │
│   ├─► submitMPCComputation()
│   │   ├─► Submit to Arcium Network
│   │   ├─► MPC nodes execute computation
│   │   └─► Result encrypted for recipient
│   │
│   └─► Monitor Computation
│       └─► getMPCComputationStatus()
│           └─► Wait for completion
│
└─► Recipient Can Decrypt Result
    └─► Uses shared secret + nonce
```

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEYSHIELD ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Next.js App (React/TypeScript)                         │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │  Dashboard   │  │ Store Form  │  │ Share Dialog │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │  │
│  │         │                 │                 │          │  │
│  │  ┌──────▼─────────────────▼─────────────────▼──────┐  │  │
│  │  │         KeyShield Client SDK                      │  │  │
│  │  │  - Build instructions                            │  │  │
│  │  │  - PDA derivation                                 │  │  │
│  │  │  - Transaction building                           │  │  │
│  │  └──────┬───────────────────────────────────────────┘  │  │
│  └─────────┼──────────────────────────────────────────────┘  │
└────────────┼──────────────────────────────────────────────────┘
             │
             │ Wallet Adapter
             │
┌────────────▼──────────────────────────────────────────────────┐
│                    PRIVACY SDK LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ Lit Protocol │  │   Bonsol     │  │   Arcium     │        │
│  │              │  │              │  │              │        │
│  │ Encryption   │  │ ZK Proofs    │  │ MPC Compute  │        │
│  │ Decryption   │  │ Generation   │  │ Agent Share  │        │
│  │ Threshold    │  │ Verification │  │ Encryption   │        │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘        │
└─────────┼──────────────────┼─────────────────┼────────────────┘
          │                  │                 │
          │                  │                 │
┌─────────▼──────────────────▼─────────────────▼────────────────┐
│                    SOLANA BLOCKCHAIN                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         KeyShield Program (Pinocchio)                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ Store Key    │  │ Access Key   │  │ Share Key    │  │  │
│  │  │ Instruction  │  │ Instruction  │  │ Instruction  │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │  │
│  │         │                 │                 │          │  │
│  │  ┌──────▼─────────────────▼─────────────────▼──────┐  │  │
│  │  │              Account Storage                      │  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐     │  │  │
│  │  │  │  Vault   │  │  Share   │  │  System  │     │  │  │
│  │  │  │  PDA     │  │  PDA     │  │  Program │     │  │  │
│  │  │  └──────────┘  └──────────┘  └──────────┘     │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         External Verifiers (if needed)                    │  │
│  │  ┌──────────────┐                                        │  │
│  │  │ Bonsol        │  ZK Proof Verification                  │  │
│  │  │ Verifier      │                                        │  │
│  │  └──────────────┘                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Privacy Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRIVACY FLOW DIAGRAM                         │
└─────────────────────────────────────────────────────────────────┘

[API Key Storage Flow]
        │
        ▼
┌──────────────────┐
│  Plain API Key   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐      ┌──────────────────┐
│  Lit Protocol    │─────►│ Encrypted Blob   │
│  Encryption      │      │ (128 bytes)      │
│  (Threshold)     │      └────────┬─────────┘
└──────────────────┘              │
         │                        │
         │                        ▼
         │              ┌──────────────────┐
         │              │  Store on-chain  │
         │              │  (Vault Account) │
         │              └──────────────────┘
         │
         ▼
┌──────────────────┐
│  ZK Commitment   │─────► Store on-chain (32 bytes)
│  (Bonsol)        │      Used for proof verification
└──────────────────┘
         │
         ▼
┌──────────────────┐
│  MPC Hash         │─────► Store on-chain (32 bytes)
│  (Arcium)         │      Used for agent sharing
└──────────────────┘

[Access Flow]
        │
        ▼
┌──────────────────┐
│  Access Request  │
└────────┬─────────┘
         │
         ├──────────────┬──────────────┐
         │              │              │
         ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Owner Access │ │ ZK Proof     │ │ Time Lock    │
│              │ │              │ │              │
│ Direct       │ │ Generate     │ │ Check        │
│ (No Proof)   │ │ Proof        │ │ Timestamp    │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       │                ▼                │
       │        ┌──────────────┐         │
       │        │ Verify Proof │         │
       │        │ (On-chain)   │         │
       │        └──────┬───────┘         │
       │                │                │
       └────────────────┴────────────────┘
                       │
                       ▼
              ┌──────────────┐
              │ Access       │
              │ Granted      │
              └──────┬───────┘
                     │
                     ▼
            ┌──────────────┐
            │ Decrypt with  │
            │ Lit Protocol  │
            └──────┬───────┘
                   │
                   ▼
            ┌──────────────┐
            │ Plain API Key│
            │ (Temporary)  │
            └──────────────┘
```

---

## 🔄 Complete End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              COMPLETE E2E FLOW: STORE → ACCESS                   │
└─────────────────────────────────────────────────────────────────┘

[1. STORE PHASE]
User → Frontend → Privacy SDKs → Solana Program
  │        │            │              │
  │        │            │              │
  │        ├─► Lit: Encrypt API key
  │        │   └─► Returns: ciphertext
  │        │
  │        ├─► Bonsol: Generate ZK commit
  │        │   └─► Returns: zk_commit
  │        │
  │        ├─► Arcium: Generate MPC hash
  │        │   └─► Returns: mpc_hash
  │        │
  │        └─► Build Transaction
  │            └─► Send to Solana
  │                │
  │                └─► Program stores vault
  │                    └─► Vault PDA created
  │
  └─► Success: Vault displayed

[2. ACCESS PHASE]
User → Frontend → ZK Proof → Solana Program → Lit Decrypt
  │        │         │            │              │
  │        │         │            │              │
  │        ├─► Check if owner
  │        │   ├─► If owner: Direct access
  │        │   └─► If not: Generate ZK proof
  │        │
  │        ├─► Bonsol: Generate proof
  │        │   └─► Returns: proof data
  │        │
  │        └─► Build Access Transaction
  │            └─► Send to Solana
  │                │
  │                └─► Program verifies proof
  │                    └─► If valid: Grant access
  │                        │
  │                        └─► Frontend decrypts with Lit
  │                            └─► Display API key
  │
  └─► User sees decrypted key

[3. SHARE PHASE]
Owner → Frontend → Arcium MPC → Solana Program
  │        │            │              │
  │        │            │              │
  │        ├─► Enter recipient
  │        │   └─► Build share transaction
  │        │
  │        ├─► Arcium: Encrypt for MPC
  │        │   └─► Submit computation
  │        │
  │        └─► Send transaction
  │            └─► Program creates share PDA
  │                │
  │                └─► Recipient can access
  │                    (with ZK proof)
```

---

## 📱 Component Interaction Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              REACT COMPONENT INTERACTION                        │
└─────────────────────────────────────────────────────────────────┘

App (page.tsx)
  │
  └─► Dashboard
        │
        ├─► WalletProvider
        │   └─► WalletMultiButton
        │
        ├─► useVault() Hook
        │   ├─► KeyShieldClient
        │   │   └─► getVault()
        │   │
        │   └─► storeKey() Mutation
        │       ├─► encryptWithLit()
        │       ├─► buildStoreKeyInstruction()
        │       └─► sendTransaction()
        │
        ├─► VaultDisplay
        │   └─► Shows vault status
        │
        ├─► StoreKeyForm (Modal)
        │   └─► Form inputs
        │       └─► Calls storeKey()
        │
        └─► ShareKeyDialog (Modal)
            └─► Share form
                └─► Calls buildShareKeyInstruction()
```

---

## 🎨 Visual Summary

### Key Interactions:
1. **Store**: User → Encrypt → On-chain Storage
2. **Access**: User → ZK Proof → Verify → Decrypt
3. **Share**: Owner → MPC → Share Account → Recipient Access

### Privacy Layers:
- **Layer 1**: Lit Protocol encryption (threshold crypto)
- **Layer 2**: ZK proofs (Bonsol) for access verification
- **Layer 3**: MPC (Arcium) for secure sharing

### On-Chain vs Off-Chain:
- **On-Chain**: Vault accounts, share accounts, ZK commitments, MPC hashes
- **Off-Chain**: Actual API keys (encrypted), ZK proof generation, MPC computation

---

**Note**: This visualization shows the complete flow. In production, some steps (like ZK proof generation) may take time and require async handling.
