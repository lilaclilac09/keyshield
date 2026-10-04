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

**Status:** **IMPLEMENTED** as hold → verify → capture. Phase 1 locks
the estimated cost in the ledger. Phase 2 hashes the upstream body.
Phase 3 submits `mpp_settle` only with the consumer session MAC over
that hash. A failed check or an expired hold returns the lock to the
available balance. The Solana program (`state.rs`,
`instructions/mpp_settle.rs`) holds the stream PDA, the USDC escrow
ATA, and the hard cap `max_total_micro_usdc`. Python metering lives in
`src/backend/mpp/fulfillment.py`, `src/backend/mpp/capture.py`, and
`src/backend/mpp/mpp_streams.py`.

An empty payload or a failed upstream does **not** debit escrow. The
proxy returns that body to the caller and releases the estimate.

### Open

`POST /mpp/streams` takes `{upstream, rate_per_token_micro_usdc,
rate_per_call_micro_usdc, settlement_interval_secs,
max_total_micro_usdc}`. The wallet signs `open_payment_stream`. The
row stores the provider scope (`upstream`), the PDA, and the USDC
escrow ATA. `max_total_micro_usdc` is the hard cap. Available escrow
is `cap - settled_micro_usdc - held_micro_usdc`. On-chain USDC stays
in the stream ATA until capture. The hold is the ledger column, not a
new account field: `AgentPaymentStream` size is unchanged.

### Phase 1 — hold the estimate

Before the proxy calls upstream, and only when the request carries
`X-Mpp-Stream-Id`, `hold_estimate` locks the cost in
`held_micro_usdc`. The amount is `X-Mpp-Estimate-Micro-Usdc`, or
`rate_per_call` when that header is absent, or `rate_per_token` when
the per-call rate is 0. Pending and settled do not move.

`settled + held + estimate > max_total_micro_usdc` raises
`BudgetExceeded`. The proxy returns 409 and does not call upstream.
`POST /mpp/streams/{id}/hold` is the same lock.

The hold row stores `expires_at = now + KS_MPP_HOLD_TTL_SECS` (default
120). A hold that is still `held` at that time is released the next
time hold, record, capture, settle, or list runs.

### Phase 2 — deliver and hash

The proxy forwards the call. When the body is in hand,
`fulfillment.verify_fulfillment` rebuilds the preimage
(`stream_id`, provider, HTTP status, `sha256(body)`, calls, tokens)
and the artifact hash `sha256(preimage)`. It accepts the body only
when all of the following hold:

- HTTP status is 2xx
- the body is non-empty and not whitespace
- the JSON is not an error envelope and not garbage text
- claimed tokens do not exceed `usage` in the body
- the stream `upstream` matches the provider that was called

Empty, 5xx, error JSON, and garbage raise `FulfillmentRejected` and
release the estimate. Pending stays unchanged. The proxy still returns
the upstream body. `x-ks-mpp-meter` is `rejected:<reason>`.

A body that verifies binds the hold to the actual price. `held`
shrinks or grows by `actual - estimate` under the same cap predicate,
and `pending` increases by the actual price. The artifact hash is
stored on the hold. `x-ks-mpp-meter` is `held`. `x-ks-mpp-hold` is the
hold id. Nothing is captured: `just_settled_micro_usdc` stays 0, and
`settle_on_chain` is not called. Interval settlement does not debit.

`POST /mpp/streams/{id}/record` uses the same check. The same artifact
hash cannot be inserted twice (`artifact already metered`).

### Phase 3 — capture with the session MAC

`POST /mpp/streams/{id}/capture` (and `settle_receipt`) debits one
artifact only after `HMAC-SHA256(session_token_utf8, artifact_hash)`
matches the signature. The session token is the bearer the consumer
already holds. The ledger checks it with `compare_digest` before the
instruction is built.

- Unknown hash → `FulfillmentRejected` (`unverified artifact`), before
  the signature is read. Pending with no artifact is dropped by
  `POST /mpp/streams/{id}/settle` and is not paid.
- Closed stream → `StreamAlreadyClosed`, before the signature is read.
- Already settled → `NonceReused`. The capture is not released.
- Expired hold → the lock returns to available balance, then
  `HoldExpired`.
- Missing or wrong signature → pending and held both decrease, settled
  stays put, then `CaptureRejected`. A later valid signature can lock
  the same artifact again when the cap still allows it.
- Valid signature → pending and held decrease, settled increases, the
  hold is `captured`, and `settle_on_chain` runs.

The signed payload is 81 bytes: discriminator `26`, `units` (u64), the
32-byte root (`sha256` of the artifact hash), `settlement_seq` (u64,
`last_settled_seq + 1`), and the 32-byte MAC. Sequence 0 is refused
before the transaction is built. A missing or all-zero root or MAC is
refused before the transaction is built.

On-chain `process_mpp_settle`, after settler authentication and before
`TransferChecked`:

- missing root, missing signature, all-zero root, all-zero signature,
  or a payload shorter than 80 bytes after the discriminator →
  `UnverifiedFulfillment` (6108). `parse_settlement` still accepts a
  48-byte root and sequence so the missing MAC fails in
  `parse_capture_signature` with the same code.
- `settlement_seq != last_settled_seq + 1` → `SettlementReplay` (6111)
- root equal to the last full root, or to one of the three previous
  fingerprints in `_reserved[40..64]` → `NonceReused` (6101)
- `cost_per_unit * units` uses `checked_mul`. `remaining = max - spent`
  uses `checked_sub`. Overflow is `ArithmeticOverflow` (6113).
  `amount > remaining` is `BudgetExceeded` (6100). `spent + amount`
  uses `checked_add`.
- the SPL transfer is the escrow debit

The program does not recompute the HMAC. The session secret is not on
the chain. A non-zero signature only proves the settler attached 32
bytes. The honest proxy attaches the MAC the ledger already verified.
A failed instruction reverts the `spent_total` write with the
transaction. A closed stream (`is_active == 0`) returns
`PaymentStreamInactive` (6052) with no balance write. Python
`record` / `settle` / `settle_receipt` on `status=closed` raise
`StreamAlreadyClosed` the same way.

`POST /mpp/streams/{id}/close` releases every open hold back to
available balance and does not capture, then marks the stream closed.

The chain does not see the HTTP body. It checks that a non-zero
commitment and a non-zero capture signature were presented, that
`settlement_seq` is the next monotonic value, and that the root is not
the last full root or one of the three fingerprints kept beside it.
`last_settled_seq` lives in `_reserved[32..40]`. A root older than that
four-deep window can be submitted again; the unique artifact hash stops
the honest settler from signing that retry.

### Account binding

`open_stream`, `pay_x402`, `mpp_settle`, and `withdraw` call
`guards::assert_canonical_usdc_mint`. The mint account must be owned
by the SPL Token program, initialized, decimals 6, and equal to
mainnet `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` or devnet
`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. A counterfeit mint
with the same decimals returns `InvalidMint` (6109). The escrow token
account's own mint and owner fields must be that mint and the stream
PDA.

PDA seeds stay `["agent_payment_stream", agent, owner, bump]`.
`assert_stream_pda` checks `create_program_address` with the canonical
bump. A different seed list, including
`["stream", user, provider, stream_id]`, does not match accounts this
program already derives and returns `InvalidPda` (6112).

Withdraw writes `CLOSED_ACCOUNT_DISCRIMINATOR` (`ksc1osed`), zeroes
every byte after it, then returns the lamports. Open refuses any
program-owned account: an active discriminator is
`PaymentStreamActive` (6051), anything else including the tombstone is
`AccountClosed` (6110). The legacy vault stream close uses
`close_stream_counter`, so a second close does not decrement the
counter again.

### Clock leeway

Session expiry and `pay_x402` deadlines use `Clock::get().unix_timestamp`
plus `CLOCK_LEEWAY_SECS` (30). `unix_expired` / `session_expired` use
`checked_add`. Overflow fails closed. `mpp_settle` does not reject a
settlement because the advisory `settlement_interval_secs` has passed;
cluster slot drift cannot lock already-earned escrow.

### Partial streams and idempotency

`/proxy` and `/vproxy` stream the upstream body when `Accept` contains
`text/event-stream` or the JSON body sets `stream: true`. Chunks are
appended until the socket ends. A drop after bytes arrived sets
`x-ks-stream-complete: 0` and meters `min(usage, chars // 4)` for that
prefix. A drop before the first byte is HTTP 502 and is not metered.
A finished SSE body bills the `usage` object on its `data:` lines.

`X-Idempotency-Key` is stored in `mpp_request_keys` in the same
commit as the usage row. The same key with no additional tokens
returns `x-ks-mpp-meter: idempotent_replay`, releases the new estimate
hold, and does not increment counters. A longer observation bills only
the token delta and does not charge a second call. Capture advances
`last_settled_seq` when the DB is the ledger (no chain settler
configured) or when the chain accepts the sequence. A capture does not
advance the sequence while a chain settler is configured and the
submission did not land, so the next on-chain debit still sends
`last_settled_seq + 1`.

### Hard cap (`AgentPaymentStream.max_total_micro_usdc`)

`spent_total_micro_usdc` only increases, via `checked_add`, and only
at capture. There is no subtract on that field, so the cap check is
not an underflow. `checked_mul`, `checked_sub`, and `checked_add`
fail closed as `ArithmeticOverflow` (6113). `amount > remaining` is
`BudgetExceeded` (6100). Off-chain, available escrow is
`cap - settled - held`, so a second estimate that does not fit is
rejected before the upstream call. The stream PDA is writable, so the
runtime serializes two `mpp_settle` transactions on the same account;
the second reads the updated `spent_total`. The same immediate replay
of one root is rejected. A distinct new root is a new debit, bounded
by the cap.

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
| MPP streaming | Activity / stream open tx | `routes/mpp.py`, `mpp/mpp_streams.py`, `mpp/fulfillment.py`, `mpp/capture.py`; proxy holds on `X-Mpp-Stream-Id` | `programs/keyshield` `mpp_settle` requires artifact root and capture signature |
| x402 | agent SDK (not browser) | `server.py:_x402_body` (response shape OK) + `billing_topup` (verify TODO) | Base USDC transfer |
