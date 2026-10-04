---
name: oracle-diff
description: "Skill for the Oracle_diff area of keyshield. 18 symbols across 1 files."
---

# Oracle_diff

18 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how start_mock_server, make_empty_session_db, spawn_python work
- Modifying oracle_diff-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/proxy/tests/oracle_diff/harness.py` | start_mock_server, _wait_health, make_empty_session_db, _resolve_python, spawn_python (+13) |

## Entry Points

Start here when exploring this area:

- **`start_mock_server`** (Function) — `src/proxy/tests/oracle_diff/harness.py:192`
- **`make_empty_session_db`** (Function) — `src/proxy/tests/oracle_diff/harness.py:227`
- **`spawn_python`** (Function) — `src/proxy/tests/oracle_diff/harness.py:276`
- **`spawn_rust`** (Function) — `src/proxy/tests/oracle_diff/harness.py:287`
- **`call`** (Function) — `src/proxy/tests/oracle_diff/harness.py:304`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `start_mock_server` | Function | `src/proxy/tests/oracle_diff/harness.py` | 192 |
| `make_empty_session_db` | Function | `src/proxy/tests/oracle_diff/harness.py` | 227 |
| `spawn_python` | Function | `src/proxy/tests/oracle_diff/harness.py` | 276 |
| `spawn_rust` | Function | `src/proxy/tests/oracle_diff/harness.py` | 287 |
| `call` | Function | `src/proxy/tests/oracle_diff/harness.py` | 304 |
| `compare` | Function | `src/proxy/tests/oracle_diff/harness.py` | 361 |
| `run_one` | Function | `src/proxy/tests/oracle_diff/harness.py` | 535 |
| `main` | Function | `src/proxy/tests/oracle_diff/harness.py` | 561 |
| `cleanup` | Function | `src/proxy/tests/oracle_diff/harness.py` | 584 |
| `canned_helius` | Function | `src/proxy/tests/oracle_diff/harness.py` | 171 |
| `do_POST` | Method | `src/proxy/tests/oracle_diff/harness.py` | 91 |
| `do_GET` | Method | `src/proxy/tests/oracle_diff/harness.py` | 145 |
| `_wait_health` | Function | `src/proxy/tests/oracle_diff/harness.py` | 213 |
| `_resolve_python` | Function | `src/proxy/tests/oracle_diff/harness.py` | 247 |
| `_strip_volatile` | Function | `src/proxy/tests/oracle_diff/harness.py` | 337 |
| `_read_body` | Method | `src/proxy/tests/oracle_diff/harness.py` | 73 |
| `_send_json` | Method | `src/proxy/tests/oracle_diff/harness.py` | 77 |
| `_record` | Method | `src/proxy/tests/oracle_diff/harness.py` | 85 |

## How to Explore

1. `context({name: "start_mock_server"})` — see callers and callees
2. `query({search_query: "oracle_diff"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
