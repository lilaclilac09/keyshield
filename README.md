# KeyShield

Zero-trust API key proxy with vault encryption and Solana wallet authentication.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license) [![Solana](https://img.shields.io/badge/Solana-on--chain-9945ff?logo=solana&logoColor=white)](https://solana.com) [![Rust](https://img.shields.io/badge/Rust-stable-orange?logo=rust&logoColor=white)](https://www.rust-lang.org/) [![Python](https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white)](https://www.python.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

## Architecture

> **Merged architecture (2026-05-09):** vault **storage** is zero-knowledge
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

**Production hosts:**

| Tier | URL | Platform |
|------|-----|----------|
| Landing | `https://ks.aileena.xyz` | Vercel (`keyshield-landing`) |
| App (web-v2 dashboard) | `https://app.ks.aileena.xyz` | Vercel (builds `src/web-v2/`) |
| Sync Worker (vault storage) | `https://keyshield-sync.<account>.workers.dev` | Cloudflare |
| API (Python business logic) | `https://api.ks.aileena.xyz` (or Railway domain) | Railway |

## Project Structure

```
keyshield/
├── src/                          # All source code
│   ├── backend/                  # Python FastAPI control plane
│   │   ├── app.py               # Application factory
│   │   ├── config.py            # Pydantic settings
│   │   ├── errors.py            # Domain error hierarchy
│   │   ├── keyshield_sdk.py     # Python SDK
│   │   ├── auth/                # Session + WebAuthn passkey
│   │   ├── vault/               # AES-256-GCM encryption
│   │   ├── proxy/               # API router + x402 verify
│   │   ├── billing/             # Usage + Solana topup
│   │   ├── agents/              # Agent CRUD + embedded wallet
│   │   ├── sharing/             # Vault share registry
│   │   ├── mpp/                 # Metered Payment Protocol
│   │   ├── trading/             # Trading orchestration
│   │   ├── skills/              # Helius agent skills
│   │   ├── middleware/          # Auth middleware
│   │   ├── routes/              # Route handlers by domain
│   │   └── tests/               # Python unit tests
│   ├── proxy/                   # Rust hot-path proxy
│   │   ├── crates/              # 6 crates: cache, helius, proxy, session, upstream, vault
│   │   ├── specs/               # Port specifications
│   │   └── tests/               # Rust tests
│   ├── programs/                # Solana on-chain programs
│   │   └── keyshield/           # Anchor program (7 instructions)
│   ├── web/                     # React frontend + Chrome extension
│   │   ├── components/          # React components
│   │   ├── hooks/               # React hooks
│   │   ├── lib/                 # Auth, API, Solana, OCR
│   │   ├── sections/            # Page sections (10 total)
│   │   ├── ui/                  # Shared UI primitives
│   │   └── extension/           # Chrome extension (TS source)
│   ├── web-v2/                  # Vite-based React app (Path A vault client + dashboard)
│   │   └── lib/{vault,sync,sync-auth}.ts  # consolidated from extension-sync/
│   ├── mobile/                  # React Native mobile app
│   ├── sdk/                     # SDK packages
│   │   ├── agent-sdk/           # Agent SDK
│   │   ├── cli/                 # CLI tool
│   │   ├── goat-wallet/         # Wallet adapter
│   │   └── openclaw-skill/      # OpenClaw skill
│   ├── infra/                   # Infrastructure
│   │   ├── sync-worker/         # Cloudflare Worker
│   │   └── metrics-ui/          # Grafana dashboard
│   └── scripts/                 # Dev/deploy scripts
├── docs/                        # Documentation
├── tests/                       # E2E tests (Playwright)
├── Cargo.toml                   # Rust workspace
└── package.json                 # npm workspace
```

## Quick Start

> **Self-host note:** vault sync (storage) uses Path A — a Cloudflare Worker
> with R2-backed zero-knowledge storage. Business logic (proxy, billing,
> agents) runs on the Python FastAPI service. See
> [docs/get-started/self-host.md](docs/get-started/self-host.md) for the full
> deploy flow (Worker + Python API + Solana program).

```bash
# Run everything in one command
bash src/scripts/dev.sh

# Or start services individually:

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

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed setup.
See [ROADMAP.md](ROADMAP.md) for current progress.

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

## License

MIT
