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
