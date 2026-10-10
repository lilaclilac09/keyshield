---
name: keyshield-pay
description: Preview a KeyShield 402 (details) then pay under --max-amount, or open an MPP stream tab. Use when an agent needs to buy an API call, inspect a Coinbase 402 body, or settle Devnet USDC. Do not treat cost_usd > 0 as paid.
---

# KeyShield pay / details

Agents pay for a **proxy call**, not a Jupiter swap. Two rails:

| Rail | When | Honest receipt |
|---|---|---|
| **MPP tab** | Open once, meter many calls | `settle_mode` = `stub` / `held` / `captured` / `submitted` / `failed` |
| **x402** | One-shot HTTP 402 | Same modes. Preview first. |

`cost_usd > 0` is **not** paid. Only `submitted` is on-chain. `stub` is a local ledger.

Do not read all of `docs/AGENT-PAY.md` unless the capture path fails closed.

## Commands (awal-shaped)

```bash
# details — print the 402 body, do not debit
bash src/scripts/pay.sh --details --max-amount 1000

# pay — same envelope, refuse if amount > cap
bash src/scripts/pay.sh --max-amount 1000

# 1 micro-USDC live capture (needs funded owner + settler + open PDA)
KS_BUY_MICRO_USDC=1 bash src/scripts/pay.sh --max-amount 1000
```

HTTP:

```bash
# wallet login — POST /auth/login is 403
GET  $KS_BASE/auth/wallet-challenge
POST $KS_BASE/auth/wallet-login   # ed25519 over UTF-8(challenge)

# details
GET  $KS_BASE/billing/402-preview?amount=1&max_amount=1000

# pay after the human/agent reviewed accepts[0]
POST $KS_BASE/billing/402-pay
     {"amount_micro_usdc":1,"max_amount_micro_usdc":1000}

# MPP tab (wallet signs ix 24, or local owner autosign)
POST $KS_BASE/mpp/streams
POST $KS_BASE/mpp/streams/$ID/build-open-tx   # wallet popup
POST $KS_BASE/mpp/streams/$ID/record-tx
# or
POST $KS_BASE/mpp/autosign/open

POST $KS_BASE/mpp/streams/$ID/record          # fulfillment body required
POST $KS_BASE/mpp/streams/$ID/capture         # HMAC-SHA256(token, artifact_hash)
```

Capture MAC:

```
mac = HMAC-SHA256(session_token_utf8, bytes.fromhex(artifact_hash))
```

UI: `/demo` is the 3-step wizard (connect → open tab → 402 details/Pay). Activity has the same CTAs. Top bar shows SOL, Devnet USDC, stream remaining, last receipt (`hash[:8]` + mode).

## Caps and refusals

- `--max-amount` is integer **micro-USDC**. `1e20`, `Infinity`, `0x10` are invalid.
- Amount over cap → HTTP 400 `over_cap`. Do not retry with a higher cap unless the user said so.
- Duplicate x402 `payment_proof` → 409. That is a real replay, not a fake receipt.
- Capture without a wallet-signed stream PDA fails closed when the settler is loaded.

## Wallets (Devnet)

| Role | Pubkey | What it signs |
|---|---|---|
| Owner | dashboard / `.keyshield-devnet/user-devnet.json` | vault, grant, ix 24 open |
| Settler | `Fx3db1bLEgMqEPQmroXj4VBA1mhCpNtJEKTmbbhiSyHR` | ix 26 `mpp_settle` |
| USDC | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | Circle Devnet mint |

Public `requestAirdrop` is often 429. Use CLI / PoW faucet for SOL, `faucet.circle.com` for 1 USDC.

## Do not

- Infer a green Paid badge from `cost_usd`.
- Treat `/auth/login` passphrase as working (403).
- Call capture before `build-open-tx` / autosign has a PDA.
- Dump raw provider keys into the agent env.
