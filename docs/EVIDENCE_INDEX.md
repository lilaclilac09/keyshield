# Evidence index

Source SHA for this pack: `f088ab8261a858497a2df2289312698b7a2edc89`.
Videos and raw JSON stay **outside Git** under `/opt/cursor/artifacts/`.

Status key: **verified now** / **supplied historical** / **mocked** /
**planned** / **blocked**.

## Historical file

`/opt/cursor/artifacts/docs-onchain-verification.txt` — **present**
(6844 bytes, 2026-10-05). Supporting only. It repeats the older pairing
of vault `9MYS…` with stream `E5sM…` and labels `t6B8V4Wg` as
“meter + settle”. Those two claims are **superseded** by this pack.

## Artifacts

| ID | Path | UTC | Env | Command / method | Result | Redaction | Limitations |
|---|---|---|---|---|---|---|---|
| E-ONCHAIN | `/opt/cursor/artifacts/evidence/onchain_verify_now.json` | 2026-10-05T09:53:29Z | Devnet `confirmed` | `node scripts/evidence_onchain_verify.mjs` | program executable; PDAs as documented | RPC sanitized to public URL | does not prove binary == HEAD |
| E-SIGS | `/opt/cursor/artifacts/evidence/recent_program_sigs.json` | 2026-10-05T09:56:05Z | Devnet | `getSignaturesForAddress` limit 25 | found ix 26 `2CnCiiji…` | none | 429 then stop; not a full history |
| E-S1 | `/opt/cursor/artifacts/evidence/stage1_bankrun.log` | 2026-10-05T09:53:39Z | local | `npm run test:bankrun` | 4/4 pass | none | SVM bankrun not asserted; `.so` exists |
| E-S1H | `/opt/cursor/artifacts/evidence/stage1_host_oracle.log` | 2026-10-05T09:54Z | local | `cargo test -p keyshield --test bankrun_invariants` | pass | none | host oracle, not Devnet |
| E-S2 | `/opt/cursor/artifacts/evidence/stage2_fuzz.log` | 2026-10-05T09:53Z | local | `cargo test -p keyshield --test fuzz_invariants` | 4/4 pass | none | 64/96 proptest cases; not on-chain SVM |
| E-S3 | `/opt/cursor/artifacts/evidence/stage3_fault.log` | 2026-10-05T09:53:54Z | local mock | `npm run test:fault` | 4/4 pass | none | chain env unset |
| E-S4D | `/opt/cursor/artifacts/evidence/stage4_dry.log` | 2026-10-05T09:54Z | local | `npm run live:e2e:dry` | DRY-RUN PASS | wallet paths only | **not** a live settle |
| E-FUL | `/opt/cursor/artifacts/evidence/fulfillment_unit.log` | 2026-10-05T09:54Z | local | pytest fulfillment + adversarial | 28 passed | none | unit, not proxy e2e |
| E-STRESS | `/opt/cursor/artifacts/evidence/stress_local.json` | 2026-10-05T09:55:41Z | local mock | `scripts/evidence_stress_local.mjs` | 160/160 ok | canary is synthetic | mock 25 ms delay |
| V-A | `/opt/cursor/artifacts/keyshield_demo_overview_cut.mp4` | 2026-10-05T09:56Z | local | ffmpeg concat of uncut scenes | 00:01:14.93, 1920×1200, h264 | fixture `.env` visible | **mocked** |
| V-B | `/opt/cursor/artifacts/keyshield_demo_technical_walkthrough.mp4` | 2026-10-05T10:19Z | local + browser | uncut + trimmed browser | 00:03:47.33 | same | After the harness: Phantom Connect login flash, then **explorer.solana.com Cloudflare verify loop — no chain UI**. Not a Solscan walk. |
| V-C | `/opt/cursor/artifacts/keyshield_record_demo_uncut_x11.mp4` | 2026-10-05T09:47Z | local | ffmpeg x11grab | 00:02:34.00 | same | lead-in dashboard flash |
| V-POSTER | `/opt/cursor/artifacts/keyshield_demo_poster.webp` | 2026-10-05T09:56Z | local | ffmpeg frame | still | fixture | — |
| T-CON | `/opt/cursor/artifacts/record_demo_console_clean.log` | 2026-10-05T09:49Z | local | `script` | scenes 1–D + 4/4 | fixture keys | ANSI stripped |
| H-DOC | `/opt/cursor/artifacts/docs-onchain-verification.txt` | 2026-10-05T09:24Z | prior pack | prior agent | historical | — | superseded pairing/labels |

Checksums: `/opt/cursor/artifacts/evidence/SHA256SUMS.txt` (generated with this pack).

## Four-stage matrix (this SHA)

| Stage | File | Exists | Command | Implementation | Assertions present | Missing | Result |
|---|---|---|---|---|---|---|---|
| 1 | `tests/bankrun_security.test.ts` + host `bankrun_invariants.rs` | yes | `npm run test:bankrun` | local stand-in + Rust oracle | 6115 inside window; clawback after; resurrection; double-claim rollback | TS stand-in skips **exact** `+2250` (oracle tests it); no live SVM ix apply | **pass** ~12s |
| 2 | `tests/fuzz_invariants.rs` | yes | cargo test | host proptest | conservation, cap, unauthorized/unverified/replay | not Trident/SBF | **pass** 0.02s |
| 3 | `tests/proxy_fault_injection.test.ts` | yes | `npm run test:fault` | Python proxy + Node mock | 502/504, drop, empty, garbage; `settled=0` `signed=0` | 31/33-byte artifacts covered in pytest, not this file | **pass** 4.88s |
| 4 | `scripts/live_e2e_run.ts` | yes | `live:e2e:dry` | dry path + Python HMAC/Ed25519 parity | crypto parity | live txs | **dry pass**; **live blocked** |

## Implementation claims

| Claim | Verdict |
|---|---|
| 502/truncated → no 32-byte artifact → no settle | **verified now** in Stage 3 + `assert_settlement_artifact` (size **and** non-zero + `assess_response`) |
| On-chain also rejects zero root / zero MAC / replay | **source + unit tests**; HMAC value itself is off-chain |
| `clawback_ready` exclusive (`now > last_active + 2250`) | **verified now** in `clawback.rs` tests and host oracle |
| &lt; 5000 CUs / transition | **design target**; historical program consumes 2126 / 2024 / 3076; local SVM CU **unmeasured** |
| drop-on-close / zeroize | drop-on-close is intended; `secrecy`/`zeroize` **not** `ks-proxy` deps; canary-not-in-log ≠ erasure |
| ixs 40–43 live | **false** — not on this allocation |

## Proposed runtime changes (not applied)

1. Align `packages/shared` APS seed `keyshield_mpp` with `agent_payment_stream`.
2. Align `demo-next` 64-slot timeout with 2250 or label it demo-only.
3. Resize/migrate stream accounts if HEAD 3384-byte layout is deployed.

## Approvals still required

- Stage 4 live transactions
- YouTube / public video publish
- Merge / deploy / program upgrade
