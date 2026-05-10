# 15 — MPP Stream Lifecycle: open → record → settle → close

> **Status: spec v1.** Written 2026-05-10. Companion to spec 10
> (EphemeralSigner) and spec 14 (Dashboard CTA). Covers the **Metered
> Payment Protocol** end-to-end — opening a per-agent payment stream
> on-chain, the agent making proxy calls that record usage, the
> server submitting periodic settlement transactions, and the user
> closing the stream to recover the rent + remaining USDC.

---

## What the user does

1. From `/app/device-vault` (Path A) or `/app/agents`, picks an agent
   and clicks **"Open payment stream"**. A modal asks for two numbers:
   `rate_per_unit_micro_usdc` and `cap_micro_usdc` (the per-call cost
   ceiling and the total budget).
2. Wallet (Phantom / Solflare via wallet-adapter) pops a sign-tx
   prompt. Approves.
3. Stream is **open** — UI shows a green "Active stream" card with the
   PDA address, current balance, and a "Use → " link that takes the
   user to the agent's API console.
4. Agent makes `/proxy/openai/...` calls. Each call records token
   counts to `mpp_streams.record_units()` server-side. **No on-chain
   tx yet** — usage is accumulated in the Python backend.
5. Every `settlement_interval_secs` (default 60s), the backend
   server-signs `mpp_settle` (ix #26) which debits accumulated
   `units * cost_per_unit` from the stream's USDC ATA on-chain. UI
   shows "Last settled X seconds ago".
6. User clicks **"Close stream"**. Wallet signs `withdraw_agent_wallet`
   (ix #27) which sweeps the remaining USDC back to the owner ATA and
   closes the PDA (recovering the rent).

---

## Where it lives

| Layer | File | What runs here |
|---|---|---|
| **Frontend (`src/web/`)** | `components/MppStreamOpener.tsx` (270 lines) | Form → `buildMppOpenTx()` → assembles 3-ix Transaction → wallet sign+send → `recordMppTx()` to persist signature |
| | `components/sections/EphemeralWalletsSection.tsx` | Lists existing streams + balances; hosts the Open / Close CTAs |
| **Shared (`packages/shared/`)** | `lib/wallet-mpp.ts` | `assembleOpenTxIxsForSign()` + `decodeIxData()` — web3.js-agnostic helpers that explain the **prereq + main** ix ordering |
| | `api/index.ts:buildMppOpenTx()` + `recordMppTx()` | Typed fetch wrappers for the build-tx + record-tx endpoints |
| **Python (`src/backend/`)** | `routes/mpp.py` — 9 routes | `/streams` CRUD + `/build-open-tx` (3-ix bundle) + `/build-withdraw-tx` (close) + `/record-tx` (persist signature) + `/record` (off-chain usage tally) + `/settle` (trigger on-chain settle) |
| | `mpp/mpp_streams.py` | Stream registry: open / record_units / record_tx_signature / settle / close. Holds the `pending_units` counter that `mpp_settle` debits. |
| | `mpp/mpp_onchain.py` | Builds the unsigned `OpenPaymentStream` and `WithdrawAgentWallet` ixs for the wallet-sign flow; signs + submits `mpp_settle` server-side using the settler keypair. |
| **On-chain (`src/programs/keyshield/`)** | `instructions/open_stream.rs` (#24) | Allocates `AgentPaymentStream` PDA, binds to `AgentGrant`, records `mpp_settler_pubkey` |
| | `instructions/mpp_settle.rs` (#26) | Server-signed batch settlement: debits `units × cost_per_unit_micro_usdc` from the stream's USDC ATA |
| | `instructions/payment_stream.rs` (#27 `withdraw_agent_wallet`) | Owner-signed close: sweeps remaining USDC + closes PDA |

---

## Wire shape — Open

The build-open-tx response is the most subtle bit because the wallet
must sign **three** instructions in one Transaction. Sending only the
main `open_payment_stream` ix (the v2 path) hit `OwnerMismatch (0x4)`
on devnet because the stream PDA's USDC ATA didn't exist at debit
time. Fixed by bundling its creation into the same tx.

### Request

```http
POST /mpp/streams/{stream_id}/build-open-tx
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "ratePerUnitMicroUsdc": 100,        // 0.0001 USDC per token
  "capMicroUsdc": 1000000,            // 1 USDC total budget
  "settlementIntervalSecs": 60
}
```

### Response (3-ix bundle)

```json
{
  "programId": "DHPTRYbLXSkrM9xYoU2ZJ1HhHWf3huvNoqFvXf5S6EBj",
  "rpcUrl": "https://api.devnet.solana.com",
  "cluster": "devnet",

  "prereqIxs": [
    {
      "programId": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      "keys": [...],
      "data": "BASE64_SPL_ATA_CREATE_DISC_1"
    },
    {
      "programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "keys": [...],
      "data": "BASE64_TRANSFER_CHECKED"
    }
  ],

  "main": {
    "programId": "DHPTRYbLXSkrM9xYoU2ZJ1HhHWf3huvNoqFvXf5S6EBj",
    "keys": [...],
    "data": "BASE64_OPEN_PAYMENT_STREAM_IX_DATA"
  }
}
```

### Frontend assembly

```ts
const resp = await buildMppOpenTx(streamId, { ratePerUnitMicroUsdc, capMicroUsdc });

// assembleOpenTxIxsForSign concatenates [prereqIxs..., main] in the
// right order — prereqIxs MUST land first because the main ix reads
// the freshly-created ATA.
const ixsJson = assembleOpenTxIxsForSign(resp);
const ixs = ixsJson.map(j => new TransactionInstruction({
  programId: new PublicKey(j.programId),
  keys: j.keys.map(k => ({
    pubkey: new PublicKey(k.pubkey),
    isSigner: k.isSigner,
    isWritable: k.isWritable,
  })),
  data: Buffer.from(decodeIxData(j.data)),
}));

const tx = new Transaction().add(...ixs);
const sig = await wallet.sendTransaction(tx, connection);
await connection.confirmTransaction(sig, 'confirmed');

// Persist the signature so the stream record can flip from
// "pending wallet sign" to "active":
await recordMppTx(streamId, { txSignature: sig });
```

---

## Wire shape — Record (off-chain)

This is the hot-path call the proxy makes after every successful
`/proxy/openai/...` request. **Not on-chain** — just bumps an
in-memory counter that the next `mpp_settle` will read.

```http
POST /mpp/streams/{stream_id}/record
Authorization: <internal proxy token>
Content-Type: application/json

{ "units": 1234, "metadata": {"upstream":"openai", "model":"gpt-4"} }
```

→ `204 No Content` on success.

The proxy is the only caller — the dashboard never hits this directly.

---

## Wire shape — Settle (server-signed)

```http
POST /mpp/streams/{stream_id}/settle
Authorization: <internal cron token>
```

Reads `mpp_streams[stream_id].pending_units`, builds + signs +
submits `mpp_settle` (ix #26) using the settler keypair, then
zeroes the counter. Returns `{ tx_signature, units_settled,
settled_micro_usdc }`. Failure modes:

| Error | Cause | What server does |
|---|---|---|
| `0x4 OwnerMismatch` | Stream's USDC ATA owner is not the stream PDA | Don't retry — config bug; alert operator |
| `0x6 InsufficientFunds` | Stream balance < `units × cost_per_unit` | Mark stream `frozen`, notify owner via UI |
| RPC `BlockhashNotFound` | Stale blockhash | Retry once with fresh blockhash |

A cron worker calls this every `settlement_interval_secs`. On manual
"Settle now" button (UI), the dashboard hits the same endpoint.

---

## Wire shape — Close

```http
POST /mpp/streams/{stream_id}/build-withdraw-tx
Authorization: Bearer <session_token>
```

Returns one ix (`withdraw_agent_wallet`, no prereqs) in the same shape
as `build-open-tx`'s `main` field. Frontend signs + submits as one
ix, then calls `record-tx` with the resulting signature.

The on-chain ix sweeps the remaining USDC ATA balance back to the
owner ATA and closes the PDA, recovering ~0.002 SOL of rent.

---

## Why these choices (alternatives considered)

### Why a 3-ix bundle for open (not "ATA already exists")

The naïve flow is: user pre-creates the stream PDA's USDC ATA in a
separate tx, then submits `open_payment_stream` against the existing
ATA. Rejected because:

1. **Two clicks, two wallet prompts.** Hackathon demo conversion is
   sensitive — every extra wallet pop is a potential drop-off point.
2. **Pre-create can fail standalone.** If the user creates the ATA
   but bails on the open-stream click, the ATA squats on the user's
   SOL with no way for the dashboard UI to surface "you have an
   orphan ATA from a half-finished open".
3. **Atomicity.** Bundling means open-stream either fully succeeds
   (PDA + ATA + first deposit) or fully reverts (no orphan state).

The cost is wire-shape complexity — `build-open-tx` returns 3 ixs,
not 1. `assembleOpenTxIxsForSign()` in shared/ encapsulates the
ordering rule so callers don't have to know.

### Why server-signed `mpp_settle` (not user-signed)

`mpp_settle` runs every 60 seconds. If it required the user's wallet
each time, the user would have to keep the wallet popup open for the
entire agent session — unworkable. Two alternatives considered:

- **EphemeralSigner-signed settle.** The agent's own wallet (created
  via `CreateEphemeralSigner`, see spec 10) signs `mpp_settle`. The
  problem: the agent's keypair is held by the agent process; if that
  process crashes between `record_units()` and the next settle, the
  pending counter is lost. **The settler keypair is held by the
  control-plane (Python backend), which has durable storage** — the
  pending counter survives.
- **No on-chain settle, just track usage off-chain.** Defeats the
  point of MPP — settlement is what makes the agent's payment
  enforceable on-chain (vs trust-the-server like x402's stub-fallback
  mode in spec 13).

The on-chain ix records `mpp_settler_pubkey` at open-stream time and
the program enforces "the signer of `mpp_settle` must match this
pubkey". So even though the settler is server-side, the user has
on-chain proof of who's allowed to debit their stream.

### Why MPP coexists with x402

Spec 10 already has `pay_x402` (ix #25) for per-call payments. So why
add MPP at all?

| Pattern | When | Cost per call | Latency |
|---|---|---|---|
| **x402 (per-call)** | Bursty, low-volume, high-value calls (e.g. one Helius RPC) | 1 on-chain tx per call | +1-2s for tx confirm |
| **MPP (streaming)** | Sustained agent traffic (e.g. an LLM session firing 100 calls/min) | 1 on-chain tx per minute | +0ms per call (off-chain only) |

An agent session typically uses x402 for the first couple of "is
this even working" calls, then opens an MPP stream for the workload
phase. Spec 13 covers this dispatch logic.

---

## Demo verification

Local end-to-end (assumes backend running + funded settler keypair):

```bash
node src/scripts/demo-streaming-payment.ts
```

The script: registers an agent, opens a stream with 1 USDC budget,
fires 10 simulated proxy calls totaling 1000 units, waits for one
settle interval, then closes. Asserts:
- `stream.settled_micro_usdc` advanced by `1000 × rate_per_unit`
- `stream.pending_units` is zero after settle
- USDC balances net-out (owner ATA == initial - settled, settler
  earned 0, stream PDA == 0)

For pure-on-chain verification (no backend running):

```bash
node src/scripts/mpp-e2e-devnet.mjs
```

Drives the build-open-tx → wallet sign → record-tx → manual settle
flow against the live devnet program with a hardcoded fixture stream.

---

## Out of scope (future specs)

- **Multi-token streams.** Currently USDC-only. SPL tokens generally
  + price-feed integration (Pyth) is its own design problem — needs
  a separate spec.
- **Auto-topup.** When a stream balance drops below a threshold, the
  owner could auto-top-up from a savings ATA. Not implemented; would
  use `pay_x402`-style flow on a different schedule.
- **Cross-stream transfer.** Right now `withdraw → open new stream`
  is two on-chain txs. A "rebalance" ix that moves USDC between two
  streams the same owner controls is plausible but not built.
- **Settlement disputes.** No mechanism for the user to challenge a
  `mpp_settle` they think over-debited. Mitigated by the
  `record_units()` audit log (every unit tally is timestamped + tied
  to a proxy request ID).
