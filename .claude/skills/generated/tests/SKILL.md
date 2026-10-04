---
name: tests
description: "Skill for the Tests area of keyshield. 378 symbols across 52 files."
---

# Tests

378 symbols | 52 files | Cohesion: 82%

## When to Use

- Working with code in `src/`
- Understanding how process_store_key, router, from_env work
- Modifying tests-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/programs/keyshield/tests/embedded_wallet_mollusk.rs` | build_open_stream_data, open_stream_data_too_short_rejected, open_stream_owner_must_sign, make_vault_with_active_grant, make_vault_with_revoked_grant (+18) |
| `src/proxy/crates/ks-proxy/tests/proxy.rs` | test_prometheus, python_bin, repo_root, proxy_rs_dir, unique_tmp_dir (+16) |
| `src/proxy/crates/ks-helius/tests/cache.rs` | client_for_mock, config_with_default_ttl, get_balance_happy_path, get_asset_happy_path, get_assets_by_owner_happy_path (+15) |
| `src/proxy/crates/ks-upstream/tests/forward.rs` | fixture, json_headers, assert_dropped_request_headers, openai_bearer_auth_drops_content_type_then_reinjects, anthropic_uses_x_api_key_and_default_version (+13) |
| `proxy-helius/crates/ks-helius/tests/unit.rs` | cache_key_is_deterministic, cache_key_differs_by_method, cache_key_differs_by_params, cache_key_is_40_char_hex, cache_key_display_matches_as_str (+12) |
| `src/proxy/crates/ks-proxy/tests/stealth.rs` | python_bin, repo_root, proxy_rs_dir, unique_tmp_dir, seed_fixtures (+11) |
| `src/proxy/crates/ks-upstream/tests/helius.rs` | helius_fixture, das_dispatch_routes_getasset_to_das_path, enhanced_dispatch_routes_gettransactions, rpc_dispatch_routes_getbalance, cacheable_method_hits_on_second_call (+11) |
| `proxy-helius/crates/ks-helius/tests/integration.rs` | make_client, make_client_with_extra_cfg, rpc_ok, get_balance_parses_lamports, get_balance_second_call_hits_cache_not_upstream (+9) |
| `src/backend/tests/test_mpp_adversarial_guards.py` | _open, test_same_artifact_hash_is_a_replay_without_an_idempotency_key, test_replayed_receipt_does_not_advance_sequence_or_balance, test_receipts_carry_strictly_increasing_sequence_and_request_hash, test_saturated_sequence_aborts_before_the_debit (+9) |
| `archive/v2-mvp/tests/test_account_deletion.py` | _delete, test_no_auth_returns_401, test_bad_token_returns_401, test_close_but_wrong_phrase_returns_400, test_returns_200_and_deleted_true (+9) |

## Entry Points

Start here when exploring this area:

- **`process_store_key`** (Function) — `src/programs/keyshield/src/instructions/store_key.rs:31`
- **`router`** (Function) — `src/proxy/crates/ks-proxy/src/lib.rs:50`
- **`from_env`** (Function) — `proxy-helius/crates/ks-helius/src/lib.rs:106`
- **`new`** (Function) — `proxy-helius/crates/ks-helius/src/lib.rs:116`
- **`set_sbf_out_dir`** (Function) — `src/programs/keyshield/tests/common/mod.rs:7`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `CustomProgramError` | Class | `tests/bankrun_security.test.ts` | 55 |
| `PartialClient` | Class | `src/backend/tests/test_mpp_adversarial_guards.py` | 431 |
| `DownClient` | Class | `src/backend/tests/test_mpp_adversarial_guards.py` | 439 |
| `process_store_key` | Function | `src/programs/keyshield/src/instructions/store_key.rs` | 31 |
| `router` | Function | `src/proxy/crates/ks-proxy/src/lib.rs` | 50 |
| `from_env` | Function | `proxy-helius/crates/ks-helius/src/lib.rs` | 106 |
| `new` | Function | `proxy-helius/crates/ks-helius/src/lib.rs` | 116 |
| `set_sbf_out_dir` | Function | `src/programs/keyshield/tests/common/mod.rs` | 7 |
| `program_id` | Function | `src/programs/keyshield/tests/common/mod.rs` | 23 |
| `vault_pda` | Function | `src/programs/keyshield/tests/common/mod.rs` | 28 |
| `share_pda` | Function | `src/programs/keyshield/tests/common/mod.rs` | 34 |
| `empty` | Function | `src/programs/keyshield/src/state.rs` | 30 |
| `new` | Function | `src/programs/keyshield/src/state.rs` | 55 |
| `to_python_json` | Function | `src/proxy/crates/ks-cache/src/lib.rs` | 126 |
| `new` | Function | `src/proxy/crates/ks-proxy/src/bridge.rs` | 34 |
| `new_with_client` | Function | `src/proxy/crates/ks-proxy/src/bridge.rs` | 38 |
| `record_mpp_call` | Function | `src/proxy/crates/ks-proxy/src/bridge.rs` | 96 |
| `spawn` | Function | `src/proxy/crates/ks-proxy/src/bridge.rs` | 216 |
| `spawn_with_capacity` | Function | `src/proxy/crates/ks-proxy/src/bridge.rs` | 220 |
| `sign_artifact_hash` | Function | `src/backend/mpp/capture.py` | 49 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Get_transactions_for_address → New` | cross_community | 6 |
| `Main → New_with_client` | cross_community | 5 |
| `Batch → New_with_client` | cross_community | 5 |
| `Fallthrough → From` | cross_community | 5 |
| `Get_transactions_for_address → Sort_keys` | cross_community | 5 |
| `Forward → All` | cross_community | 5 |
| `Proxy_inner → From` | cross_community | 5 |
| `Main → Drain_loop` | cross_community | 4 |
| `Main → LogBufferTask` | cross_community | 4 |
| `Main → All` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Mpp | 4 calls |
| Cluster_235 | 3 calls |
| Cluster_254 | 2 calls |
| Cluster_216 | 2 calls |
| Instructions | 2 calls |
| Cluster_240 | 2 calls |
| Cluster_129 | 1 calls |
| Cluster_241 | 1 calls |

## How to Explore

1. `context({name: "process_store_key"})` — see callers and callees
2. `query({search_query: "tests"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
