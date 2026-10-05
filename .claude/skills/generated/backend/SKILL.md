---
name: backend
description: "Skill for the Backend area of keyshield. 108 symbols across 4 files."
---

# Backend

108 symbols | 4 files | Cohesion: 86%

## When to Use

- Working with code in `src/`
- Understanding how get_settings, reset_settings, test_settings_loads work
- Modifying backend-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/backend/keyshield_sdk.py` | logout, list_keys, list_items, decrypt_key, delete_key (+63) |
| `src/backend/errors.py` | KeyShieldError, BillingError, InsufficientFunds, TopupFailed, SharingError (+31) |
| `src/backend/config.py` | _validate_secret, get_settings, reset_settings |
| `src/backend/tests/test_smoke.py` | test_settings_loads |

## Entry Points

Start here when exploring this area:

- **`get_settings`** (Function) — `src/backend/config.py:113`
- **`reset_settings`** (Function) — `src/backend/config.py:123`
- **`test_settings_loads`** (Function) — `src/backend/tests/test_smoke.py:54`
- **`KeyShieldError`** (Class) — `src/backend/errors.py:9`
- **`BillingError`** (Class) — `src/backend/errors.py:96`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `KeyShieldError` | Class | `src/backend/errors.py` | 9 |
| `BillingError` | Class | `src/backend/errors.py` | 96 |
| `InsufficientFunds` | Class | `src/backend/errors.py` | 100 |
| `TopupFailed` | Class | `src/backend/errors.py` | 104 |
| `SharingError` | Class | `src/backend/errors.py` | 130 |
| `ShareNotFound` | Class | `src/backend/errors.py` | 134 |
| `ShareAlreadyGranted` | Class | `src/backend/errors.py` | 138 |
| `ConfigError` | Class | `src/backend/errors.py` | 168 |
| `MissingEnvVar` | Class | `src/backend/errors.py` | 172 |
| `InvalidConfig` | Class | `src/backend/errors.py` | 176 |
| `SessionError` | Class | `src/backend/errors.py` | 35 |
| `SessionExpired` | Class | `src/backend/errors.py` | 39 |
| `SessionNotFound` | Class | `src/backend/errors.py` | 43 |
| `SessionInvalid` | Class | `src/backend/errors.py` | 47 |
| `UserDeleted` | Class | `src/backend/errors.py` | 51 |
| `MppError` | Class | `src/backend/errors.py` | 145 |
| `StreamNotFound` | Class | `src/backend/errors.py` | 149 |
| `PaymentFailed` | Class | `src/backend/errors.py` | 153 |
| `SettlementError` | Class | `src/backend/errors.py` | 157 |
| `MppSubmitError` | Class | `src/backend/errors.py` | 161 |

## How to Explore

1. `context({name: "get_settings"})` — see callers and callees
2. `query({search_query: "backend"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
