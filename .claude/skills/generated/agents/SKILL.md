---
name: agents
description: "Skill for the Agents area of keyshield. 22 symbols across 3 files."
---

# Agents

22 symbols | 3 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how register, lookup_owner, revoke_agent work
- Modifying agents-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/backend/agents/agents.py` | _db, register, lookup_owner, revoke_agent, revoke_by_pubkey (+6) |
| `src/backend/agents/server_wallet.py` | _b58encode, _server_secret, _encrypt_seed, _decrypt_seed, _db (+4) |
| `src/backend/agents/agent_wallet.py` | build_create_ephemeral_signer_ix_data, build_create_ephemeral_signer_ix |

## Entry Points

Start here when exploring this area:

- **`register`** (Function) — `src/backend/agents/agents.py:78`
- **`lookup_owner`** (Function) — `src/backend/agents/agents.py:109`
- **`revoke_agent`** (Function) — `src/backend/agents/agents.py:153`
- **`revoke_by_pubkey`** (Function) — `src/backend/agents/agents.py:189`
- **`list_revoked`** (Function) — `src/backend/agents/agents.py:213`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `register` | Function | `src/backend/agents/agents.py` | 78 |
| `lookup_owner` | Function | `src/backend/agents/agents.py` | 109 |
| `revoke_agent` | Function | `src/backend/agents/agents.py` | 153 |
| `revoke_by_pubkey` | Function | `src/backend/agents/agents.py` | 189 |
| `list_revoked` | Function | `src/backend/agents/agents.py` | 213 |
| `un_revoke_agent` | Function | `src/backend/agents/agents.py` | 241 |
| `list_agents` | Function | `src/backend/agents/agents.py` | 258 |
| `revoke` | Function | `src/backend/agents/agents.py` | 287 |
| `touch` | Function | `src/backend/agents/agents.py` | 324 |
| `purge_user` | Function | `src/backend/agents/agents.py` | 337 |
| `create_server_wallet` | Function | `src/backend/agents/server_wallet.py` | 124 |
| `delete_server_wallet` | Function | `src/backend/agents/server_wallet.py` | 162 |
| `list_server_wallets` | Function | `src/backend/agents/server_wallet.py` | 180 |
| `get_signing_key` | Function | `src/backend/agents/server_wallet.py` | 194 |
| `build_create_ephemeral_signer_ix_data` | Function | `src/backend/agents/agent_wallet.py` | 95 |
| `build_create_ephemeral_signer_ix` | Function | `src/backend/agents/agent_wallet.py` | 122 |
| `_db` | Function | `src/backend/agents/agents.py` | 39 |
| `_b58encode` | Function | `src/backend/agents/server_wallet.py` | 46 |
| `_server_secret` | Function | `src/backend/agents/server_wallet.py` | 62 |
| `_encrypt_seed` | Function | `src/backend/agents/server_wallet.py` | 82 |

## How to Explore

1. `context({name: "register"})` — see callers and callees
2. `query({search_query: "agents"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
