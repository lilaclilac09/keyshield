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
and the artifact hash `sha256(preimage)`. `assert_settlement_artifact`
then checks that hash (and the body SHA-256) is exactly 32 non-zero
bytes. The proxy metering handler (`_mpp_meter_header`) repeats that
length check before it returns `x-ks-mpp-meter: held`. Capture will
not sign `mpp_settle` without that 32-byte digest. It accepts the
body only when all of the following hold:

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

A live submit also needs the stream owner's Ed25519 over
`sha256(stream_pubkey || seq_le || debit_le || request_hash)`.
`POST /mpp/streams/{id}/capture` accepts `ownerPubkey` and
`ownerSignature`. `settle_on_chain` prepends that precompile as
instruction 0. A missing or unparsable binding returns `mode=failed`
and does not send a transaction that the program would reject as
`InvalidSettlementSignature` (6114). Stub-fallback (no settler env)
still skips the prefix.

The signed payload is 113 bytes: discriminator `26`, `units` (u64), the
32-byte root (`sha256` of the request hash), `settlement_seq` (u64),
the 32-byte MAC, and the 32-byte `request_hash`. The honest settler
sends `last_settled_seq + 1`. Sequence 0 is refused before the
transaction is built. A missing or all-zero root, MAC, or request
hash is refused before the transaction is built. Every successful
receipt includes `sequence_number` and `request_hash`.

On-chain `process_mpp_settle`, after settler authentication and before
`TransferChecked`:

- missing root, missing signature, missing request hash, all-zero
  root, all-zero signature, all-zero request hash, or a payload
  shorter than 112 bytes after the discriminator →
  `UnverifiedFulfillment` (6108). `parse_settlement` still accepts a
  48-byte root and sequence so the missing MAC fails in
  `parse_capture_signature`. A body that has a MAC and stops before
  the request hash fails in `parse_request_hash` with the same code.
- `settlement_seq <= last_settled_seq` → `SettlementReplay` (6111),
  before `spent_total` is written. A strictly greater sequence,
  including a gap, is accepted.
- request hash equal to the last full hash, or to one of the three
  previous fingerprints in `_reserved[40..64]` → `NonceReused` (6101)
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
commitment, a non-zero capture signature, and a non-zero request
hash were presented, that `settlement_seq` is strictly greater than
`last_settled_seq`, and that the request hash is not the last full
hash or one of the three fingerprints kept beside it.
`last_settled_seq` lives in `_reserved[32..40]`. The last request hash
lives in `_reserved[0..32]`. A request hash older than that four-deep
window can be submitted again; the unique artifact hash stops the
honest settler from signing that retry.

### Account binding

`open_stream`, `pay_x402`, `mpp_settle`, and `withdraw` call
`guards::assert_canonical_usdc_mint`. The mint account must be owned
by the SPL Token program, initialized, decimals 6, and equal to
mainnet `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` or devnet
`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. A counterfeit mint
with the same decimals returns `InvalidMint` (6109). The escrow
constraint is `escrow_vault.mint == usdc_mint.key()`: the token
account must be owned by the SPL Token program, its mint field must
equal that USDC mint, and its authority field must be the stream PDA.
The transfer destination's mint field must equal the same USDC mint.

PDA seeds stay `["agent_payment_stream", agent, owner, bump]`.
`assert_stream_pda` checks `create_program_address` with the canonical
bump. A different seed list, including
`["stream", user, provider, stream_id]`, does not match accounts this
program already derives and returns `InvalidPda` (6112).

Withdraw writes `CLOSED_ACCOUNT_DISCRIMINATOR` (`ksc1osed`), zeroes
every byte after it, then returns the lamports with `checked_add`.
Overflow of that lamport move is `ArithmeticOverflow` (6113). Open
refuses any program-owned account: an active discriminator is
`PaymentStreamActive` (6051), anything else including the tombstone is
`AccountClosed` (6110). A short buffer cannot skip the tombstone.
Closing an in-vault payment stream writes the same tombstone over the
slot, keeps the service hash beside it, and zeroes the rate, agent,
`is_active`, and pending amount. A second close of that slot returns
`AccountClosed` (6110) and does not decrement the counter again.
`pay_x402` and `mpp_settle` debit with `debit_within_budget`
(`checked_sub` / `checked_add`). `pay_for_service` authorizes
`cumulative + amount` with `checked_add`: overflow is
`ArithmeticOverflow` (6113), and a sum above the grant cap is
`MaxSpendExceeded` (6035).

### Clock leeway

Session expiry and `pay_x402` deadlines use `Clock::get().unix_timestamp`
plus `CLOCK_LEEWAY_SECS` (30). `unix_expired` / `session_expired` use
`checked_add`. Overflow fails closed. `mpp_settle` does not reject a
settlement because the advisory `settlement_interval_secs` has passed;
cluster slot drift cannot lock already-earned escrow.

### Velocity, Ed25519 binding, clawback, revocation

`/proxy` and `/vproxy` admit a session before the MPP hold and before
the upstream call. The in-memory limiter caps requests per second,
tokens per second, and micro-USDC per minute
(`KS_VELOCITY_MAX_REQUESTS_PER_SEC` 25,
`KS_VELOCITY_MAX_TOKENS_PER_SEC` 8000,
`KS_VELOCITY_MAX_MICRO_USDC_PER_MIN` 1000000). A rejected admit is not
counted. HTTP 429 uses `velocity_limited`. Three consecutive upstream
HTTP 5xx responses or empty bodies set the session to `Suspended`
(HTTP 423, `session_suspended`). A non-empty status below 500 resets
that streak. HTTP 402 and a missing upstream route do not. A process
restart clears the counters.

`mpp_settle` reads the instructions sysvar (account 7) after the
112-byte body parses. Instruction 0 must be the Ed25519 precompile.
Its message is `sha256(stream_pubkey || seq_le || debit_le || artifact)`.
The public key is the stream owner. The program does not verify the
signature bytes again. A missing sysvar or a mismatch is
`InvalidSettlementSignature` (6114), before `spent_total` is written.
`settlement_binding_hash` builds that preimage. The 113-byte payload
is unchanged. An optional `u32` session index after those 112 bytes,
together with the owner's revocation bitmap (account 8), returns
`SessionRevoked` (6116) when that bit is set.

`AgentPaymentStream` stays `#[repr(C)]` with fixed arrays. Handlers
read `aps_offset` and do not unpack `String` or `Vec`. `StreamState`
is that account. `last_active_slot` and `dispute_timeout_slots` are
appended at offsets 3368 and 3376. The account is 3384 bytes. Offsets
0..3367 are unchanged. Open writes the current slot and a timeout of
2250. `pay_x402` and `mpp_settle` refresh `last_active_slot`.

`force_clawback` (discriminator 28) is owner-signed. It requires
`Clock.slot > last_active_slot + dispute_timeout_slots`. A stored
timeout of 0 means 2250. Equality stays inside the window
(`DisputeWindowActive`, 6115). Overflow is `ArithmeticOverflow`
(6113). The owner check returns `NotOwner` (6103) first. The
instruction transfers the SPL token balance at offset 64, closes the
ATA, tombstones the stream, and returns the stream lamports with
`checked_add`.

`SetRevocationBit` (discriminator 29) maintains one bitmap PDA per
owner, seeds `["revocation_bitmap", owner, bump]`, 16384 bytes /
131072 bits. An out-of-range index fails closed. The payment-stream
PDA seeds are unchanged.

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
hold, and does not increment counters. The session token is not an
idempotency key. The fulfillment hash is: `mpp_artifacts` is unique
on `(stream_id, artifact_hash)`, so a retry of the same body without
the header is also `idempotent_replay` and does not increment
pending. A longer observation bills only the token delta and does not
charge a second call. Capture advances
`last_settled_seq` when the DB is the ledger (no chain settler
configured) or when the chain accepts the sequence. The receipt's
`sequence_number` is that new value, and `request_hash` is the
artifact hash. The SQL update stores the new sequence only while
`last_settled_seq` still equals the value that was read. A capture
does not advance the sequence while a chain settler is configured and
the submission did not land, so the next on-chain debit still sends
`last_settled_seq + 1`. On-chain, any `seq <= last_settled_seq` aborts
before the debit.

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

**Status:** **IMPLEMENTED** in `src/backend/proxy/x402_verify.py` (the
old `v2-mvp/src/server.py:1067` stub is gone). `verify_on_chain`
decodes the Base USDC `Transfer` log and `x402_claims` makes
`payment_proof` unique. Without `KS_X402_BASE_RPC_URL` +
`KS_X402_RECEIVER_ADDRESS` the verifier returns `stub-fallback`; set
`KS_X402_VERIFY_REQUIRED=1` to refuse that path in production.

MPP settlement is a different gate: the Python proxy meters only after
`fulfillment.verify_fulfillment` + `assert_settlement_artifact` (32-byte
non-zero hash). `settle_on_chain` repeats that check before it builds
the 113-byte `mpp_settle` payload. Empty / short / all-zero artifacts
cannot be signed.

On-chain `mpp_settle` is pinocchio, not Anchor. The equivalent of
Anchor mint/close constraints is `guards::assert_canonical_usdc_mint`
plus `guards::seal_closed_account` (`ksc1osed` + zero the body) on
withdraw and clawback. A settle against a tombstone is `AccountClosed`
(6110).

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
| x402 | agent SDK (not browser) | `proxy/x402_verify.py` (`verify_on_chain` + unique `payment_proof`) | Base USDC transfer |
