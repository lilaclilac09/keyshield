# KeyShield Visual Summary

## 🎯 Quick Visual Guide

### Main User Flows

```
┌─────────────────────────────────────────────────────────────┐
│                    KEYSHIELD USER FLOWS                      │
└─────────────────────────────────────────────────────────────┘

1️⃣ STORE KEY
   User → Enter API Key → Encrypt → Store on Solana
   ⏱️ Time: ~5-10 seconds

2️⃣ ACCESS KEY
   User → Request Access → ZK Proof → Verify → Decrypt
   ⏱️ Time: ~10-30 seconds (ZK proof generation)

3️⃣ SHARE KEY
   Owner → Enter Recipient → MPC Share → Recipient Access
   ⏱️ Time: ~1-5 minutes (MPC computation)
```

## 🏗️ System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM COMPONENTS                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Frontend  │─────►│   Privacy   │─────►│   Solana    │
│  (Next.js)  │      │    SDKs     │      │  Program    │
│             │      │             │      │ (Pinocchio) │
│  • React UI │      │ • Lit       │      │             │
│  • Wallet   │      │ • Bonsol    │      │ • Vaults    │
│  • Client   │      │ • Arcium    │      │ • Shares    │
└─────────────┘      └─────────────┘      └─────────────┘
```

## 🔐 Privacy Flow (Simplified)

```
API Key → [Encrypt] → Encrypted Blob → [Store] → On-Chain
                                    ↓
                            [Access Request]
                                    ↓
                            [ZK Proof] → [Verify] → [Decrypt] → API Key
```

## 📊 Data Storage

```
On-Chain (Solana):
  ✅ Encrypted API key (128 bytes)
  ✅ ZK commitment (32 bytes)
  ✅ MPC hash (32 bytes)
  ✅ Metadata (owner, timestamp, flags)

Off-Chain:
  ❌ Plain API key (never stored)
  ⚠️ ZK proof generation (Bonsol network)
  ⚠️ MPC computation (Arcium network)
```

## 🎨 UI Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    UI COMPONENT FLOW                         │
└─────────────────────────────────────────────────────────────┘

App
 │
 ├─► WalletProvider
 │   └─► Connect Wallet
 │
 └─► Dashboard
     │
     ├─► VaultDisplay (if vault exists)
     │   └─► Show vault info
     │
     ├─► StoreKeyForm (button)
     │   └─► Store new/update key
     │
     └─► ShareKeyDialog (button)
         └─► Share with recipient
```

## ⚡ Quick Reference

### Store Key
```
1. User enters API key
2. Frontend encrypts with Lit
3. Generate ZK commit & MPC hash
4. Build transaction
5. User signs
6. Store on-chain
```

### Access Key
```
1. User requests access
2. Check if owner
   ├─► Owner: Direct access
   └─► Not owner: Generate ZK proof
3. Verify proof on-chain
4. Decrypt with Lit
5. Display key
```

### Share Key
```
1. Owner enters recipient
2. Encrypt for MPC (Arcium)
3. Create share account
4. Recipient can access (with proof)
```

## 🔄 State Transitions

```
┌─────────────────────────────────────────────────────────────┐
│                    STATE DIAGRAM                             │
└─────────────────────────────────────────────────────────────┘

[No Vault]
    │
    │ Store Key
    ▼
[Vault Created]
    │
    ├─► Access Key ──► [Decrypted] ──► [Display]
    │
    └─► Share Key ──► [Share Created] ──► [Recipient Access]
```

## 📱 Mobile vs Desktop

```
Desktop:
  ✅ Full feature set
  ✅ All privacy SDKs
  ✅ Complete UI

Mobile:
  ✅ Responsive design
  ⚠️ Wallet connection (mobile wallets)
  ⚠️ ZK proof generation (may be slower)
```

## 🎯 Key Features Visual

```
┌─────────────────────────────────────────────────────────────┐
│                    FEATURE MATRIX                            │
└─────────────────────────────────────────────────────────────┘

Feature              │ Status │ Complexity │ Time
─────────────────────┼────────┼────────────┼────────
Store Key            │   ✅   │    Low     │  5s
Access (Owner)       │   ✅   │    Low     │  2s
Access (ZK Proof)    │   ⚠️   │   High     │  30s
Share Key            │   ⚠️   │   High     │  5min
Time-Lock            │   ✅   │   Medium   │  5s
AI Agent Integration │   📝   │   High     │  TBD
```

## 🚀 Performance Metrics

```
Transaction Sizes:
  • Store Key: ~201 bytes instruction data
  • Access Key: ~1-5KB (with ZK proof)
  • Share Key: ~41 bytes instruction data

Account Sizes:
  • Vault: 288 bytes
  • Share: 64+ bytes

Compute Units:
  • Store: ~50k CU
  • Access: ~200k CU (with ZK verification)
  • Share: ~100k CU
```

## 🔒 Security Checklist

```
✅ API keys encrypted before storage
✅ ZK proofs for access verification
✅ MPC for secure sharing
✅ Time-locked access support
✅ Owner-only direct access
✅ On-chain verification
```

## 📚 Documentation Map

```
KeyShield/
├── README.md              # Main documentation
├── SETUP.md               # Setup instructions
├── USERFLOW_WORKFLOW.md   # Detailed flows (this doc)
├── ARCHITECTURE.md        # System architecture
├── KEYSHIELD_SDK_ANALYSIS.md  # SDK review
└── VISUAL_SUMMARY.md      # Quick reference (this doc)
```

---

**Quick Start**: See [SETUP.md](./SETUP.md)  
**Detailed Flows**: See [USERFLOW_WORKFLOW.md](./USERFLOW_WORKFLOW.md)  
**Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
