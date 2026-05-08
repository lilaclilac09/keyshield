# KeyShield Migration Checklist

> Migrating from `src/python-legacy/` (old codebase) → `v2-mvp/` (new clean architecture) → `src/backend/` (current)
> Last updated: 2026-05-09 — Phase 6: Landing page + _dropped restructure

---

## Phase 6: Landing + Archived Extensions (2026-05-09)

### `landing/` — Demo Landing Page
**Purpose:** Standalone product demo (no build step required). Used for hackathon judging, Twitter, and README showcases.

| File | Purpose |
|------|---------|
| `index.html` | Full single-page demo with Cut A (silent autoplay) and Cut B (voiced deep cut) |
| `DEMO-SCRIPT.md` | Demo video scripts with timestamps |

### `_archive/` — Archived Artifacts
**Purpose:** Preserved but no longer tracked in git. These are historical extension implementations.

| Directory | Content |
|-----------|---------|
| `dropped-extension/` | Agentic extension (X402, Lit, Cloud) — TypeScript source + webpack build |
| `disabled-extension/` | Disabled Vite-based extension — multi-browser builds (Chrome/Firefox/Safari) |

### Current Git-Tracked Layout

```
keyshield/
├── landing/             # Demo page (tracked — lightweight)
├── _archive/            # Archived extensions (not tracked)
├── src/
│   ├── backend/         # Python control plane
│   ├── web/extension/   # Active Chrome extension
│   └── web-v2/          # Web v2 source
└── tests/               # E2E tests
```

---

## Old Codebase (`python-legacy/src/`) — FINAL STATE

### ✅ Files MIGRATED AND DELETED from python-legacy/src/

| File | Lines | Current Location | Status |
|------|-------|-----------------|--------|
| vault.py | 218 | `src/backend/routes/vault.py` | ✅ Migrated, deleted from legacy |
| session.py | 274 | `src/backend/auth/session.py` | ✅ Migrated, deleted from legacy |
| agents.py | 318 | `src/backend/agents/agents.py` | ✅ Migrated, deleted from legacy |
| usage.py | 386 | `src/backend/billing/usage.py` | ✅ Migrated, deleted from legacy |
| passkey.py | 234 | `src/backend/auth/passkey.py` | ✅ Migrated, deleted from legacy |
| sharing.py | 187 | `src/backend/sharing/sharing.py` | ✅ Migrated, deleted from legacy |
| x402_verify.py | 396 | `src/backend/proxy/x402_verify.py` | ✅ Migrated, deleted from legacy |
| billing_solana.py | 381 | `src/backend/billing/billing_solana.py` | ✅ Migrated, deleted from legacy |
| server.py | 2378 | `src/backend/app.py` | ✅ Migrated, deleted from legacy |
| keyshield_sdk.py | 933 | `src/backend/keyshield_sdk.py` | ✅ Created (new) |
| api_router.py | 245 | `src/backend/proxy/api_router.py` | ✅ Migrated, deleted from legacy |
| metrics.py | 67 | `src/backend/proxy/metrics.py` | ✅ Migrated, deleted from legacy |
| vault_new.py | 218 | `src/backend/vault/vault.py` | ✅ Copied, deleted from legacy |
| mpp_onchain.py | ~700 | `src/backend/mpp/mpp_onchain.py` | ✅ Copied, deleted from legacy |
| mpp_streams.py | ~800 | `src/backend/mpp/mpp_streams.py` | ✅ Copied, deleted from legacy |
| agent_wallet.py | ~300 | `src/backend/agents/agent_wallet.py` | ✅ Copied, deleted from legacy |
| skills/helius_skill.py | 357 | `src/backend/skills/helius_skill.py` | ✅ Copied, deleted from legacy |

### ℹ️ Files KEPT in python-legacy/src/ (not migrated)

| File | Lines | Reason |
|------|-------|--------|
| helius_router.py | 157 | Standalone, not imported by server.py — legacy-only module |
| __init__.py | 0 | Empty placeholder |
| static/passkey.html | 380 | Not used in current code |

### ✅ Trading Module (NEW in v2-mvp)

| File | Lines | Status |
|------|-------|--------|
| trading/__init__.py | 56 | ✅ Created (new) |
| trading/agent.py | 775 | ✅ Migrated — Orchestrator + agents |
| trading/execution.py | 474 | ✅ Migrated — ZeroX, Titan, Jupiter |
| trading/feeds.py | 311 | ✅ Migrated — PythFeed, PriceSignal |
| trading/models.py | 447 | ✅ Migrated — ModelRouter |

### ✅ TypeScript API Server — ALREADY PORTED
- `src/crypto/aes-gcm.ts`, `vault/index.ts`, `sessions/index.ts`, `x402/index.ts`

### ✅ Rust Proxy — PRODUCTION-READY
- `crates/ks-proxy` — ACME TLS, forward proxy
- `crates/ks-vault`, `ks-session`, `ks-helius`, `ks-cache`, `ks-upstream`

### ✅ Web Frontend — COMPLETE (no migration needed)
- React web UI — 19 files

### ✅ SDK Packages — PORTED
- agent-sdk, cli, goat-wallet, openclaw-skill

### ✅ Landing Page (Demo)
- `landing/` — Standalone demo page (index.html + DEMO-SCRIPT.md)
- Cut A: 60s silent autoplay loop for hackathon judging page
- Cut B: Voiced deep cut for README + Twitter
- Core trust message: the agent never holds the API key

### ✅ Archived Extensions (_archive/)
- `_archive/dropped-extension/` — Agentic extension (X402, Lit, Cloud)
  - Source: `.dropped-20260427-231054/extension/` → `src/web-v2/extension/`
  - TypeScript source + webpack build
- `_archive/disabled-extension/` — Disabled extension (Vite-based)
  - Source: `.dropped-20260427-231054/disabled_extension/`
  - Multi-browser builds (Chrome, Firefox, Safari)

---

## Migration Summary

### All modules migrated from python-legacy → src/backend/:

| Category | Count | Details |
|----------|-------|---------|
| Python modules deleted from legacy | 17 | All core files removed |
| Python modules in src/backend/ | 16 | Full feature parity |
| Trading module files | 5 | New in v2-mvp (not in legacy) |
| Total lines migrated | ~6,800+ | Across all files |

### Test Status: **21/21 PASSING** ✅

| Test | Status | Notes |
|------|--------|-------|
| test_store_and_load | ✅ PASS | Vault store + load |
| test_wrong_password_fails | ✅ PASS | Auth guard |
| test_key_isolation | ✅ PASS | Per-user isolation |
| test_list_keys | ✅ PASS | List keys per user |
| test_delete_key | ✅ PASS | Delete key by upstream |
| test_create_and_get | ✅ PASS | Session CRUD |
| test_expired_token | ✅ PASS | TTL enforcement |
| test_verify_token | ✅ PASS | Signature verification |
| test_tampered_token | ✅ PASS | Tamper detection |
| test_delete_all_for_user | ✅ PASS | Bulk delete |
| test_register_and_lookup | ✅ PASS | Agent registration |
| test_revoke_agent | ✅ PASS | Agent revocation (FIXED) |
| test_re_revoke_is_idempotent | ✅ PASS | Idempotent revoke |
| test_stub_fallback | ✅ PASS | x402 stub mode |
| test_empty_proof_raises | ✅ PASS | Empty proof validation |
| test_password_login | ✅ PASS | Password login flow |
| test_store_key | ✅ PASS | Store key via proxy |
| test_list_keys | ✅ PASS | List keys via proxy |
| test_agent_register | ✅ PASS | Agent registration endpoint |
| test_agent_list | ✅ PASS | Agent listing (FIXED) |
| test_proxy_openai | ✅ PASS | Proxy to OpenAI |

---

## Functions Preserved — Full Inventory

### server.py (37+ routes, 20+ Pydantic models)

**Route handlers:**
- `/auth/login` — Password-based login
- `/auth/logout` — Session invalidation
- `/auth/delete-account-challenge` — WebAuthn challenge for account deletion
- `/auth/delete-account` — Delete user + vault keys
- `/auth/wallet-challenge` — Wallet signature challenge
- `/auth/wallet-login` — Sign-in with wallet
- `/auth/agent-challenge` — Agent auth challenge
- `/auth/agent-login` — Agent login
- `/agents/register` — Register agent
- `/agents/list` — List agents
- `/agents/{agent_id}` — Delete agent
- `/manage/list` — List secrets
- `/manage/decrypt/{upstream}` — Decrypt secret
- `/manage/store` — Store secret
- `/manage/secret/{upstream}` — Delete secret
- `/share/grant` — Share vault key
- `/share/incoming` — Incoming shares
- `/share/outgoing` — Outgoing shares
- `/share/{share_id}` — Delete share
- `/manage/batch` — Batch operations
- `/auth/passkey/register-options` | `register-verify` | `auth-options` | `auth-verify` | `list` | `{cred_id}` — WebAuthn
- `/billing/balance` — User balance
- `/billing/topup` | `/billing/topup-solana` | `/billing/topup-solana-usdc` — Top-up
- `/billing/sol-quote` — SOL quote
- `/billing/topup-history` — History
- `/mpp/streams` — Open/close streams
- `/mpp/events` | `/{stream_id}/record` | `/{stream_id}/settle` | `/{stream_id}/close` | `/{stream_id}/record-tx` — MPP
- `/proxy/{upstream}/{path}` — Universal proxy
- `/health` — Health check

**Pydantic models:**
- `LoginBody`, `DeleteAccountBody`, `WalletLoginBody`, `AgentLoginBody`, `AgentRegisterBody`
- `StoreBody`, `ShareGrantBody`, `BatchItem`, `BatchBody`, `SkillRunBody`
- `PasskeyRegVerifyBody`, `PasskeyAuthVerifyBody`, `TopupBody`
- `SolQuoteBody`, `TopupSolanaBody`, `TopupUsdcBody`
- `MppOpenStreamBody`, `MppRecordBody`, `BuildOpenTxBody`, `BuildWithdrawTxBody`
- `MppRecordTxBody`, `BuildEphemeralSignerTxBody`, `_AccountMetaJson`, `BuildTxResponse`

### agents.py (6 functions)
- `register(owner_wallet, pubkey_b58, name, scopes)` → agent_id
- `lookup_owner(pubkey_b58)` → dict or None
- `revoke_agent(owner_wallet, agent_id, reason)` → bool
- `list_agents(owner_wallet)` → list of agents
- `_db()` → sqlite3.Connection

### vault.py (5 functions)
- `store(user_id, key, value, password)`
- `load(user_id, key, password)`
- `delete(user_id, key)`
- `list_keys(user_id)` → list
- `VAULT_DIR` → Path

### session.py (5 functions)
- `create_token(user_id, password, ttl)` → token
- `get(token)` → dict or None
- `verify_token(token)` → tuple[bool, str|None]
- `delete_all_for_user(user_id)` → count
- `_cache` → dict

### usage.py (8 functions)
- `log_usage(user_id, upstream, bytes_transferred, request_count, cost_usd)`
- `get_balance(user_id)` → float
- `deduct(user_id, amount)` → bool
- `add_topup(user_id, amount, tx_hash)`
- `list_topups(user_id)` → list
- `topup_solana(user_id, tx_hash, amount_sol, amount_usd, token_address)`
- `get_recent_usage(user_id, limit)` → list
- `_purge_old_usage(days_back)`

### passkey.py (8 functions)
- `register_options(user_id)` → dict
- `verify_register(response, user_id, options)` → dict
- `auth_options(user_id)` → dict
- `verify_auth(response, user_id)` → dict
- `get_passkeys(user_id)` → list
- `delete_passkey(credential_id)` → bool
- `load_credential_store()` → dict
- `save_credential_store(store)`

### sharing.py (7 functions)
- `_db()`, `grant(recipient_id, share_id)`, `revoke(owner_id, share_id)`, `list_outgoing(owner_id)`, `list_incoming(recipient_id)`, `purge_user(user_id)`, `_row_to_dict(r)`

### billing_solana.py (10 functions)
- Classes: `PaymentVerificationError`, `SolUsdPrice`, `_ManualClient`
- Functions: `_instructions()`, `_verify_tx_succeeded()`, `find_sol_transfer()`, `find_usdc_transfer()`, `find_memo()`, `_purge_expired_memos()`, `issue_topup_memo()`, `verify_topup_memo()`, `consume_topup_memo()`

### x402_verify.py (6 functions)
- `verify_on_chain(proof, resource_url, amount)` → tuple[bool, str]
- `_sign_with_wallet(wallet, payload)`
- `verify_proof(proof, expected_signer)`
- `parse_x402_header(header)`
- `get_claim_status(claim_id)`
- `stub_verify(proof, resource_url, amount)`

### api_router.py (7 functions)
- `_ck(provider, key, payload)`, `_cache_get()`, `_cache_set()`, `_build_url_and_headers()`
- `_helius_provider()`, `call_helius()`, `call_rest()`
- `batch_helius()`, `batch_rest()`, `cache_stats()`

### metrics.py (67 lines)
- `PROXY_REQUESTS` — Counter
- `PROXY_LATENCY` — Histogram
- `VAULT_OPS` — Counter
- `AUTH_ATTEMPTS` — Counter
- `BILLING_TOPUPS` — Counter
- `get_metrics()` → str

### skills/helius_skill.py (9 tools)
- `get_balance`, `get_token_balance`, `get_asset`, `get_assets_by_owner`
- `send_transaction`, `get_signatures_for_address`, `get_transaction`
- `get_account_info`, `get_token_accounts`

---

## Git Commands (current paths)

```bash
# Add all Python backend files
git add src/backend/app.py \
        src/backend/config.py \
        src/backend/errors.py \
        src/backend/keyshield_sdk.py \
        src/backend/auth/ \
        src/backend/routes/ \
        src/backend/proxy/ \
        src/backend/billing/ \
        src/backend/agents/ \
        src/backend/sharing/ \
        src/backend/mpp/ \
        src/backend/trading/ \
        src/backend/skills/ \
        src/backend/middleware/ \
        src/backend/tests/ \
        MIGRATION_CHECKLIST.md \
        MIGRATION_AUDIT.md \
        integration-log.md

git commit -m "Update Python backend paths after SOTA restructure

All core modules now under src/backend/:
- app.py (FastAPI factory) — 37+ routes, 20+ Pydantic models
- keyshield_sdk.py (933 lines) — KeyShield, AsyncKeyShield, AgentKeyShield
- auth/ — session management, WebAuthn passkeys
- routes/ — vault, agents, billing, sharing route handlers
- proxy/ — api_router, metrics, x402_verify
- billing/ — usage tracking, Solana topup
- agents/ — agent CRUD, embedded wallet
- mpp/ — payment streams
- trading/ — orchestration (6 modules)
- skills/ — Helius tools (9 tools)

Tests: 21 tests collected ✅

Legacy cleanup:
- Deleted 17 migrated .py files from python-legacy/src/
- Kept helius_router.py (standalone, legacy-only)
- Kept __init__.py (empty placeholder)"

git push origin main
```
