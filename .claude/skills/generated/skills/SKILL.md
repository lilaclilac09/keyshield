---
name: skills
description: "Skill for the Skills area of keyshield. 33 symbols across 3 files."
---

# Skills

33 symbols | 3 files | Cohesion: 97%

## When to Use

- Working with code in `src/`
- Understanding how watch_wallet, list_webhooks, delete_webhook work
- Modifying skills-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/backend/skills/helius_ws.py` | _call, _subscribe, _iter, account_subscribe, signature_subscribe (+10) |
| `src/backend/skills/helius_laserstream.py` | _import_stubs, _import_grpc, __aenter__, _connect, _md (+9) |
| `src/backend/skills/helius_skill.py` | _webhook_req, watch_wallet, list_webhooks, delete_webhook |

## Entry Points

Start here when exploring this area:

- **`watch_wallet`** (Function) — `src/backend/skills/helius_skill.py:283`
- **`list_webhooks`** (Function) — `src/backend/skills/helius_skill.py:305`
- **`delete_webhook`** (Function) — `src/backend/skills/helius_skill.py:316`
- **`subscribe`** (Method) — `src/backend/skills/helius_laserstream.py:112`
- **`subscribe_accounts`** (Method) — `src/backend/skills/helius_laserstream.py:131`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `watch_wallet` | Function | `src/backend/skills/helius_skill.py` | 283 |
| `list_webhooks` | Function | `src/backend/skills/helius_skill.py` | 305 |
| `delete_webhook` | Function | `src/backend/skills/helius_skill.py` | 316 |
| `subscribe` | Method | `src/backend/skills/helius_laserstream.py` | 112 |
| `subscribe_accounts` | Method | `src/backend/skills/helius_laserstream.py` | 131 |
| `subscribe_transactions` | Method | `src/backend/skills/helius_laserstream.py` | 150 |
| `subscribe_slots` | Method | `src/backend/skills/helius_laserstream.py` | 173 |
| `subscribe_blocks` | Method | `src/backend/skills/helius_laserstream.py` | 180 |
| `account_subscribe` | Method | `src/backend/skills/helius_ws.py` | 176 |
| `signature_subscribe` | Method | `src/backend/skills/helius_ws.py` | 189 |
| `program_subscribe` | Method | `src/backend/skills/helius_ws.py` | 201 |
| `logs_subscribe` | Method | `src/backend/skills/helius_ws.py` | 218 |
| `slot_subscribe` | Method | `src/backend/skills/helius_ws.py` | 229 |
| `transaction_subscribe` | Method | `src/backend/skills/helius_ws.py` | 232 |
| `close` | Method | `src/backend/skills/helius_ws.py` | 70 |
| `close` | Method | `src/backend/skills/helius_laserstream.py` | 101 |
| `_import_stubs` | Function | `src/backend/skills/helius_laserstream.py` | 41 |
| `_import_grpc` | Function | `src/backend/skills/helius_laserstream.py` | 53 |
| `_req_iter` | Function | `src/backend/skills/helius_laserstream.py` | 124 |
| `_commitment_to_pb` | Function | `src/backend/skills/helius_laserstream.py` | 198 |

## How to Explore

1. `context({name: "watch_wallet"})` — see callers and callees
2. `query({search_query: "skills"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
