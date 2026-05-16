# KeyShield Roadmap

What's built, what's broken, what's left. Ground truth as of 2026-05-09.

## Architecture — Consolidated

All code lives under `src/`:
- **`src/backend/`** — Python FastAPI control plane (app.py + 12 domain modules). Stateless `/proxy/*` after the Path A merge.
- **`src/proxy/`** — Rust hot-path proxy (6 crates, 78+ tests)
- **`src/programs/keyshield/`** — Solana on-chain program (7 instructions)
- **`src/web/`** — Active dashboard (Vite + React 19, renamed from `dashboard/` on 2026-05-10).
- **`src/_archive/web-v2/`** — Prior dashboard with the full Path A vault client (`lib/{vault,sync,sync-auth}.ts`) + Device Vault UI. Archived 2026-05-10. Reintegration into the new `src/web/` is pending — wallet sign-off + device-vault flows currently live here only.
- **`src/_archive/web/`** — Original popup-style React frontend + Chrome extension build.
- **`src/mobile/`** — React Native mobile app (no native shell yet)
- **`src/sdk/`** — SDK packages (agent-sdk, cli, goat-wallet, openclaw-skill)
- **`src/infra/`** — Cloudflare workers (vault sync), Grafana/Prometheus
- **`src/scripts/`** — Dev/deploy scripts
- **`tests/e2e/`** — Playwright E2E tests

## Recent Milestones

- **2026-05-09 — Path A + Python merge** ✅ Vault storage moved off Python onto the Cloudflare sync-worker (zero-knowledge, R2-backed). Python `/proxy/*` refactored to stateless (`X-Upstream-API-Key` header per request). Legacy `/manage/*` plaintext-storage routes removed. `extension-sync/` workspace consolidated into `src/web-v2/lib/`.

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
| ✅ | Stateless `/proxy/*` (X-Upstream-API-Key header) | routes/proxy.py |
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

> Vault CRUD lives outside the Python backend now: vault
> ciphertext is stored on the Cloudflare sync-worker via the
> Path A client in `src/web-v2/lib/{vault,sync,sync-auth}.ts`.
> The Python `/proxy/*` no longer holds upstream keys.

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

## 4. Web v2 dashboard (`src/web-v2/`) + Sync Worker (`src/infra/sync-worker/`)

Path A vault client + dashboard. Builds with Vite 6 + React 19. The
`lib/{vault,sync,sync-auth}.ts` modules implement WebAuthn-PRF →
HKDF → AES-256-GCM client-side encryption and talk to the
Cloudflare sync-worker over `/vault/:id` + `/auth/*`. The
sync-worker is zero-knowledge — only ciphertext + WebAuthn
material on R2.

## 5. Web Frontend (`src/web/`)

Builds to 904KB with React 19 + Vite 6. All 10 sections functional. Chrome extension integrated.

## 6. Mobile (`src/mobile/`) — P3 Deferred

1300 lines TS, no native shell.

## 7. SDK + Infra (`src/sdk/`, `src/infra/`)

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

---

## Specs (architectural decision records)

`src/proxy/specs/` is the canonical home for architecture +
user-feature specs. Each spec follows the format in
`SPEC-WRITING-GUIDE.md` (user-feature anchored, layer table, wire
shape, decision rationale).

### Foundational (Stage 1)

| # | Topic | Status |
|---|---|---|
| 00 | Project overview | ✅ |
| 01 | Vault format (legacy server-side) | ✅ |
| 02 | Session format | ✅ |
| 03 | Cache policy | ✅ |
| 04 | Upstream auth | ✅ |
| 05 | Helius routing | ✅ |
| 06 | Batch | ✅ |
| 07 | Bridge (Rust ↔ Python) | ✅ |
| 08 | Python compat | ✅ |
| 09 | Helius client + method list | ✅ |

### User-feature specs (Stage 2+)

| # | Topic | Status |
|---|---|---|
| 10 | Embedded wallet (EphemeralSigner) | ✅ shipped |
| 11 | User interactions | ✅ shipped |
| 12 | TLS / stealth mode | ✅ shipped |
| 13 | Agent access (3 patterns: CLI / dashboard / agent) | ✅ shipped |
| 14 | Dashboard CTA → on-chain signer | ✅ shipped (2026-05-10) |
| 15 | MPP stream lifecycle (open / record / settle / close) | ✅ shipped (2026-05-10) |
| 16 | Path A device vault (client crypto + CF sync) | ✅ shipped (2026-05-10) |
| 17 | Agent permissions (owner/collaborator/viewer) | 📋 design v1 (2026-05-10) |
| 18 | Audit log + retention | ⚙️ client v1 / 📋 server v1 (2026-05-10) |

### Architecture decision records

| # | Topic | Status |
|---|---|---|
| ADR-001 | (legacy, see file) | ✅ |
| ADR-002 | User-feature spec format | ✅ |
| ADR-007 | Stealth-default order | ✅ |
| ADR-008 | CI devnet pipeline (workflow_dispatch + tag trigger) | ✅ shipped (2026-05-10) |

When adding a new spec: pick the next free number, follow
`src/proxy/specs/SPEC-WRITING-GUIDE.md`, link from this index.
