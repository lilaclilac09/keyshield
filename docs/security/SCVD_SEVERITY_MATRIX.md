# SCVD-style session desync — severity matrix

Fail-to-pass harnesses live in `tests/scvd_*.test.ts`,
`src/backend/tests/test_scvd_settlement.py`, and
`src/programs/keyshield/tests/scvd_session_desync.rs`.

| Sev | Vector (SCVD analog) | Failure mode | Affected files | Minimal architectural fix |
|-----|----------------------|--------------|----------------|---------------------------|
| **SEV-1** | BUY-005 stale cache / receipt-without-order | RPC timeout or mempool drop was logged as a hard `failed` settle attempt. The 60s idempotency window then returned `SettleOutcome(0, "failed")` without resubmitting. If the first tx later landed, funds moved while the ledger rolled back and the client prompted another session-key capture. | `src/backend/mpp/mpp_streams.py` (`settle_on_chain`, `_find_recent_attempt`, `_capture_locked`) | New `mode="indeterminate"` for timeout/503/drop. Do not cache-block retries. Capture raises `CaptureRejected("settlement indeterminate")` and **does not** decrement pending/held/settled. Retry may reconcile a landed root as `submitted`. |
| **SEV-1** | BUY-034 receipt without order | Empty instruction data, missing account metas, or uninitialized PDA seeds could be presented to a session signer as a payment. | `src/programs/keyshield/src/session_guard.rs`, `src/programs/keyshield/src/lib.rs` | `assert_instruction_envelope` at the program entrypoint. Reject empty / unknown / truncated OpenStream (30 B) and MppSettle (113 B) before any handler. |
| **SEV-2** | BUY-001 blank delivery / DOM–wire split | Extension x402 parser used `parseFloat` on `accepts[0]`. Null bytes, `1e20`, `Infinity`, prototype keys, spoofed events, empty instruction lists, or a System Program no-op could diverge from the compiled wire tx the session key signed. | `src/extension/dom-intent.js`, `src/extension/content.js`, `src/extension/manifest.json` | Canonical micro-USDC integer amounts only. Refuse `__proto__` / constructor keys. Compare DOM intent to compiled KeyShield program id + discriminator + units before any payment message. Malformed 402 bodies abort (no $0 auto-pay). |
| **SEV-2** | Volatile PRF / unzeroized HKDF | `deriveMasterKey` left HKDF `bits` live after AES import. Extension HKDF did not wipe caller `sigBytes` on failure. Parallel ceremonies reused the same context with no nonce lock. | `src/web/lib/vault.ts`, `src/web/lib/vault-key.ts`, `src/web/lib/prf-wipe.ts`, `packages/shared/src/lib/vault.ts` | Wipe `Uint8Array` views in `finally`. `acquireSignatureNonce(context)` refuses a second in-flight ceremony. `ks-proxy` still has no `zeroize`/`secrecy` crates — this is client-side wipe only. |
| **SEV-2** | CU mid-instruction orphan | A path that burned past 5,000 CU after a balance write would leave spent/escrow dirty if the host did not snapshot. | `src/programs/keyshield/src/session_guard.rs` | `settle_with_cu_budget` charges parse/PDA/Ed25519/transfer first. Any CU trip returns the pre-image `StreamSnap`. Honest path stays under 5,000 CU. |
| **SEV-2** | Pass-through CPI | A foreign program invoking `mpp_settle` without the recorded settler or canonical `["agent_payment_stream", agent, owner, bump]` PDA. | `src/programs/keyshield/src/session_guard.rs`, `src/programs/keyshield/src/guards.rs` (`assert_stream_pda`) | `assert_no_passthrough_cpi(settler_is_signer, pda_verified)` plus existing on-chain PDA + settler checks. |
| **SEV-3** | Idempotent replay vs new purchase | The same fulfillment body metered twice must not open a second hold. | `src/backend/mpp/mpp_streams.py` (`record_usage` unique artifact hash) | Unique `(stream_id, artifact_hash)` → `idempotent_replay`. Capture of a settled hash is `NonceReused`. Covered by `test_identical_meter_payload_is_idempotent_not_a_new_purchase`. |

## Invariants (must stay true)

1. A session-key HMAC never decrements `settled_micro_usdc` unless `settle_on_chain` returns `submitted` or stub-ledger `stub`.
2. Timeout ≠ debit. Timeout ≠ terminal cache poison.
3. DOM amount / program id must equal compiled ix bytes or the session key does not sign.
4. Intermediate PRF/HKDF bytes are wiped on both success and panic-equivalent `finally`.
5. Compute over 5,000 CU rolls back to the pre-instruction snapshot.
6. Settler-not-signer or unverified PDA cannot CPI-transfer escrow.
