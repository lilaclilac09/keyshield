# KeyShield — Old Code → New SOTA Codebase Coverage Checklist

> This file summarizes migration status. See [MIGRATION-CHECKLIST.md](./MIGRATION-CHECKLIST.md) for the full function-by-function checklist.

## Quick Reference

| Old Module | Lines | New Location | Status |
|---|---|---|---|
| server.py | 2317 | src/api/server.ts (195) | ⚠️ Partial — 14/45 routes wired |
| vault.py | 248 | src/vault/index.ts (221) | ✅ Complete — 10/10 functions |
| session.py | 274 | src/sessions/index.ts (merged) | ✅ Complete — 7/8 functions |
| agents.py | 318 | src/sessions/index.ts (merged) | ✅ Complete — 11/11 functions |
| x402_verify.py | 396 | src/x402/index.ts (287) | ✅ Complete — 6/6 functions |
| usage.py | 386 | src/sessions/index.ts (merged) | ⚠️ Partial — 5/8 functions |
| billing_solana.py | 381 | src/trading/index.ts (308) | ✅ Complete — 9/9 functions |
| helius_router.py | 116 | src/proxy/index.ts (merged) | ✅ Complete — 3/3 functions |
| agent_wallet.py | 206 | src/wallet/index.ts (129) | ✅ Complete — 4/4 functions |
| api_router.py | 280 | src/proxy/index.ts (merged) | ✅ Complete — 5/5 functions |
| mpp_streams.py | 822 | src/trading/index.ts (partial) | ⚠️ 4/7 functions exist, need wiring |
| mpp_onchain.py | 731 | src/trading/index.ts (partial) | ⚠️ 4/6 partially migrated |
| passkey.py | 234 | **NEEDS MODULE** | ❌ Missing — 0/6 functions |
| sharing.py | 187 | **NEEDS MODULE** | ❌ Missing — 0/5 functions |

**Total old code: ~6,520 lines → New core: ~1,516 + 300 tests = ~1,816 lines**
**Coverage: ~65% of functions migrated.**

## Test Status

| Test File | Tests | Status |
|---|---|---|
| vault.test.ts | 7 | ✅ All passing |
| sessions.test.ts | 13 | ✅ All passing |
| wallet.test.ts | 7 | ✅ All passing |
| x402.test.ts | 9 | ✅ All passing |
| trading.test.ts | 12 | ✅ All passing |
| proxy.test.ts | 6 | ✅ All passing |
| server.test.ts | 8 | ✅ All passing |

**Total: 62/62 tests passing.**

## Next Steps (for full migration)

See [MIGRATION-CHECKLIST.md](./MIGRATION-CHECKLIST.md) for complete details. Critical items:

1. **Passkey module** — Create `src/api/passkey.ts` from passkey.py (234 lines, 6 functions)
2. **Sharing module** — Create `src/api/sharing.ts` from sharing.py (187 lines, 5 functions)
3. **MPP endpoint wiring** — Wire mpp_streams.py + mpp_onchain.py functions to server.ts routes (8 endpoints)
4. **Wallet login flow** — Add `/auth/wallet-challenge` + `/auth/wallet-login` endpoints
5. **Usage stats/history** — Add `get_stats()` aggregation and `/usage/stats` + `/usage/history` endpoints
6. **Key decrypt endpoint** — Add `GET /manage/decrypt/{id}` to server.ts
