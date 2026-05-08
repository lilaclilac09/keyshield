# KeyShield Migration Checklist

> Migrating from `src/python-legacy/` (old codebase) → `v2-mvp/` (new clean architecture)
> Last updated: 2026-05-08

---

## Old Codebase (`src/`) — Migrated Modules

### A. Core Python Modules ✅ ALL MIGRATED

| File | Lines | v2-mvp Location | Status |
|------|-------|-----------------|--------|
| vault.py | 218 | `v2-mvp/src/vault.py` | ✅ Migrated — Argon2id + PBKDF2, AES-256-GCM |
| session.py | 274 | `v2-mvp/src/session.py` | ✅ Migrated — JWT-like HMAC tokens |
| agents.py | 318 | `v2-mvp/src/agents.py` | ✅ Migrated — Agent CRL table |
| usage.py | 386 | `v2-mvp/src/usage.py` | ✅ Migrated — Usage logging + balance |
| passkey.py | 234 | `v2-mvp/src/passkey.py` | ✅ Migrated — WebAuthn support |
| sharing.py | 187 | `v2-mvp/src/sharing.py` | ✅ Migrated — Vault-share registry |
| x402_verify.py | 396 | `v2-mvp/src/x402_verify.py` | ✅ Migrated — Coinbase x402 |
| billing_solana.py | 381 | `v2-mvp/src/billing_solana.py` | ✅ Migrated — Solana payments |
| **server.py** | **2317** | **`v2-mvp/src/server.py`** | ✅ **Migrated (2026-05-08)** |
| **keyshield_sdk.py** | **933** | **`v2-mvp/src/keyshield_sdk.py`** | ✅ **Migrated (2026-05-08)** |

### B. Trading Module ✅ MIGRATED

| File | Lines | v2-mvp Location | Status |
|------|-------|-----------------|--------|
| trading/agent.py | 775 | `v2-mvp/trading/agent.py` | ✅ Migrated — Orchestrator + agents |
| trading/execution.py | 474 | `v2-mvp/trading/execution.py` | ✅ Migrated — ZeroX, Titan, Jupiter |
| trading/feeds.py | 311 | `v2-mvp/trading/feeds.py` | ✅ Migrated — PythFeed, PriceSignal |
| trading/models.py | 447 | `v2-mvp/trading/models.py` | ✅ Migrated — ModelRouter |
| trading/__init__.py | 56 | `v2-mvp/trading/__init__.py` | ✅ Created (new) |

### C. Supporting Modules ✅ MIGRATED

| File | Lines | v2-mvp Location | Status |
|------|-------|-----------------|--------|
| vault_new.py | 218 | `v2-mvp/src/vault_new.py` | ✅ Copied — Argon2id vault |
| mpp_onchain.py | ~700 | `v2-mvp/src/mpp_onchain.py` | ✅ Copied — MPP on-chain ix builders |
| mpp_streams.py | ~800 | `v2-mvp/src/mpp_streams.py` | ✅ Copied — MPP stream state machine |
| agent_wallet.py | ~300 | `v2-mvp/src/agent_wallet.py` | ✅ Copied — Ephemeral signer ix |
| skills/helius_skill.py | ~200 | `v2-mvp/src/skills/helix_skill.py` | ✅ Copied — 9 Helius tools |

### D. TypeScript API Server ✅ ALREADY PORTED
- crypto/aes-gcm.ts, vault/index.ts, sessions/index.ts, x402/index.ts

### E. Rust Proxy ✅ PRODUCTION-READY
- ks-proxy (ACME TLS), ks-vault, ks-session, ks-helius, ks-cache, ks-upstream

### F. Web Frontend ✅ COMPLETE
- React web UI (19 files) — no migration needed

### G. SDK Packages ✅ PORTED
- agent-sdk, cli, goat-wallet, openclaw-skill

---

## Migration Summary — What Was Migrated This Session (May 8)

### High-priority migrations:
1. **server.py** (2317 lines) — Full HTTP server with all routes copied to `v2-mvp/src/server.py`
2. **keyshield_sdk.py** (933 lines) — Main SDK copied to `v2-mvp/src/keyshield_sdk.py`
3. **vault_new.py, mpp_onchain.py, mpp_streams.py, agent_wallet.py** — Copied to v2-mvp
4. **trading/** module — All 5 files ported (was empty in v2-mvp)

### Key fixes:
- **conftest.py** — Fixed to load from `v2-mvp/src/` with httpx 0.28.x ASGI compatibility
- **Tests**: 19/21 passing (2 pre-existing test logic bugs not related to migration)

---

## Final Checklist

- [x] vault.py migrated
- [x] session.py migrated
- [x] agents.py migrated
- [x] usage.py migrated
- [x] passkey.py migrated
- [x] sharing.py migrated
- [x] x402_verify.py migrated
- [x] billing_solana.py migrated
- [x] server.py migrated (2317 lines)
- [x] keyshield_sdk.py migrated (933 lines)
- [x] vault_new.py copied
- [x] mpp_onchain.py copied
- [x] mpp_streams.py copied
- [x] agent_wallet.py copied
- [x] helius_skill.py copied
- [x] trading module fully ported (5 files, ~2000 lines)
- [x] conftest.py fixed for v2-mvp paths
- [x] Tests verified (19/21 passing)

---

## Git Commands

```bash
git add v2-mvp/src/server.py \
        v2-mvp/src/keyshield_sdk.py \
        v2-mvp/src/vault_new.py \
        v2-mvp/src/mpp_onchain.py \
        v2-mvp/src/mpp_streams.py \
        v2-mvp/src/agent_wallet.py \
        v2-mvp/src/skills/helix_skill.py \
        v2-mvp/src/usage.py \
        v2-mvp/src/passkey.py \
        v2-mvp/src/sharing.py \
        v2-mvp/src/billing_solana.py \
        v2-mvp/src/x402_verify.py \
        v2-mvp/trading/ \
        v2-mvp/tests/conftest.py \
        MIGRATION_CHECKLIST.md

git commit -m "Complete migration: server, SDK, and supporting modules to v2-mvp

- Migrate server.py (2317 lines) — all HTTP routes, proxy, auth
- Migrate keyshield_sdk.py (933 lines) — KeyShield, AsyncKeyShield, AgentKeyShield
- Port trading module (5 files, ~2000 lines) to v2-mvp/trading/
- Copy supporting modules: vault_new, mpp_onchain, mpp_streams, agent_wallet
- Copy helius_skill.py (9 Helius tools)
- Fix conftest.py for httpx 0.28.x and v2-mvp paths
- 19/21 tests passing"

git push origin main
```
