# KeyShield — 2-Minute Demo Presentation Script

**Duration**: ~2 minutes  
**Audience**: Hackathon judges / technical evaluators  
**Tone**: Confident, demo-driven, technical but accessible

---

## Opening (15 sec)

Hi everyone. I'm demoing **KeyShield** — a private API vault that stops secret leaks, simplifies API access via wallet-based control, and cuts on-chain storage costs by up to **95%**.

---

## The Problem (20 sec)

API keys are different from passwords. They control spending and access — they can drain wallets, leak data, and run up unbounded costs. Today they’re stuffed in .env files, clipboards, and code snippets. KeyShield fixes that.

---

## How It Works — Wallet-Based Access (30 sec)

Instead of hard-coding keys or sharing them in docs, KeyShield uses **wallet-based access control**. Connect your wallet — via Clerk Solana SIWS or a fallback — and request access to a private API. KeyShield verifies the wallet and returns the reference without ever exposing the raw secret. No more leaked keys in repos or screenshots.

**[Demo]**: Connect wallet → request API access → receive reference. Show the hybrid list: on-chain vault PDA as source of truth, local metadata for fast search. Search filters the merged list in-memory — no extra RPC calls per search.

---

## Extension — Auto-Detection (25 sec)

Our browser extension **auto-detects** API keys as you use them. It monitors form fields and clipboard, with support for GitHub, Helius, Google Gemini, and more. Detected keys are immediately offered for secure vaulting instead of staying in plaintext. Build scripts support Chrome, Firefox, and Safari.

**[Demo]**: Paste a key or enter one in a form → extension detects → prompt to vault.

---

## Lit + Light: Encryption & Storage (25 sec)

We use **two protocols** for different jobs. **Lit Protocol** handles **encryption** — threshold crypto so decrypt happens only when your wallet signs. Local AES can't enforce that; Lit does via a decentralized network. The ciphertext is 1–5 KB, too big for on-chain, so we store it in IndexedDB and put only the 32-byte hash on-chain. For that hash storage we use **Light Protocol** — ZK compression for Solana — which gets us **95% cheaper** than raw on-chain. If Light isn't available we fall back to our KeyShield program vault: 8 keys per wallet, still **80% cheaper** than the old one-vault-per-key model. Either way: full auditability, no plaintext on-chain.

---

## Closing (15 sec)

KeyShield gives you: leak prevention via a private vault, wallet-based access for easy API referencing, and auditable usage records at a fraction of the cost. It’s secure by default, simple to use, and built for real teams. Thanks — happy to take questions.

---

## Technical Cheat Sheet (for Q&A)

### Lit Protocol vs Light Protocol

| Protocol | Role | What it does |
|----------|------|--------------|
| **Lit Protocol** | **Encryption** | Threshold crypto; encrypt API keys with wallet-based access; decrypt only when wallet signs. Ciphertext 1–5 KB. |
| **Light Protocol** | **ZK compression** | ZK compression for Solana; store hash reference in compressed accounts; ~95% cheaper than standard PDAs. Requires Helius RPC. |

### Storage Flow

```
API Key → Lit encrypt → ciphertext (IndexedDB) + hash
                              ↓
         On-chain: Light (compressed, 95% cheaper) OR KeyShield Program (vault PDA, 80% cheaper)
```

### Storage Breakdown

| Component | Size | Location |
|-----------|------|----------|
| Vault (container) | 472 bytes | On-chain (KeyShield program path) |
| Compressed account | ~15K lamports | On-chain (Light Protocol path) |
| Key Entry | 34 bytes | Inside vault array |
| Ciphertext | 1–5 KB | Off-chain (IndexedDB) |

### Cost Comparison

| Model | Cost per Key | Notes |
|-------|--------------|-------|
| Old (one vault per key) | 0.002 SOL | 8 keys = 0.016 SOL |
| KeyShield Program (8 keys/vault) | ~0.0004 SOL | 8 keys = 0.0033 SOL — **80% savings** |
| Light Protocol (ZK compressed) | ~15K lamports | **95% savings** (requires Helius) |

### Key Benefits

| Benefit | Details |
|---------|---------|
| **Cost efficiency** | Up to 95% cheaper (Light); 80% with program; single rent per wallet |
| **Cleaner architecture** | Deterministic vault: `["vault", owner]`; one PDA per wallet; "Your vault" vs "Your 12 vaults" |
| **Scalability** | Up to 8 keys per wallet (extendable); easy to query: one vault per wallet |
| **Accurate terminology** | Vault = container (on-chain account); Key = entry (item in vault) |

### Lit Protocol (Encryption)

| Aspect | Details |
|--------|---------|
| **Why Lit (vs local AES)** | Local encryption can’t enforce “decrypt only when wallet X signs.” Lit provides threshold crypto via decentralized nodes. |
| **Flow** | `encryptWithLit(apiKey, walletPubkey)` → `{ ciphertext, dataToEncryptHash }`; ciphertext → IndexedDB, hash → on-chain. |
| **Decrypt** | User signs with wallet → Lit verifies access conditions → decrypt only if wallet matches. |
| **Network** | Datil-dev (dev); Lit mainnet for production. |
| **Fallback** | If Lit handshake fails, optional local encryption fallback (dev only). |

### Light Protocol (ZK Compression)

| Aspect | Details |
|--------|---------|
| **Role** | Store hash reference in compressed accounts; reduces on-chain state cost via zero-knowledge proofs. |
| **Requirement** | Helius RPC with ZK Compression support (`VITE_HELIUS_API_KEY`). |
| **Fallback** | If Light unavailable, KeyShield program vault (80% savings). |
| **Badge** | Items show ⚡ COMPRESSED (Light) or 📦 ON-CHAIN (program). |

### Quick Reference

| Topic | One-liner |
|-------|-----------|
| **Lit** | Encryption; threshold crypto; decrypt only when wallet signs |
| **Light** | ZK compression; 95% cheaper on-chain hash storage; Helius RPC |
| **Hybrid list** | On-chain vault PDA for existence + local metadata for search; in-memory filtering |
| **Extension** | Form + clipboard detection; GitHub (`ghp_`, `gho_`), Helius, Google Gemini (`AIza...`) |
| **Vault PDA** | `seeds = ["vault", owner]`; `connection.getAccountInfo(vaultPDA)` |
| **Multi-browser** | `build-chrome.sh`, `build-firefox.sh`, `build-safari.sh` |
