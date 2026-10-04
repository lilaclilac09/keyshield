---
name: integration
description: "Skill for the Integration area of keyshield. 18 symbols across 1 files."
---

# Integration

18 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `tests/`
- Understanding how ok, fail, info work
- Modifying integration-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `tests/integration/test_agent_flow.py` | ok, fail, info, section, gen_keypair (+13) |

## Entry Points

Start here when exploring this area:

- **`ok`** (Function) — `tests/integration/test_agent_flow.py:45`
- **`fail`** (Function) — `tests/integration/test_agent_flow.py:46`
- **`info`** (Function) — `tests/integration/test_agent_flow.py:47`
- **`section`** (Function) — `tests/integration/test_agent_flow.py:49`
- **`gen_keypair`** (Function) — `tests/integration/test_agent_flow.py:54`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ok` | Function | `tests/integration/test_agent_flow.py` | 45 |
| `fail` | Function | `tests/integration/test_agent_flow.py` | 46 |
| `info` | Function | `tests/integration/test_agent_flow.py` | 47 |
| `section` | Function | `tests/integration/test_agent_flow.py` | 49 |
| `gen_keypair` | Function | `tests/integration/test_agent_flow.py` | 54 |
| `sign_b64` | Function | `tests/integration/test_agent_flow.py` | 61 |
| `POST` | Function | `tests/integration/test_agent_flow.py` | 75 |
| `GET` | Function | `tests/integration/test_agent_flow.py` | 82 |
| `DELETE` | Function | `tests/integration/test_agent_flow.py` | 89 |
| `test_owner_login` | Function | `tests/integration/test_agent_flow.py` | 100 |
| `test_register_agent` | Function | `tests/integration/test_agent_flow.py` | 125 |
| `test_agent_login` | Function | `tests/integration/test_agent_flow.py` | 153 |
| `test_agent_identity` | Function | `tests/integration/test_agent_flow.py` | 174 |
| `test_billing_topup` | Function | `tests/integration/test_agent_flow.py` | 193 |
| `test_proxy_logged` | Function | `tests/integration/test_agent_flow.py` | 212 |
| `test_revoke_agent` | Function | `tests/integration/test_agent_flow.py` | 246 |
| `main` | Function | `tests/integration/test_agent_flow.py` | 277 |
| `_hdr` | Function | `tests/integration/test_agent_flow.py` | 68 |

## How to Explore

1. `context({name: "ok"})` — see callers and callees
2. `query({search_query: "integration"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
