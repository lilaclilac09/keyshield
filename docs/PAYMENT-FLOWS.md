# How users pay for KeyShield calls

Three paying paths exist. The frontend's DocsSection mentions all three
but doesn't walk the actual byte-level flow. This doc does.

The decision tree from the user's perspective:

```
Does my agent already have a vault key for this upstream?
├─ Yes → call /proxy/<upstream>/... — your own key, outside every plan
└─ No  → KeyShield uses its platform key. How is that paid?
         ├─ I am on a monthly plan (the normal way) → the call draws down
         │    the calls included in Personal, Operate, or Floor
         ├─ I opened an MPP stream                    → the call is recorded
         │    on the stream and does not 402
         ├─ I hold a Tempo session voucher            → the call is checked
         │    locally and does not 402
         ├─ I prepaid a balance                       → balance debited
         └─ None of those, balance is empty           → 402, then pay, then retry
```

## Path A — Prepaid balance + on-chain Solana topup

**When:** you have an agent that runs many calls, you want simple billing.
**UX:** open dashboard → ActivitySection → "Top up with SOL" or "USDC".

### Flow

1. Frontend calls `GET /billing/sol-quote?amount_usd=10` → returns
   `{amount_lamports, sol_usd_price, valid_for_secs: 60, payment_address,
   memo}`. The `memo` is a server-issued one-time string that binds this
   topup to your specific session — anti-replay across users.

2. Frontend prompts your Phantom/Solana wallet to send `amount_lamports`
   lamports of SOL to `payment_address`, with a Memo Program instruction
   carrying the exact `memo` string.

3. Your wallet broadcasts the tx, gets a tx signature.

4. Frontend POSTs `/billing/topup-solana` with
   `{tx_signature, expected_amount_usd: 10, memo, finalized: false}`.

5. Server (Python `billing_solana.py`) does:
   - Helius RPC `getTransaction(tx_signature, commitment="confirmed")`
   - Verify there's a SOL transfer from your wallet (the session's user_id)
     to `PAYMENT_ADDRESS_SOLANA`
   - Verify the on-chain Memo matches the issued memo
   - Pyth oracle: fetch SOL/USD price; reject if observed USD value is
     > 5% off from `expected_amount_usd` (price slippage tolerance)
   - Atomic credit: insert `(tx_signature, user_id, $amount)` into
     `solana_topups` table. Idempotent on tx_signature — double-submit
     gets 409.
   - Consume the memo so it can't be reused.

6. Returns `{credited_atoms, credited_usd, balance_usd}`.

**Frontend impact:** ActivitySection's balance card updates. User now
has $10 prepaid; subsequent `/proxy/<upstream>/...` calls debit it.

### Same flow, USDC variant

`POST /billing/topup-solana-usdc` — no Pyth oracle needed since 1 USDC = $1.
Verifies SPL transfer to your token account. Same memo binding + idempotency.

## Path B — MPP (streaming payment, on-chain `PaymentStream`)

**When:** long-running agent, e.g. continuously trading bot, batch
processing 10K records. Per-call x402 round-trips waste 200ms each;
prepaid balance might be wrong-sized.

**Status:** The off-chain stream and the Rust hot path are in place.
Opening a stream is `POST /mpp/streams`. Each proxy call that sends
`X-Mpp-Stream-Id` for an **open** row owned by that user skips the
balance lookup and the 402. After a successful response, `ks-proxy`
records usage with `POST /mpp/streams/{id}/record`. A closed, foreign,
or missing stream still returns 402. Confirmed-open pairs stay in
memory for 5 seconds (`src/proxy/crates/ks-proxy/src/mpp.rs`).

On-chain settle remains the Python `mpp_settle` path in
`src/backend/mpp/`. The hot path does not wait for it.

### Flow

1. The account opens a stream with `POST /mpp/streams`.
2. The agent calls `/proxy/<upstream>/...` with `X-Mpp-Stream-Id`.
3. The Rust proxy reads `mpp.db` (`KS_MPP_DB`, default
   `src/backend/data/mpp.db`). An open row owned by the caller is
   forwarded on that same request.
4. Usage is recorded off-chain. Settlement runs on the stream interval.

**Why faster than x402:** x402 is a 402 → pay → retry round-trip on
every call (~200ms). MPP is a one-time stream-open + per-call usage
record (no extra HTTP). The 200ms savings × 10K calls = 33 minutes saved
on a long-running agent.

**Implementation gates:** Solana program `instructions/open_stream.rs` +
`instructions/settle_stream.rs`, Python `billing_streams.py`, frontend
`StreamingSection.tsx`.

## Path C — x402 (per-call micropayment, Coinbase format)

**When:** zero-setup, pay-as-you-go agent. "Just call the API and pay
inline." No prior balance, no stream, no UI required.

### Flow

1. Agent calls `POST /proxy/openai/v1/chat/completions` with bearer.
2. Server checks balance (`/_internal/balance/<user_id>` from Rust to
   Python). Balance ≤ 0 → return 402:

```
HTTP/1.1 402 Payment Required
X-Payment-Required: x402
Content-Type: application/json

{
  "x402Version": 1,
  "error": "X-PAYMENT-REQUIRED",
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "10000",         // $0.01 USDC (6 decimals)
    "resource": "<the-url-being-called>",
    "description": "KeyShield API proxy — openai",
    "mimeType": "application/json",
    "payTo": "0x<PAYMENT_ADDRESS>",
    "maxTimeoutSeconds": 300,
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // USDC Base
    "extra": {"name": "USDC", "version": "2"}
  }]
}
```

3. Agent (using a Coinbase-x402-aware client) sees 402, signs a USDC
   transfer to `payTo`, broadcasts on Base, and retries the original
   request with header `X-Payment-Proof: <tx_hash_or_signed_payload>`.

4. Server (Python `/billing/topup` with `payment_proof`) verifies the
   payment on-chain, credits balance, retries the proxy call, returns
   the upstream response.

**Status:** **HALF IMPLEMENTED.** The 402 response path works — server
emits the right body shape. The verification step at
`v2-mvp/src/server.py:1067` is `# TODO: verify body.payment_proof on-chain`
— currently any payment_proof string up to $10 credits without
on-chain check. Needs:
- Base RPC client (alchemy or Coinbase) to verify USDC transfer
- Same idempotency table as Solana topup (`evm_topups` keyed by tx hash)

This is one of the Stage 2 work items in `proxy-rs/ADR-002-architecture.md`.

## Which path

Different agent profiles want different tradeoffs:

| | Setup cost | Per-call latency | Balance sizing |
|---|---|---|---|
| **Monthly plan** | choose Personal, Operate, or Floor | none inside the allowance | the plan |
| **Prepaid + Solana** | top up via UI | none | manual |
| **MPP streaming** | open stream once | none after open | the stream |
| **Tempo session** | open a TIP-1034 channel once | none after the voucher | the voucher |
| **x402** | none | one extra round trip | per call |

People who run agents every day → a monthly plan. The price is the plan, not the call.
A trading bot running for hours → MPP or a Tempo session voucher.
A one-off caller with no plan and no balance → x402.

## Where each path lives in code

| Path | Frontend | Backend | On-chain |
|---|---|---|---|
| Prepaid SOL | `ActivitySection.tsx` topup card | `server.py:billing_topup_solana`, `billing_solana.py` | Solana SystemProgram transfer + Memo |
| Prepaid USDC | same | `server.py:billing_topup_solana_usdc` | SPL token transfer + Memo |
| Monthly plan | `PlanSection.tsx` | `GET /billing/plans`, `GET /billing/breakdown`, `POST /billing/subscription` | — |
| MPP streaming | Activity → MPP | `routes/mpp.py` + `ks-proxy` `X-Mpp-Stream-Id` | `programs/keyshield` PaymentStream |
| Tempo session | wallet sends `Payment-Authorization` | `ks-proxy` `src/tempo.rs` | TIP-1034 channel reserve |
| x402 | agent SDK (not browser) | `ks-proxy` 402 body when no plan channel applies | Base USDC transfer |

## Path D — Tempo wallet session (TIP-1034 v2)

**When:** a Tempo wallet already holds an open channel and can sign a cumulative voucher. Same latency goal as MPP: no 402 retry.

**Specs:** `draft-httpauth-payment-01` and `draft-tempo-session-00` (`sessionProtocol: "v2"`). The older v1 contract channel is not accepted.

1. The proxy's 402, when `KS_TEMPO_PAYEE` is set, includes `WWW-Authenticate: Payment` with `method="tempo"`, `intent="session"`, and `header="Payment-Authorization"`. The KeyShield bearer stays in `Authorization`.
2. The wallet sends `Payment-Authorization: Payment <base64url credential>`.
3. `ks-proxy` checks the echoed header, payee, escrow, currency, chain, channel id, low-s signature, and a cumulative amount that does not go backwards.
4. The accepted amount is written to `tempo_vouchers.db` before the upstream call. A restart cannot treat an old voucher as a new payment.
5. The response carries `x-ks-pay: tempo`.

Defaults when the matching env var is unset: escrow `0x4D50500000000000000000000000000000000000`, currency pathUSD `0x20c0000000000000000000000000000000000000`, chain `4217`. `KS_TEMPO_PAYEE` is required. `KS_TEMPO_DB` overrides the voucher book.

## Path E — Monthly plans

**When:** this is the normal way a person pays. The decision is which plan fits the work. Calls inside the plan are included, so the product does not put a price on each call.

| Plan | Monthly | Platform calls included | Agents |
|---|---|---|---|
| Personal | $29 | 40,000 | 1 |
| Operate | $89 | 200,000 | 8 |
| Floor | $240 | 1,000,000 | no cap |

Operate is the plan most teams use. Calls made with a vault key (`self_custodian`) sit outside every plan. Full rules and the breakdown response: [SUBSCRIPTION.md](SUBSCRIPTION.md).

```
GET  /billing/plans
GET  /billing/subscription
POST /billing/subscription          { "plan": "operate" }
GET  /billing/breakdown
```

The dashboard is the Plan section (`src/web/components/sections/PlanSection.tsx`). It shows the allowance and each upstream's share of this month's platform calls. The monthly price is the settlement.
