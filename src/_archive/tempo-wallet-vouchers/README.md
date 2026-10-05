# Archived: Tempo wallet session vouchers

**Not a product surface.** Do not compile this into `ks-proxy`. Do not
treat Tempo (chain `4217`, pathUSD, TIP-1034 vouchers) as the settlement
chain.

PR **#45** added `tempo.rs` to the proxy so a TIP-1034 v2 session voucher
could skip the HTTP 402 round trip. PR **#64** kept the **open MPP
stream** skip (`X-Mpp-Stream-Id`) and left Tempo out.

## Core (live)

Solana USDC Micro-Payment Protocol — Streaming / Escrow:

`CreateUniversalVault` → Session Grant (`GrantAgentAccess`) →
`OpenPaymentStream` / `OpenStream` (ix 24) → meter → `MppSettle` (ix 26).

Live 402 skip: an **open** MPP stream owned by the caller. Prepaid
Solana top-up and x402 stay the other two paying paths.

The proxy still forwards across environments (vault key / platform key /
`/vproxy`). That is cross-environment proxying, not Tempo settlement.

## Why this folder exists

Closing #45 would have dropped 582 lines of voucher verification. The
source is saved here so it is not lost. Wiring it back is an explicit
product change, not the default.

## Contents (from `pull/45`, commit `e88f44537`)

| File | What |
|---|---|
| `tempo.rs` | TIP-1034 v2 voucher check, `tempo_vouchers.db` high-water mark |
| `tempo_session_voucher_test.rs.txt` | Proxy integration test from that PR |
| `pr45-proxy-wiring.diff` | `handlers` / `lib` / `main` / tests vs current main. **MPP hunks in this diff already landed via #64.** Only Tempo hunks were unapplied. |
| `PAYMENT-FLOWS-path-d.md` | Historical Path D write-up (not live docs) |

`KS_TEMPO_PAYEE` / `KS_TEMPO_DB` are not read by the live binary.
