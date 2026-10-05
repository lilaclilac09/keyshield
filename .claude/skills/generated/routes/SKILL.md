---
name: routes
description: "Skill for the Routes area of keyshield. 97 symbols across 11 files."
---

# Routes

97 symbols | 11 files | Cohesion: 93%

## When to Use

- Working with code in `src/`
- Understanding how session_key, proxy_route, vault_proxy_route work
- Modifying routes-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/backend/routes/mpp.py` | _auth, _require_auth, mpp_list_streams, mpp_list_events, mpp_open_stream (+11) |
| `src/backend/routes/proxy.py` | _get_x402_interceptor, _bearer, _mpp_stream_id, _mpp_acquire_hold, _header_u64 (+8) |
| `src/backend/routes/auth.py` | _bearer, _session, _origin_rp_id, auth_logout, passkey_register_options (+7) |
| `src/backend/routes/agents.py` | _auth, agent_list_rest, agent_register_rest, agent_delete_rest, agent_register (+7) |
| `src/backend/routes/vault.py` | _db, _auth, _require_user_id, _iso, _mask (+6) |
| `src/backend/routes/sharing.py` | _auth, sharing_list, _normalize, sharing_grant, sharing_delete_rest (+4) |
| `src/backend/routes/x402.py` | _auth, add_x402_trust, delete_x402_trust, get_x402_spend, _db (+3) |
| `src/backend/routes/billing.py` | _auth, billing_info, billing_usage, usage_stats, usage_history (+2) |
| `src/backend/routes/sessions.py` | _auth, _db, _get_ip, _get_ua, _detect_device (+2) |
| `src/backend/proxy/velocity.py` | session_key |

## Entry Points

Start here when exploring this area:

- **`session_key`** (Function) — `src/backend/proxy/velocity.py:45`
- **`proxy_route`** (Function) — `src/backend/routes/proxy.py:171`
- **`vault_proxy_route`** (Function) — `src/backend/routes/proxy.py:300`
- **`test_session_key_uses_the_bearer_then_the_user`** (Function) — `src/backend/tests/test_velocity.py:87`
- **`auth_logout`** (Function) — `src/backend/routes/auth.py:57`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `session_key` | Function | `src/backend/proxy/velocity.py` | 45 |
| `proxy_route` | Function | `src/backend/routes/proxy.py` | 171 |
| `vault_proxy_route` | Function | `src/backend/routes/proxy.py` | 300 |
| `test_session_key_uses_the_bearer_then_the_user` | Function | `src/backend/tests/test_velocity.py` | 87 |
| `auth_logout` | Function | `src/backend/routes/auth.py` | 57 |
| `passkey_register_options` | Function | `src/backend/routes/auth.py` | 148 |
| `passkey_register_verify` | Function | `src/backend/routes/auth.py` | 160 |
| `passkey_auth_options` | Function | `src/backend/routes/auth.py` | 181 |
| `passkey_auth_verify` | Function | `src/backend/routes/auth.py` | 192 |
| `passkey_list` | Function | `src/backend/routes/auth.py` | 216 |
| `passkey_delete` | Function | `src/backend/routes/auth.py` | 225 |
| `delete_account_challenge` | Function | `src/backend/routes/auth.py` | 238 |
| `delete_account` | Function | `src/backend/routes/auth.py` | 248 |
| `vault_list` | Function | `src/backend/routes/vault.py` | 152 |
| `vault_store` | Function | `src/backend/routes/vault.py` | 165 |
| `vault_decrypt` | Function | `src/backend/routes/vault.py` | 221 |
| `vault_delete` | Function | `src/backend/routes/vault.py` | 239 |
| `vault_update` | Function | `src/backend/routes/vault.py` | 254 |
| `agent_list_rest` | Function | `src/backend/routes/agents.py` | 45 |
| `agent_register_rest` | Function | `src/backend/routes/agents.py` | 70 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Proxy_route → _get` | cross_community | 4 |
| `Proxy_route → _prune` | cross_community | 4 |
| `Vault_proxy_route → _get` | cross_community | 4 |
| `Vault_proxy_route → _prune` | cross_community | 4 |
| `Proxy_route → Session_key` | intra_community | 3 |
| `Proxy_route → _bearer` | intra_community | 3 |
| `Proxy_route → _header_u64` | intra_community | 3 |
| `Proxy_route → _mpp_stream_id` | intra_community | 3 |
| `Vault_proxy_route → Session_key` | intra_community | 3 |
| `Vault_proxy_route → _bearer` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Proxy | 3 calls |
| Mpp | 1 calls |

## How to Explore

1. `context({name: "session_key"})` — see callers and callees
2. `query({search_query: "routes"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
