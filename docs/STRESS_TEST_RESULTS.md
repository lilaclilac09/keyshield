# Stress-test results

Plan: [STRESS_TEST_PLAN.md](STRESS_TEST_PLAN.md).
SHA: `f088ab8261a858497a2df2289312698b7a2edc89`.
UTC: 2026-10-05T09:55:41Z.
Environment: **local mock only** (Node `http` server). Not production.

Command: `KS_SOURCE_SHA=f088ab826… node scripts/evidence_stress_local.mjs`

## Ceilings honored

8 workers · 20 rps · 160/200 requests sent · ~8 s wall · $0 · no public RPC.

Progression: baseline 1 → modest 4 → ceiling 8 → recovery 1.

## Latency (successful mock GETs, n=160)

Method: sort milliseconds; percentile index `ceil(p/100*n)-1`.
Injected upstream delay: **25 ms**. These numbers are mock loopback.

| Wave | n | p50 (ms) | p95 (ms) |
|---|---|---|---|
| baseline | 20 | 25.90 | 26.53 |
| modest | 40 | 25.78 | 25.93 |
| ceiling | 80 | 25.80 | 26.00 |
| recovery | 20 | 25.71 | 25.89 |
| all | 160 | 25.80 | 26.10 |

p99 (all) = 26.53 ms. **Do not treat as production p99.**

Errors: 0. Throughput ≈ 20 req/s (rate-limited by the plan).

## Fault / artifact cases

| Case | Result |
|---|---|
| mock `?fault=502` | HTTP 502 |
| empty 200 | 0 bytes (proxy Stage 3 rejects this as `empty payload`) |
| garbage JSON | 9 bytes `{not-json` (Stage 3 rejects `garbage payload`) |
| artifact `None` / 0 / 31 / 33 bytes | `rejected: must be 32 bytes` |
| 32 zero bytes | `rejected: non-zero` |
| 32 non-zero | accepted by `assert_settlement_artifact` only |
| `verify_fulfillment` status 502 | `rejected:upstream error status` |

Stage 3 (separate process, same SHA): 4/4, no `signed` / `settled`.

## Escrow host oracle (not load)

`cargo test -p keyshield --test bankrun_invariants` and
`--test fuzz_invariants`: **pass**. Exact clawback boundary:
`last_active + 2250` → 6115; `+ 2251` → ready.

## Resource / canary

Synthetic canary `sk-canary-NOT-A-REAL-KEY` is the label in the JSON
report. That is **not** proof of universal memory erasure.

CPU / RSS of `ks-proxy` was **not** sampled in this wave (mock HTTP
only). Queue depth: not instrumented.

## Compute units (historical Devnet, not this stress)

| Tx | ix | Program or total CU |
|---|---|---|
| `t6B8V4Wg` | 24 | program **2126** (tx 15747 incl. ATA) |
| `2CnCiiji` | 26 | total **2024** |
| `u99eN5uh` | 27 | program **3076** |

Design budget &lt; 5000 CUs / transition: these three **historical**
consumes are under 5000. Isolated hold/verify CU on a local SVM was
**not measured** in this pack.

## Failures

None inside the ceilings. Public Devnet RPC returned **429** during a
25-signature scan; that scan stopped; no retry storm.
