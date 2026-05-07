# KeyShield Architecture

> Zero-trust API key proxy with vault encryption, Solana wallet auth, and multi-party computation.

## System Overview

KeyShield is a **zero-trust proxy system** that decouples API key ownership from API key usage. It provides:

1. **Encrypted Vault** — API keys encrypted at rest (AES-256-GCM)
2. **Hot-Path Proxy** — Rust-based low-latency request forwarding
3. **Control Plane** — Python-based vault CRUD, agent management, billing
4. **Solana Integration** — On-chain vault state, wallet auth, payment streams
5. **Multi-Party Computation** — Distributed key generation (MPC) for high-security use cases

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Client Layer                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Web UI   │  │ Mobile   │  │ CLI      │  │ Agents   │            │
│  │ (Next.js)│  │ (React   │  │ (TS SDK) │  │ (SDK)    │            │
│  │          │  │  Native) │  │          │  │          │            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │              │              │              │                    │
│       └──────────────┴──────────────┴──────────────┘                    │
│                             │ HTTPS :8000                              │
└─────────────────────────────────────┼─────────────────────────────────────┘
                                  │
┌─────────────────────────────────────▼─────────────────────────────────────┐
│                      ks-proxy (Rust) :8000                             │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Request Pipeline                            │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │    │
│  │  │ AuthN   │→│ Rate    │→│ Key     │→│ Cache   │   │    │
│  │  │ (Wallet │  │ Limit  │  │ Inject  │  │ (LRU)  │   │    │
│  │  │  /JWT)  │  │         │  │         │  │         │   │    │
│  │  └─────────┘  └─────────┘  └────┬────┘  └─────────┘   │    │
│  │                                    │                    │    │
│  │  ┌─────────────────────────────────▼──────────────────┐   │    │
│  │  │              Upstream Forward                      │   │    │
│  │  │  OpenAI, Anthropic, Groq, 0x, Titan, Helius  │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                  │                                   │
│                      Fallthrough │ (reverse proxy)                    │
│                                  ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Python Control Plane :8001                          │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │    │
│  │  │ Vault    │ │ Agents   │ │ Billing │ │ Passkey │      │    │
│  │  │ CRUD     │ │ Manage   │ │ (Pyth)  │ │ (FIDO2) │      │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────────▼─────────────────────────────────────┐
│                       Solana Blockchain                                │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  KeyShield Program (on-chain)                             │       │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐          │       │
│  │  │ Vault      │ │ MPP        │ │ Payment    │          │       │
│  │  │ (PDA)      │ │ Settle     │ │ Stream     │          │       │
│  │  └────────────┘ └────────────┘ └────────────┘          │       │
│  └──────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Rust Proxy (`src/rust-proxy/`)

**Purpose:** Hot-path request processing — authentication, rate limiting, key injection, caching.

**Crates:**
- `ks-proxy` — Main proxy binary, request routing, fallthrough
- `ks-session` — Session management, wallet auth, JWT issuance
- `ks-vault` — Vault operations (Python bridge), key decryption
- `ks-cache` — LRU cache with TTL, oracle compatibility
- `ks-upstream` — Upstream HTTP client, connection pooling
- `ks-helius` — Helius RPC client, DAS API, enhanced methods

**Key Design Decisions:**
- See [ADR-002: Why fallthrough, not full port](src/rust-proxy/ADR-002-architecture.md)
- See [ADR-001: Divergence decisions](src/rust-proxy/ADR-001-divergences.md)

### 2. Python Control Plane (`src/python-legacy/`)

**Purpose:** Vault CRUD, agent management, billing, passkey auth, Pyth price feeds.

**Modules:**
- `server.py` — FastAPI application, route definitions
- `api_router.py` — Upstream routing, provider-specific auth
- `vault.py` — Vault operations, encryption/decryption
- `session.py` — Session management, wallet login
- `agents.py` — Agent CRUD, keypair management
- `billing_solana.py` — Pyth price feeds, SOL billing
- `helius_router.py` — Helius DAS, enhanced RPC
- `mpp_onchain.py` — Multi-party payment settlement
- `x402_verify.py` — x402 micropayment verification
- `passkey.py` — FIDO2/WebAuthn registration + login
- `sharing.py` — Vault sharing between users
- `usage.py` — Usage tracking, analytics

**Trading Bot (`trading/`):**
- `agent.py` — MarketDataAgent, RiskAgent, AnalysisAgent, ExecutionAgent
- `execution.py` — 0x quotes, Titan submissions, parallel execution
- `feeds.py` — Pyth price feeds, SSE handlers
- `models.py` — Pydantic models, request/response schemas

### 3. TypeScript SDKs (`src/sdk/`)

**Packages:**
- `agent-sdk` — TypeScript SDK for AI agents
- `cli` — Command-line interface (`ks` command)
- `goat-wallet` — Solana wallet integration (goat-compatible)

### 4. Solana Programs (`src/solana-programs/`)

**KeyShield Program Instructions:**
- `store_key` — Store encrypted key reference on-chain
- `access_key` — Grant/revoke agent access
- `share_key` — Share vault with another user
- `open_stream` — Open payment stream (x402)
- `pay_x402` — Pay for API usage via x402 protocol
- `mpp_settle` — Settle multi-party payment
- `withdraw` — Withdraw SOL from vault
- `universal_vault` — Unified vault operations

### 5. Web Frontend (`src/web-frontend/`)

**Stack:** Next.js 14, React, TypeScript, Tailwind CSS

**Sections:**
- VaultSection — Key management UI
- AgentsSection — Agent management
- SharingSection — Vault sharing
- SessionsSection — Active sessions
- DeveloperSection — API docs, OpenClaw skill
- SettingsSection — User settings, passkey management
- ActivitySection — Usage logs, audit trail

### 6. Mobile App (`src/mobile-app/`)

**Stack:** React Native, Expo, Solana Mobile Stack

**Screens:**
- VaultList — List vaults
- UnlockScreen — Biometric/PIN unlock
- RestoreScreen — Mnemonic phrase restore
- UpgradeScreen — Upgrade to Pro
- RecoveryPhraseScreen — Show recovery phrase

### 7. Crypto Module (`src/crypto/`)

**Standards:**
- **AES-256-GCM** — Vault encryption at rest (cross-compatible TS/Python/Rust)
- **Ed25519** — Wallet auth, agent keypairs, Solana signing

**Modules:**
- `aes-gcm.ts` — AES-256-GCM encrypt/decrypt (TypeScript)
- `ed25519.ts` — Ed25519 sign/verify (Web Crypto API)
- `kdf.ts` — Key derivation (scrypt, HKDF)

## Data Flow

### Request Flow (Hot Path)

```
Client Request
    │
    ▼
ks-proxy: Authenticate (wallet signature / JWT)
    │
    ▼
ks-proxy: Rate limit check (per user/API key)
    │
    ▼
ks-proxy: Decrypt API key from vault (AES-256-GCM)
    │
    ▼
ks-proxy: Inject key into request headers
    │
    ▼
ks-proxy: Check cache (LRU + TTL)
    │
    ├─ Cache HIT → Return cached response
    │
    └─ Cache MISS → Forward to upstream
                       │
                       ▼
                  Upstream API (OpenAI, etc.)
                       │
                       ▼
                  Cache response (if cacheable)
                       │
                       ▼
                  Return to client
```

### Fallthrough Flow (Control Plane)

```
Client Request (non-hot-path)
    │
    ▼
ks-proxy: Check if route is in fallthrough list
    │
    ▼ (yes)
ks-proxy: Reverse proxy to Python :8001
    │
    ▼
Python: Handle request (vault CRUD, agents, billing, etc.)
    │
    ▼
Python: Return response
    │
    ▼
ks-proxy: Forward response to client
```

## Security Architecture

### Zero-Trust Principles

1. **Keys never in client code** — Keys stored encrypted in vault, decrypted server-side per request
2. **Session-based access** — Wallet signature → JWT → session token (ksv2_xxx)
3. **Passkey support** — FIDO2/WebAuthn for passwordless auth
4. **Agent isolation** — Agents have their own ed25519 keypair, specific access grants
5. **Rate limiting** — Per-user, per-API-key limits
6. **Audit logging** — All key access logged (wallet, timestamp, upstream)

### Encryption Layers

```
┌─────────────────────────────────────────┐
│         Client Application              │
│  (only has session token)              │
└──────────────┬────────────────────────┘
               │ ksv2_xxx token
               ▼
┌─────────────────────────────────────────┐
│         ks-proxy (Rust)                │
│  Decrypt key using session passphrase  │
│  (AES-256-GCM with scrypt KDF)       │
└──────────────┬────────────────────────┘
               │ raw API key (in memory, per request)
               ▼
┌─────────────────────────────────────────┐
│         Upstream API                    │
│  (OpenAI, Anthropic, etc.)            │
└─────────────────────────────────────────┘
```

## Scalability Design

### Horizontal Scaling

- **ks-proxy:** Stateless (sessions in SQLite, cache in memory). Can run multiple instances behind load balancer.
- **Python control plane:** Can be scaled independently. Not on hot path.
- **Cache:** LRU with TTL. Future: Redis for distributed cache.

### Performance Optimizations

1. **Connection pooling** — `ks-upstream` reuses HTTP connections
2. **Parallel execution** — Trading bot uses `asyncio.gather()` for quote + analysis
3. **Cache-aware routing** — Helius RPC cached by method name (getBalance, etc.)
4. **Fallthrough is exception** — Only non-hot-path routes hit Python

## Deployment Architecture

See [OPERATOR.md](docs/OPERATOR.md) for deployment guide.

```
┌─────────────────────────────────────────┐
│         Docker Compose                   │
│  ┌──────────┐  ┌──────────┐           │
│  │ ks-proxy │  │ Python   │           │
│  │ :8000    │  │ :8001    │           │
│  └──────────┘  └──────────┘           │
│         │               │                │
│         └───────┬───────┘                │
│                 │                        │
│         ┌───────▼───────┐                │
│         │  SQLite DB    │                │
│         │  (volumes)    │                │
│         └───────────────┘                │
└─────────────────────────────────────────┘
```

## Development Workflow

See [DEVELOPMENT.md](DEVELOPMENT.md) for local setup.

```bash
# 1. Start Rust proxy
cd src/rust-proxy && cargo run --bin ks-proxy

# 2. Start Python control plane (another terminal)
cd src/python-legacy && uvicorn src.server:app --port 8001

# 3. Start frontend (another terminal)
cd src/web-frontend && npm run dev

# 4. Run tests
cd src/rust-proxy && cargo test
cd src/python-legacy && pytest
cd src/web-frontend && npm test
```

## Further Reading

- [Architecture Decision Records](src/rust-proxy/) — ADR-001 through ADR-007
- [API Routing Guide](docs/technical/API_ROUTING_GUIDE.md)
- [Technical Architecture](docs/technical/TECHNICAL_ARCHITECTURE.md)
- [Local Vault Architecture](docs/technical/LOCAL_VAULT_ARCHITECTURE.md)
- [MPC Coordination Guide](docs/technical/MPC_COORDINATION_GUIDE.md)
