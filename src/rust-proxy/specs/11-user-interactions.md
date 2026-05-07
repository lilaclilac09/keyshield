# 11 — User-interaction matrix (31 interactions)

> **Status: full spec v1.** The complete enumeration of user-visible
> interactions with KeyShield, mapped to component / endpoint / runtime.
> Source of truth when deciding "where does feature X live" — pairs with
> ADR-002 (fallthrough architecture), spec 09 (HeliusClient), spec 10
> (embedded wallet), and the SPEC-WRITING-GUIDE's user-feature-first
> requirement.

## Purpose

Three concrete uses for this matrix:
1. **Product reviews:** when adding a feature, confirm which actor it
   serves and which port handles it.
2. **CI gating:** every interaction below should have at least one
   integration or e2e test. Empty cells = test gap.
3. **Onboarding:** new contributors read this to learn the product
   surface in one page.

## Three actors

- **Owner** — human user, opens the dashboard at `:5173`. Low frequency,
  high stakes per click. Their interactions go to `:8000` (Rust) which
  reverse-proxies to `:8001` (Python control plane).
- **Agent** — programmatic. Python script / Codex bot / OpenClaw skill /
  trading bot. High frequency. Their proxy calls go to `:8000` (Rust)
  which handles them directly (hot path); auth + skill calls fall
  through to Python.
- **Developer** — integrating KeyShield into their own code. Reads
  docs, runs sample curls, opens the dashboard once.

## The 31

### Owner — 21 interactions, all → Python `:8001` (via Rust fallthrough)

| # | Interaction | UI surface | Endpoint | Server-side code |
|---|---|---|---|---|
| 1 | Login with passphrase | AuthScreen | `POST /auth/login` | `server.py:435` |
| 2 | Login with Solana wallet (sign challenge) | AuthScreen | `POST /auth/wallet-challenge` + `POST /auth/wallet-login` | `server.py:449-501` |
| 3 | Login with passkey (Touch ID / Face ID / Windows Hello) | AuthScreen | `GET /auth/passkey/auth-options` + `POST /auth/passkey/auth-verify` | `server.py:956-978` |
| 4 | Register a new passkey | SessionsSection / passkey.html | `GET /auth/passkey/register-options` + `POST /auth/passkey/register-verify` | `server.py:929-953` |
| 5 | List my passkeys | SessionsSection | `GET /auth/passkey/list` | `server.py:981` |
| 6 | Delete a passkey | SessionsSection | `DELETE /auth/passkey/{credId}` | `server.py:987` |
| 7 | Add an API key (multi-type via AddKeyModal) | VaultSection | `POST /manage/store` | `server.py:679` |
| 8 | List my vault entries (masked) | VaultSection | `GET /manage/list` | `server.py:639` |
| 9 | Decrypt + reveal a key (self-verify) | VaultSection RevealField | `GET /manage/decrypt/{upstream}` | `server.py:659` |
| 10 | Delete a vault entry | VaultSection | `DELETE /manage/secret/{upstream}` | `server.py:692` |
| 11 | Register an agent's ed25519 pubkey | AgentsSection | `POST /agents/register` | `server.py:597` |
| 12 | List registered agents | AgentsSection | `GET /agents/list` | `server.py:614` |
| 13 | Revoke an agent | AgentsSection | `DELETE /agents/{id}` | `server.py:622` |
| 14 | View call history | ActivitySection | `GET /usage/history` | `server.py:1003` |
| 15 | View per-upstream usage stats | ActivitySection | `GET /usage/stats` | `server.py:996` |
| 16 | Check current balance | ActivitySection | `GET /billing/balance` | `server.py:1011` |
| 17 | Get $X-to-SOL quote (Pyth) | ActivitySection | `GET /billing/sol-quote?amount_usd=...` | `server.py:1073` |
| 18 | Top up via on-chain SOL | ActivitySection | `POST /billing/topup-solana` | `server.py:1141` |
| 19 | Top up via on-chain USDC (SPL) | ActivitySection | `POST /billing/topup-solana-usdc` | `server.py:1244` |
| 20 | View topup history | ActivitySection | `GET /billing/topup-history` | `server.py:1319` |
| 21 | Logout | any section | `POST /auth/logout` | `server.py:441` |

### Agent — 7 interactions; 5 are Rust-direct, 2 fall through

| # | Interaction | Where called from | Endpoint | Runtime |
|---|---|---|---|---|
| 22 | Self-authenticate (ed25519 sign challenge → token) | agent process | `GET /auth/agent-challenge` + `POST /auth/agent-login` | Python (control plane) |
| 23 | Call OpenAI / Anthropic / Mistral / Cohere / Groq / Alchemy / 0x / Titan / Pyth | agent process | `POST/GET /proxy/{upstream}/{path}` | **Rust direct** (`ks-proxy::proxy`) |
| 24 | Call Helius RPC / DAS / Enhanced (post spec 09 land: typed via `ks-helius`) | agent process or ks-proxy | `POST /proxy/helius/` (RPC) or `ks-helius` typed call | **Rust direct** |
| 25 | Pay-as-you-go via x402 (post spec 10 land) | agent's `EmbeddedWallet` | upstream returns 402 → `pay_x402` ix on Solana → retry with `X-Payment-Proof` | **Rust + Solana** |
| 26 | Streaming-payment via MPP (post spec 10 land) | agent process | `POST /mpp/streams/{open,record,settle,close}` | Python (server-signed `mpp_settle` ix) |
| 27 | Batch parallel calls (≤20) | agent process | `POST /manage/batch` | **Rust direct** (`ks-proxy::batch`, tokio::join_all) |
| 28 | Run Helius high-level skill | agent process | `POST /skill/helius/run` | Python (`server.py:894`) |

### Developer — 3 interactions

| # | Interaction | Where | Runtime |
|---|---|---|---|
| 29 | `curl /health` | any | **Rust direct** (`ks-proxy::handlers::health`) |
| 30 | Read curl examples in dashboard | DeveloperSection | pure UI (no backend) |
| 31 | Read architecture / agent flow / x402 explainer | DocsSection | pure UI (no backend) |

## Status of each (cross-reference to ROADMAP)

| Status | Count | Which |
|---|---|---|
| ✅ Shipped + tested | 22 | 1-22, 28, 30, 31 |
| ✅ Shipped + tested + Rust hot path | 4 | 23, 24 (RPC dispatch), 27, 29 |
| ⚠️ Shipped but Rust typed wrappers in flight (spec 09 phases) | 1 | 24 (typed `ks-helius`) |
| 📋 Designed only — frontend UI exists, Python endpoint missing | 1 | 26 (MPP — P0 in ROADMAP) |
| 📋 Designed only — full spec 10 v1 ready, engineering not yet shipped | 1 | 25 (x402 + EmbeddedWallet) |

## Test coverage gaps (from this matrix)

The "tests pass but product unusable" failure mode the user identified
maps directly to which interactions LACK e2e coverage.

Today (78 unit/integration + 12 oracle_diff fixtures):

| Interaction | Has unit/integration test? | Has e2e test? |
|---|---|---|
| 1-3 (logins) | ✅ Python pytest in v2-mvp/tests/ | 🔴 no Playwright |
| 4-6 (passkey CRUD) | ✅ pytest | 🔴 no Playwright |
| 7-10 (vault CRUD) | ✅ pytest | 🔴 no Playwright |
| 11-13 (agents) | ✅ pytest | 🔴 no Playwright |
| 14-21 (activity / billing / logout) | ⚠️ partial | 🔴 no Playwright |
| 22-27 (agent calls) | ✅ Rust unit + oracle_diff | 🔴 no e2e via real Helius |
| 28 (skill) | ⚠️ pytest exists | 🔴 no e2e |
| 29 (health) | ✅ Rust unit | n/a |
| 30-31 (UI docs) | ⚠️ tsc only | n/a |

**Gap analysis:** every "Owner" interaction (1-21) has at most a unit
test against a Python test client. None go through `bash scripts/dev.sh`
+ a real browser. **This is the e2e-tests P1 item in ROADMAP.** A
thorough Playwright pass would add 21 e2e specs (one per Owner
interaction) plus 4-5 for Agent flows.

## How to add a new interaction

When adding interaction #32:

1. **Decide the actor** — Owner / Agent / Developer
2. **Decide which port** — by walking the SPEC-WRITING-GUIDE's
   decision tree:
   - Solana on-chain? → `programs/keyshield/`
   - User-clickable UI? → `frontend/`
   - Hot-path key inject? → `proxy-rs/crates/ks-proxy/`
   - Else → `v2-mvp/src/server.py`
3. **Add a row to this spec** — UI + endpoint + server-side code
4. **Add at least one test** — unit minimum; e2e if it's an Owner-
   visible flow (per the gap table above)
5. **Update ROADMAP** — adding a new ✅ row, or a 📋 if it's designed
   but not built

## Anti-pattern guard

If an interaction's UI exists but its endpoint doesn't, **the entry
in this spec must be marked 📋 with a link to the spec that promises
to build the endpoint**. The dead `/mpp/streams/*` calls in
`frontend/components/sections/ActivitySection.tsx:166-167` are exactly
the failure case this guard prevents.

## Cross-references

- ADR-002 — why fallthrough rather than full Rust port
- spec 09 — typed Rust HeliusClient (interactions 23, 24, 27)
- spec 10 — embedded wallet for interaction 25, 26
- BOUNDARY.md — short version of which port handles what
- ROADMAP.md — feature-completeness status
