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

# Web v2 dashboard (vault UI; client-side crypto via Path A)
cd src/web-v2 && npm install && npm run dev

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
│   └── scripts/                  # Dev/deploy scripts
├── packages/
│   ├── shared/                   # Shared types, hooks, auth, API client
│   │   ├── src/api/              # Typed API client
│   │   ├── src/auth/             # Wallet auth + token management
│   │   ├── src/hooks/            # React Query hooks
│   │   ├── src/lib/              # Crypto, time, vault utilities
│   │   ├── src/stores/           # Zustand stores
│   │   └── src/types/            # Zod-validated type schemas
│   └── ui/                       # Shared UI components (shadcn + Radix)
├── docs/                         # Documentation
├── tests/                        # E2E tests (Playwright)
├── Cargo.toml                    # Rust workspace
└── package.json                  # npm workspace
```

---

## Security Model

KeyShield operates on a **zero-trust** principle:

1. **Encryption at rest** — All vault entries are encrypted with AES-256-GCM. The encryption key is derived from your wallet signature via HKDF-SHA256.
2. **Per-request key injection** — The proxy receives decrypted keys in the `X-Upstream-API-Key` header and never persists them.
3. **WebAuthn passkeys** — Passwordless login with PRF extension. No password stored on any server.
4. **Agent CRL** — Certificate revocation list ensures revoked agents cannot authenticate.
5. **Session tokens** — Self-contained JWT-like tokens with HMAC signature and expiry.

---

## Documentation

- [Architecture Overview](docs/architecture/README.md)
- [System Design](docs/architecture/system-design.md)
- [Sync Vault Architecture (Path A)](docs/technical/SYNC_VAULT_ARCHITECTURE.md)
- [Operator Guide](docs/OPERATOR.md)
- [Payment Flows](docs/PAYMENT-FLOWS.md)
- [Roadmap](ROADMAP.md)

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
