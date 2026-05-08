# KeyShield

Zero-trust API key proxy with vault encryption and Solana wallet authentication.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license) [![Solana](https://img.shields.io/badge/Solana-on--chain-9945ff?logo=solana&logoColor=white)](https://solana.com) [![Rust](https://img.shields.io/badge/Rust-stable-orange?logo=rust&logoColor=white)](https://www.rust-lang.org/) [![Python](https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white)](https://www.python.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Apps                           │
│  (Web Frontend, Mobile App, CLI, Agent SDK, Chrome Extension) │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ks-proxy (Rust)                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Auth         │  │ Key Inject  │  │ Cache           │   │
│  │ (Wallet/    │─▶│ (AES-256    │─▶│ (Helius RPC,    │   │
│  │  Session)   │  │  GCM)       │  │  OpenAI, etc.) │   │
│  └─────────────┘  └──────────────┘  └─────────────────┘   │
│         │                                                      │
│         │ Fallthrough (reverse proxy)                          │
│         ▼                                                      │
│  ┌──────────────────────────────────────────────────────┐     │
│  │         Python Control Plane                      │     │
│  │  Vault CRUD, Agents, Billing, WebAuthn, Pyth       │     │
│  └──────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              Upstream APIs                                     │
│  OpenAI, Anthropic, Groq, Mistral, 0x, Titan, Helius     │
└─────────────────────────────────────────────────────────────────┘
```

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

```bash
# Run everything in one command
bash src/scripts/dev.sh

# Or start services individually:

# Python control plane
cd src/backend && pip install -r requirements.txt
python -m uvicorn app:app --port 8001 --reload

# Rust proxy (hot path)
cd src/proxy && cargo run --bin ks-proxy

# Web frontend
cd src/web && npm install && npm run dev
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
- [Operator Guide](docs/OPERATOR.md)
- [Payment Flows](docs/PAYMENT-FLOWS.md)
- [Roadmap](ROADMAP.md)
- [Integration Log](integration-log.md)

### Architecture Decision Records

- [ADR-001: Divergence decisions](src/proxy/ADR-001-divergences.md)
- [ADR-002: Why fallthrough, not full port](src/proxy/ADR-002-architecture.md)
- [ADR-003: Firewall rules](src/proxy/ADR-003-firewall.md)
- [ADR-007: TLS and stealth mode](src/proxy/ADR-007-tls-and-stealth.md)

## License

MIT
