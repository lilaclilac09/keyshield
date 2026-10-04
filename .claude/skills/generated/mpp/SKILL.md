---
name: mpp
description: "Skill for the Mpp area of keyshield. 86 symbols across 6 files."
---

# Mpp

86 symbols | 6 files | Cohesion: 82%

## When to Use

- Working with code in `src/`
- Understanding how open_stream, hold_estimate, release_hold work
- Modifying mpp-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/backend/mpp/mpp_streams.py` | _resolve_db_path, _db, _row_to_stream, _row_to_event, _begin_immediate (+41) |
| `src/backend/mpp/mpp_onchain.py` | build_mpp_settle_ix_data, build_mpp_settle_ix, submit_mpp_settle, _b58decode_pure, _b58decode (+12) |
| `src/backend/mpp/fulfillment.py` | sha256, assert_settlement_artifact, coerce_body, canonical_preimage, verify_fulfillment (+9) |
| `src/backend/tests/test_mpp_fulfillment.py` | test_settlement_artifact_must_be_32_nonzero_bytes, test_empty_error_and_garbage_are_not_billable, test_claimed_tokens_cannot_exceed_usage_in_the_body, test_token_claim_without_usage_is_rejected |
| `src/backend/mpp/capture.py` | _artifact_bytes, coerce_signature, _signature_bytes, verify_artifact_signature |
| `src/backend/tests/test_mpp_adversarial_guards.py` | test_empty_disconnect_is_not_billable |

## Entry Points

Start here when exploring this area:

- **`open_stream`** (Function) — `src/backend/mpp/mpp_streams.py:901`
- **`hold_estimate`** (Function) — `src/backend/mpp/mpp_streams.py:1190`
- **`release_hold`** (Function) — `src/backend/mpp/mpp_streams.py:1249`
- **`record_usage`** (Function) — `src/backend/mpp/mpp_streams.py:1285`
- **`meter_proxy_response`** (Function) — `src/backend/mpp/mpp_streams.py:1602`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `open_stream` | Function | `src/backend/mpp/mpp_streams.py` | 901 |
| `hold_estimate` | Function | `src/backend/mpp/mpp_streams.py` | 1190 |
| `release_hold` | Function | `src/backend/mpp/mpp_streams.py` | 1249 |
| `record_usage` | Function | `src/backend/mpp/mpp_streams.py` | 1285 |
| `meter_proxy_response` | Function | `src/backend/mpp/mpp_streams.py` | 1602 |
| `settle_stream` | Function | `src/backend/mpp/mpp_streams.py` | 1667 |
| `settle_receipt` | Function | `src/backend/mpp/mpp_streams.py` | 1707 |
| `close_stream` | Function | `src/backend/mpp/mpp_streams.py` | 1957 |
| `record_tx_signature` | Function | `src/backend/mpp/mpp_streams.py` | 2003 |
| `list_streams` | Function | `src/backend/mpp/mpp_streams.py` | 2057 |
| `list_events` | Function | `src/backend/mpp/mpp_streams.py` | 2106 |
| `build_mpp_settle_ix_data` | Function | `src/backend/mpp/mpp_onchain.py` | 338 |
| `build_mpp_settle_ix` | Function | `src/backend/mpp/mpp_onchain.py` | 503 |
| `submit_mpp_settle` | Function | `src/backend/mpp/mpp_onchain.py` | 627 |
| `settle_on_chain` | Function | `src/backend/mpp/mpp_streams.py` | 551 |
| `sha256` | Function | `src/backend/mpp/fulfillment.py` | 77 |
| `assert_settlement_artifact` | Function | `src/backend/mpp/fulfillment.py` | 81 |
| `coerce_body` | Function | `src/backend/mpp/fulfillment.py` | 110 |
| `canonical_preimage` | Function | `src/backend/mpp/fulfillment.py` | 338 |
| `verify_fulfillment` | Function | `src/backend/mpp/fulfillment.py` | 361 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Settle_on_chain → _b58decode_pure` | cross_community | 5 |
| `Meter_proxy_response → _resolve_db_path` | intra_community | 5 |
| `Hold_estimate → _resolve_db_path` | intra_community | 4 |
| `Hold_estimate → _release_hold_row` | intra_community | 4 |
| `Settle_on_chain → Build_ed25519_ix_data` | cross_community | 4 |
| `Settle_stream → _resolve_db_path` | intra_community | 4 |
| `Settle_stream → _release_hold_row` | intra_community | 4 |
| `Settle_receipt → _resolve_db_path` | intra_community | 4 |
| `Settle_receipt → _release_hold_row` | intra_community | 4 |
| `Settle_receipt → _row_to_stream` | intra_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Tests | 2 calls |

## How to Explore

1. `context({name: "open_stream"})` — see callers and callees
2. `query({search_query: "mpp"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
