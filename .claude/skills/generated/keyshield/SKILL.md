---
name: keyshield
description: "Skill for the Keyshield area of keyshield. 76 symbols across 4 files."
---

# Keyshield

76 symbols | 4 files | Cohesion: 88%

## When to Use

- Working with code in `packages/`
- Understanding how generate_keypair, test_generate_keypair_returns_hex_and_b58, test_agent_authenticate_and_list_keys work
- Modifying keyshield-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/sdk-py/keyshield/__init__.py` | _b58encode, generate_keypair, generate_keypair, pubkey_b58, authenticate (+62) |
| `packages/sdk-py/tests/test_agent_client.py` | _owner_login_and_register, test_generate_keypair_returns_hex_and_b58, test_agent_authenticate_and_list_keys, test_agent_pubkey_property_matches_keypair, test_agent_authenticate_without_registration_returns_403 (+1) |
| `packages/sdk-py/tests/test_sync_client.py` | test_authed_call_without_login_raises, test_login_bad_password_raises |
| `packages/sdk-py/tests/test_async_client.py` | test_async_authed_without_login_raises |

## Entry Points

Start here when exploring this area:

- **`generate_keypair`** (Function) — `packages/sdk-py/keyshield/__init__.py:95`
- **`test_generate_keypair_returns_hex_and_b58`** (Function) — `packages/sdk-py/tests/test_agent_client.py:23`
- **`test_agent_authenticate_and_list_keys`** (Function) — `packages/sdk-py/tests/test_agent_client.py:30`
- **`test_agent_pubkey_property_matches_keypair`** (Function) — `packages/sdk-py/tests/test_agent_client.py:50`
- **`test_agent_authenticate_without_registration_returns_403`** (Function) — `packages/sdk-py/tests/test_agent_client.py:62`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `generate_keypair` | Function | `packages/sdk-py/keyshield/__init__.py` | 95 |
| `test_generate_keypair_returns_hex_and_b58` | Function | `packages/sdk-py/tests/test_agent_client.py` | 23 |
| `test_agent_authenticate_and_list_keys` | Function | `packages/sdk-py/tests/test_agent_client.py` | 30 |
| `test_agent_pubkey_property_matches_keypair` | Function | `packages/sdk-py/tests/test_agent_client.py` | 50 |
| `test_agent_authenticate_without_registration_returns_403` | Function | `packages/sdk-py/tests/test_agent_client.py` | 62 |
| `test_agent_missing_inputs_raise_clear_errors` | Function | `packages/sdk-py/tests/test_agent_client.py` | 77 |
| `test_async_authed_without_login_raises` | Function | `packages/sdk-py/tests/test_async_client.py` | 47 |
| `generate_keypair` | Method | `packages/sdk-py/keyshield/__init__.py` | 575 |
| `pubkey_b58` | Method | `packages/sdk-py/keyshield/__init__.py` | 588 |
| `authenticate` | Method | `packages/sdk-py/keyshield/__init__.py` | 596 |
| `store` | Method | `packages/sdk-py/keyshield/__init__.py` | 636 |
| `list_keys` | Method | `packages/sdk-py/keyshield/__init__.py` | 639 |
| `proxy` | Method | `packages/sdk-py/keyshield/__init__.py` | 642 |
| `get_balance` | Method | `packages/sdk-py/keyshield/__init__.py` | 661 |
| `topup` | Method | `packages/sdk-py/keyshield/__init__.py` | 664 |
| `logout` | Method | `packages/sdk-py/keyshield/__init__.py` | 178 |
| `list_keys` | Method | `packages/sdk-py/keyshield/__init__.py` | 191 |
| `list_items` | Method | `packages/sdk-py/keyshield/__init__.py` | 194 |
| `decrypt_key` | Method | `packages/sdk-py/keyshield/__init__.py` | 197 |
| `delete_key` | Method | `packages/sdk-py/keyshield/__init__.py` | 200 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Wallet_login_with_key → _raise` | intra_community | 4 |

## How to Explore

1. `context({name: "generate_keypair"})` — see callers and callees
2. `query({search_query: "keyshield"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
