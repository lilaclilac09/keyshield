# Reviewer quickstart

Companion to [keyshield.md](../keyshield.md). No merge, no deploy, no
new Devnet transactions unless the owner approves §Stage 4 live.

## Identity

| Field | Value |
|---|---|
| Repo | `lilaclilac09/keyshield` (KeyShield, not aileen_machina_01) |
| Evidence SHA | `f088ab8261a858497a2df2289312698b7a2edc89` |
| Evidence branch | `cursor/evidence-handoff-b48a` |

## Watch the takes (outside Git)

| Cut | Path | Duration | Label |
|---|---|---|---|
| A overview | `/opt/cursor/artifacts/keyshield_demo_overview_cut.mp4` | 00:01:15 | MOCK harness highlights |
| B technical | `/opt/cursor/artifacts/keyshield_demo_technical_walkthrough.mp4` | 00:03:47 | MOCK harness + **failed** Explorer.com challenge (not Solscan) |
| C uncut | `/opt/cursor/artifacts/keyshield_record_demo_uncut_x11.mp4` | 00:02:34 | MOCK full take |

There is **no** published YouTube URL.

## Re-run the four stages

```bash
npm run test:bankrun          # Stage 1 (host oracle + TS stand-in)
cargo test -p keyshield --test fuzz_invariants -- --test-threads=1
npm run test:fault            # Stage 3 — no chain env
npm run live:e2e:dry          # Stage 4 path check only
```

Optional: `npm run demo:record:fast` or
`bash scripts/record_demo.sh --split --pace 28000`.

## Stage 4 live — blocked until you say yes

A new live run would:

| Item | Value |
|---|---|
| Network | Solana **Devnet** only |
| Owner pubkey | `DDNp8HJjtdmCkv416Ud2VM3DQSUSjpQK5p9WLsvMuYMU` |
| Settler pubkey | `8hMEe1hNLnWf2ed9gnJvVbT3ta7xsS8R9LBjTonV2xuo` |
| Operations | vault/grant if needed, `OpenStream` (24), proxy meter, `MppSettle` (26), withdraw/close |
| Max transactions | 8 |
| Deposit / fee budget | 5_000_000 micro-USDC + Devnet fees |
| Accounts | vault `9MYS…`, a new stream PDA, USDC ATAs |

Reply explicitly to approve. Historical `2CnCiiji…` is **not** a substitute
for a newly completed e2e.

## On-chain read-only

```bash
KS_EVIDENCE_OUT=/tmp/onchain.json node scripts/evidence_onchain_verify.mjs
```

Use `?cluster=devnet` on every Explorer / Solscan link. If
`getTransaction` returns null, mark **inconclusive**.
