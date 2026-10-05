---
name: proxy
description: "Skill for the Proxy area of keyshield. 39 symbols across 6 files."
---

# Proxy

39 symbols | 6 files | Cohesion: 98%

## When to Use

- Working with code in `src/`
- Understanding how call_helius, call_rest, call_rest_streaming work
- Modifying proxy-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/backend/proxy/api_router.py` | _ck, _cache_get, _cache_set, _build_url_and_headers, _helius_provider (+6) |
| `src/backend/proxy/velocity.py` | _body_empty, _get, _prune, is_suspended, admit (+3) |
| `src/backend/proxy/x402_verify.py` | _db, record_claim, has_claim, verify_on_chain, _verify_on_chain_real (+3) |
| `src/backend/proxy/x402_interceptor.py` | from_response, pay, parse_402, with_x402_retry, pay (+1) |
| `src/backend/tests/test_velocity.py` | _limiter, test_request_cap_does_not_count_the_rejected_attempt, test_spend_and_token_windows, test_three_empty_or_5xx_responses_suspend_the_session, test_success_resets_the_failure_streak |
| `src/backend/routes/proxy.py` | _velocity_observe |

## Entry Points

Start here when exploring this area:

- **`call_helius`** (Function) — `src/backend/proxy/api_router.py:216`
- **`call_rest`** (Function) — `src/backend/proxy/api_router.py:250`
- **`call_rest_streaming`** (Function) — `src/backend/proxy/api_router.py:314`
- **`batch_helius`** (Function) — `src/backend/proxy/api_router.py:370`
- **`one`** (Function) — `src/backend/proxy/api_router.py:373`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `call_helius` | Function | `src/backend/proxy/api_router.py` | 216 |
| `call_rest` | Function | `src/backend/proxy/api_router.py` | 250 |
| `call_rest_streaming` | Function | `src/backend/proxy/api_router.py` | 314 |
| `batch_helius` | Function | `src/backend/proxy/api_router.py` | 370 |
| `one` | Function | `src/backend/proxy/api_router.py` | 373 |
| `batch_rest` | Function | `src/backend/proxy/api_router.py` | 382 |
| `parse_402` | Function | `src/backend/proxy/x402_interceptor.py` | 283 |
| `with_x402_retry` | Function | `src/backend/proxy/x402_interceptor.py` | 301 |
| `test_request_cap_does_not_count_the_rejected_attempt` | Function | `src/backend/tests/test_velocity.py` | 24 |
| `test_spend_and_token_windows` | Function | `src/backend/tests/test_velocity.py` | 38 |
| `test_three_empty_or_5xx_responses_suspend_the_session` | Function | `src/backend/tests/test_velocity.py` | 59 |
| `test_success_resets_the_failure_streak` | Function | `src/backend/tests/test_velocity.py` | 76 |
| `record_claim` | Function | `src/backend/proxy/x402_verify.py` | 200 |
| `has_claim` | Function | `src/backend/proxy/x402_verify.py` | 232 |
| `verify_on_chain` | Function | `src/backend/proxy/x402_verify.py` | 256 |
| `load_x402_config` | Function | `src/backend/proxy/x402_verify.py` | 112 |
| `from_response` | Method | `src/backend/proxy/x402_interceptor.py` | 56 |
| `pay` | Method | `src/backend/proxy/x402_interceptor.py` | 97 |
| `is_suspended` | Method | `src/backend/proxy/velocity.py` | 104 |
| `admit` | Method | `src/backend/proxy/velocity.py` | 109 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Proxy_route → _get` | cross_community | 4 |
| `Proxy_route → _prune` | cross_community | 4 |
| `Vault_proxy_route → _get` | cross_community | 4 |
| `Vault_proxy_route → _prune` | cross_community | 4 |
| `Call_helius → From_response` | intra_community | 4 |
| `Call_rest → From_response` | intra_community | 4 |

## How to Explore

1. `context({name: "call_helius"})` — see callers and callees
2. `query({search_query: "proxy"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
