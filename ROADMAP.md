# KeyShield Roadmap

What's built, what's broken, what's left. Ground truth as of 2026-05-09.

## Architecture — Consolidated

All code lives under `src/`:
- **`src/backend/`** — Python FastAPI control plane (app.py + 12 domain modules)
- **`src/proxy/`** — Rust hot-path proxy (6 crates, 78+ tests)
- **`src/programs/keyshield/`** — Solana on-chain program (7 instructions)
- **`src/web/`** — React frontend + Chrome extension (builds to 904KB)
- **`src/mobile/`** — React Native mobile app (no native shell yet)
- **`src/sdk/`** — SDK packages (agent-sdk, cli, goat-wallet, openclaw-skill)
- **`src/infra/`** — Cloudflare workers, Grafana/Prometheus
- **`src/scripts/`** — Dev/deploy scripts
- **`tests/e2e/`** — Playwright E2E tests

## Status Legend

- ✅ **shipped** — works end-to-end, has tests, in CI
- ⚙️ **shipped, no tests** — works but not protected by tests
- ⚠️ **half-done** — some pieces work, others stubbed/TODO
- 🔴 **broken** — was working, now regressed
- 📋 **designed only** — spec/plan exists, code doesn't

---

## 1. Backend — Python Control Plane (`src/backend/`)

| Status | Feature | Where |
|---|---|---|
| ✅ | Passphrase login (`/auth/login`) | routes/auth.py |
| ✅ | Wallet login (Solana ed25519 + nonce) | routes/auth.py |
| ✅ | Agent self-auth (`/auth/agent-*`) | routes/auth.py |
| ✅ | Agent register/list/revoke | routes/agents.py |
| ✅ | Passkey register/auth/list/delete | routes/auth.py |
| ✅ | Vault CRUD (multi-type) | routes/vault.py |
| ✅ | Proxy with key injection | routes/proxy.py |
| ✅ | Batch parallel proxy | routes/proxy.py |
| ✅ | Usage logging + stats | routes/billing.py |
| ✅ | Helius skill bundle | skills/helius_skill.py |
| ✅ | Solana SOL/USDC topup | billing/billing_solana.py |
| ✅ | x402 payment-proof verification | proxy/x402_verify.py |
| ✅ | MPP stream open/record/settle/close | mpp/ |
| ✅ | Ephemeral signer build-tx | agents/agent_wallet.py |
| ✅ | Account deletion (cascade) | routes/auth.py |
| ✅ | `KS_INTERNAL_SECRET` firewall | middleware/auth.py |
| ✅ | TLS (rustls + axum-server) | src/proxy/ |
| ⚠️ | Sharing — 501 stub | routes/sharing.py |

## 2. Rust Hot-Path Proxy (`src/proxy/`)

| Status | Feature | Where |
|---|---|---|
| ✅ | 6 crates + 78+ tests | crates/ |
| ✅ | Auth + Vault decrypt + Auth injection | ks-session/ks-vault/ks-upstream |
| ✅ | Helius routing + cache | ks-helius/ks-cache |
| ✅ | Proxy handlers + Python bridge | ks-proxy |
| ✅ | Stealth mode default-on | ks-proxy::stealth |
| ✅ | TLS + ACME renewal | ks-proxy::tls/acme |

## 3. Solana Program (`src/programs/keyshield/`)

7 instructions: CreateEphemeralSigner, OpenPaymentStream, PayX402, MppSettle, WithdrawAgentWallet + PDAs

## 4. Web Frontend (`src/web/`)

Builds to 904KB with React 19 + Vite 6. All 10 sections functional. Chrome extension integrated.

## 5. Mobile (`src/mobile/`) — P3 Deferred

1300 lines TS, no native shell.

## 6. SDK + Infra (`src/sdk/`, `src/infra/`)

Agent SDK, CLI, goat-wallet, openclaw-skill. Cloudflare sync-worker, Grafana metrics.

---

## Priority

### P0 — Demo-ready
- Frontend wallet integration for spec-10 ixs
- Browser extension save→backend flow
- Devnet e2e test

### P1 — Product-completing
- Ephemeral signer follow-ups
- MPP frontend wallet integration
- Sharing — full DEK re-wrap

### P2 — Productionization
- Docker compose + real domain + ACME lifecycle

### P3 — Feature expansion
- Mobile packaging, Lit/Bonsol/Arcium

### P4 — Observability
- Prometheus, Sentry, audit log retention
