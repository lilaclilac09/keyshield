<p align="center">
  <img src="src/web/public/keyshield.svg" alt="KeyShield" width="64" height="64" style="filter: brightness(0) invert(1);" />
</p>

<h1 align="center">KeyShield</h1>

<p align="center">
  Zero-trust API key proxy with vault encryption and Solana wallet authentication.
</p>

<p align="center">
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://solana.com"><img src="https://img.shields.io/badge/Solana-on--chain-9945ff?logo=solana&logoColor=white" alt="Solana" /></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/Rust-stable-orange?logo=rust&logoColor=white" alt="Rust" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white" alt="Python" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

---

> 📖 **Full API reference**: [`docs/API.md`](docs/API.md) — every endpoint, every auth flow, paste-ready curl/Python/JS examples, extension install. Start there if you're integrating.

---

## Overview

KeyShield is an intelligent agent and custodial platform built for the agentic future. It provides zero-trust API key management, Solana-based wallet authentication, and metered payment protocols — all without ever storing plaintext secrets on any server.

**Key features:**

| Feature | Description |
|---|---|
| **Zero-Knowledge Vault** | Client-side AES-256-GCM encryption via WebAuthn PRF. Server never sees plaintext. |
| **Wallet Authentication** | Sign in with Phantom, Solflare, or Backpack. Passkey support for mobile. |
| **API Key Proxy** | Stateless proxy with `X-Upstream-API-Key` header injection — keys never persisted. |
| **Agent Delegation** | Register AI agents with scoped API access and revocation CRL. |
| **MPP Streams** | Metered Payment Protocol for micro-payments per API call on Solana. |
| **x402 Auto-Pay** | Micropayment protocol for AI agent payments with configurable trust domains. |
| **Key Sharing** | Grant time-limited vault access to other wallets securely. |

---

## Architecture

> **Merged architecture (2026-05-09):** Vault **storage** is zero-knowledge
> (Path A — client-side WebAuthn-PRF crypto + Cloudflare Worker + R2). Vault
> **usage** (proxy, billing, agents, sharing) goes through the Python FastAPI
> backend with the upstream key in the `X-Upstream-API-Key` request header
> (never persisted server-side).

```
┌─────────────── Browser / extension (client) ───────────────┐
│  Vault crypto (Path A): WebAuthn PRF → HKDF → AES-256-GCM  │
│  Encrypted client-side, server can't decrypt               │
└────┬───────────────────────┬───────────────────────────────┘
     │                       │
     ▼ /vault/:id (CF Worker) ▼ /proxy/:upstream/...  + X-Upstream-API-Key header
┌──────────────────┐         ┌────────────────────────────────┐
│ Cloudflare Worker│         │ Python FastAPI (Railway)       │
│ (sync-worker)    │         │  - /proxy/* (stateless, key in │
│  R2: VAULTS,     │         │    header, never persisted)    │
│       REGISTRY   │         │  - /auth/passkey/* (mobile)    │
│  Zero-knowledge  │         │  - /agents/*, /billing/*,      │
│                  │         │    /share/*, /usage/*, /mpp/*  │
└──────────────────┘         └────────────────────────────────┘
```

### Production Hosts

| Tier | URL | Platform |
|---|---|---|
| Landing | `https://ks.aileena.xyz` | Vercel |
| App (dashboard) | `https://app.ks.aileena.xyz` | Vercel |
| Sync Worker (vault) | `https://keyshield-sync.<account>.workers.dev` | Cloudflare |
| API (business logic) | `https://api.ks.aileena.xyz` | Railway |

---

## Quick Start

> **Self-host note:** Vault sync (storage) uses Path A — a Cloudflare Worker
> with R2-backed zero-knowledge storage. Business logic (proxy, billing,
> agents) runs on the Python FastAPI service.

### Run Everything

```bash
bash src/scripts/dev.sh
```

### Run Services Individually

```bash
# Python control plane (proxy, billing, agents, etc.)
cd src/backend && pip install -r requirements.txt
python -m uvicorn app:app --port 8001 --reload

# Rust proxy (hot path; optional — Python /proxy works standalone)
cd src/proxy && cargo run --bin ks-proxy

# Dashboard (Path A vault UI; client-side crypto via @keyshield/shared)
# Note: the previous src/web-v2/ was archived to src/_archive/web-v2/ on
# 2026-05-10 and the current dashboard lives at src/web/.
cd src/web && npm install && npm run dev

# Cloudflare sync worker (vault storage; required for Path A)
cd src/infra/sync-worker && npx wrangler dev
```

---

## Project Structure

```
keyshield/
├── src/
│   ├── backend/                  # Python FastAPI control plane
│   │   ├── app.py                # Application factory
│   │   ├── config.py             # Pydantic settings
│   │   ├── auth/                 # Session + WebAuthn passkey
│   │   ├── proxy/                # API router + x402 verify
│   │   ├── billing/              # Usage + Solana topup
│   │   ├── agents/               # Agent CRUD + embedded wallet
│   │   ├── sharing/              # Vault share registry
│   │   ├── mpp/                  # Metered Payment Protocol
│   │   ├── trading/              # Trading orchestration
│   │   ├── routes/               # Route handlers by domain
│   │   └── tests/                # Python unit tests
│   ├── proxy/                    # Rust hot-path proxy
│   │   ├── crates/               # 6 crates: cache, helius, proxy, session, upstream, vault
│   │   └── specs/                # Port specifications
│   ├── programs/                 # Solana on-chain programs (Anchor)
│   │   └── keyshield/            # 7-instruction Anchor program
│   ├── web/                      # React dashboard + Chrome extension
│   │   ├── src/pages/            # Dashboard pages (Vault, Agents, etc.)
│   │   ├── src/layouts/          # Authenticated app shell
│   │   ├── src/components/       # UI components
│   │   ├── src/components/landing/  # Landing page sections
│   │   └── public/               # Static assets
│   ├── mobile/                   # React Native mobile app
│   ├── sdk/                      # SDK packages
│   │   ├── agent-sdk/            # Agent SDK
│   │   ├── cli/                  # CLI tool
│   │   └── openclaw-skill/       # OpenClaw skill
│   ├── infra/                    # Infrastructure
│   │   ├── sync-worker/          # Cloudflare Worker (vault storage)
│   │   └── metrics-ui/           # Grafana dashboard
│   ├── scripts/                  # Dev/deploy scripts
│   │   ├── dev.sh                # Boot the local stack
│   │   ├── pay.sh                # MPP payment-flow demo
│   │   ├── mpp-e2e-devnet.mjs    # 9-step devnet verification of the ATA fix
│   │   └── bootstrap-fresh-agent.mjs   # Grant a fresh agent for a clean e2e
│   └── _archive/                 # Pre-2026-05-10 layout (web/web-v2/web-v3) — kept for reference
├── packages/
│   ├── shared/                   # Shared types, hooks, auth, API client
│   │   ├── src/api/              # Typed API client (incl. buildMppOpenTx)
│   │   ├── src/auth/             # Wallet auth + token management
│   │   ├── src/hooks/            # React Query hooks (use-mpp, use-vaults, …)
│   │   ├── src/lib/              # Vault crypto, sync, wallet-mpp helper
│   │   ├── src/stores/           # Zustand stores
│   │   └── src/types/            # Zod-validated type schemas
│   └── ui/                       # Shared UI components (shadcn + Radix)
├── docs/                         # Architecture / get-started / technical
├── tests/                        # E2E tests (Playwright)
├── CHANGELOG.md                  # Per-day, by-area record of what shipped
├── ROADMAP.md                    # What's built / broken / left
├── TODOS.md                      # Deferred work
├── AGENTS.md                     # Collaborator quickstart (4 docs to read)
├── Dockerfile.python             # Used by Railway to build the Python API
├── railway.json                  # Production Python API deploy config (points at Dockerfile.python)
├── .env.example                  # Documented env (Solana, x402, Helius, …)
├── Cargo.toml                    # Rust workspace
└── package.json                  # npm workspace
```

> Production deploy is **Vercel × 2 + Cloudflare Worker + Railway** —
> see [`docs/get-started/deploy-production.md`](docs/get-started/deploy-production.md).
> No `docker-compose.yml` / `Makefile.docker` / `Dockerfile.{web,proxy}` —
> Vercel builds Vite directly, Cloudflare uses `wrangler`, Railway uses
> `Dockerfile.python`. Deleted on 2026-05-10 because they duplicated
> what the PaaS providers do for free.

---

## Security Model

KeyShield operates on a **zero-trust** principle:

1. **Encryption at rest** — All vault entries are encrypted with AES-256-GCM. The encryption key is derived from a WebAuthn-PRF passkey on the user's device via HKDF-SHA256. Cloudflare Worker only stores ciphertext + HKDF-derived vault id.
2. **Per-request key injection** — The proxy receives decrypted keys in the `X-Upstream-API-Key` header and never persists them.
3. **WebAuthn passkeys** — Passwordless login with PRF extension. No password stored on any server.
4. **Agent CRL** — Certificate revocation list ensures revoked agents cannot authenticate.
5. **Session tokens** — Self-contained JWT-like tokens with HMAC signature and expiry.
6. **MPP wallet sign-off** — On-chain payment streams use a stream-PDA-owned USDC ATA so `mpp_settle`'s PDA-signed transfer succeeds without exposing the owner wallet to a settler signature.

### Browser extension client-side encryption (Path A lite, 2026-05-11)

The Chrome extension previously POSTed plaintext API keys to `/manage/store` — the server's in-memory dict held raw `sk-...` strings. This commit closes that gap with **client-side AES-256-GCM** keyed off the user's Solana wallet signature.

> **One-sentence summary** — the extension now encrypts every detected API key in your browser before it ever leaves the page; the backend only sees opaque base64url ciphertext.

#### The crypto chain

```
   Phantom / Solflare / Backpack (wallet extension)
                │
                │  user clicks "Sign in" → wallet signs the fixed UTF-8 bytes
                │  of  "keyshield-vault-unlock-v1"  (ed25519, 64-byte signature)
                ▼
       ╔════════════════════════╗
       ║   sig (64 bytes)       ║   ← input keying material
       ╚════════════════════════╝
                │
                │  HKDF-SHA256
                │      salt = empty (Uint8Array(0))
                │      info = "ks-extension-vault-v1"
                │      L    = 32 bytes
                ▼
       ╔════════════════════════╗
       ║  master key (32 B)     ║   ← AES-256-GCM key material
       ╚════════════════════════╝
                │
                │  base64url-encoded, pushed to extension via
                │  chrome.runtime.sendMessage(extId, {
                │    type: 'KS_VAULT_KEY_REGISTER', keyB64
                │  }) — extension only reachable from origins listed in
                │  manifest.externally_connectable
                ▼
       ╔════════════════════════╗
       ║  chrome.storage.session║   ← key bytes live here in extension
       ║  ks_vault_key          ║      (auto-cleared on browser close,
       ╚════════════════════════╝       NOT persisted to disk)
                │
                │  for each detected API key:
                │  iv = crypto.getRandomValues(Uint8Array(12))
                │  ct = AES-GCM(master_key, iv, plaintext)
                ▼
       ╔════════════════════════════════════════════╗
       ║  POST /manage/store                        ║
       ║    { upstream, name,                       ║
       ║      cipher:    base64url(ct),             ║
       ║      iv:        base64url(iv),             ║
       ║      cipher_v:  1 }                        ║
       ╚════════════════════════════════════════════╝
                │
                ▼
       SQLite vault_shim.db  ←  server only ever sees opaque base64url strings
```

#### How it compares to other key managers

| Property | iCloud Keychain | This (Path A lite) | Full Path A (spec 16) |
|---|---|---|---|
| Key derivation root | Secure Enclave entropy | Wallet ed25519 signature | WebAuthn PRF (TPM / Secure Enclave) |
| Encryption | AES-256-GCM | AES-256-GCM | AES-256-GCM |
| Server sees plaintext | Never | Never | Never |
| Decryption requires | Device unlock (Touch/Face ID) | Wallet still installed & connected | Same passkey on same device |
| Key residency | Secure Enclave (TEE) | `chrome.storage.session` JS memory | WebCrypto `extractable: false` |
| Cleared on | Device wipe | Browser close | Browser close |
| Hardware-backed | ✅ | ⚠️ via wallet (Phantom/Ledger) | ✅ when device has TPM/Enclave |
| Multi-device sync | ✅ via Apple iCloud | ❌ (per-browser session) | ✅ via R2 + same passkey |

#### What's intentionally **not** done

- **Full spec-16 (WebAuthn PRF)** — would require the extension to launch a WebAuthn dance inside its popup, which has UX/security tradeoffs we haven't designed yet. The dashboard already implements full Path A for its own vault; this commit only addresses the extension's `/manage/store` path.
- **R2 storage** — extension ciphertext goes to the Python backend's SQLite shim (`src/backend/data/vault_shim.db`). The Cloudflare sync-worker route is for the dashboard's `/vault/:id` flow. Migrating the extension to R2 means routing through the dashboard tab or implementing JWT auth in the extension.
- **Key rotation** — Vault key is deterministic from the wallet signature; rotating requires either rotating the wallet or changing the unlock message.

#### Files involved

| Layer | File | Role |
|---|---|---|
| Crypto + bridge | [`packages/shared/src/auth/index.ts`](packages/shared/src/auth/index.ts) | `registerExtensionVaultKey`, `_deriveExtVaultKey` (HKDF), `syncVaultKeyToExtension`, postMessage bridge |
| Wallet sign hook | `src/web/.../WalletConnector.tsx` (payne worktree) | Asks wallet to sign `keyshield-vault-unlock-v1` right after login |
| Extension service worker | [`src/extension/background.js`](src/extension/background.js) | `KS_VAULT_KEY_REGISTER` handler, `directStore()` AES-GCM encryption, `X-Dev-Mode` header, base64url helpers |
| Extension content script | [`src/extension/content.js`](src/extension/content.js) | Multi-key panel, `__ks_ext_announce` bridge broadcast, URL-UUID false-positive filter |
| Extension popup | [`src/extension/popup.html`](src/extension/popup.html) / [`popup.js`](src/extension/popup.js) | Live token+vault status badge, sign-in button, manual token paste fallback |
| Backend storage | [`src/backend/routes/vault.py`](src/backend/routes/vault.py) | `vault_items.cipher` / `.iv` / `.cipher_v` columns (idempotent ALTER TABLE), pass-through in `vault_store` and `vault_list` |

#### Demo verification

```bash
# 1. Confirm the extension sent ciphertext, not plaintext
sqlite3 src/backend/data/vault_shim.db \
  "SELECT upstream, cipher_v, length(cipher), length(value) FROM vault_items ORDER BY created_at DESC LIMIT 5;"
# Expected: cipher_v=1, length(cipher) > 0, length(value) = 0
```

If `cipher_v=1` and `value` is empty, the server stored only opaque ciphertext — the demo claim holds.

### Closing the iCloud Keychain UX gap

The crypto story above gets KeyShield to the same **server-zero-knowledge** floor as iCloud Keychain. Three UX features close the remaining gap — every one was shipped against the same Path A lite key (no schema changes, no new crypto, just message handlers + tiny UI):

#### 1. Auto-fill (replaces "go to dashboard, copy, paste back")

iCloud Keychain auto-fills passwords. KeyShield now auto-fills saved API keys.

- **What you see**: visit a known provider domain (e.g. `platform.openai.com`) → every API-key-shaped input gets a small 🔑 button anchored to its top-right.
- **One key match** → click fills.
- **Multiple matches** → click opens a small dropdown ("OpenAI · prod-key", "OpenAI · staging-key") → pick one → fills.
- **Form integration**: dispatch `input` + `change` events using React's native setter pattern, so framework forms detect the change cleanly.
- **Guardrails**: won't overwrite an input that already has 8+ chars (avoids stomping a user who's typing), won't render inside the extension's own panel, won't render on dashboard origins. Re-checks every 2 s; reposition every 800 ms to survive layout shifts.

**Message contract** (`background.js` ↔ `content.js`):
```js
{ type: 'GET_KEYS_FOR_DOMAIN', domain: 'platform.openai.com' }
//   →  { ok: true, keys: [{ id, upstream, name, value }] }
//   →  { ok: false, reason: 'no-vault-key' | 'no-upstream-match' | 'no-keys' | 'http-N' | 'network' | 'decrypt-failed' }
```

Background.js holds a 30-second in-memory plaintext cache so the popup doesn't re-decrypt on every fill click.

#### 2. Cross-device sync proof (replaces hand-waving about "yes it syncs")

Same wallet on any browser → same 64-byte ed25519 signature → same HKDF-SHA256 master key → same AES decryption capability. KeyShield surfaces a **fingerprint** in the popup so the user can verify this property by eye:

```
Vault key fingerprint    SHA-256(key)[:4]
┌──────────────┐
│  a4 b9 c2 d8 │   ← 8 hex chars
└──────────────┘
```

Open the extension on a second browser, sign in with the same wallet → fingerprint matches → both browsers decrypt the same vault. Open with a *different* wallet → different fingerprint, no confusion.

**Why 4 bytes**: it's a SHA-256 prefix, not the key itself. 32 bits is enough to spot a mismatch in a demo; not enough to leak useful key material. (Birthday collision among the user's own wallets is ~65k devices before false positives — fine for human visual check.)

Cross-device storage is the second half of the story. The popup gains a **`[Point at remote]`** button that swaps `chrome.storage.local.ks_api_base` from `http://127.0.0.1:8001` to any HTTPS URL (e.g. a Railway-hosted backend). Same wallet sig + same backend URL ⇒ any browser sees the same vault.

#### 3. Encrypted backup & restore (replaces "lose your wallet, lose everything")

Recovery isn't about decrypting without the wallet — that would defeat the security model. It's about not losing the **ciphertext** if your local SQLite gets nuked. The popup gets two new buttons:

- **`[Export to file…]`** — GETs `/manage/vault`, packs every row's `cipher` + `iv` + `cipher_v` (plus metadata) into a single JSON blob with schema `"keyshield-backup-v1"`, programmatically downloads it as `keyshield-backup-YYYYMMDD-HHmm.json`.
- **`[Restore]`** — `<input type="file">` → read JSON → POST every item back to `/manage/store` (the existing `ON CONFLICT(id, user_id) DO UPDATE` makes restore idempotent).

The exported file is **safe to publish** — without the wallet signature it's opaque ciphertext. Put it on iCloud Drive, a USB stick, a public Gist, GitHub release artifact — it doesn't matter, the wallet still gates decryption.

**Fingerprint check on import**: the export records the fingerprint at export time. On restore, if the *currently unlocked* vault key has a different fingerprint, the status banner flips to red — "Imported N items — fingerprint mismatch, decryption may fail." User can still proceed (maybe they want to migrate to a new wallet by re-encrypting), but they're warned.

**Export schema** (paste into a future spec doc):
```json
{
  "schema":      "keyshield-backup-v1",
  "exported_at": 1715472000,
  "fingerprint": "a4b9c2d8",
  "items": [
    { "id":"ks_abc…", "upstream":"helius", "name":"helius key",
      "cipher":"Yk0a…", "iv":"X3kZ…", "cipher_v":1,
      "created_at":"2026-05-11T08:30:00Z", "expires_at":null }
  ]
}
```

#### Recovery story, in one paragraph

You hold three things, each with its own backup story: (1) **your wallet seed phrase** — store this in a hardware wallet or a real safe; (2) **the encrypted backup file** — copy it anywhere durable, it's ciphertext; (3) **a backend URL** — when the local one is gone, point the extension at a remote that has the same ciphertext (or restore from the file). Lose any one, recover from the other two. Lose two, you're in trouble. This is the same threat profile as iCloud Keychain (Apple ID password + device passcode + recovery key), just with different secrets.

#### Where everything lives

| Layer | New surface | Files |
|---|---|---|
| Crypto-cache & decrypt | `GET_KEYS_FOR_DOMAIN` handler, 30 s in-memory `_decryptCache`, `DOMAIN_TO_UPSTREAM` map | [`src/extension/background.js`](src/extension/background.js) |
| Auto-fill UI | 🔑 overlay button anchored to detected inputs, 1-or-N dropdown, React-safe value setter | [`src/extension/content.js`](src/extension/content.js) |
| Fingerprint compute | `GET_VAULT_FINGERPRINT` (`SHA-256(keyBytes)[:4]` hex) | [`src/extension/background.js`](src/extension/background.js) |
| Fingerprint UI | `<details>` "Cross-device sync" block, monospace fingerprint readout, remote-URL switcher | [`src/extension/popup.html`](src/extension/popup.html) + [`popup.js`](src/extension/popup.js) |
| Backup/restore | `EXPORT_VAULT` (pack `/manage/vault` → `keyshield-backup-v1` JSON), `IMPORT_VAULT` (replay POSTs to `/manage/store`) | [`src/extension/background.js`](src/extension/background.js) |
| Backup UI | `<details>` "Backup & restore" block with file download anchor + `<input type=file>` + status banner | [`src/extension/popup.html`](src/extension/popup.html) + [`popup.js`](src/extension/popup.js) |

#### Updated comparison table

| Property | iCloud Keychain | This (Path A lite + auto-fill + sync + backup) | Full Path A (spec 16) |
|---|---|---|---|
| Server sees plaintext | Never | Never | Never |
| Auto-fill on revisit | ✅ Safari prompts on every form | ✅ 🔑 button on every detected input | not in scope (dashboard-only) |
| Cross-device sync | ✅ via iCloud (Apple's E2E + HSM) | ✅ Same wallet ⇒ same key (deterministic); ciphertext via shared backend URL | ✅ via R2 + same passkey |
| Sync verification | implicit ("you trust Apple") | **explicit 8-hex fingerprint** the user can read on two browsers | implicit |
| Recovery from device loss | ✅ Apple ID + recovery contact / key | ✅ Wallet seed + encrypted backup JSON (any of {USB, iCloud Drive, public Gist}) | ✅ Same passkey on a new device |
| Recovery from wallet/passkey loss | ✅ Apple account recovery | ⚠️ Wallet seed phrase is the root — keep it safe | ⚠️ Same — passkey is the root |
| Hardware-backed unlock | ✅ Secure Enclave | ⚠️ via wallet (Phantom/Ledger — Ledger is hardware) | ✅ TPM / Secure Enclave |

The remaining "⚠️" rows are properties of the wallet ecosystem, not gaps in KeyShield's design. A user with a Ledger has Secure-Enclave-equivalent properties end-to-end.

### Verified on devnet (2026-05-10)

The Solana program at `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j` is end-to-end exercised by [`src/scripts/mpp-e2e-devnet.mjs`](src/scripts/mpp-e2e-devnet.mjs). All 9 steps green — the ATA fix (commit [`9974a8e85`](https://github.com/lilaclilac09/keyshield/commit/9974a8e85)) is provably wired:

| | Devnet account / tx |
|---|---|
| Open MPP stream | [`678bqTSq…XTQc`](https://explorer.solana.com/tx/678bqTSq4gYspz2TWwdK3wCzZwEHuuDqseDUS2NcEPVQ45472iNPRykVh6K1zGEbq4nPmbLfDKKSiUx2nrT6XTQc?cluster=devnet) |
| Stream PDA (`disc='ksaywal1'`) | [`E5sMx86o3MWV…DgfR`](https://explorer.solana.com/address/E5sMx86o3MWV562BxbWk6SxfqTFBWpCitj3AU9i6DgfR?cluster=devnet) |
| Stream-PDA-owned USDC ATA (funded 0.1 USDC) | [`6QtooE6QVFF9…FtBH`](https://explorer.solana.com/address/6QtooE6QVFF9pJ9Pa9DgAFAWpEWkB8VtjEytc5FyFtBH?cluster=devnet) |
| Settle round-trip (1k micro-USDC) | no `0x4 OwnerMismatch` — clean |

Reproduce:
```bash
node src/scripts/bootstrap-fresh-agent.mjs    # grant a new vault agent
KS_AGENT_PUBKEY=<printed pubkey> \
  node src/scripts/mpp-e2e-devnet.mjs         # 9-step verification
```

---

## Documentation

**Source-of-truth records:**

- [CHANGELOG.md](CHANGELOG.md) — per-day, by-area: what shipped, which files, which commits. Read this first when catching up.
- [ROADMAP.md](ROADMAP.md) — current state: shipped / in-flight / deferred.
- [TODOS.md](TODOS.md) — deferred work with priority.
- [AGENTS.md](AGENTS.md) — collaborator quickstart (4 docs to read in order).

**Architecture:**

- [System Design](docs/architecture/system-design.md) — §2.2 documents both Path A (zero-knowledge) and Path B (legacy).
- [Sync Vault Architecture (Path A)](docs/technical/SYNC_VAULT_ARCHITECTURE.md) — vault crypto + Worker contract.
- [TEE Architecture](docs/technical/TEE_ARCHITECTURE.md) — three-layer TEE stack + threat model + stub-vs-shipped table.
- [Architecture Overview](docs/architecture/README.md)

**Get started:**

- [Production deploy](docs/get-started/deploy-production.md) — Vercel × 2 + Cloudflare + Railway, env matrix, DNS.
- [Device Vault UI](docs/get-started/device-vault-ui.md) — end-user guide for the dashboard's Path A page.
- [Operator Guide](docs/OPERATOR.md)
- [Payment Flows](docs/PAYMENT-FLOWS.md)

### Architecture Decision Records

- [ADR-001: Divergence decisions](src/proxy/ADR-001-divergences.md)
- [ADR-002: Why fallthrough, not full port](src/proxy/ADR-002-architecture.md)
- [ADR-003: Firewall rules](src/proxy/ADR-003-firewall.md)
- [ADR-007: TLS and stealth mode](src/proxy/ADR-007-tls-and-stealth.md)

---

## Testing

```bash
# Rust tests
cd src/proxy && cargo test

# Python tests
cd src/backend && pytest tests/

# Web frontend
cd src/web && npm run build

# E2E tests
npx playwright test
```

---

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed setup instructions.
See [ROADMAP.md](ROADMAP.md) for current progress.

---

## License

MIT
