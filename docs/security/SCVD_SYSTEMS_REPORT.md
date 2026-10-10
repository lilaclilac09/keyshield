# KeyShield Systems Report — Session Authorization vs Fulfillment

This is the engineering record of the SCVD-style adversarial audit
and the remediations on `cursor/scvd-session-desync-b48a`. The
failure class is **authorization/fulfillment desynchronization**: a
session-key signature (or a cached settle attempt) moved, or was
allowed to move, ledger state that the chain or the artifact had not
confirmed.

Critical safety and cryptography stay in Rust. TypeScript/JavaScript
is limited to DOM event listeners (`src/extension/dom-intent.js`).
`ks-proxy` does not take `secrecy` or `zeroize`. The Pinocchio
program stays `no_std` and does not take those crates either. The
host/WASM engine is `ks-session-engine`.

The host SHA-256 context digest is **not** WebAuthn-PRF and is **not**
the Solana Anchor framework. The on-chain program is Pinocchio only
(`pinocchio` / `pinocchio-token` / `pinocchio-system`).

---

## 1. Root Cause Breakdown (The SCVD Analog)

SCVD’s purchase bugs are the same shape as KeyShield’s MPP bugs: a
**receipt** (signature, cache row, 402 body) is treated as a
**fulfilled order** (on-chain debit, upstream bytes, compiled
instruction). The session key is the receipt. The stream PDA +
artifact root + confirmed `mpp_settle` is the order.

| SCVD | KeyShield failure | Where auth desynced from fulfillment |
|------|-------------------|--------------------------------------|
| **BUY-001** blank delivery | DOM `parseFloat` on `accepts[0]` | The extension signed a session payment whose **display amount** was not the **wire amount**. Null bytes, `1e20`, `Infinity`, `__proto__` keys, spoofed `click` events, empty ix lists, or a System Program no-op could be presented as a KeyShield debit. Authorization (user gesture + session MAC) left the compiled instruction. |
| **BUY-005** stale cache poisoning | RPC timeout cached as hard `failed` | `settle_on_chain` wrote `mpp_settle_attempts.success=0` on timeout. The 60s idempotency window then returned `SettleOutcome(0, "failed")` **without resubmitting**. If the first tx later landed, USDC moved on-chain while SQLite rolled back `pending`/`held`/`settled` and the client was asked to sign again. Signature and chain state diverged. |
| **BUY-034** receipt without order | Empty / truncated / unknown ix presented to the session signer | A 0-byte payload, a truncated OpenStream (< 30 B) or MppSettle (< 113 B), missing account metas, or an uninitialized PDA bump could still be HMAC’d. The signature existed; the payment instruction did not. |

Additional KeyShield-specific desyncs in the same family:

**Volatile PRF / unzeroized HKDF.** `deriveMasterKey` left HKDF
`bits` live after AES-GCM import. Extension HKDF did not wipe caller
`sigBytes` on failure. Parallel ceremonies reused one context with no
nonce lock. The “session key” in memory was not the session key the
next ceremony thought it was signing with.

**CU mid-instruction orphan.** A path that charged past 5,000 CU
*after* a spent/escrow write would leave a dirty `StreamSnap` if the
host did not snapshot. Authorization (Ed25519 / session MAC) had
already been accepted; the debit was not atomic with the CU budget.

**Pass-through CPI.** A foreign program invoking `mpp_settle` without
the recorded settler and without
`["agent_payment_stream", agent, owner, bump]` is a signature on the
wrong authority. The PDA signer must not transfer escrow for a
stranger.

**Idempotent replay as a new purchase.** The same fulfillment body
metered twice must not open a second hold. That is BUY-034 inverted:
two receipts for one order.

In every case the broken invariant is the same:

> A session-key signature must never decrement balance or quota
> unless the downstream state change is cryptographically or
> consensus-verified.

Before remediation, timeout, DOM–wire split, empty envelopes, and CU
trips all violated that sentence.

---

## 2. Architectural Thesis & Remediation Strategy

KeyShield’s payment path is **Hold-Verify-Capture**, not
sign-then-hope.

```
Hold     reserve available → held. Session key is NOT a debit.
Verify   assert envelope, PDA, artifact, then broadcast RPC.
         Read the outcome: Confirmed | Stub | Failed | Indeterminate.
Capture  held → settled  ONLY on Confirmed or explicit stub-ledger Stub.
Rollback held → available on Failed or caller-declared give-up.
```

Signing is decoupled from commitment. The MAC proves the consumer
authorized *this* artifact hash. It does not move `settled_micro_usdc`.
`settle_on_chain` / `Engine::verify` move settled only after the
downstream state is known.

**Deterministic assertion before RPC.**

1. Instruction envelope: known discriminator, minimum length
   (OpenStream 30 B, MppSettle 113 B).
2. Packed layout view at fixed offsets (no padding).
3. Artifact root, request hash, capture MAC, sequence ≥ 1.
4. Canonical stream PDA and settler-is-signer.
5. DOM intent equals compiled program id + discriminator + integer
   micro-USDC. Spoofed events (`isTrusted !== true`) never sign.

**Deterministic assertion after RPC.**

| Outcome | Ledger | Cache | Client |
|---------|--------|-------|--------|
| `submitted` / `Confirmed` | capture (held → settled) | success, retry is replay | receipt |
| `stub` and stub-ledger | capture | local settle | receipt |
| `failed` | rollback, no settled++ | terminal for the 60s window | `CaptureRejected` |
| `indeterminate` | **no debit**, hold remains | **must not** cache-block | `CaptureRejected("settlement indeterminate")`, retry allowed |

A later retry that sees the same root already consumed on-chain is
`submitted` (replay = success). That is how a landed-but-unconfirmed
tx is reconciled without a second debit.

**Invariant enforcement (must stay true).**

1. Session HMAC never decrements `settled` unless verify returns
   Confirmed/Stub.
2. Timeout ≠ debit. Timeout ≠ terminal cache poison.
3. DOM amount / program id equal compiled ix bytes or no sign.
4. PRF/HKDF bytes wiped on success and on `finally`.
5. Compute over 5,000 CU returns the pre-instruction `StreamSnap`.
6. Settler-not-signer or unverified PDA cannot CPI-transfer escrow.
7. `available + held + settled == endowment` on every host-engine
   transition.

Python (`mpp_streams.py`) already implements 1–2 and 6 for the live
control plane. Rust `ks-session-engine` is the host/WASM copy of that
state machine so a browser or agent runtime does not re-implement
quota math in TypeScript.

---

## 3. Rust Implementation & Core Code

Two crates, one job:

| Crate | Role | Crates allowed |
|-------|------|----------------|
| `keyshield` (`src/programs/keyshield`) | Pinocchio on-chain, `no_std`, < 5,000 CU | `pinocchio`, `pinocchio-token`, `pinocchio-system` |
| `ks-session-engine` (`src/session-engine`) | Host/WASM HVC, key wipe, SHA-256 guard | `secrecy`, `zeroize`, `sha2`, `hmac`, `digest`, `subtle` |

`ks-proxy` is a **different** workspace (`src/proxy/`) and is not
given `secrecy`/`zeroize` by this work. `ks-session-engine` is
excluded from the root Pinocchio workspace so `zeroize 1.8+` does
not unify with `solana-sdk`'s `curve25519-dalek` (`zeroize <1.4`).
Its lockfile is `src/session-engine/Cargo.lock`.

### 3.1 Pinocchio — envelope, PDA, packed layout, CU snapshot

```toml
# src/programs/keyshield/Cargo.toml
[dependencies]
pinocchio = { workspace = true }          # 0.9
pinocchio-token = { workspace = true }    # 0.4
pinocchio-system = { workspace = true }   # 0.3
```

Host-metered honest path (CI-asserted, not a marketing figure):

```
CU_PARSE 200 + CU_PDA 800 + CU_ED25519 2000 + CU_TRANSFER 1500 = 4500
MAX_COMPUTE_UNITS = 5000
4500 < 5000
```

Do not cite `4,120` CU. This report does not re-run Devnet. The
number the tests lock is **4,500** host-metered CU.

Packed MppSettle (113 bytes, discriminator included):

```
[0]        disc = 26
[1..9]     units_consumed        u64 LE
[9..41]    artifact_root         [u8; 32]
[41..49]   settlement_seq        u64 LE
[49..81]   capture_signature     [u8; 32]
[81..113]  request_hash          [u8; 32]
```

Packed OpenPaymentStream (30 bytes):

```
[0]        disc = 24
[1]        bump
[2..10]    max_total_micro_usdc
[10..18]   cost_per_unit_micro_usdc
[18..26]   max_rate_usd_per_min_bits
[26..30]   settlement_interval_secs
```

`process_instruction` calls `assert_instruction_envelope` before any
handler. `assert_stream_pda` derives
`["agent_payment_stream", agent, owner, bump]` via
`create_program_address`. `settle_with_cu_budget` charges the four
honest steps first and returns the pre-image `StreamSnap` on any CU
trip — spent/escrow are not written on the failure path.

Source: `src/programs/keyshield/src/session_guard.rs`,
`src/programs/keyshield/src/guards.rs` (`assert_stream_pda`),
`src/programs/keyshield/src/instructions/mpp_settle.rs`
(TransferChecked + settler check).

### 3.2 Host/WASM — secrecy, zeroize, atomic quota

```toml
# src/session-engine/Cargo.toml
[dependencies]
digest = "0.10.7"
hmac = "0.12.1"
secrecy = "0.8.0"
sha2 = "0.10.8"
subtle = "2.6.1"
zeroize = { version = "1.8.1", features = ["derive"] }
```

`SessionKey` wraps `secrecy::Secret<KeyBytes>` where `KeyBytes: Zeroize`.
Debug is `[REDACTED]`. Drop swaps in an empty secret so the previous
vector is zeroized. HMAC matches `src/backend/mpp/capture.py`:

```
HMAC-SHA256(session_token_utf8, artifact_hash[32])
```

Locked vector (`ks-session-consumer` / `bytes(range(32))`):

```
e73c7053ebba0e2e811867cfb36abe5bb4ad03b8b667b956cc71561f57cbd08a
```

`QuotaLedger` is the only type that can increment `settled`, and only
via `capture` after a verified hold. `Engine::verify` maps:

- `RpcOutcome::Indeterminate` → `EngineError::Indeterminate`, hold
  remains, settled unchanged
- `RpcOutcome::Failed` → rollback + consume digest
- `RpcOutcome::Confirmed | Stub` → capture + consume digest

Source: `src/session-engine/src/{keys,quota,hvc}.rs`.

### 3.3 Idempotency — SHA-256 context digest

```
SHA-256(
  "ks.hvc.ctx.v1" || 0x00 ||
  program_id ||
  u32_le(len(ix)) || ix ||
  u64_le(stream_id) ||
  artifact_hash ||
  u64_le(nonce)
)
```

The on-chain program keeps portable **FNV-1a** in
`session_guard::context_digest` so host tests do not need
`sol_sha256`. The host engine uses SHA-256. They are different
functions on purpose; do not mix them. Neither is the Anchor
framework.

A consumed or still-live digest cannot `hold` again (`EngineError::Replay`).
That is the session guard: the complete payload + context, not the
signature alone.

Source: `src/session-engine/src/context.rs`.

### 3.4 TypeScript (DOM only)

`src/extension/dom-intent.js` refuses untrusted events, prototype
keys, and non-integer micro-USDC, then compares DOM program id /
units to compiled KeyShield ix 24/25/26. It does not implement HMAC,
quota, or context digests.

---

## 4. Verification Metrics & Audit Ledger

### Fail-to-pass

| Surface | Before | After | Harness |
|---------|--------|-------|---------|
| Empty / truncated ix | Could be session-signed | `InvalidInstructionData` / `InvalidEnvelope` | `scvd_session_desync.rs`, `ks-session-engine` |
| RPC timeout | Cached `failed`, possible orphan on-chain debit | `indeterminate`, no settled++, retry ok | `test_scvd_settlement.py`, `invariants.rs` |
| DOM–wire split | `parseFloat` auto-pay | Canonical µUSDC + `isTrusted` | `tests/scvd_dom_intent.test.ts` |
| PRF/HKDF residue | bits/`sigBytes` survived failure | `finally` wipe + nonce lock | `tests/scvd_prf_lifecycle.test.ts` |
| CU trip | Dirty spent/escrow possible | Snapshot rollback | `settle_with_cu_budget` |
| Replay | Second hold on same body | `NonceReused` / `Replay` | Python + host engine |
| Python HMAC | n/a | Vector `e73c7053…d08a` | `python_hmac_matches_capture_py` |

### Compute units

| Meter | Value | Status |
|-------|-------|--------|
| Host honest path | **4,500 CU** | `assert_eq!(meter.used, 4_500)` |
| Hard cap | **5,000 CU** | `assert!(used < MAX_COMPUTE_UNITS)` |
| Invented 4,120 | — | **not used** |

```
HONEST_SETTLE_CU = 200 + 800 + 2_000 + 1_500 = 4_500
```

### Invariant checklist

| Invariant | Proof |
|-----------|--------|
| Zero unhandled panics | `catch_unwind` over 12,000 LCG-driven hold / indeterminate / confirm / fail / rollback ops |
| Zero orphan debits | `settled == captured_sum` and `available + held + settled == endowment` after every op |
| Zero conservation breaks | `QuotaLedger::assert_conserved` on hold, capture, rollback |
| Zero memory leaks (holds) | `live_holds() == open.len()` at fuzz end; no Rc cycles; `SessionKey` drop zeroizes |
| Timeout does not debit | `verify(..., Indeterminate)` leaves `settled == 0` |
| Bad MAC does not debit | `InvalidSignature`, held unchanged, settled == 0 |
| SHA-256 guard binds context | Any field change moves the digest; replay of the same tuple is `Replay` |

### Commands

```bash
cargo test -p keyshield --test scvd_session_desync --lib
cargo test --manifest-path src/session-engine/Cargo.toml
pytest src/backend/tests/test_scvd_settlement.py
npx vitest run tests/scvd_dom_intent.test.ts tests/scvd_prf_lifecycle.test.ts
```

GitNexus `run.cjs` is not in this checkout (`.gitnexus/meta.json`
only). Impact was recorded by call-site read: new crate has no
existing callers (MEDIUM). `assert_instruction_envelope` callers are
`process_instruction` and the SCVD tests; layout parsers are additive.
`settle_on_chain` / `_capture_locked` were not changed in the host-engine
turn.
