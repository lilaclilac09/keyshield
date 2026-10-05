# KeyShield — verification, boundaries, and the 4-stage harness

Companion to [README.md](README.md). This file is the reviewer checklist:
what is live on Devnet, which failures the program and proxy must refuse,
and which test file proves each claim. It is **not** a second product
spec — architecture still lives in [AGENTS.md](AGENTS.md) and
[docs/architecture/](docs/architecture/).

---

## On-chain verification

The deployed program is **pinocchio** (not Anchor), upgradeable, and
confirmed executable on Solana Devnet.

| Field | Value |
|---|---|
| Cluster | Solana Devnet |
| Program ID | `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j` |
| Loader | BPFLoaderUpgradeable (`BPFLoaderUpgradeab1e11111111111111111111111`) |
| Executable | `true` (confirmed via `getAccountInfo`) |
| ProgramData | `48Ji7Wmwe8DDQxnGpbBRs2ey9oGo2qwdxTEodhwJk2nx` |
| Upgrade authority | `74Xuc5BC5uttSiHj598sJJj3rgEUsfYF7xVs69tWLwDY` |
| Devnet USDC | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

Direct Explorer links (`?cluster=devnet` required):

- [Program account](https://explorer.solana.com/address/41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j?cluster=devnet)
- [ProgramData (last upgrade slot + authority)](https://explorer.solana.com/address/48Ji7Wmwe8DDQxnGpbBRs2ey9oGo2qwdxTEodhwJk2nx?cluster=devnet)
- [Upgrade authority](https://explorer.solana.com/address/74Xuc5BC5uttSiHj598sJJj3rgEUsfYF7xVs69tWLwDY?cluster=devnet)
- [Upgrade-authority vault `8QBV…`](https://explorer.solana.com/address/8QBVXySkwWJcic2K4b7SAdaG4tQtyA2ekPvaRQLpizmp?cluster=devnet) (`universal_vault` + `74Xuc5…`)
- [MPP stream `E5sM…`](https://explorer.solana.com/address/E5sMx86o3MWV562BxbWk6SxfqTFBWpCitj3AU9i6DgfR?cluster=devnet) (owner `74Xuc5…`, agent `ExoYHG…`)
- [Stream USDC ATA](https://explorer.solana.com/address/6QtooE6QVFF9pJ9Pa9DgAFAWpEWkB8VtjEytc5FyFtBH?cluster=devnet)
- [Local-user vault `9MYS…`](https://explorer.solana.com/address/9MYSdKcRkg1F9hpYmUXsknEyuQ2vzqtW5JDdfsxnTqmV?cluster=devnet) (`universal_vault` + `DDNp8H…`) — **not** the vault for `E5sM…`
- [USDC mint](https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet)

Re-verified 2026-10-05T09:53:29Z, commitment `confirmed`, RPC `https://api.devnet.solana.com`. Program → ProgramData pointer matches. Upgrade authority full address (not a prefix): `74Xuc5BC5uttSiHj598sJJj3rgEUsfYF7xVs69tWLwDY`. On-chain stream account is **3368** bytes; current HEAD `AgentPaymentStream::SIZE` is **3384** (appended `last_active_slot` + `dispute_timeout_slots`). Do not claim the deployed binary matches this HEAD.

### Confirmed execution slots

Open the signature, check `meta.err`, and read the **compiled instruction discriminator**. Confirmation alone is not success; Explorer copy is not the discriminator.

| Signature | Slot | Verified ix |
|---|---|---|
| [t6B8V4WgF3DL…gyGVEh](https://explorer.solana.com/tx/t6B8V4WgF3DLWsmWpVaukoogvrsTxY8MtKnLXijYReAmKeoEgaQntoSy9Jd5ZYT8fJJzRzshVSrkHbT5tgyGVEh?cluster=devnet) | 507665661 | **24 OpenStream** (user `DDNp8H…`). Program **2126** CUs. Previously supplied as “meter + MppSettle” — that label is **wrong**. |
| [2CnCiiji…3Qoj](https://explorer.solana.com/tx/2CnCiijiu7UuRQWRJ1XbB7gq86N2YGFZpHxsoCaJtK3RPmJ3MktBruiPHkzxdUV7a5QEbbZdiZseRsvq4CTf3Qoj?cluster=devnet) | 507665666 | **26 MppSettle** (historical; found via `getSignaturesForAddress`, limit 25). Total **2024** CUs. |
| [u99eN5uhtTHr…wr9peyi](https://explorer.solana.com/tx/u99eN5uhtTHrLBNiWCUzHLJgvj85cLnJ2Xhnhk57Zg7z7GHLDesyiEpGxKuGzP9RtNUQ9PHg2o7wwXUbwr9peyi?cluster=devnet) | 507665693 | **27 WithdrawAgentWallet**. Program **3076** CUs. |
| [678bqTSq4gYs…nrT6XTQc](https://explorer.solana.com/tx/678bqTSq4gYspz2TWwdK3wCzZwEHuuDqseDUS2NcEPVQ45472iNPRykVh6K1zGEbq4nPmbLfDKKSiUx2nrT6XTQc?cluster=devnet) | 461386827 | **24 OpenStream** for `E5sM…`. |

Live instruction surface on this allocation: vault / grant / revoke /
config, `OpenStream` (ix 24), `MppSettle` (ix 26), `CloseStream`, and
`ForceClawback` (ix 28). Source also defines zk-vault ixs **40–43**.
Those bytes are **not** on this ProgramData until authority `74Xuc5…`
extends the allocation and upgrades the buffer. An
`InvalidInstructionData` on ix 40 is the expected live result today.

Operator notes: [docs/DEVNET.md](docs/DEVNET.md).

---

## Failure modes and security boundaries

These are the edges the program and proxy must refuse. Each row names
the automated handler — not a policy promise.

### Settlement vs delivery desync

Pay-before-delivery is the naive path: the agent spends, the upstream
returns HTTP 502 / 504 or a truncated SSE body, and there is nothing
to hash. KeyShield splits the debit:

1. `hold_estimate` locks micro-USDC in the stream ledger.
2. `verify_fulfillment` + `assert_settlement_artifact` require a
   32-byte SHA-256 of a complete, non-error body.
3. `settle_receipt` / `mpp_settle` run only after
   `HMAC-SHA256(session, artifact)` and the owner Ed25519 binding.

A 502, a mid-stream TCP drop, an empty 200, or garbage JSON **cannot**
issue a fulfillment proof. Stage 3 asserts `settled = 0` and
`signed = 0`.

### Slot-bounded escrow timeout

`DEFAULT_DISPUTE_TIMEOUT_SLOTS` is **2250**. `clawback_ready(now,
last_active, timeout)` stays closed at `last_active + timeout` and
opens at `last_active + timeout + 1`. After that, `ForceClawback`
returns remaining escrow to the owner **without** the agent or settler
signing. Inside the window the program returns **6115**
(`DisputeWindowActive`). Stage 1 warps the clock both sides of the
threshold.

### Compute-unit ceiling

Handlers are `no_std` pinocchio. They index `aps_offset` instead of
deserializing heap types (`String`, `Vec`). Mint, PDA, and tombstone
checks run after the cheap early returns so a bad settler or a
zero-byte artifact fails before `TransferChecked`. Design ceiling:
**&lt; 5,000 CUs** per hold / verify / settle transition. This is the
budget that blocks CU-exhaustion as a liveness attack, not a
per-commit CI measurement.

### Memory boundary

The data plane must not leak plaintext credentials on panic or
unwind:

- Vault ciphertext is AES-256-GCM (WebAuthn-PRF → HKDF on the client).
- The proxy injects `X-Upstream-API-Key` once per request and never
  persists it.
- Request buffers are dropped when the socket closes. The record-demo
  client prints `Memory zeroized on socket close`.
- `secrecy` + `zeroize` is the intended crate-level hardening of that
  drop-on-close contract. Those crates are **not** current
  `ks-proxy` dependencies; do not claim they wrap every buffer today.

---

## Four-stage test suite

The matrix below is the implementation, not a wishlist. Commands run
from the repo root.

| Stage | File | Command | What it proves |
|---|---|---|---|
| **1** | [`tests/bankrun_security.test.ts`](tests/bankrun_security.test.ts) | `npm run test:bankrun` | Deterministic slot manipulation (`warpToSlot`); clawback enforcement (6115 inside the window, escrow returned after); account resurrection protection (`ksc1osed` / lamports 0 → settle rejected); double-claim / underflow (two 60-unit settles against a 100-unit cap roll back). Host oracle: [`src/programs/keyshield/tests/bankrun_invariants.rs`](src/programs/keyshield/tests/bankrun_invariants.rs). Optional `solana-bankrun` if `target/deploy/keyshield.so` exists. |
| **2** | [`tests/fuzz_invariants.rs`](tests/fuzz_invariants.rs) | `cargo test -p keyshield --test fuzz_invariants` | Proptest on `StreamModel`: arbitrary create / settle / revoke / close / clawback sequences. Invariant A: `escrow = deposit − spent`. Invariant B: `spent ≤ cap`. Invariant C: `remaining_budget` is monotonic. Unauthorized / revoked / unverified / replayed settles return a custom error and **do not** mutate escrow. |
| **3** | [`tests/proxy_fault_injection.test.ts`](tests/proxy_fault_injection.test.ts) | `npm run test:fault` | Node mock + [`tests/proxy_fault_injection_driver.py`](tests/proxy_fault_injection_driver.py). (a) TCP drop after ~300 of 1000 advertised tokens — bill delivered only. (b) 502 / 504 — balances unmutated, no `mpp_settle`. (c) empty 200 — `rejected:empty payload`. (d) truncated JSON — `rejected:garbage payload`. Chain env is unset so a fault cannot sign. |
| **4** | [`scripts/live_e2e_run.ts`](scripts/live_e2e_run.ts) | `npm run live:e2e:dry` / `LIVE_E2E=1 npm run live:e2e` | End-to-end Devnet: session token (WebAuthn-PRF / `ksv2_…`) → proxy data plane → hold → meter SSE → fulfillment hash → owner binding → confirmed `OpenStream` / `MppSettle`. Default is dry-run. Live path needs operator USDC + an inference key. |

```bash
npm run test:harness          # Stages 1 + 3 + 4 dry-run
npm run test:invariants       # Stage 1 host oracle + Stage 2 fuzz + layout tests
npm run test:fault            # Stage 3
npm run live:e2e:dry          # Stage 4 path check
LIVE_E2E=1 npm run live:e2e   # Stage 4 live Devnet
npm run demo:record           # unattended record-demo (A–D)
npm run demo:record:fast      # same, CI pace
```

`npm run test:harness` is the merge gate for Stages 1, 3, and 4
dry-run. Stage 2 is in `test:invariants` because it is a cargo test.

---

## Demo

| Asset | Where |
|---|---|
| Scene-by-scene voiceover (2:30) | [docs/DEMO_RECORDING_SCRIPT.md](docs/DEMO_RECORDING_SCRIPT.md) |
| Unattended harness (mock + ks-proxy + clawback + Nemotron plug-in) | `npm run demo:record` |
| Judging / landing scripts | [docs/pitch/DEMO_SCRIPT.md](docs/pitch/DEMO_SCRIPT.md), [docs/internal/demo-script-landing.md](docs/internal/demo-script-landing.md) |
| Live app | https://app.ks.aileena.xyz |
| Marketing | https://ks.aileena.xyz |
| YouTube | No `youtu.be` URL is checked into this repository. Publish the voiced cut from `DEMO_RECORDING_SCRIPT.md` and replace this row with the public link. |

Record-demo components:

| Pane | Process |
|---|---|
| A | `scripts/record_demo_mock_upstream.mjs` — fast SSE, 502, truncated stream |
| B | `ks-proxy` / proxy-helius (`RUST_LOG=info`) |
| C | `scripts/record_demo_client.ts` + `npm run test:fault` |
| D | OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free` when a saved key exists, otherwise the local plug-in |

---

## Related

| Doc | Purpose |
|---|---|
| [README.md](README.md) | Product overview + quickstart |
| [docs/DEVNET.md](docs/DEVNET.md) | Operator deploy / upgrade / e2e |
| [AGENTS.md](AGENTS.md) | Agent wiring into the proxy |
| [SPEC.md](SPEC.md) | Protocol primitives |
| [docs/EVIDENCE_INDEX.md](docs/EVIDENCE_INDEX.md) | Artifact IDs, checksums, verified vs claimed |
| [docs/REVIEWER_QUICKSTART.md](docs/REVIEWER_QUICKSTART.md) | Re-run commands + Stage 4 approval gate |
| [docs/STRESS_TEST_PLAN.md](docs/STRESS_TEST_PLAN.md) / [docs/STRESS_TEST_RESULTS.md](docs/STRESS_TEST_RESULTS.md) | Bounded local stress |
| [docs/PROJECT_RESUME.md](docs/PROJECT_RESUME.md) | Submission summary |
