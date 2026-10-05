# KeyShield — project résumé (evidence-backed)

Attribution of personal contributions: **owner confirmation required**.

## One line

Non-custodial session-key sandbox: agents hold a `ksv2_…` token; Solana
Devnet MPP escrow captures only after a fulfillment artifact verifies.

## Product summary

KeyShield stores provider-key **ciphertext** (WebAuthn-PRF / wallet →
HKDF → AES-256-GCM on the client). A Cloudflare worker syncs ciphertext.
A Python control plane and a Rust `ks-proxy` inject
`X-Upstream-API-Key` per request and do not persist it. Spend is
intended to settle on a pinocchio program on Solana Devnet after
`verify_fulfillment` produces a non-zero 32-byte artifact.

## Architecture (from source)

- `src/web/` — vault UI
- `src/backend/` — sessions, MPP ledger, `mpp/fulfillment.py`
- `src/proxy/` — `ks-proxy` (no direct `secrecy` / `zeroize` dependency)
- `src/programs/keyshield/` — pinocchio program (`aps_offset`, ix 24/26/27/28)
- `src/infra/sync-worker/` — ciphertext sync
- `scripts/record_demo.sh` — local mock demo harness

`packages/shared/src/lib/solana.ts` uses APS seed `keyshield_mpp`.
The program and `src/web/lib/solana.ts` use `agent_payment_stream`.
That mismatch is **reported, not silently fixed**.

## Implemented vs deployed

| Capability | Status |
|---|---|
| Client-side AES-GCM vault + session token | Implemented locally; live PRF not demonstrated in the MOCK take |
| Proxy inject-once + Stage 3 fault refuse | Implemented; **verified now** (4/4 + 28 fulfillment units) |
| OpenStream / Withdraw on Devnet | **Historical**, `meta.err = null` |
| MppSettle on Devnet | **Historical** tx `2CnCiiji…` (2024 CUs); not in the originally supplied pair |
| ForceClawback on Devnet | Source + host oracle; **no new live clawback** in this pack |
| zk-vault ixs 40–43 | Source only — **not live** on this ProgramData |
| `secrecy` + `zeroize` | Intended hardening; **not** a `ks-proxy` direct dependency |

## Verification highlights

- Program `41P2wHK…` executable, loader `BPFLoaderUpgradeab1e…`, ProgramData `48Ji7Wm…`, authority `74Xuc5BC5uttSiHj598sJJj3rgEUsfYF7xVs69tWLwDY` (full, not prefix).
- Stages 1–3 + Stage 4 **dry-run** passed at SHA `f088ab826`.
- Artifact gate: size **and** non-zero + semantic `assess_response` (502/empty/garbage rejected).
- `clawback_ready`: closed at `last_active + 2250`, open at `+ 2251` (exclusive).
- MOCK record-demo: TTFT overhead 1.2 ms, RTT 4 ms (local mock; **not** production).

## Known boundaries

- Deployed stream accounts are 3368 bytes; HEAD struct is 3384.
- On-chain HMAC is presence/non-zero + Ed25519 binding; HMAC bytes are checked **off-chain**.
- Stage 4 **live** is blocked pending owner approval.
- `demo-next` uses a 64-slot dispute timeout constant; the program default is 2250.

## Reproducible references

[REVIEWER_QUICKSTART.md](REVIEWER_QUICKSTART.md) ·
[EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) ·
`npm run test:harness` ·
`npm run demo:record:fast`

## Résumé bullet options (owner confirmation required)

1. Built a pinocchio MPP program on Solana Devnet with OpenStream / MppSettle / withdraw, verified by compiled discriminators rather than Explorer captions.
2. Gated proxy settlement on SHA-256 fulfillment artifacts so 502 / empty / garbage bodies cannot `mpp_settle` (Stage 3 + fulfillment unit tests).
3. Shipped a reproducible mock record-demo (zero-clipboard token, <80 ms local overhead claim, simulated clawback) plus a reviewer evidence pack.

Do not invent user counts, revenue, adoption, audits, or production latency wins.
