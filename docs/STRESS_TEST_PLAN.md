# KeyShield — bounded local stress-test plan

Written **before** execution. This is adversarial coverage plus measured
local limits. It is **not** a license to load-test public infrastructure.

Status: plan only until the results file is filled from a completed run.

## Scope (allowed)

| Allowed | Forbidden |
|---|---|
| Local mock upstream | Public Devnet RPC load |
| Local `ks-proxy` / Python proxy | `https://app.ks.aileena.xyz` fault injection |
| Host oracles (`cargo test`, vitest) | Production / paid upstream APIs |
| Local validator / bankrun if `.so` exists | Email providers, OpenRouter, Helius live |
| Synthetic canary secrets | Real credentials, real funds, mainnet |

## Ceilings (abort if exceeded)

| Limit | Ceiling | Abort |
|---|---|---|
| Concurrency | 8 workers | > 8 simultaneous clients |
| Request rate | 20 req/s | sustained > 20 rps |
| Total requests | 200 | stop at 200 |
| Duration | 90 s wall | SIGINT at 90 s |
| Artifact size | 64 KiB / response | reject larger synthetic bodies |
| Cost | $0 (local mock) | any live paid call |
| Error rate | observe | abort if > 50% unexpected 5xx from **local** proxy |
| Memory | observe RSS of local proxy | abort if host swap thrash |

Progression: **baseline (1 worker)** → **modest (4)** → **ceiling (8)** → **recovery (1)**.

## Workload

1. Escrow / state-machine (host oracle, no RPC):
   - `clawback_ready` at `last_active + 2249`, `+ 2250`, `+ 2251`
   - unauthorized / double-claim / replay / resurrection via Stage 1 + 2
   - escrow conservation `escrow = deposit − spent` with explicit spent accounting
2. Proxy / artifact (local mock):
   - 502 / 504, TCP drop mid-SSE, empty 200, garbage JSON
   - artifact lengths 0 / 31 / 32 / 33 and all-zero 32-byte digest
   - no `mpp_settle` signature when chain env is unset
3. Resource / isolation (local):
   - open/close churn of the mock server
   - synthetic canary `sk-canary-NOT-A-REAL-KEY` must not appear in proxy logs
   - concurrent sessions against the mock (≤ 8)

## Measurements to record

Report separately; do not blend mock latency with production claims.

- end-to-end latency (client start → last byte)
- proxy processing overhead (e2e − upstream mock delay)
- upstream mock latency (known, injected)
- time to first byte
- throughput (completed req/s)
- error / timeout rates
- p50 / p95 / p99 **only with sample count and method** (`numpy`/sort); n < 30 marked “illustrative, not robust”
- CPU / RSS of local proxy if `/proc` is available
- compute units: **unmeasured on Devnet in this run** unless a historical tx log contains them
- recovery time after the ceiling wave

Hardware, OS, commit SHA, cold vs warm, and measurement overhead go in
[STRESS_TEST_RESULTS.md](STRESS_TEST_RESULTS.md).

## Pass / fail

A case **fails** if:

- `settled > 0` or `signed > 0` on a fault path
- escrow decreases without a verified artifact
- a canary secret is written to a log or artifact
- a worker exceeds the ceilings above

Failures are preserved. Runtime code is **not** changed to make this plan pass.
