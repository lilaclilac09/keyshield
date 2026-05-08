# KeyShield

[![Test](https://github.com/lilaclilac09/keyshield/actions/workflows/test.yml/badge.svg)](https://github.com/lilaclilac09/keyshield/actions/workflows/test.yml) [![node-tests](https://github.com/lilaclilac09/keyshield/actions/workflows/node-tests.yml/badge.svg)](https://github.com/lilaclilac09/keyshield/actions/workflows/node-tests.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license) [![Solana](https://img.shields.io/badge/Solana-on--chain-9945ff?logo=solana&logoColor=white)](https://solana.com) [![Rust](https://img.shields.io/badge/Rust-stable-orange?logo=rust&logoColor=white)](https://www.rust-lang.org/) [![Python](https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white)](https://www.python.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Specs](https://img.shields.io/badge/specs-14-5b8cff)](src/rust-proxy/specs/) [![Tests](https://img.shields.io/badge/Rust%20oracle%20tests-78-success)](src/rust-proxy/)

> **Live demo:** _coming soon — see `landing/index.html` for the project page_

Zero-trust API key proxy with vault encryption and Solana wallet authentication.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Apps                           │
│  (Web Frontend, Mobile App, CLI, Agent SDK, OpenClaw)       │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS :8000
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
│  │         Python Control Plane (:8001)               │     │
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
│   ├── rust-proxy/              # Rust hot-path proxy (ks-proxy)
│   │   ├── crates/              # Rust workspace members
│   │   ├── specs/               # API specifications
│   │   └── tests/               # Rust integration tests
│   ├── python-legacy/           # Python MVP (control plane)
│   │   ├── trading/             # Trading bot examples
│   │   ├── examples/            # SDK usage examples
│   │   └── tests/               # Python tests
│   ├── api-server/              # TypeScript API server
│   ├── web-frontend/            # Next.js frontend
│   ├── mobile-app/              # React Native mobile app
│   ├── solana-programs/         # Solana on-chain programs
│   ├── sdk/                     # Client SDKs (TS, Python, CLI)
│   ├── crypto/                  # Unified crypto standards
│   │   ├── aes-gcm.ts          # AES-256-GCM vault encryption
│   │   ├── ed25519.ts          # Ed25519 signing/verification
│   │   └── kdf.ts              # Key derivation (scrypt, HKDF)
│   ├── common/                  # Shared utilities
│   └── agents/                 # Agent framework
├── docs/                        # Documentation
│   ├── api/                    # API reference
│   ├── architecture/           # ADRs, design docs
│   └── guides/                # User guides
├── infra/                       # Infrastructure (Docker, K8s)
├── tests/                       # Cross-service integration tests
├── scripts/                     # Build/deploy scripts
└── README.md
```

## Cryptography Standards

### 1. AES-256-GCM (Vault Encryption)
- **Purpose:** Encrypt API keys at rest in the vault
- **Key Derivation:** scrypt with fixed salt
- **Implementation:** Unified across TS (`src/crypto/aes-gcm.ts`), Python, Rust

### 2. Ed25519 (Identity & Signing)
- **Purpose:** Wallet authentication, agent keypairs, Solana transactions
- **Implementation:** Web Crypto API (TS), `ed25519` (Python), `ed25519-dalek` (Rust)

## Quick Start

```bash
# Install dependencies
cd src/rust-proxy && cargo build --release
cd ../api-server && npm install
cd ../web-frontend && npm install

# Run Rust proxy (hot path)
cd src/rust-proxy && cargo run --bin ks-proxy

# Run Python control plane (in another terminal)
cd src/python-legacy && python -m uvicorn server:app --port 8001

# Run frontend (in another terminal)
cd src/web-frontend && npm run dev
```

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed setup.

## Architecture Decision Records

- [ADR-001: Divergence decisions for stage-1 Rust port](src/rust-proxy/ADR-001-divergences.md)
- [ADR-002: Why fallthrough, not full port](src/rust-proxy/ADR-002-architecture.md)
- [ADR-003: Firewall rules](src/rust-proxy/ADR-003-firewall.md)
- [ADR-007: TLS and stealth mode](src/rust-proxy/ADR-007-tls-and-stealth.md)

## Testing

```bash
# Rust tests
cd src/rust-proxy && cargo test

# TypeScript tests
cd src/api-server && npm test
cd src/web-frontend && npm test

# Python tests
cd src/python-legacy && pytest

# Integration tests
cd tests && npm test
```

## Documentation

- [Architecture Overview](docs/architecture/README.md) — System architecture, components, security
- [System Design](docs/architecture/system-design.md) — Detailed technical specification
- [API Reference](docs/API.md) — Endpoint documentation
- [Development Guide](DEVELOPMENT.md) — Local setup, testing
- [Operator Guide](docs/OPERATOR.md) — Deployment, monitoring
- [Roadmap](ROADMAP.md) — Current progress and future plans

### Architecture Decision Records

- [ADR-001: Divergence decisions](src/rust-proxy/ADR-001-divergences.md)
- [ADR-002: Why fallthrough, not full port](src/rust-proxy/ADR-002-architecture.md)
- [ADR-003: Firewall rules](src/rust-proxy/ADR-003-firewall.md)
- [ADR-007: TLS and stealth mode](src/rust-proxy/ADR-007-tls-and-stealth.md)

## License

MIT
