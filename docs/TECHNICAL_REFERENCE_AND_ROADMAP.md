# KeyShield — Technical Reference & Roadmap

**One-stop reference for all technical details and product roadmap.**

Last updated: February 2, 2026

---

## Part 1: Technical Details

### 1.1 Storage Breakdown

| Component | Size | Location |
|-----------|------|----------|
| Vault (container) | 472 bytes | On-chain (KeyShield program path) |
| Compressed account | ~15K lamports | On-chain (Light Protocol path) |
| Key Entry | 34 bytes | Inside vault array |
| Ciphertext | 1–5 KB | Off-chain (IndexedDB) |

### 1.2 Cost Comparison

| Model | Cost per Key | Notes |
|-------|--------------|-------|
| Old (one vault per key) | 0.002 SOL | 8 keys = 0.016 SOL |
| KeyShield Program (8 keys/vault) | ~0.0004 SOL | 8 keys = 0.0033 SOL — **80% savings** |
| Light Protocol (ZK compressed) | ~15K lamports | **95% savings** (requires Helius) |

### 1.3 Key Benefits

| Benefit | Details |
|---------|---------|
| **Cost efficiency** | Up to 95% cheaper (Light); 80% with program; single rent per wallet |
| **Cleaner architecture** | Deterministic vault: `["vault", owner]`; one PDA per wallet; "Your vault" vs "Your 12 vaults" |
| **Scalability** | Up to 8 keys per wallet (extendable); easy to query: one vault per wallet |
| **Accurate terminology** | Vault = container (on-chain account); Key = entry (item in vault) |

---

### 1.4 Vault Architecture

**One Wallet → One Vault → Multiple Keys**

```
Clerk User (user_123)
  │
  ├─ Wallet 1 (9xyz...abc)
  │   └─ Vault PDA ["vault", 9xyz...abc]  ← ONE vault per wallet (472 bytes)
  │       ├─ Key Entry 1: hash_abc123... (GitHub)
  │       ├─ Key Entry 2: hash_def456... (Helius)
  │       └─ Key Entry 3: hash_ghi789... (Generic)
  │
  └─ Wallet 2 (5def...ghi)
      └─ Vault PDA ["vault", 5def...ghi]
          └─ Key Entry 1: hash_xyz999...
```

**On-chain structure (Rust):**

```rust
pub struct Vault {
    discriminator: [u8; 8],        // "keyshld\0"
    owner: Pubkey,                 // 32 bytes
    key_count: u8,
    keys: [KeyEntry; 8],           // 8 × 34 = 272 bytes
    created_at: u64,
    vault_flags: u8,
    _reserved: [u8; 150],
}  // Total: 472 bytes

pub struct KeyEntry {
    encrypted_key_hash: [u8; 32],  // Lit dataToEncryptHash
    key_type: u8,                  // 0=Generic, 1=GitHub, 2=Helius, 3=GoogleGemini
    access_flags: u8,
}  // 34 bytes each
```

**PDA derivation:** `seeds = ["vault", owner]`

---

### 1.5 Lit Protocol vs Light Protocol

| Protocol | Role | What it does |
|----------|------|--------------|
| **Lit Protocol** | **Encryption** | Threshold crypto; encrypt API keys with wallet-based access; decrypt only when wallet signs. Ciphertext 1–5 KB. |
| **Light Protocol** | **ZK compression** | ZK compression for Solana; store hash reference in compressed accounts; ~95% cheaper than standard PDAs. Requires Helius RPC. |

### 1.6 Lit Protocol (Encryption)

| Aspect | Details |
|--------|---------|
| **Why Lit (vs local AES)** | Local encryption can't enforce "decrypt only when wallet X signs." Lit provides threshold crypto via decentralized nodes. |
| **Flow** | `encryptWithLit(apiKey, walletPubkey)` → `{ ciphertext, dataToEncryptHash }`; ciphertext → IndexedDB, hash → on-chain. |
| **Decrypt** | User signs with wallet → Lit verifies access conditions → decrypt only if wallet matches. |
| **Network** | Datil-dev (dev); Lit mainnet for production. |
| **Fallback** | If Lit handshake fails, optional local encryption fallback (dev only). |

**Data flow:**
1. Encrypt with Lit → get `ciphertext` + `dataToEncryptHash`
2. Store `ciphertext` in IndexedDB keyed by hash
3. Store hash on-chain: **Light Protocol** (compressed, 95% cheaper) or **KeyShield Program** (vault PDA, 80% cheaper)
4. Decrypt: read hash from vault → fetch ciphertext from IndexedDB → Lit decrypt with session signatures

### 1.7 Light Protocol (ZK Compression)

| Aspect | Details |
|--------|---------|
| **Role** | Store hash reference in compressed accounts; reduces on-chain state cost via zero-knowledge proofs. |
| **Requirement** | Helius RPC with ZK Compression support (`VITE_HELIUS_API_KEY`). |
| **Fallback** | If Light unavailable, KeyShield program vault (80% savings). |
| **Cost** | ~15K lamports per key (95% cheaper than standard PDAs). |

---

### 1.8 Browser Extension

| Aspect | Details |
|--------|---------|
| **Detection** | Form fields, clipboard; future: HTTP headers, OCR |
| **Providers** | GitHub (`ghp_`, `gho_`), Helius, Google Gemini (`AIza...`), OpenAI (`sk-`), bloXroute |
| **Build** | `build-chrome.sh`, `build-firefox.sh`, `build-safari.sh` |
| **Files** | `frontend/content.js`, `frontend/background.js` |

**Detection patterns:**
- **GitHub**: `/^gh[porus]_[A-Za-z0-9]{36}$/`
- **OpenAI**: `/^sk-[A-Za-z0-9]{48}$/`
- **Google Gemini**: `/^AIza[A-Za-z0-9_-]{35}$/`
- **Helius**: `/^[a-f0-9]{32,64}$/` + domain check

---

### 1.9 Hybrid List & Search

- **On-chain**: Vault PDA as source of truth; `connection.getAccountInfo(vaultPDA)`
- **Local**: Metadata (name, domain, type) in `localStorage` or `chrome.storage.local`
- **Merge**: Unify on load; one list with on-chain + searchable metadata
- **Search**: In-memory filter by `searchQuery` (name, domain); no RPC per search

---

### 1.10 API Key vs Password Detection

| Aspect | Passwords | API Keys |
|--------|-----------|----------|
| **Location** | Form fields (`input[type="password"]`) | Headers, clipboard, .env, code, OCR |
| **Pattern** | Domain-matched | Provider-specific (`ghp_`, `AIza`, `sk-`) |
| **Risk** | Account lockout | Financial/data leak |
| **Auto-fill** | Safe (wrong = fail login) | Dangerous (wrong = key exposure) |

---

### 1.11 MPC Agent Coordination (Arcium, Planned)

1. Agent1 encrypts key with Lit, stores hash on-chain
2. Agent2 requests access
3. Arcium MPC: Agent1 share + Agent2 proof → MPC compute
4. API key used inside MPC; result encrypted for Agent1
5. Agent2 never sees raw API key

---

### 1.12 API Routing Proxy (Planned)

- **Problem**: APIs need keys in headers; agents shouldn't store keys
- **Solution**: `/api/proxy` — accepts encrypted intent + vault hash + wallet signature → verifies → Lit decrypt → routes to target API → returns (optionally encrypted) response

---

### 1.13 Key Files

| Component | Location |
|-----------|----------|
| Solana program | `programs/keyshield/` |
| Vault state | `programs/keyshield/src/state.rs` |
| Lit client | `frontend/lib/lit-protocol.ts` |
| Ciphertext storage | `frontend/lib/ciphertext-storage.ts` |
| Vault hooks | `frontend/hooks/useVaults.ts` |
| Solana utils | `frontend/lib/solana.ts` |
| Extension content | `frontend/content.js` |
| Extension background | `frontend/background.js` |

---

## Part 2: Roadmap

### Phase 1: Core Infrastructure (Q1 2026) — Complete ✅

- [x] Solana program (StoreKey, AccessKey, ShareKey)
- [x] Browser extension auto-detection (10+ providers)
- [x] Lit Protocol v4 encryption (hash on-chain, ciphertext off-chain)
- [x] Hybrid on-chain + local metadata vault list
- [x] Testing framework (Mollusk unit, Surfpool integration)
- [x] Frontend store flow with wallet signing
- [x] Complete encryption-to-chain pipeline
- [x] IndexedDB ciphertext storage
- [x] Transaction builder with proper instruction format
- [x] Clerk authentication with userId-based vaults
- [x] Dual storage: Clerk userId (local) + Wallet (on-chain)

---

### Phase 2: Advanced Privacy & Coordination (Q2 2026)

| Feature | Description | Effort | Status |
|---------|-------------|--------|--------|
| **Clerk Wallet Linking** | Map multiple Solana wallets to Clerk user profile | 1 week | In Progress |
| **Lit Conditional Decrypt** | Time-lock, NFT-gated access | 2–3 weeks | Planned |
| **Arcium MPC Integration** | Agent coordination, secure sharing | 3–4 weeks | Planned |
| **API Routing Proxy** | `/api/proxy` endpoint for confidential calls | 1–2 weeks | Planned |
| **Multi-Browser Support** | Firefox, Safari extension builds | 1 week | Planned |
| **Enhanced Detection** | OCR, HTTP intercept, .env file scanning | 2–3 weeks | Planned |

---

### Phase 3: Developer Tools & Testing (Q3 2026)

| Feature | Description | Effort | Status |
|---------|-------------|--------|--------|
| **Jupyter Testing Framework** | Interactive notebooks for encryption/MPC flows | 1 week | Planned |
| **Vault Audit Report Generator** | Export vault access logs, detection history | 2 weeks | Planned |
| **CLI Tool** | `keyshield encrypt/decrypt/share` command-line interface | 1–2 weeks | Planned |
| **SDK for Agents** | Python/JS SDK for AI agents (Langchain, AutoGen) | 3–4 weeks | Planned |
| **Security Audit** | Third-party audit of Solana program + Lit integration | 4–6 weeks | Planned |

---

### Phase 4: Ecosystem & Scale (Q4 2026)

| Feature | Description | Effort | Status |
|---------|-------------|--------|--------|
| **Multi-Sig Vaults** | Team vaults with M-of-N approval | 3–4 weeks | Planned |
| **Cross-Chain Bridges** | Ethereum, Polygon key storage | 4–6 weeks | Planned |
| **AI Agent Integrations** | Pre-built connectors for Langchain, AutoGen, AgentC | 2–3 weeks | Planned |
| **Enterprise Dashboard** | Team management, usage analytics | 4–6 weeks | Planned |
| **Mainnet Launch** | Production deployment after audit | 2–3 weeks | Planned |

---

### Timeline Overview

| Quarter | Theme | Key Deliverables |
|---------|--------|------------------|
| **Q1 2026** | Core vault + auth + Lit encryption | Program, extension, Lit v4, Clerk auth, hybrid storage |
| **Q2 2026** | MPC + routing + multi-browser | Wallet linking, conditional decrypt, Arcium MPC, API proxy |
| **Q3 2026** | Developer tools + audit | Jupyter, audit report, CLI, agent SDK, security audit |
| **Q4 2026** | Ecosystem + scale | Multi-sig, cross-chain, AI integrations, enterprise, mainnet |

---

### Implementation Priority Order

1. **Clerk wallet linking UI** — Link/manage multiple Solana wallets
2. **Lit conditional decryption** — Time-lock, wallet conditions (unblocks MPC and proxy)
3. **API routing proxy** — Confidential agent-to-API calls
4. **Arcium MPC integration** — Agent coordination without full key reveal
5. **Multi-browser extension** — Firefox/Safari builds
6. **Jupyter testing** — Interactive encryption/MPC flows
7. **Vault audit report** — Export logs and detection history
8. **CLI and agent SDK** — Developer adoption
9. **Security audit** — Before mainnet
10. **Mainnet launch** — After audit and hardening

---

## Related Documents

| Document | Description |
|----------|-------------|
| [technical/TECHNICAL_ARCHITECTURE.md](technical/TECHNICAL_ARCHITECTURE.md) | Deep dive: detection, Lit, MPC, API routing |
| [technical/LIT_INTEGRATION_GUIDE.md](technical/LIT_INTEGRATION_GUIDE.md) | Lit setup and conditional decrypt |
| [roadmap/PRODUCT_ROADMAP.md](roadmap/PRODUCT_ROADMAP.md) | Full product roadmap with Clerk flow |
| [roadmap/IMPLEMENTATION_PLAN.md](roadmap/IMPLEMENTATION_PLAN.md) | Technical priorities and sequencing |
| [pitch/PRESENTATION_SCRIPT.md](pitch/PRESENTATION_SCRIPT.md) | 2-minute demo script |
| [../VAULT_ARCHITECTURE.md](../VAULT_ARCHITECTURE.md) | Vault layout and data flow |
