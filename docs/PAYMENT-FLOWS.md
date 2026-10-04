# How users pay for KeyShield calls

Three paying paths exist. The frontend's DocsSection mentions all three
but doesn't walk the actual byte-level flow. This doc does.

The decision tree from the user's perspective:

```
Does my agent already have a vault key for this upstream?
├─ Yes → call /proxy/<upstream>/... — zero cost to me, my own key is used
└─ No  → KeyShield uses its platform key and bills me. How?
         ├─ I prepaid (most common)        → balance debited per call
         ├─ I want to stream a long task   → MPP (open a metered channel)
         └─ I want zero setup, pay-as-I-go → x402 (per-call micropayment)
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

**Status:** **IMPLEMENTED**, with a fulfillment gate. The Solana program
(`state.rs`, `instructions/mpp_settle.rs`) tracks the stream PDA, the
USDC escrow ATA, and the hard `max_total_micro_usdc` budget. Python
metering lives in `src/backend/mpp/mpp_streams.py` and
`src/backend/mpp/fulfillment.py`. Settlement submits ix #26 only when
the batch has a non-zero artifact root. On-chain, a missing or
all-zero root returns `UnverifiedFulfillment` (6108) and does not
transfer USDC.

### Flow

1. Agent opens a stream with `POST /mpp/streams`
   `{upstream, rate_per_token_micro_usdc, rate_per_call_micro_usdc,
   settlement_interval_secs, max_total_micro_usdc}` and the wallet signs
   `open_payment_stream`. `max_total_micro_usdc` is the hard cap. A
   debit that would pass it raises `BudgetExceeded` and rolls back.
2. The stream row stores the provider scope (`upstream`), the PDA, and
   the USDC escrow ATA.
3. Each proxied call that sends `X-Mpp-Stream-Id` is metered from the
   response the proxy actually received. `fulfillment.py` rebuilds the
   preimage (`stream`, provider, HTTP status, `sha256(body)`, units)
   and accepts it only when the body is a 2xx payload with real
   content. Empty bodies, error statuses, error JSON, and garbage are
   not billed. The response header `x-ks-mpp-meter` is `recorded` or
   `rejected:<reason>`. `POST /mpp/streams/{id}/record` requires the
   same `status_code` + `body` and caps claimed tokens at `usage` in
   that body. The same artifact hash cannot be metered twice.
4. Every `settlement_interval_secs`, the server folds the unsettled
   artifact hashes into one root and submits `mpp_settle`. The
   instruction debits `units × cost_per_unit` only when that root is
   present and has not been replayed. Pending balance with no artifact
   is dropped, not paid. One artifact can also settle on its own via
   `settle_receipt`: the debit takes `BEGIN IMMEDIATE`, checks the
   hard cap in the same write, and rolls back on overflow. Reusing a
   consumed artifact hash raises `NonceReused` and does not debit again.
5. Either party can close the stream (`POST /mpp/streams/{id}/close`);
   final settlement runs immediately, still only for verified artifacts.
   After `status=closed`, record, settle, and receipt raise
   `StreamAlreadyClosed` and leave balances unchanged.

**Why faster than x402:** x402 is a 402 → pay → retry round-trip on
every call (~200ms). MPP is a one-time stream-open + per-call usage
record (no extra HTTP). The 200ms savings × 10K calls = 33 minutes saved
on a long-running agent.

**Code:** `instructions/open_stream.rs` + `instructions/mpp_settle.rs`,
Python `src/backend/mpp/`, proxy header `X-Mpp-Stream-Id`.

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

## Why three paths

Different agent profiles want different tradeoffs:

| | Setup cost | Per-call latency | Balance sizing |
|---|---|---|---|
| **Prepaid + Solana** | top up via UI | none | manual |
| **MPP streaming** | open stream once | none after open | on-chain rate cap |
| **x402** | none | ~200ms (402 round-trip) | per-call USDC |

A demo / hackathon agent → x402 (zero setup).
A trading bot running 8 hours → MPP (no per-call latency tax).
A person buying their AI coworker $50 of credit → Prepaid + Solana.

## Where each path lives in code

| Path | Frontend | Backend | On-chain |
|---|---|---|---|
| Prepaid SOL | `ActivitySection.tsx` topup card | `server.py:billing_topup_solana`, `billing_solana.py` | Solana SystemProgram transfer + Memo |
| Prepaid USDC | same | `server.py:billing_topup_solana_usdc` | SPL token transfer + Memo |
| MPP streaming | Activity / stream open tx | `routes/mpp.py`, `mpp/mpp_streams.py`, `mpp/fulfillment.py`; proxy meters `X-Mpp-Stream-Id` | `programs/keyshield` `mpp_settle` requires artifact root |
| x402 | agent SDK (not browser) | `server.py:_x402_body` (response shape OK) + `billing_topup` (verify TODO) | Base USDC transfer |
