# 10 — Embedded Wallet (Agent's on-chain payment authority)

> **Status: full spec v1.** Promoted from `10-embedded-wallet-stub.md`
> on 2026-04-30 by answering the 7 open questions identified in the
> stub. This is the design the engineering work follows.
>
> The stub remains in git history; do not edit it. New work tracks
> against this file.
>
> **Why this spec exists** (from the stub): it's the load-bearing
> dependency for (a) ROADMAP §6a "embedded wallet pillar", (b) spec 09
> Phase 4 (x402 retry in HeliusClient), (c) the P0 dead
> `frontend/components/sections/ActivitySection.tsx:166-167` MPP UI,
> and (d) ROADMAP P1 x402 on-chain verification at
> `v2-mvp/src/server.py:1067`. One spec → four downstream unblocks.

---

## What user does

### Use case A — Owner gives an agent its own wallet

1. Owner opens **AgentsSection**, sees their registered agents
2. For agent `trading-bot-v1`, clicks **"Give wallet"** button (new)
3. Frontend `POST /agents/{id}/wallet/create` (Bearer token)
4. Server submits `CreateEphemeralSigner` (ix #23 — already on-chain)
   AND new `OpenPaymentStream` (ix #24, this spec) in one transaction
5. Returns: `{ephemeral_signer_pubkey, payment_stream_pda, usdc_ata}`
6. UI shows: *"Wallet ready. Balance: $0. Top up to enable payments."*

### Use case B — Owner tops up the agent's wallet

1. Owner clicks **"Top up $10"** in AgentsSection
2. Frontend prompts owner's Phantom: *"Approve USDC transfer of 10
   USDC to `<usdc_ata>`"*
3. Wallet signs + broadcasts standard SPL `Transfer` ix (10_000_000
   USDC atoms)
4. Frontend `POST /agents/{id}/wallet/topup { tx_signature }`
5. Server verifies on-chain via Helius `getTransaction` (idempotent on
   tx signature) and records
6. Balance updates: `$10.00` ✅

### Use case C — Agent pays per-call (x402)

1. Agent (Python script with `keyshield-sdk` + ks-helius) calls
   `helius.parse_transactions([sigs])`
2. Helius returns **HTTP 402** with `X402Envelope`
3. ks-helius's `PaymentInterceptor` (the slot left in spec 09's v2
   constructor) sees 402, dispatches to `EmbeddedWallet::pay_x402(env)`
4. `EmbeddedWallet`:
   a. Builds `pay_x402` ix (#25, this spec) targeting
      `keyshield_program`
   b. Wraps in `Transaction`
   c. `EphemeralSignerProvider::sign(&tx)` returns signed tx
   d. Submits via Helius `sendTransaction`
   e. Returns the tx signature as `PaymentProof`
5. ks-helius retries the original Helius call with header
   `X-Payment-Proof: <signature>`
6. Helius's facilitator (or our self-hosted facilitator at
   `v2-mvp/src/server.py:1067`) verifies the on-chain payment, returns
   the originally-requested data
7. Owner-side dashboard sees: *"Agent spent $0.001 on
   parse_transactions, balance now $9.999"*

The agent code did not handle 402 — it looked like a normal call.

### Use case D — Agent pays via stream (MPP)

1. Agent (long-running indexer) calls `POST /mpp/streams` with
   `{upstream: "helius", max_rate_usd_per_min: 0.50,
   settlement_interval_secs: 60}`
2. Server submits `OpenPaymentStream` (ix #24) with the rate cap on-chain
3. Agent calls upstream as normal; for each call it logs token usage
   via `POST /mpp/streams/{id}/record { usage_units }`
4. Every 60s, server submits `mpp_settle` (ix #26) that debits
   PaymentStream by `cumulative_usage * cost_per_unit`
5. Owner sees periodic settlement events in ActivitySection

This is the path that was already wired UI-side in `ActivitySection.tsx`
but had no backend. Spec 10 finishes it.

### Use case E — Owner revokes agent + reclaims residual balance

1. Owner clicks **Revoke** on agent
2. Server submits `revoke_agent` ix (already exists in
   `programs/keyshield`)
3. AgentGrant marked revoked → EphemeralSigners can no longer sign
   `pay_x402` (on-chain check)
4. Dashboard shows: *"Agent revoked. Residual: $4.20.
   [Reclaim to wallet]"*
5. Owner clicks **Reclaim** → owner's wallet signs
   `withdraw_agent_wallet` ix (#27, this spec)
6. PaymentStream USDC ATA → owner's USDC ATA (full balance)
7. PaymentStream PDA closed (rent reclaimed to owner)

---

## Where it lives

| Layer | Status | Code |
|---|---|---|
| `EphemeralSigner` PDA struct | ✅ shipped | `programs/keyshield/src/state.rs:309` |
| `CreateEphemeralSigner` ix #23 | ✅ shipped | `programs/keyshield/src/lib.rs:120` |
| `OpenPaymentStream` ix #24 | 📋 **this spec** | `programs/keyshield/src/instructions/open_stream.rs` |
| `pay_x402` ix #25 | 📋 **this spec** | `programs/keyshield/src/instructions/pay_x402.rs` |
| `mpp_settle` ix #26 | 📋 **this spec** | `programs/keyshield/src/instructions/mpp_settle.rs` |
| `withdraw_agent_wallet` ix #27 | 📋 **this spec** | `programs/keyshield/src/instructions/withdraw.rs` |
| Python `/agents/{id}/wallet/{create,topup,balance,reclaim}` | 📋 **this spec** | `v2-mvp/src/server.py` (new) |
| Python `/mpp/streams/{open,record,settle,close}` | 📋 **this spec** | `v2-mvp/src/server.py` (new — fixes ActivitySection P0) |
| Python `/billing/topup` x402 verification (currently TODO at line 1067) | 📋 **this spec** | rewrite to use Solana RPC |
| Frontend AgentsSection wallet UI | 📋 **this spec** | `frontend/components/sections/AgentsSection.tsx` (extend) |
| Rust `EmbeddedWallet` + `EphemeralSignerProvider` trait | 📋 **this spec** | new crate `proxy-rs/crates/ks-wallet/` |
| Rust `PaymentInterceptor` impl that wraps `EmbeddedWallet` | 📋 **this spec** | extends spec 09 Phase 4 |

---

## Q1 — `pay_x402` instruction

### Accounts

| # | Role | Address |
|---|---|---|
| 0 | `[signer]` | EphemeralSigner keypair (the agent's per-grant signer) |
| 1 | `[]` | AgentGrant PDA (validated; must be active, not revoked) |
| 2 | `[writable]` | PaymentStream PDA (validated; owner == agent_grant.owner) |
| 3 | `[writable]` | PaymentStream's USDC ATA (the escrow source) |
| 4 | `[writable]` | Recipient's USDC ATA (from envelope's `payTo`) |
| 5 | `[]` | USDC mint (validated against config) |
| 6 | `[]` | SPL Token Program (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`) |
| 7 | `[]` | This program (`keyshield_program`) — for PDA self-validation |

### Instruction data

```
struct PayX402Data {
    discriminator:    u8 = 25,         // ix #25
    amount:           u64,             // micro-USDC
    nonce:            [u8; 16],        // replay protection
    expires_at:       i64,             // unix ts; ix fails if clock > this
    envelope_hash:    [u8; 32],        // sha256 of canonical X402Envelope
}
```

### Logic

1. **Verify EphemeralSigner is in AgentGrant's slot array** and not
   expired (`signer_expires_at > now`).
2. **Verify AgentGrant not revoked** (`agent_grant.revoked_at == 0`).
3. **Check rate cap** (off-chain enforced, see Q7) — server must reject
   proofs that exceed; on-chain checks the *budget cap* only.
4. **Check budget cap**: `payment_stream.spent_total + amount <=
   payment_stream.max_total_micro_usdc`. If exceeded → fail with
   `BudgetExceeded` (error 6080).
5. **Replay check**: hash `(envelope_hash, nonce)` and check it's not
   in `payment_stream.consumed_nonces` ring buffer (last 256 entries).
   If present → fail with `NonceReused` (error 6081).
6. **CPI to SPL Token Program**: `transfer_checked` from PaymentStream
   USDC ATA → recipient ATA, `amount` micro-USDC, `decimals: 6`.
   Authority: this program's PDA (PaymentStream PDA-derived signer).
7. **Update state**: `payment_stream.spent_total += amount`,
   `payment_stream.consumed_nonces.push((envelope_hash, nonce))`,
   `payment_stream.last_payment_ts = now`.
8. Emit log: `pay_x402: signer={pubkey} amount={amount} nonce={nonce}`.

### Output

The Solana **transaction signature** (assigned by the cluster) IS the
`X-Payment-Proof`. Verifier looks it up via `getTransaction(sig)`,
confirms it called `pay_x402` with matching `envelope_hash` and
`amount >= envelope.maxAmountRequired`.

---

## Q2 — `X402Envelope` wire format

**Adopt Coinbase x402 spec verbatim**, with one KeyShield-specific
extension under the existing `extra` field. No changes to top-level
shape — interoperable with any x402-aware client.

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT-REQUIRED",
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana-mainnet",
      "maxAmountRequired": "10000",
      "resource": "https://example/api/v1/expensive",
      "description": "1 call to /api/v1/expensive",
      "mimeType": "application/json",
      "payTo": "<recipient_solana_pubkey_b58>",
      "maxTimeoutSeconds": 300,
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "extra": {
        "name": "USDC",
        "version": "2",
        "keyshield": {
          "supports_payment_stream": true,
          "facilitator": "https://api.keyshield.example/v1/x402/verify",
          "expected_program_id": "<keyshield_program_id_b58>",
          "expected_ix_discriminator": 25
        }
      }
    }
  ]
}
```

The `keyshield.*` fields under `extra` are advisory — clients without
them treat the envelope as a regular Coinbase x402 USDC transfer
request. Clients with KeyShield-aware facilitator (our verifier at
`/billing/topup` rewritten in this spec) parse them to verify the
proof matches our `pay_x402` ix specifically.

### Proof header

```
X-Payment-Proof: <solana_tx_signature_base58>
X-Payment-Network: solana-mainnet
```

Verifier flow:
1. Fetch tx via Helius `getTransaction(sig, commitment="confirmed")`
2. Confirm program == `keyshield_program_id`
3. Confirm ix discriminator == 25 (`pay_x402`)
4. Parse ix data → match `envelope_hash` against fresh hash of
   the request's envelope
5. Confirm `amount >= maxAmountRequired`
6. Confirm `payment_stream.owner` matches the bearer's user
7. Idempotent: insert (sig) into `x402_proofs` table; reject duplicates

---

## Q3 — MPP vs x402 (separate ixs, shared PaymentStream)

Both x402 and MPP debit the **same** PaymentStream USDC ATA. Different
ixs, different invocation patterns, same on-chain budget enforcement.

| | x402 (per-call) | MPP (streaming) |
|---|---|---|
| Ix | `pay_x402` (#25) | `mpp_settle` (#26) |
| Trigger | Upstream returned 402 → agent retries with proof | Server timer (every `settlement_interval_secs`) |
| Signer | Agent's EphemeralSigner | Server keypair (designated as `mpp_settler` in PaymentStream) |
| Frequency | One call → one ix | Many calls → one cumulative ix |
| Latency tax | ~200ms per call (Solana confirm) | ~0ms per call (recorded off-chain), ~200ms per settlement |
| Best for | One-shot or sporadic agents | Long-running indexers / trading bots |

### Stream lifecycle

```
OpenPaymentStream(ix #24)
    {max_rate_usd_per_min, settlement_interval_secs, max_total_micro_usdc}
            │
            ▼
        agent calls upstream
            │
            ▼
   POST /mpp/streams/{id}/record {usage_units}
   (server tracks cumulative_units in mpp_streams table)
            │
            ▼  (every settlement_interval_secs)
   server submits mpp_settle(stream_id, units_since_last_settle)
   → on-chain ix debits USDC = units * cost_per_unit (read from PaymentStream)
            │
            ▼
   POST /mpp/streams/{id}/close
   → server submits mpp_settle one final time + closes stream PDA field
```

### What this fixes

`frontend/components/sections/ActivitySection.tsx:166-167` calls
`/mpp/streams/*` against a backend that doesn't exist (P0 in
ROADMAP). This spec makes the backend exist. After implementation,
the frontend's existing UI just starts working — no frontend changes
needed.

---

## Q4 — `EphemeralSignerProvider` trait

Signs **full Solana transactions**, not raw signatures. Reasons:
1. The proof needed is a tx signature (Solana network-assigned); only
   reachable by submitting a real signed tx
2. The `pay_x402` ix needs the EphemeralSigner as a `[signer]` account;
   that requires tx-level signing
3. Standard Solana wallet adapter pattern — implementations exist for
   in-memory keys, hardware wallets, browser wallets

```rust
// proxy-rs/crates/ks-wallet/src/lib.rs

pub trait EphemeralSignerProvider: Send + Sync {
    /// Pubkey of the EphemeralSigner. Cached on construction;
    /// constant for the lifetime of the trait object.
    fn pubkey(&self) -> Pubkey;

    /// Sign a Solana Transaction. Implementation may:
    /// - hold an in-memory ed25519 keypair (dev / unit test)
    /// - delegate to a hardware wallet (Ledger via @ledgerhq)
    /// - delegate to a passphrase-encrypted keystore on disk
    /// - call out to an HSM
    async fn sign(&self, tx: &mut Transaction) -> Result<(), SignError>;
}

pub struct EmbeddedWallet {
    signer: Arc<dyn EphemeralSignerProvider>,
    payment_stream: Pubkey,
    rpc: Arc<dyn SolanaRpc>,        // Helius or vanilla RPC
    program_id: Pubkey,             // keyshield_program
    usdc_mint: Pubkey,
}

impl EmbeddedWallet {
    pub async fn pay_x402(
        &self,
        envelope: &X402Envelope,
    ) -> Result<PaymentProof, WalletError> {
        // 1. Hash envelope
        let envelope_hash = sha256_canonical_x402(envelope);
        // 2. Build pay_x402 ix
        let ix = build_pay_x402_ix(
            self.signer.pubkey(),
            self.payment_stream,
            envelope.recipient_ata(),
            envelope.amount_micro_usdc(),
            random_nonce(),
            envelope.expires_at(),
            envelope_hash,
            self.program_id,
            self.usdc_mint,
        );
        // 3. Build + sign tx
        let mut tx = Transaction::new_with_payer(&[ix], Some(&self.signer.pubkey()));
        tx.message.recent_blockhash = self.rpc.get_latest_blockhash().await?;
        self.signer.sign(&mut tx).await?;
        // 4. Submit
        let sig = self.rpc.send_transaction(&tx).await?;
        // 5. Wait confirmation (configurable)
        self.rpc.confirm(sig, CommitmentLevel::Confirmed).await?;
        Ok(PaymentProof::SolanaSignature(sig))
    }
}
```

### Default implementations shipped in `ks-wallet`

```rust
/// In-memory ed25519 signer. Uses ephemeral_signer.privkey from local
/// secure storage. Fastest; no UX cost; key never leaves the process.
pub struct InMemorySigner { kp: Arc<Keypair>, pubkey: Pubkey }

/// Wraps a HardwareWallet adapter (Ledger). User must approve each
/// signature on-device. Higher friction but private key never in RAM.
pub struct LedgerSigner { ... }
```

Agent author picks which to construct based on their threat model.

---

## Q5 — Top-up flow

**Two-step, owner-initiated, idempotent on tx signature.**

### Wire shape

```
POST /agents/{id}/wallet/create
  Bearer: <owner session token>
  → 200 {
      ephemeral_signer_pubkey: "<base58>",
      payment_stream_pda:      "<base58>",
      usdc_ata:                "<base58>",
      tx_signature:            "<base58>"   // create-wallet tx
    }

POST /agents/{id}/wallet/topup
  Bearer: <owner session token>
  Body:   { tx_signature: "<base58>", expected_amount_usd: number }
  → 200 {
      credited_micro_usdc: u64,
      balance_micro_usdc:  u64,    // post-topup
      tx_signature:        "<echo>",
      commitment:          "confirmed"
    }
  → 409 if tx_signature already credited (idempotent)
  → 400 if on-chain tx doesn't match (wrong recipient, wrong amount, etc.)

GET /agents/{id}/wallet/balance
  Bearer: <owner session token>
  → 200 {
      balance_micro_usdc:    u64,
      spent_total_micro_usdc: u64,
      max_total_micro_usdc:   u64,    // budget cap
      max_rate_usd_per_min:   f64,    // off-chain rate limit
    }
```

### Server-side topup verification (Python)

Mirrors the existing `/billing/topup-solana-usdc` flow at
`v2-mvp/src/billing_solana.py`:
1. Fetch tx via Helius `getTransaction(sig, commitment="confirmed")`
2. Find an SPL Token Transfer ix from owner's USDC ATA to the agent's
   PaymentStream USDC ATA
3. Confirm amount and recipient
4. Insert `(tx_signature, agent_id, amount, ts)` into
   `agent_wallet_topups` table; on duplicate sig → 409
5. Return new balance (sourced from on-chain ATA, not the table)

Owner doesn't need to "approve" twice — the SPL transfer IS the
top-up. The Python endpoint just records it for audit + UI.

---

## Q6 — Revocation + reclaim

**Two ixs, owner-initiated.**

### Step 1: Revoke

`DELETE /agents/{id}` (already exists in `server.py:622`):
1. Server submits existing `revoke_agent` ix
2. AgentGrant.revoked_at = now()
3. From this moment, EphemeralSigner cannot sign `pay_x402` (on-chain
   check at step 2 of Q1)

Server-side flag is set so future MPP `record` / `settle` calls also
fail.

### Step 2: Reclaim residual

New endpoint: `POST /agents/{id}/wallet/reclaim`
1. Owner's session signs the request
2. Frontend prompts owner's Phantom for `withdraw_agent_wallet` ix
   (built and returned by server)
3. Owner signs + broadcasts
4. `withdraw_agent_wallet` ix (#27) does:
   - Verify caller is owner of AgentGrant
   - Verify AgentGrant.revoked_at != 0
   - Compute residual = PaymentStream USDC ATA balance
   - CPI to SPL Token: transfer all balance to owner's USDC ATA
   - Close PaymentStream PDA (rent → owner)
5. Server records the reclaim event for audit

**Auto-refund?** No. Server doesn't sign for owner; owner must approve
the on-chain reclaim. This avoids a "server controls owner funds"
trust boundary.

**What if owner forgets?** Residual stays on-chain indefinitely. UI
shows the residual indefinitely, prompting reclaim.

---

## Q7 — Rate caps (hybrid)

| Layer | What's enforced | Failure mode |
|---|---|---|
| **On-chain (hard)** | `max_total_micro_usdc` budget cap on PaymentStream | `pay_x402` / `mpp_settle` fail with `BudgetExceeded` once spent |
| **Off-chain (soft)** | `max_rate_usd_per_min` rate limit | Server's facilitator (`/billing/topup` rewrite) rejects proofs that exceed window-rate; agent gets 429 |

### Rationale

**Pure on-chain rate limiting is too expensive.** Each `pay_x402` would
need to read+write a sliding-window state field. Solana TX cost is
~5000 lamports + compute; 100/min agent calls would mean continuous
on-chain churn just for rate accounting.

**Pure off-chain rate limiting is too risky.** If server is compromised,
attacker calls `pay_x402` directly with valid EphemeralSigner sig and
drains the entire PaymentStream up to `max_total_micro_usdc`.

**Hybrid is the right balance:**
- The hard cap (`max_total_micro_usdc`) is the user-visible budget.
  "I'll never spend more than $50 on this agent." Enforced on-chain.
- The rate limit (`max_rate_usd_per_min`) is the server-side burn-rate
  guard. "$50 budget should last 100 minutes, not get drained in 5
  seconds." Enforced off-chain. If server is compromised, attacker
  bypasses this but is still bounded by `max_total_micro_usdc`.

This matches Coinbase Agentic's published model.

### What server-side rate limit looks like

```python
# v2-mvp/src/billing_x402.py (new)
async def verify_x402_proof(envelope, sig, agent_id):
    # ... on-chain verification (Q1, Q2 logic) ...

    # Off-chain rate check
    cap = get_payment_stream_rate_cap(agent_id)  # max_rate_usd_per_min
    spent_last_60s = sum_recent_x402_proofs(agent_id, window_secs=60)
    proposed_spend = envelope.max_amount_required / 1e6
    if spent_last_60s + proposed_spend > cap:
        raise HTTPException(429, "rate cap exceeded; retry later")

    record_proof(sig, agent_id, proposed_spend)
    return ok
```

---

## Implementation phases (concrete)

| Phase | Slice | Eng-days | Depends on |
|---|---|---|---|
| 10.0 | This spec (you're reading it) | 0.5 | done |
| 10.1 | On-chain ixs `OpenPaymentStream(#24)` + `pay_x402(#25)` + Mollusk tests | 2 | 10.0 |
| 10.2 | On-chain ixs `mpp_settle(#26)` + `withdraw_agent_wallet(#27)` + Mollusk tests | 1.5 | 10.1 |
| 10.3 | Python endpoints `/agents/{id}/wallet/{create,topup,balance,reclaim}` | 1.5 | 10.2 |
| 10.4 | Python endpoints `/mpp/streams/{open,record,settle,close}` (FIXES P0) | 1.5 | 10.2 |
| 10.5 | Python `/billing/topup` rewrite to verify x402 proofs on-chain (FIXES server.py:1067) | 1 | 10.2 |
| 10.6 | Frontend AgentsSection wallet UI (Give wallet / Top up / Balance / Revoke + Reclaim) | 2 | 10.3 |
| 10.7 | Rust `ks-wallet` crate: `EphemeralSignerProvider` trait + `InMemorySigner` impl + `EmbeddedWallet` | 1.5 | 10.2 |
| 10.8 | Wire `ks-wallet::EmbeddedWallet` into `ks-helius`'s `PaymentInterceptor` slot (= spec 09 Phase 4) | 0.5 | 10.7, spec 09 Phase 1 |
| 10.9 | E2E Playwright test: owner gives wallet → tops up → agent makes 402'd call → balance debits | 1 | 10.6, 10.8 |

**Total: ~13 engineer-days. Realistic 3 weeks calendar with reviews.**

### Real parallelism

After 10.2 lands (on-chain ixs all done):
- Track A: Engineer A → 10.3 → 10.6 (Python wallet endpoints, then frontend)
- Track B: Engineer B → 10.4 (MPP streams) — parallel with A
- Track C: Engineer C → 10.5 (x402 verifier rewrite) — parallel with A
- Track D: Engineer D → 10.7 → 10.8 (Rust ks-wallet, then ks-helius wiring) — parallel with A/B/C
- 10.9 (E2E) waits for A and D

So 4-way parallelism after 10.2. **10.1 + 10.2 are the bottleneck**;
ship them first as a serial pair.

---

## Acceptance criteria

### For the on-chain phases (10.1 + 10.2)

1. `cargo build-sbf` clean
2. `cargo test -p keyshield` passes including new tests
3. Mollusk tests cover: happy path for each new ix, replay rejection,
   budget overrun rejection, revoked agent rejection, owner-not-caller
   rejection on `withdraw_agent_wallet`
4. Surfpool integration test (one end-to-end ix dispatch with a real
   USDC mint), even if `continue-on-error: true` per existing CI

### For the Python phases (10.3, 10.4, 10.5)

1. `pytest v2-mvp/tests/` adds new test files for each endpoint
2. Each new endpoint has at least: happy path, idempotency, auth-fail,
   on-chain-tx-not-found, on-chain-amount-mismatch
3. P0 in ROADMAP fixed: open dashboard, ActivitySection MPP buttons
   functional (no 404s)
4. server.py:1067 TODO replaced with real on-chain verification

### For the Rust phase (10.7)

1. `cargo test -p ks-wallet` ≥ 8 tests (trait conformance with
   `InMemorySigner`, mock-rpc `pay_x402` happy path, expired
   EphemeralSigner rejected, invalid envelope rejected)
2. `cargo check --workspace` green

### For E2E (10.9)

1. `bash scripts/dev.sh` brings up the full stack
2. Playwright test scripts owner login → create agent → give wallet
   → top up → simulate agent call hitting 402 → see balance change
3. Test uses local Solana validator (Surfpool) for the chain

---

## Test plan

### Unit (per crate / per file)

- Mollusk for each Solana ix
- pytest for each Python endpoint
- cargo test for `ks-wallet`

### Integration (cross-component)

- Wiremock-mocked Helius for `EmbeddedWallet::pay_x402` (no real chain)
- Real Surfpool for one full owner → agent → pay flow

### E2E (cross-stack)

- Playwright + bash scripts/dev.sh + Surfpool
- One scenario per use case A, B, C, D, E above

### Oracle parity

If the existing `oracle_diff` harness (12 fixtures) covers any new
endpoints, add fixtures for:
- `/agents/{id}/wallet/balance` (deterministic by-design)
- `/mpp/streams/{id}/record` (deterministic; no upstream call)

Topup and reclaim are non-deterministic (depend on chain state); skip.

---

## What this spec doesn't cover

- **Refund mechanics for partial settle failures.** If `mpp_settle`
  fails on-chain (compute exceeded, network down), what happens to
  the recorded usage? Decision: record a `pending_settle` row, retry
  next interval. Not in this spec; track as a Stage 2 polish item.
- **Multi-asset wallets.** Spec assumes USDC. Other tokens (SOL,
  custom SPL) are future work; the PaymentStream PDA could hold
  multiple ATAs but adds complexity. Defer.
- **Rate cap subspecs per upstream.** A single `max_rate_usd_per_min`
  applies across all upstream calls. Per-upstream caps (e.g. "$0.50/min
  on OpenAI, $5/min on Helius") are future work.
- **Cross-chain payments.** Coinbase x402 supports Base/Ethereum.
  This spec is Solana-only. Adding Base would need a parallel
  PaymentStream contract on Base + Wormhole-style bridging or
  equivalent. Major work; not in scope.

---

## Promotion checklist (was on the stub — now verified ✅)

- [x] Q1-Q7 answered with concrete byte/instruction-level designs
- [x] On-chain ix ABI documented (account list, data layout, error
      codes 6080-6082)
- [x] HTTP wire shape for all new endpoints
- [x] Phase ordering with engineer-days
- [x] Acceptance criteria per phase
- [x] Test plan: unit + integration + on-chain (Mollusk + Surfpool) +
      E2E (Playwright)

**Spec 10 is full status. Phase 10.1 ready for engineer dispatch.**
