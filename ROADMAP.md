# KeyShield roadmap

What's actually built, what's broken, what's left. Ground truth as of
2026-05-06 (post-MVP-night sprint).

## Status legend

- ✅ **shipped** — works end-to-end, has tests, in CI
- ⚙️ **shipped, no tests** — works but not protected by tests
- ⚠️ **half-done** — some pieces work, others stubbed/TODO
- 🔴 **broken** — was working, now regressed
- 📋 **designed only** — spec/plan exists, code doesn't
- ❌ **README claim, no code** — pure aspiration, delete or build

---

## TL;DR — what shipped today

Tonight's sprint (2026-05-05 → 2026-05-06) landed the spec-10 + spec-12
embedded-wallet pillar end-to-end at the protocol layer:

- **`mpp_settle` (#26) on-chain submit** — `v2-mvp/src/mpp_onchain.py` +
  idempotency table + 6 tests
- **`open_payment_stream` (#24) + `withdraw_agent_wallet` (#27) ix
  builders** — Python byte-perfect builders (owner-signed, frontend
  wallet adapter submits) + 9 tests
- **`/mpp/streams/{id}/build-{open,withdraw}-tx` server endpoints** —
  return ix payloads as `{programId, keys, data(base64)}` + 7 tests
- **`create_ephemeral_signer` (#23) ix builder + endpoint** — agent
  embedded wallet. The differentiator vs Coinbase Agentic. + 9 tests
- **x402 on-chain verification** — `x402_verify.py` with
  `eth_getTransactionReceipt` + ERC-20 Transfer log decode + UNIQUE
  idempotency table + 17 tests. Closes server.py:1067 TODO.
- **TLS productionization** — rustls 0.23 + axum-server. Three
  `KS_TLS_MODE` modes: off (default), self-signed (rcgen), acme
  (instant-acme HTTP-01 + 24h renewal task) + 18 tests + ADR-007 +
  spec 12
- **Stealth default-on** — derived from `KS_TLS_MODE`; `KS_STEALTH=0|1`
  always wins
- **Account deletion + Sharing (501 stub)** — `/auth/delete-account`
  with cascade + tombstone; `/share/grant` 501 path documenting the
  passkey-vault re-wrap requirement + 26 tests
- **ACME pebble integration test + x402 anvil integration test** —
  `#[ignore]`d / `skipif`d, ready to run against local fakes
- **`docs/OPERATOR.md`** (618 lines) — full runbook
- **`scripts/pay.sh`** — end-to-end CLI demo

**Test totals:** 310 passed, 10 skipped (Python) + 40 (Rust ks-proxy).
0 regressions across all commits.

---

## 1. Backend — Python control plane (`v2-mvp/`)

| Status | Feature | Where |
|---|---|---|
| ✅ | Passphrase login (`/auth/login`) | server.py |
| ✅ | Wallet login (Solana ed25519 + nonce) | server.py |
| ✅ | Agent self-auth (`/auth/agent-*`) | server.py |
| ✅ | Agent register/list/revoke (`/agents/*`) | server.py |
| ✅ | Passkey register/auth/list/delete | server.py |
| ✅ | Vault CRUD (multi-type: api_key / pw / note / env / ssh) | server.py |
| ✅ | Proxy with key injection (`/proxy/{upstream}/*`) | server.py + Rust port |
| ✅ | Batch parallel proxy (`/manage/batch`) | server.py |
| ✅ | Usage logging + stats (`/usage/stats|history`) | server.py |
| ✅ | Helius skill bundle (`/skill/helius/run`) | server.py |
| ✅ | Solana SOL/USDC topup (Pyth oracle + memo + idempotency) | billing_solana.py |
| ✅ | `/billing/balance|sol-quote|topup-history` | server.py |
| ✅ | `/_internal/balance` + `/_internal/log` (Rust bridge) | server.py |
| ✅ | `KS_INTERNAL_SECRET` firewall middleware | server.py |
| ✅ | **x402 payment-proof verification + idempotency** (this sprint) | server.py + `x402_verify.py` |
| ✅ | **MPP stream open/record/settle/close** (this sprint) | server.py + `mpp_streams.py` + `mpp_onchain.py` |
| ✅ | **MPP build-tx endpoints (`/mpp/streams/{id}/build-{open,withdraw}-tx`)** (this sprint) | server.py + `mpp_onchain.py` |
| ✅ | **Ephemeral signer build-tx endpoint** (this sprint) | server.py + `agent_wallet.py` |
| ✅ | **Account deletion (cascade + tombstone)** (this sprint) | server.py + `session.py` |
| ⚠️ | **Sharing — 501 stub** (this sprint) | server.py + `sharing.py` |
| 📋 | Sharing — full crypto (DEK re-wrap to recipient) | requires passkey-vault refactor |
| 📋 | Ephemeral signer top-up (`/agents/{id}/wallet/topup`) | follow-up |
| 📋 | Ephemeral signer balance read | follow-up |

## 2. Backend — Rust hot-path proxy (`proxy-rs/`)

| Status | Feature | Where |
|---|---|---|
| ✅ | 5 crates compile + 78+ tests | proxy-rs/crates/ |
| ✅ | Auth (bearer → session) | ks-session |
| ✅ | Vault decrypt (PBKDF2 + AES-GCM) | ks-vault |
| ✅ | Per-upstream auth injection (10 providers) | ks-upstream |
| ✅ | Helius DAS/Enhanced/RPC routing + cache | ks-upstream + ks-helius |
| ✅ | TTL cache + pycompat (Python json.dumps byte parity) | ks-cache |
| ✅ | `/proxy/{upstream}/*`, `/manage/batch`, `/health` handlers | ks-proxy |
| ✅ | Bridge to Python (buffered logs) | ks-proxy::bridge |
| ✅ | Stealth mode default-on (derived from `KS_TLS_MODE`) | ks-proxy::stealth |
| ✅ | `X-Internal-Secret` injection on fallthrough | ks-proxy::handlers |
| ✅ | Oracle_diff harness (12 fixtures, byte-equal vs Python) | proxy-rs/scripts/ |
| ✅ | **TLS termination** — rustls 0.23 + axum-server (this sprint) | ks-proxy::tls |
| ✅ | **Self-signed cert mode** (rcgen) (this sprint) | ks-proxy::tls |
| ✅ | **ACME (Let's Encrypt) HTTP-01 + 24h renewal** (this sprint) | ks-proxy::acme |
| ✅ | **Pebble integration test (`#[ignore]`)** (this sprint) | proxy-rs/crates/ks-proxy/tests/acme_pebble.rs |
| 📋 | DNS-01 challenge for wildcard certs | not in v1 |
| 📋 | OCSP stapling | depends on webpki-ocsp stable |
| 📋 | Single-binary deploy (article-3 form) | E group |

## 3. Frontend — `frontend/` (React + Vite + Chrome extension)

| Status | Feature | Where |
|---|---|---|
| ✅ | Passphrase + wallet + passkey login | AuthScreen + lib/auth.ts |
| ✅ | VaultSection — list/add/decrypt/delete keys | components/sections/VaultSection.tsx |
| ✅ | Multi-type AddKeyModal | AddKeyModal.tsx |
| ✅ | AgentsSection — register/list/revoke ed25519 agents | components/sections/AgentsSection.tsx |
| ✅ | ActivitySection — usage + stats + balance + Solana topup | components/sections/ActivitySection.tsx |
| ✅ | SessionsSection — passkey list/delete + logout | components/sections/SessionsSection.tsx |
| ✅ | DeveloperSection — curl examples | components/sections/DeveloperSection.tsx |
| ✅ | DocsSection — architecture + agent flow | components/sections/DocsSection.tsx |
| ✅ | Chrome extension content.js — auto-detect 8 providers, 12 patterns | content.js |
| ✅ | Frontend `tsc --noEmit` + `vite build` in CI | .github/workflows/ |
| ✅ | **SettingsSection — Danger Zone account deletion** (this sprint) | SettingsSection.tsx |
| ✅ | **SharingSection — full UI tabs (501 banner)** (this sprint) | SharingSection.tsx |
| ⚠️ | **MPP "Open on-chain stream" wallet flow** (in progress, Bucket 1 retry) | ActivitySection.tsx |
| ⚠️ | **Browser extension save→/manage/store flow** (in progress, Bucket B) | content.js + background.js |
| 📋 | Ephemeral signer "Give this agent a wallet" button | AgentsSection.tsx |
| 📋 | E2E tests (Playwright) — beyond key-capture | tests/e2e/ |

## 4. CLI — `packages/cli/`

Unchanged this sprint. All 11 commands still ship; CI for CLI still
deferred (small task).

| Status | Command | What it does |
|---|---|---|
| ✅ | `keyshield login/logout/status` | session mgmt |
| ✅ | `keyshield list/get/store/delete` | vault ops |
| ✅ | `keyshield run -- <cmd>` | env injection |
| ✅ | `keyshield doctor` | diagnostics |
| ✅ | `keyshield agent list/register/revoke` | agent grants |
| ✅ | Local mode (parse `.env` directly) | env-file.ts |
| 📋 | CI for CLI (`tsc --noEmit` + workspace test) | small |

## 5. Mobile — `mobile/` (P3 — deferred)

Per ROADMAP P3 priority + tonight's deprioritization. The 1300 lines
of TS still typecheck via vitest, but **no native shell** (no Xcode
project, no Expo wrap, no `npx expo run:ios`). Pick this up when
mobile is actually a strategic priority.

## 6. Solana program — `programs/keyshield/`

| Status | Feature | Where |
|---|---|---|
| ✅ | UniversalVault PDA | state.rs |
| ✅ | AgentGrant PDA | state.rs |
| ✅ | EphemeralSigner struct (64 bytes) | state.rs:312 |
| ✅ | `CreateEphemeralSigner` ix #23 | agent_access.rs |
| ✅ | `OpenPaymentStream` ix #24 | open_stream.rs |
| ✅ | `PayX402` ix #25 | pay_x402.rs |
| ✅ | `MppSettle` ix #26 | mpp_settle.rs |
| ✅ | `WithdrawAgentWallet` ix #27 | withdraw.rs |
| ✅ | Mollusk unit tests in CI | .github/workflows/ |
| 📋 | Devnet end-to-end test (in progress, Bucket C dispatch) | scripts/devnet-e2e.sh + scripts/devnet-setup.sh |
| 📋 | `cargo test-sbf` integration via Surfpool | continue-on-error in CI |

### 6a. Ephemeral signer / agent embedded wallet — the differentiator

Status: **server-side complete this sprint**. Frontend wrap pending.

- ✅ On-chain struct + ix #23 (state.rs:312, agent_access.rs)
- ✅ Python ix builder (`v2-mvp/src/agent_wallet.py`)
- ✅ AllowedActions bitmap (PAY_X402 / MPP_RECORD / PROXY_CALL / READ_VAULT)
- ✅ `POST /agents/{id}/wallet/create-tx` server endpoint
- ✅ 9 byte-layout / account-ordering tests
- 📋 Frontend AgentsSection.tsx "Give this agent a wallet" button
- 📋 Top-up flow (owner sends SOL/USDC to ephemeral signer)
- 📋 Balance read endpoint

## 7. Infra

| Status | Feature | Where |
|---|---|---|
| ✅ | sync-worker (Cloudflare Worker, vault sync via passkey PRF) | infra/sync-worker/ |
| ✅ | sync-worker auto-deploy on push to main | .github/workflows/ |
| ✅ | One-command dev launcher | scripts/dev.sh |
| ✅ | CI for Rust + frontend + npm workspaces | .github/workflows/ |
| ✅ | `KS_INTERNAL_SECRET` firewall | dev.sh + middleware + Rust injection |
| ✅ | **TLS cert lifecycle (ACME)** (this sprint) | ks-proxy::acme |
| ✅ | **Stealth wired into deploy** (this sprint) | ks-proxy::stealth |
| ✅ | **Operator runbook** (this sprint) | docs/OPERATOR.md |
| 📋 | Docker compose for production deploy | E group, after env vars freeze |
| 📋 | Real domain + ACME cert lifecycle (binary ready, needs DNS+ops) | E group |

## 8. Docs

| Status | Doc | What it covers |
|---|---|---|
| ✅ | `README.md` | Top-level pitch |
| ✅ | `AGENTS.md` (25KB) | Integration guide for agent developers |
| ✅ | `USAGE.md` | Hands-on user guide |
| ✅ | `DEVELOPMENT.md` | One-command dev launch + test commands |
| ✅ | `ROADMAP.md` (this file) | Honest current state |
| ✅ | `proxy-rs/BOUNDARY.md` | Hot path vs control plane |
| ✅ | `proxy-rs/ADR-001-divergences.md` | Python-bug decisions for the port |
| ✅ | `proxy-rs/ADR-002-architecture.md` | Why fallthrough not full port |
| ✅ | `proxy-rs/ADR-003-firewall.md` | KS_INTERNAL_SECRET design |
| ✅ | **`proxy-rs/ADR-007-tls-and-stealth.md`** (this sprint) | TLS + stealth-default decisions |
| ✅ | `proxy-rs/specs/00-08` | Stage 1 port specs |
| ✅ | `proxy-rs/specs/09-helius-client.md` | v2 — full HeliusClient |
| ✅ | `proxy-rs/specs/10-embedded-wallet.md` | Embedded wallet pillar |
| ✅ | `proxy-rs/specs/11-user-interactions.md` | 31-interaction matrix |
| ✅ | **`proxy-rs/specs/12-tls-stealth.md`** (this sprint) | Production HTTPS |
| ✅ | **`docs/OPERATOR.md`** (this sprint) | Production runbook |
| ✅ | `docs/PAYMENT-FLOWS.md` | x402 / MPP / Solana topup |
| 📋 | **`docs/DEVNET.md`** (in progress, Bucket C) | Devnet e2e ops |
| 📋 | **`docs/EXTENSION.md`** (in progress, Bucket B) | Browser extension flow |

## 9. README claims that aren't true

| README claim | Reality | Recommendation |
|---|---|---|
| ❌ "Lit Protocol threshold encryption" | placeholder | delete from README until built |
| ❌ "Bonsol ZK proofs" | placeholder | delete |
| ❌ "Arcium MPC" | placeholder | delete |
| ❌ "GOAT Wallet — 250+ onchain actions" | only priority-fee handler | drop the "250+" claim |
| ⚠️ "Browser extension auto-detects 100+ patterns" | 8 providers, 12 patterns (real) | update count |
| ❌ "App Store / Play Store" | no Xcode/Android projects | drop until packaged |

---

## Priority for the next sprint

### P0 — what blocks demo (do this week)

- ⚠️ **Frontend wallet integration for spec-10 ixs** — Bucket 1 dispatch
  in progress. Without it, "Open on-chain stream" / "Withdraw" buttons
  build the right ix bytes but can't sign. Demo workaround: `pay.sh`
  script (CLI demo path that exercises the whole flow without
  needing in-browser wallet).
- ⚠️ **Browser extension save→backend flow** — Bucket B dispatch in
  progress. content.js detects keys but background.js doesn't yet
  POST to `/manage/store`.
- 📋 **Devnet e2e** — Bucket C dispatch in progress. Will produce
  `scripts/devnet-{setup,e2e}.sh` + `docs/DEVNET.md`.

### P1 — product-completing (fix this month)

- 📋 **Ephemeral signer follow-ups** — top-up endpoint, balance read,
  frontend "Give this agent a wallet" button. Server primitive is
  ready (this sprint).
- 📋 **MPP frontend wallet integration** — pairs with P0 #1 above.
- 📋 **Sharing — full DEK re-wrap** — requires passkey-vault refactor;
  current `/share/grant` returns 501 with explanation.

### P2 — Stage 2 productionization

- ✅ **TLS termination on Rust** (this sprint)
- ✅ **Stealth wired** (this sprint)
- ✅ **Operator runbook** (this sprint)
- 📋 Single-binary deploy + Docker compose (E group, after env freeze)
- 📋 Real domain + ACME cert lifecycle (binary ready; ops work only)

### P3 — feature expansion

- 📋 Mobile iOS/Android packaging — mobile/ has 1300 lines of TS
  but no native shell. Pick up when actually a priority.
- 📋 MPP streaming payment full UI
- 📋 Lit/Bonsol/Arcium if/when actually needed for a feature

### P4 — observability

- 📋 Metrics (Prometheus or similar) on Rust + Python
- 📋 Error tracking (Sentry)
- 📋 Audit log retention policy

---

## Today's open dispatch (2026-05-06 evening sprint)

Three agents working in parallel via `isolation: "worktree"` off
`feat/frontend-wallet-mpp`:

| Bucket | Task | Status |
|--------|------|--------|
| 1 (retry) | Frontend wallet integration for spec-10 ixs | 🔄 running |
| B | Browser extension save→backend flow + manifest polish | 🔄 running |
| C | Devnet e2e setup + scripts + docs/DEVNET.md | 🔄 running |

After they land, **E group** (Docker compose + final docs sync +
domain) is the last step before tagging v0.1.0.
