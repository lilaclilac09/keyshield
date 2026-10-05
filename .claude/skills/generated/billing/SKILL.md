---
name: billing
description: "Skill for the Billing area of keyshield. 38 symbols across 4 files."
---

# Billing

38 symbols | 4 files | Cohesion: 91%

## When to Use

- Working with code in `src/`
- Understanding how open_stream, record, settle work
- Modifying billing-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/backend/billing/usage.py` | _db, get_stats, get_history, purge_user, list_topups (+7) |
| `src/backend/billing/mpp.py` | _db, _stream_row_to_dict, _event_row_to_dict, _compute_pending, _do_settle (+6) |
| `src/backend/billing/shares.py` | _conn, _encrypt, _decrypt, _token_hash, create_share (+3) |
| `src/backend/billing/billing_solana.py` | _instructions, _verify_tx_succeeded, find_sol_transfer, find_usdc_transfer, ata_owner (+2) |

## Entry Points

Start here when exploring this area:

- **`open_stream`** (Function) — `src/backend/billing/mpp.py:191`
- **`record`** (Function) — `src/backend/billing/mpp.py:246`
- **`settle`** (Function) — `src/backend/billing/mpp.py:333`
- **`close_stream`** (Function) — `src/backend/billing/mpp.py:364`
- **`list_streams`** (Function) — `src/backend/billing/mpp.py:423`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `open_stream` | Function | `src/backend/billing/mpp.py` | 191 |
| `record` | Function | `src/backend/billing/mpp.py` | 246 |
| `settle` | Function | `src/backend/billing/mpp.py` | 333 |
| `close_stream` | Function | `src/backend/billing/mpp.py` | 364 |
| `list_streams` | Function | `src/backend/billing/mpp.py` | 423 |
| `list_events` | Function | `src/backend/billing/mpp.py` | 456 |
| `create_share` | Function | `src/backend/billing/shares.py` | 74 |
| `access_share` | Function | `src/backend/billing/shares.py` | 122 |
| `list_shares` | Function | `src/backend/billing/shares.py` | 171 |
| `revoke_share` | Function | `src/backend/billing/shares.py` | 201 |
| `find_sol_transfer` | Function | `src/backend/billing/billing_solana.py` | 140 |
| `find_usdc_transfer` | Function | `src/backend/billing/billing_solana.py` | 164 |
| `ata_owner` | Function | `src/backend/billing/billing_solana.py` | 183 |
| `get_stats` | Function | `src/backend/billing/usage.py` | 187 |
| `get_history` | Function | `src/backend/billing/usage.py` | 229 |
| `purge_user` | Function | `src/backend/billing/usage.py` | 377 |
| `list_topups` | Function | `src/backend/billing/usage.py` | 401 |
| `log_call` | Function | `src/backend/billing/usage.py` | 132 |
| `get_balance` | Function | `src/backend/billing/usage.py` | 265 |
| `topup` | Function | `src/backend/billing/usage.py` | 278 |

## How to Explore

1. `context({name: "open_stream"})` — see callers and callees
2. `query({search_query: "billing"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
