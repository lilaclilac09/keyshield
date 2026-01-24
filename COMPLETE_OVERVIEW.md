# KeyShield - Complete User Flow & Architecture Overview

## 📚 All Documentation Files

### Core Documentation
1. **[README.md](./README.md)** - Project overview, quick start, features
2. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete system architecture (572 lines)
3. **[TEST_AND_ARCHITECTURE_SUMMARY.md](./TEST_AND_ARCHITECTURE_SUMMARY.md)** - Test results + architecture summary
4. **[START_HERE.md](./START_HERE.md)** - Quick testing guide
5. **[QUICKSTART.md](./QUICKSTART.md)** - 5-minute quick start
6. **[SETUP.md](./SETUP.md)** - Detailed setup instructions

### Testing Documentation
7. **[TESTING.md](./TESTING.md)** - Complete testing guide
8. **[TEST_RESULTS.md](./TEST_RESULTS.md)** - Test results and status
9. **[DECRYPTION_TESTING.md](./DECRYPTION_TESTING.md)** - Decryption flow testing
10. **[QUICK_VERIFICATION.md](./QUICK_VERIFICATION.md)** - Quick verification steps

### Extension Documentation
11. **[extension/README.md](./extension/README.md)** - Extension overview
12. **[extension/INSTALL.md](./extension/INSTALL.md)** - Extension installation guide
13. **[extension/TEST_CHECKLIST.md](./extension/TEST_CHECKLIST.md)** - Extension testing checklist
14. **[extension/DEBUGGING.md](./extension/DEBUGGING.md)** - Extension debugging guide

### Technical Documentation
15. **[LIT_PROTOCOL_V4_UPDATE.md](./LIT_PROTOCOL_V4_UPDATE.md)** - Lit Protocol v4 migration guide

---

## 🏛️ Complete Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER (Browser)                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Chrome Extension (MV3)                                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │  │
│  │  │ Content      │  │ Background   │  │ Popup        │      │  │
│  │  │ Script       │  │ Service      │  │ UI           │      │  │
│  │  │ (Detection)  │  │ Worker       │  │              │      │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Next.js Dashboard (http://localhost:3000)                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │  │
│  │  │ React UI     │  │ Wallet       │  │ Privacy      │      │  │
│  │  │ Components   │  │ Adapter      │  │ SDKs         │      │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              │
┌─────────────────────────────▼─────────────────────────────────────┐
│                    PRIVACY SERVICES LAYER                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Lit Protocol │  │   Bonsol     │  │   Arcium     │          │
│  │  Network     │  │   Network    │  │   Network    │          │
│  │              │  │              │  │              │          │
│  │ Threshold    │  │ ZK Provers   │  │ MPC Nodes    │          │
│  │ Cryptography │  │ & Verifiers  │  │              │          │
│  │ (Encryption) │  │ (Proofs)     │  │ (Sharing)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ RPC Calls
                              │
┌─────────────────────────────▼─────────────────────────────────────┐
│                    SOLANA BLOCKCHAIN LAYER                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  KeyShield Program (Pinocchio Framework)                    │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  Instructions: StoreKey │ AccessKey │ ShareKey        │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │  Accounts: Vault PDA │ Share PDA │ System Accounts   │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Complete User Flow

### Flow 1: Extension Auto-Detection → Dashboard Save

```
┌─────────────────────────────────────────────────────────────────┐
│  USER BROWSES WEB PAGE                                          │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Extension Content Script (content-script.ts)                   │
│  • Scans DOM every 5 seconds                                     │
│  • Monitors form fields                                         │
│  • Watches clipboard                                            │
│  • Uses MutationObserver for dynamic content                    │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Key Detector (key-detector.ts)                                 │
│  Detects: Helius, bloXroute, 0x, QuickNode, Alchemy,           │
│          GitHub, Google Gemini, OpenAI, etc.                     │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Content Script → Background Service Worker                      │
│  Message: { type: 'KEY_DETECTED', provider, key, url }          │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Background Service Worker (service-worker.ts)                  │
│  • Checks deduplication (notifiedKeys)                          │
│  • Creates Chrome notification                                  │
│  • Title: "KeyShield: API Key Detected!"                        │
│  • Button: "Open Dashboard to Save"                            │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  USER CLICKS NOTIFICATION BUTTON                                │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  chrome.tabs.create({ url: 'http://localhost:3000' })           │
│  Opens Next.js Dashboard in new tab                             │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard (Dashboard.tsx)                                       │
│  • User connects wallet                                         │
│  • Enters API key (or uses detected key)                        │
│  • Clicks "Store Key"                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 2: Store Key (Dashboard → On-Chain)

```
┌─────────────────────────────────────────────────────────────────┐
│  USER ENTERS API KEY IN DASHBOARD                               │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend: encryptWithLit()                                     │
│  • Creates wallet access conditions                            │
│  • Encrypts API key with Lit Protocol                           │
│  • Returns: { ciphertext (1-5 KB), dataToEncryptHash (32B) }   │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ├─► Store full ciphertext in IndexedDB
                    │   Key: ciphertext:${dataToEncryptHash}
                    │   Value: Full ciphertext string
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend: buildStoreKeyInstruction()                            │
│  • Derives Vault PDA                                            │
│  • Serializes: discriminator + hash (32B) + zk_commit +        │
│                mpc_hash + timestamp + key_type                  │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Solana Transaction                                             │
│  • User signs with wallet                                       │
│  • Transaction sent to network                                  │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  KeyShield Program: process_store_key()                          │
│  • Validates accounts                                           │
│  • Writes to Vault Account (288 bytes):                         │
│    - discriminator: "keyshld"                                   │
│    - owner: Pubkey                                              │
│    - encrypted_key_hash: [u8; 32] ← Only hash on-chain!        │
│    - zk_commit: [u8; 32]                                        │
│    - mpc_hash: [u8; 32]                                         │
│    - created_at: u64                                             │
│    - access_flags: u8 (key type)                                │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 3: Access/Decrypt Key

```
┌─────────────────────────────────────────────────────────────────┐
│  USER CLICKS "REVEAL KEY" IN DASHBOARD                          │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend: Check Access                                         │
│  • Is user the owner? → Direct access                           │
│  • Not owner? → Generate ZK proof (Bonsol)                      │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend: Read Vault from On-Chain                             │
│  • Get encrypted_key_hash (32 bytes)                            │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend: Retrieve Full Ciphertext from IndexedDB              │
│  • Query: ciphertext:${hashBase64}                             │
│  • Returns: Full ciphertext (1-5 KB)                            │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend: Generate Session Signatures                          │
│  • Wallet signs message for Lit Protocol                        │
│  • Returns session signatures                                   │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend: decryptWithLit()                                     │
│  • Sends ciphertext + conditions to Lit network                 │
│  • Lit nodes verify access conditions                           │
│  • Nodes provide signature shares                               │
│  • Decrypts → Returns plaintext API key                         │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard: Display Decrypted Key                               │
│  • Shows API key to user                                        │
│  • Option to copy to clipboard                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Flow 4: Oracle Service (Use Key for External API)

```
┌─────────────────────────────────────────────────────────────────┐
│  USER CONFIGURES ORACLE CALL                                    │
│  • Selects vault with stored API key                           │
│  • Enters API endpoint (e.g., GitHub API)                      │
│  • Clicks "Execute Oracle Call"                                 │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Oracle Service: getDecryptedApiKey()                           │
│  • Reads vault from on-chain                                    │
│  • Gets encrypted_key_hash                                      │
│  • Retrieves ciphertext from IndexedDB                          │
│  • Decrypts with Lit Protocol                                   │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Oracle Service: callExternalAPI()                              │
│  • Uses decrypted API key in request                            │
│  • Calls external API (GitHub/Helius/Google Gemini)             │
│  • Returns API response                                         │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ├─► Display results to user (off-chain)
                    │
                    └─► (Optional) Post results to on-chain program
                        • example-oracle program stores results
                        • Enables on-chain programs to consume API data
```

---

## 🔐 Security Architecture (4 Layers)

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                              │
└─────────────────────────────────────────────────────────────────┘

Layer 1: Client-Side Encryption (Lit Protocol)
  │
  ├─► API key encrypted BEFORE leaving browser
  ├─► Uses threshold cryptography (BLS signatures)
  ├─► Access controlled by conditions:
  │   • Wallet address
  │   • Time locks
  │   • NFT/token ownership (future)
  └─► Full ciphertext stored off-chain (IndexedDB)

Layer 2: On-Chain Storage
  │
  ├─► Only 32-byte hash stored on-chain (NOT plaintext)
  ├─► ZK commitment (32 bytes) for proof verification
  ├─► MPC hash (32 bytes) for secure sharing
  └─► Total on-chain: 288 bytes per vault

Layer 3: Access Verification (ZK Proofs - Bonsol)
  │
  ├─► Zero-knowledge proofs verify access
  ├─► No secrets revealed during verification
  ├─► On-chain verification via Bonsol verifier
  └─► Enables access without revealing credentials

Layer 4: Secure Sharing (MPC - Arcium)
  │
  ├─► Multi-party computation for agent-to-agent sharing
  ├─► Encrypted computation results
  ├─► Time-locked access support
  └─► Enables secure key sharing between agents
```

---

## 📊 Data Storage Architecture

### On-Chain Storage (Solana Vault Account - 288 bytes)

```
Offset  Size    Field               Description
─────────────────────────────────────────────────────────
0       8       discriminator       "keyshld" identifier
8       32      owner               Vault owner public key
40      32      encrypted_key_hash  Hash reference (NOT plaintext!)
72      32      zk_commit           ZK proof commitment
104     32      mpc_hash            MPC computation hash
136     8       created_at          Timestamp (Unix)
144     1       access_flags        Access control + key type
145     143     _reserved           Reserved for future use
```

**Critical**: Only the hash is stored on-chain, not the full ciphertext!

### Off-Chain Storage (IndexedDB)

```
Key: ciphertext:${dataToEncryptHash} (base64)
Value: Full Lit Protocol ciphertext (1-5 KB, base64 string)
```

**Why**: Cost efficiency, size constraints, privacy

---

## 🎯 Key Features & User Flows

### 1. Extension Auto-Detection
- **Where**: Any web page
- **How**: Content script scans DOM, form fields, clipboard
- **Detection**: 10+ API key patterns (Helius, bloXroute, 0x, GitHub, etc.)
- **Action**: Chrome notification → Opens dashboard

### 2. Dashboard Key Storage
- **Where**: http://localhost:3000
- **How**: User enters key → Lit encryption → On-chain storage
- **Storage**: Hash on-chain (32B), ciphertext off-chain (1-5 KB)

### 3. Key Access/Reveal
- **Where**: Dashboard
- **How**: Read vault → Get ciphertext → Lit decryption
- **Security**: Wallet signature required for decryption

### 4. Oracle Service
- **Where**: Dashboard Oracle Integration component
- **How**: Decrypt key → Call external API → Return results
- **Use Case**: On-chain programs consuming external API data

### 5. Key Sharing (Future)
- **Where**: Dashboard Share Key dialog
- **How**: MPC computation → Share account creation
- **Security**: Time-locked access, encrypted sharing

---

## 🔧 Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **UI**: React 18, Tailwind CSS
- **Wallet**: Solana Wallet Adapter (Phantom, Solflare, WalletConnect)
- **State**: React Query, Zustand

### Privacy SDKs
- **Lit Protocol v4**: Threshold cryptography (encryption/decryption)
- **Bonsol**: ZK proof generation/verification (stub)
- **Arcium**: MPC computation (stub, testnet)

### Backend
- **Framework**: Pinocchio (Solana program framework)
- **Language**: Rust
- **Network**: Solana Devnet/Mainnet

### Extension
- **Manifest**: Chrome Extension Manifest V3
- **Language**: TypeScript
- **Build**: Webpack

---

## 📁 Project Structure

```
keyshield/
├── programs/
│   ├── keyshield/              # Main Solana program
│   │   ├── src/
│   │   │   ├── lib.rs          # Entry point
│   │   │   ├── state.rs        # Vault state
│   │   │   ├── pda.rs          # PDA derivation
│   │   │   └── instructions/   # Instruction handlers
│   │   └── Cargo.toml
│   └── example-oracle/         # Oracle example program
│
├── frontend/                   # Next.js dashboard
│   ├── src/
│   │   ├── app/                # Next.js app directory
│   │   ├── components/         # React components
│   │   ├── lib/                # Utilities & SDKs
│   │   ├── hooks/              # React hooks
│   │   └── types/              # TypeScript types
│   └── package.json
│
├── extension/                  # Chrome extension
│   ├── src/
│   │   ├── background/         # Service worker
│   │   ├── content/            # Content scripts
│   │   ├── popup/              # Popup UI
│   │   ├── lib/                # Extension libraries
│   │   └── storage/            # Secure storage
│   └── dist/                   # Built extension
│
└── [Documentation Files]      # All .md files
```

---

## ✅ Current Status

### Completed ✅
1. **Solana Program**: Deployed on devnet
2. **Frontend Dashboard**: Builds successfully
3. **Lit Protocol v4**: Fully integrated
4. **Extension**: Auto-detection + notification flow
5. **On-Chain Storage**: Hash-based pattern
6. **Off-Chain Storage**: IndexedDB ciphertext storage
7. **Oracle Service**: External API integration

### In Progress 🚧
1. **Bonsol Integration**: ZK proof generation (stub)
2. **Arcium Integration**: MPC computation (stub)
3. **Extension**: Quick-save in popup (future)

---

## 🚀 Quick Start

1. **Start Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

2. **Load Extension**:
   - Chrome → `chrome://extensions` → Load unpacked → `extension/dist`

3. **Test Flow**:
   - Open test page: `extension/test-page.html`
   - Extension detects keys → Notification appears
   - Click notification → Opens dashboard
   - Connect wallet → Store key → Reveal key

---

## 📖 Documentation Index

See the complete list of documentation files at the top of this document.

**Start Here**: [START_HERE.md](./START_HERE.md)  
**Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)  
**Setup**: [SETUP.md](./SETUP.md)  
**Extension**: [extension/README.md](./extension/README.md)

---

**KeyShield**: Decentralized API key management with privacy-preserving encryption 🛡️
