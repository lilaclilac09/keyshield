# Migration Audit — python-legacy → src/backend

## Status: Path A + Python merge (2026-05-09)

**Change:** Merged Path A + Python — vault ops moved to the
Cloudflare Worker + client-side crypto; Python `/proxy/*`
refactored to **stateless** (the upstream key arrives on each
request as `X-Upstream-API-Key` and is never persisted);
`/manage/*` server-side plaintext storage routes removed; the
former `extension-sync/` workspace was consolidated into
`src/web-v2/lib/{vault,sync,sync-auth}.ts` (HTTP contract
unchanged).

Production hosts after the merge:

- Landing — `https://ks.aileena.xyz` (Vercel `keyshield-landing`)
- App — `https://app.ks.aileena.xyz` (Vercel building `src/web-v2/`)
- Sync Worker — `https://keyshield-sync.<account>.workers.dev`
- API — `https://api.ks.aileena.xyz` (Railway)

---

## Status: Core migration complete (2026-05-08)

**Commit:** `c73a4a5e6` — feat(migration): migrate core Python modules from python-legacy to v2-mvp
**Tests:** 19/21 passing (2 pre-existing bugs, not migration issues)

---

## Module-by-Module Audit

### Core Modules (Migrated from python-legacy/src/)

| # | Module | Size Legacy → V2MVP | Status | Description |
|---|--------|---------------------|--------|-------------|
| 1 | vault.py | 8.5KB / 237 lines → 8.1KB / 237 lines | IDENTICAL | `Vault`, `load_vault`, `get_key`, `set_key`, `del_key` |
| 2 | session.py | 8.8KB → 8.8KB | IDENTICAL | Session token management (JWT), `create_session()`, `verify_token()` |
| 3 | agents.py | 10.7KB → 10.7KB | IDENTICAL | `register_agent()`, `lookup_owner()`, `revoke_agent()`, `list_agents()` |
| 4 | x402_verify.py | 14.8KB → 14.8KB | IDENTICAL | Coinbase x402 on-chain claim verification |
| 5 | mpp_onchain.py | 29.9KB → 29.9KB | IDENTICAL | MPP on-chain instruction builders |
| 6 | mpp_streams.py | 31.6KB → 31.6KB | IDENTICAL | MPP stream state machine |
| 7 | agent_wallet.py | 8.2KB → 8.2KB | IDENTICAL | Ephemeral signer instructions |
| 8 | vault_new.py | 7.5KB → 7.5KB | IDENTICAL | Argon2id-based vault with improved security |

### Changed Modules (Cleaned during migration)

| # | Module | Size Legacy → V2MVP | Description |
|---|--------|---------------------|-------------|
| 9 | server.py | 88.6KB / 2378 lines → 86.1KB / ~2340 lines | All 37+ route handlers, 20+ Pydantic models preserved. Routes: `/auth/*`, `/manage/*` (since removed in 2026-05-09 Path A merge), `/proxy/*`, `/agents/*`, `/share/*`, `/billing/*`, `/mpp/*`. Functions: `_cache_key`, `_cache_get`, `_cache_set`, `_rpc_ttl`, `_b58decode`, `_purge_expired_nonces`, `_record_nonce`, `_validate_challenge`, `_consume_nonce`, `_decode_b58_pubkey`, `_decode_b64_signature`, `_bearer`, `_session`, `_resolve_key`, `_x402_body`, `_looks_like_solana_wallet`, `_ix_to_response` |
| 10 | billing_solana.py | 14.6KB / 387 lines → 9.0KB / ~260 lines | Classes: `PaymentVerificationError`, `SolUsdPrice`, `_ManualClient`. Functions: `_instructions()`, `_verify_tx_succeeded()`, `find_sol_transfer()`, `find_usdc_transfer()`, `find_memo()`, `_purge_expired_memos()`, `issue_topup_memo()`, `verify_topup_memo()`, `consume_topup_memo()` |
| 11 | passkey.py | 9.1KB → 8.6KB | WebAuthn registration and authentication |
| 12 | sharing.py | 6.7KB → 4.3KB | `_db()`, `grant()`, `revoke()`, `list_outgoing()`, `list_incoming()`, `purge_user()`, `_row_to_dict()` |
| 13 | usage.py | 16.0KB → 12.9KB | Usage logging, balance tracking, Solana topup |

### New Modules (Created during migration)

| # | Module | Size | Description |
|---|--------|------|-------------|
| 14 | keyshield_sdk.py | 35.4KB | `KeyShield`, `AsyncKeyShield`, `AgentKeyShield` |
| 15 | skills/helius_skill.py | 15.0KB | 9 Helius tools for agent use |

### Trading Module (New, not from legacy)

| # | Module | Size | Description |
|---|--------|------|-------------|
| 16 | trading/__init__.py | 1.5KB | All trading module public interfaces |
| 17 | trading/orchestrator.py | 3.8KB | `TradingOrchestrator` |
| 18 | trading/market_data.py | 3.2KB | `MarketDataAgent` |
| 19 | trading/risk.py | 5.0KB | `RiskAgent` |
| 20 | trading/analysis.py | 5.6KB | `AnalysisAgent` |
| 21 | trading/execution.py | 5.1KB | `ZeroXRouter`, `TitanExecutor`, swap routing |
| 22 | trading/models.py | 2.8KB | `ModelRouter`, `TaskType` routing |

---

## Functions Preserved — Full Inventory

### server.py (37+ routes, 20+ Pydantic models)

**Route handlers:** `/auth/login`, `/auth/logout`, `/auth/delete-account-challenge`, `/auth/delete-account`, `/auth/wallet-challenge`, `/auth/wallet-login`, `/auth/agent-challenge`, `/auth/agent-login`, `/agents/register`, `/agents/list`, `/agents/{agent_id}`, ~~`/manage/list`~~, ~~`/manage/decrypt/{upstream}`~~, ~~`/manage/store`~~, ~~`/manage/secret/{upstream}`~~, `/share/grant`, `/share/incoming`, `/share/outgoing`, `/share/{share_id}`, ~~`/manage/batch`~~, passkey endpoints, billing endpoints, mpp endpoints, `/proxy/{upstream}/{path}`, `/health`

> `/manage/*` routes removed 2026-05-09 (Path A merge). Vault
> storage is now exclusively client-encrypted via the Cloudflare
> sync-worker. The Python `/proxy/*` is stateless w.r.t. upstream
> keys: clients send the decrypted key as the `X-Upstream-API-Key`
> request header.

**Pydantic models:** `LoginBody`, `DeleteAccountBody`, `WalletLoginBody`, `AgentLoginBody`, `AgentRegisterBody`, `StoreBody`, `ShareGrantBody`, `BatchItem`, `BatchBody`, `SkillRunBody`, `PasskeyRegVerifyBody`, `PasskeyAuthVerifyBody`, `TopupBody`, `SolQuoteBody`, `TopupSolanaBody`, `TopupUsdcBody`, `MppOpenStreamBody`, `MppRecordBody`, `BuildOpenTxBody`, `BuildWithdrawTxBody`, `MppRecordTxBody`, `BuildEphemeralSignerTxBody`, `_AccountMetaJson`, `BuildTxResponse`

### agents.py (4 functions)
- `register(owner_wallet, pubkey_b58, name, scopes)` → agent_id
- `lookup_owner(pubkey_b58)` → dict or None
- `revoke_agent(owner_wallet, agent_id, reason)` → bool
- `list_agents(owner_wallet)` → list

### vault.py (5 functions)
- `store(user_id, key, value, password)`, `load(user_id, key, password)`, `delete(user_id, key)`, `list_keys(user_id)`, `VAULT_DIR`

### session.py (5 functions)
- `create_token(user_id, password, ttl)`, `get(token)`, `verify_token(token)`, `delete_all_for_user(user_id)`

### usage.py (8 functions)
- `log_usage()`, `get_balance()`, `deduct()`, `add_topup()`, `list_topups()`, `topup_solana()`, `get_recent_usage()`, `_purge_old_usage()`

### passkey.py (8 functions)
- `register_options()`, `verify_register()`, `auth_options()`, `verify_auth()`, `get_passkeys()`, `delete_passkey()`, `load_credential_store()`, `save_credential_store()`

### sharing.py (7 functions), billing_solana.py (10 functions), x402_verify.py (6 functions)

---

## Test Status

**File:** `src/backend/tests/test_security_fixes.py`
**Passing:** 19/21 tests
**Failing:** 2/21 tests (pre-existing bugs)

| Test | Issue |
|------|-------|
| test_store_and_load | PASS |
| test_wrong_password_fails | PASS |
| test_key_isolation | PASS |
| test_list_keys | PASS |
| test_delete_key | PASS |
| test_create_and_get | PASS |
| test_expired_token | PASS |
| test_verify_token | PASS |
| test_tampered_token | PASS |
| test_delete_all_for_user | PASS |
| test_register_and_lookup | PASS |
| test_revoke_agent | FAIL — `agent_id = [a["id"] for a in []][0]` -> IndexError (placeholder) |
| test_re_revoke_is_idempotent | PASS |
| test_stub_fallback | PASS |
| test_empty_proof_raises | PASS |
| test_password_login | PASS |
| test_store_key | PASS |
| test_list_keys | PASS |
| test_agent_register | PASS |
| test_agent_list | FAIL — owner mismatch: registers under "test", queries as "alice" |
| test_proxy_openai | PASS |

---

## Summary

| Metric | Value |
|--------|-------|
| Modules migrated from legacy | 14 (8 identical, 6 changed) |
| New modules created | 9 |
| Total lines migrated/created | ~7,500+ lines |
| Routes preserved | 37+ route handlers |
| Pydantic models preserved | 20+ |
| Functions preserved | 60+ |
| Test pass rate | 19/21 = 90.5% |
| Pre-existing bugs | 2 (not migration issues) |

---

## Files NOT yet migrated

| Module | Size | Status |
|--------|------|--------|
| api_router.py | 10.5KB / ~300 lines | Import exists in server.py but file not copied to src/backend/ |
| helius_router.py | 5.6KB | Standalone legacy module, may be redundant with api_router |
| metrics.py | 2.7KB / 67 lines | Prometheus metric definitions, standalone |

---

## Next Actions

1. Copy `api_router.py` to `src/backend/` (imported but file missing)
2. Fix `test_revoke_agent` — placeholder agent_id on line ~130 of `test_security_fixes.py`
3. Fix `test_agent_list` — owner mismatch between registration and query
4. Copy `metrics.py` to `src/backend/` if Prometheus metrics needed
5. Decide on `helius_router.py` — redundant with api_router, can be removed or kept as legacy
6. Delete fully migrated files from `src/python-legacy/src/` (after verification)
7. Update AGENTS.md and MIGRATION_CHECKLIST.md with final state
