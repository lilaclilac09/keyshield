# KeyShield roadmap

What's actually built, what's broken, what's left. Ground truth as of
2026-04-30.

## Status legend

- ✅ **shipped** — works end-to-end, has tests, in CI
- ⚙️ **shipped, no tests** — works but not protected by tests
- ⚠️ **half-done** — some pieces work, others stubbed/TODO
- 🔴 **broken** — was working, now regressed
- 📋 **designed only** — spec/plan exists, code doesn't
- ❌ **README claim, no code** — pure aspiration, delete or build

---

## 1. Backend — Python control plane (`v2-mvp/`)

| Status | Feature | Where |
|---|---|---|
| ✅ | Passphrase login (`/auth/login`) | server.py:435 |
| ✅ | Wallet login (Solana ed25519 + nonce, `/auth/wallet-*`) | server.py:449-501 |
| ✅ | Agent self-auth (`/auth/agent-*`) | server.py:523-586 |
| ✅ | Agent register/list/revoke (`/agents/*`) | server.py:597-629 |
| ✅ | Passkey register/auth/list/delete (`/auth/passkey/*`) | server.py:929-991 |
| ✅ | Vault CRUD (`/manage/store/list/decrypt/secret`) | server.py:639-696 |
| ✅ | Multi-type vault (api_key / pw__ / note__ / env__ / ssh__) | server.py:676 |
| ✅ | Proxy with key injection (`/proxy/{upstream}/*`) | server.py:768 + Rust port |
| ✅ | Batch parallel proxy (`/manage/batch`) | server.py:821 |
| ✅ | Usage logging + stats (`/usage/stats|history`) | server.py:996-1008 |
| ✅ | Helius skill bundle (`/skill/helius/run`) | server.py:894 |
| ✅ | Solana SOL topup (Pyth oracle + memo binding + idempotency) | billing_solana.py |
| ✅ | Solana USDC topup (SPL transfer + memo + idempotency) | billing_solana.py |
| ✅ | `/billing/balance|sol-quote|topup-history` | server.py:1011-1330 |
| ✅ | `/_internal/balance` + `/_internal/log` (Rust bridge endpoints) | server.py |
| ✅ | `KS_INTERNAL_SECRET` firewall middleware (this PR) | server.py:280 |
| ⚠️ | x402 micropayment (response shape ✅, on-chain verify 🔴) | server.py:1067 `# TODO` |
| 📋 | MPP streaming payment (PaymentStream PDA designed, server TODO) | docs/PAYMENT-FLOWS.md |
| ⚠️ | Account deletion ("coming soon" in SettingsSection) | — |

## 2. Backend — Rust hot-path proxy (`proxy-rs/`)

| Status | Feature | Where |
|---|---|---|
| ✅ | 5 crates compile + 78 tests | proxy-rs/crates/ |
| ✅ | Auth (bearer → session lookup) | ks-session |
| ✅ | Vault decrypt (PBKDF2 + AES-GCM) | ks-vault |
| ✅ | Per-upstream auth injection (10 providers) | ks-upstream |
| ✅ | Helius DAS/Enhanced/RPC routing + cache | ks-upstream |
| ✅ | TTL cache + pycompat (Python json.dumps byte parity) | ks-cache |
| ✅ | `/proxy/{upstream}/*`, `/manage/batch`, `/health` handlers | ks-proxy |
| ✅ | Bridge to Python (`balance`, `log_batch` buffered) | ks-proxy::bridge |
| ✅ | Fallthrough reverse-proxy (preserves method/headers/body/query) | ks-proxy::handlers |
| ✅ | Usage cost extraction + buffered log shipping | ks-proxy::usage |
| ✅ | Stealth mode (`KS_STEALTH=1` → nginx 404 for unauthed) | ks-proxy::stealth |
| ✅ | `X-Internal-Secret` injection on fallthrough (this PR) | ks-proxy::handlers |
| ✅ | Oracle_diff harness (12 fixtures, byte-equal vs Python) | proxy-rs/scripts/run_oracle_diff.sh |
| 📋 | TLS termination (rustls + ACME) — Stage 2 | — |
| 📋 | Single-binary stealth deploy (article 3 form) — Stage 2 | — |

## 3. Frontend — `frontend/` (React + Vite + Chrome extension)

| Status | Feature | Where |
|---|---|---|
| ✅ | Passphrase login + wallet login + passkey login | AuthScreen + lib/auth.ts |
| ✅ | VaultSection — list/add/decrypt/delete keys | components/sections/VaultSection.tsx + AddKeyModal.tsx |
| ✅ | Multi-type AddKeyModal (api_key / password / note / env / ssh) | AddKeyModal.tsx |
| ✅ | AgentsSection — register/list/revoke ed25519 agent pubkeys | components/sections/AgentsSection.tsx |
| ✅ | ActivitySection — usage history + stats + balance + Solana topup UI | components/sections/ActivitySection.tsx |
| ✅ | SessionsSection — passkey list/delete + logout | components/sections/SessionsSection.tsx |
| ✅ | SettingsSection — manage list + Chrome extension ID config | components/sections/SettingsSection.tsx |
| ✅ | DeveloperSection — curl examples for /proxy + /manage/store | components/sections/DeveloperSection.tsx |
| ✅ | DocsSection — architecture + agent flow + x402 explainer | components/sections/DocsSection.tsx |
| ✅ | Chrome extension manifest (doubles as extension popup) | manifest.json |
| ⚙️ | Frontend `tsc --noEmit` + `vite build` in CI (this session) | .github/workflows/node-tests.yml |
| 📋 | E2E tests (Playwright) — "test like a user" | none yet — see SPEC-WRITING-GUIDE.md |
| ⚠️ | "Sharing" section — empty 11-line placeholder | components/sections/SharingSection.tsx |
| ⚠️ | "Account deletion" — "coming soon" string | SettingsSection.tsx |

## 4. CLI — `packages/cli/`

| Status | Command | What it does |
|---|---|---|
| ✅ | `keyshield login` | Authenticate against v2-mvp server |
| ✅ | `keyshield logout` | Drop session token |
| ✅ | `keyshield status` | Show active session / mode |
| ✅ | `keyshield list` | List vault entries |
| ✅ | `keyshield get <name>` | Fetch one decrypted secret |
| ✅ | `keyshield store <upstream>` | Add a key to vault |
| ✅ | `keyshield delete <upstream>` | Remove from vault |
| ✅ | `keyshield run -- <cmd>` | Inject vault keys into child process env (this is "env export" mode #3) |
| ✅ | `keyshield doctor` | Diagnostics |
| ✅ | `keyshield agent list/register/revoke` | Manage agent grants |
| ✅ | Local mode (parse `.env` file directly, no server) | env-file.ts |

**Coverage gap:** CLI not built or tested in CI. Need to add `npm test --workspace=@keyshield/cli` and `tsc --noEmit` to node-tests.yml.

## 5. Mobile — `mobile/` (React Native)

| Status | Feature | Where |
|---|---|---|
| ⚙️ | Vault list, unlock, restore, recovery phrase, upgrade screens (1322 lines) | mobile/src/screens/ |
| ⚙️ | LostDeviceDialog, AddPasskeyBanner, ConflictDialog, SessionExpiryToast, SessionBar | mobile/src/components/ |
| ⚙️ | AsyncStorage backend + react-native-quick-crypto for AES | mobile/src/storage/ |
| ⚙️ | react-native-passkey adapter | mobile/src/lib/passkeyAdapter.ts |
| 🔴→✅ | **Was broken**: dependency on deleted `@keyshield/extension-sync` (this PR removes it) | mobile/package.json |
| 📋 | iOS / Android build configs (Xcode project, gradle) — not present | — |
| 📋 | App Store / Play Store metadata | — |
| 📋 | E2E mobile testing (Detox?) | — |

**Status caveat:** mobile has ~1300 lines of TypeScript that vitest typechecks (per package.json `tsconfig.test.json`), but there's no actual iOS/Android project to BUILD into a real app. It's web-only TS until someone runs `npx react-native init` or wires Expo.

## 6. Solana program — `programs/keyshield/`

| Status | Feature | Where |
|---|---|---|
| ✅ | UniversalVault PDA | state.rs |
| ✅ | AgentGrant PDA | state.rs |
| ✅ | PaymentStream PDA (designed for MPP) | state.rs |
| ✅ | EphemeralSigner struct (64 bytes, 8 slots/grant) | state.rs:309 |
| ✅ | `CreateEphemeralSigner` instruction (#23) | lib.rs:120 |
| ✅ | Mollusk unit tests in CI | .github/workflows/test.yml |
| 📋 | `open_stream` / `settle_stream` instructions for MPP | not yet wired |
| 📋 | Real on-chain x402 verification (Base USDC, separate from this program) | server.py:1067 TODO |
| 📋 | `cargo test-sbf` integration via Surfpool | test.yml has it but `continue-on-error: true` |

### 6a. Ephemeral signers — the unbuilt "embedded wallet" pillar

The on-chain design exists end-to-end:
- `EphemeralSigner` PDA struct (state.rs:309) — 64 bytes per slot
- `AgentGrant` carries `[EphemeralSigner; 8]` array (state.rs:376)
- `CreateEphemeralSigner` instruction reserved as #23 (lib.rs:120)
- Error space 6070-6079 reserved for ephemeral-signer failures
- `agent-sdk/src/types.ts:95` defines the TS interface

What's **NOT yet built** above the chain layer:
- 📋 Server endpoint that wraps "create ephemeral signer for this agent"
  into a single API call (e.g., `POST /agents/{id}/wallet/create`)
- 📋 Server endpoint to top up an ephemeral signer's balance (e.g.,
  `POST /agents/{id}/wallet/topup` — accepts SOL/USDC transfer signed
  by owner)
- 📋 Frontend UI: "Give this agent a wallet" button in AgentsSection,
  + balance display, + top-up flow
- 📋 x402 / MPP integration: when balance hits 0, the ephemeral signer
  is what signs the on-chain micropayment instead of the owner

This is the missing **product pillar** the user described as
"agent embedded wallet — top up directly or via x402/MPP". Promote to
**P3 priority** below until you decide it should be P1 (it might —
it's the differentiator vs. Coinbase Agentic).

## 7. Infra

| Status | Feature | Where |
|---|---|---|
| ✅ | sync-worker (Cloudflare Worker, vault sync via passkey PRF) | infra/sync-worker/ |
| ✅ | sync-worker auto-deploy on push to main | .github/workflows/sync-worker-deploy.yml |
| ⚠️ | sync-worker: nothing currently uses it (extension-sync was the client, deleted) | — |
| ✅ | One-command dev launcher | scripts/dev.sh |
| ✅ | CI for Rust + frontend + npm workspaces | .github/workflows/ |
| ✅ | `KS_INTERNAL_SECRET` firewall (this PR) | scripts/dev.sh + Python middleware + Rust injection |
| 📋 | Docker compose for production deploy | — |
| ✅ | Real domain + TLS cert (rustls + Let's Encrypt ACME HTTP-01) | proxy-rs/crates/ks-proxy/src/{tls,acme}.rs (this PR) |
| ✅ | Stealth mode wired into deploy story (default-on with TLS) | proxy-rs/crates/ks-proxy/src/stealth.rs (this PR) |
| 📋 | Operator runbook (KS_INTERNAL_SECRET rotation, log retention, etc.) | — |

## 8. Docs

| Status | Doc | What it covers |
|---|---|---|
| ✅ | `README.md` | Top-level project pitch (parts are aspirational — see #9) |
| ✅ | `AGENTS.md` (25KB) | Detailed integration guide for agent developers |
| ✅ | `USAGE.md` | Hands-on user guide |
| ✅ | `DEVELOPMENT.md` | One-command dev launch + test commands (this session) |
| ✅ | `ROADMAP.md` (this file) | Honest current state |
| ✅ | `proxy-rs/BOUNDARY.md` | Hot path vs control plane (this session) |
| ✅ | `proxy-rs/ADR-001-divergences.md` | 11 Python-bug decisions for the port |
| ✅ | `proxy-rs/ADR-002-architecture.md` | Why fallthrough not full port |
| ✅ | `proxy-rs/ADR-003-firewall.md` | KS_INTERNAL_SECRET design (this session) |
| ✅ | `proxy-rs/specs/00-08` | Stage 1 port specs (8 files) |
| ✅ | `proxy-rs/specs/09-helius-client.md` | v2 (post-Architect review) — full HeliusClient spec, x402 deferred to Stage 2 |
| ✅ | `proxy-rs/specs/10-embedded-wallet.md` | full v1 — 7 open questions answered, 4 new on-chain ixs designed |
| ✅ | `proxy-rs/specs/11-user-interactions.md` | 31-interaction matrix, 21 owner / 7 agent / 3 dev |
| ✅ | `proxy-rs/specs/SPEC-WRITING-GUIDE.md` | How to write specs for keyshield |
| ✅ | `docs/PAYMENT-FLOWS.md` | x402 / MPP / Solana topup byte-level walks |

## 9. README claims that aren't true

The top-level README and AGENTS.md mention these as if they exist. They don't, or they're placeholders. Either build or delete from README:

| README claim | Reality | Recommendation |
|---|---|---|
| "Lit Protocol threshold encryption" | `packages/agent-sdk/src/lit.ts` is a near-empty placeholder | Delete from README until built |
| "Bonsol ZK proofs" | `packages/agent-sdk/src/bonsol.ts` placeholder | Delete from README until built |
| "Arcium MPC" | `packages/agent-sdk/src/arcium.ts` placeholder | Delete from README until built |
| "GOAT Wallet — 250+ onchain actions" | `packages/goat-wallet/` only has priority-fee handler | Delete the "250+" claim until more shipped |
| "Browser extension auto-detects 100+ API key patterns" | extension-sync had a `detector.ts` with this; deleted in this session. `frontend/content.js` may have a successor — needs audit | Audit content.js then either keep claim or drop |
| "App Store / Play Store" mentions | No Xcode project, no Android project | Drop until packaged |

---

## Priority for the next sprint

### P0 — actually broken (fix this week)

- ✅ Mobile package.json orphaned `@keyshield/extension-sync` dep — **fixed**
- ✅ `frontend/content.js` audit — confirmed real (8 providers, 12 regex patterns); README updated.
- 🔴 **Frontend ActivitySection calls `/mpp/streams/open|record|settle|close`
  but Python has NO `/mpp/*` endpoints** — UI buttons silently 404. Either
  build the Python MPP server-side (per spec 10 + ROADMAP §6a → embedded
  wallet) or remove the dead UI. Discovered while writing spec 09.

### P0a — spec 10 Phase 10.4-real (mpp_settle on-chain)

- ✅ **`mpp_settle` ix submission wired** — `v2-mvp/src/mpp_onchain.py`
  builds the ix (#26) byte-for-byte to match
  `programs/keyshield/src/instructions/mpp_settle.rs`; `settle_on_chain`
  in `mpp_streams.py` submits when env is configured, falls back to
  stub (return 0) otherwise. Idempotency log lives in new
  `mpp_settle_attempts` SQLite table. 6 unit tests in
  `tests/test_mpp_onchain.py` cover env-missing, byte-layout
  (discriminator 0x1a + u64 LE), PDA-missing, and double-submit
  prevention. Real Solana RPC integration test deferred.
- 📋 **P1 follow-up: `open_stream` on-chain wiring.** `mpp_streams.open_stream`
  is still DB-only — no `OpenPaymentStream` (ix #24) submission. Until
  this lands, `_get_stream_pda_ata()` returns (None, None) and the
  real `mpp_settle` path falls back to stub. The frontend "under
  construction" banner stays until both this AND `close_stream` ship.
- 📋 **P1 follow-up: `close_stream` on-chain wiring.** `mpp_streams.close_stream`
  is DB-only — no final on-chain settle + PDA close. Pairs with the
  `open_stream` follow-up; both want the same PDA-column wiring.

### P1 — product-completing (fix this month)

- ✅ **Spec 10 promoted to full v1** — `proxy-rs/specs/10-embedded-wallet.md` (commit 661a948e). 7 open questions answered, 4 new on-chain ixs designed.
- ✅ **Spec 09 Phase 0+1 shipped** — `proxy-rs/crates/ks-helius/` exists with 16 tests passing, single-flight + per-record TTL invariants verified, `pycompat::cache_key` byte-parity with Python confirmed.
- 🔴 **Spec 10 Phase 10.1+10.2 (on-chain ixs) NOT done** — Engineer β hit "You've hit your org's monthly usage limit" mid-task. Needs re-dispatch when quota recovers, or split into smaller pieces if recurring. Blocks: real x402 retry path, `/mpp/streams/*` P0 fix, embedded wallet pillar.
- 📋 **x402 on-chain verification** — server.py:1067 TODO. Now blocked on spec 10 promotion (since x402 retry path goes through EmbeddedWallet). Without it, anyone can claim payment for free up to $10/call.
- ✅ **README cleanup** — done in earlier PR. Lit/Bonsol/Arcium/GOAT-250 marked 📋 placeholder.
- 📋 **E2E tests (Playwright)** — `bash scripts/dev.sh` then click through every section. One spec per top-level user action. Without these, "tests pass" still doesn't mean "product works".

### P2 — Stage 2 productionization

- ✅ **TLS termination on Rust** (this PR) — rustls 0.23 + axum-server +
  instant-acme HTTP-01 + 24h renewal task. Three modes via `KS_TLS_MODE`:
  off (default), self-signed (rcgen), acme (LE). 18 lib + 22 integration
  tests. See `proxy-rs/ADR-007-tls-and-stealth.md` + spec 12.
- ✅ **Stealth mode wired** (this PR) — default-on derived from `KS_TLS_MODE`,
  explicit `KS_STEALTH=0|1` overrides. ADR-007 §"Stealth-default order".
- 📋 Single-binary deploy + Docker compose
- 📋 Operator runbook (env contract, rate-limit safety, failure modes —
  parts already in spec 12)
- 📋 Real domain + ACME cert lifecycle (this PR provides the binary;
  needs DNS + firewall ops)

### P3 — feature expansion

- 📋 MPP streaming payment (PDA + Python settlement loop + frontend stream UI)
- 📋 Mobile iOS/Android packaging (Expo or bare React Native)
- 📋 Sharing section (currently 11-line placeholder) — design + build
- 📋 Account deletion (currently "coming soon") — wallet-keypair rotation flow
- 📋 Lit/Bonsol/Arcium if/when they're actually needed for a feature

### P4 — observability

- 📋 Metrics (Prometheus or similar) on Rust + Python
- 📋 Error tracking (Sentry)
- 📋 Audit log retention policy
