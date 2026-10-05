# 07 — On-chain programs, balances, and settlement

[← repository index](../README.md)

Category purpose: On-chain programs, balances, and settlement.
Indexed files: **37**.

## Key entrypoints

- [`docs/DEVNET.md`](../../DEVNET.md) — On-chain program, MPP settlement, or Devnet operator script.
- [`scripts/live_e2e_run.ts`](../../../scripts/live_e2e_run.ts) — On-chain program, MPP settlement, or Devnet operator script.
- [`scripts/live_e2e_setup.ts`](../../../scripts/live_e2e_setup.ts) — On-chain program, MPP settlement, or Devnet operator script.
- [`scripts/run_devnet_zk_vault.ts`](../../../scripts/run_devnet_zk_vault.ts) — On-chain program, MPP settlement, or Devnet operator script.
- [`scripts/upgrade_devnet_program.sh`](../../../scripts/upgrade_devnet_program.sh) — On-chain program, MPP settlement, or Devnet operator script.

## Related modules

03, 09, 12

## Existing documentation and tests

- Docs: [keyshield.md](../../../keyshield.md), [docs/DEVNET.md](../../DEVNET.md)
- Tests: [tests/bankrun_security.test.ts](../../../tests/bankrun_security.test.ts), [tests/fuzz_invariants.rs](../../../tests/fuzz_invariants.rs)

## Uncertainties

zk-vault ixs 40–43 are in source and not on the current Devnet allocation.

Full inventory with type/notes: [FILE_INDEX.md](FILE_INDEX.md).

## File / directory index

| ID | original relative path | purpose | related categories | evidence | verification status |
|---|---|---|---|---|---|
| `KS-07-001` | [`docs/DEVNET.md`](../../DEVNET.md) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-002` | [`scripts/live_e2e_run.ts`](../../../scripts/live_e2e_run.ts) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-003` | [`scripts/live_e2e_setup.ts`](../../../scripts/live_e2e_setup.ts) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-004` | [`scripts/run_devnet_zk_vault.ts`](../../../scripts/run_devnet_zk_vault.ts) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-005` | [`scripts/upgrade_devnet_program.sh`](../../../scripts/upgrade_devnet_program.sh) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-006` | [`src/backend/mpp/__init__.py`](../../../src/backend/mpp/__init__.py) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-007` | [`src/backend/mpp/capture.py`](../../../src/backend/mpp/capture.py) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-008` | [`src/backend/mpp/fulfillment.py`](../../../src/backend/mpp/fulfillment.py) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-009` | [`src/backend/mpp/mpp_onchain.py`](../../../src/backend/mpp/mpp_onchain.py) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-010` | [`src/backend/mpp/mpp_streams.py`](../../../src/backend/mpp/mpp_streams.py) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-011` | [`src/backend/mpp/owner_keystore.py`](../../../src/backend/mpp/owner_keystore.py) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-012` | [`src/backend/mpp/owner_submit.py`](../../../src/backend/mpp/owner_submit.py) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-013` | [`src/programs/keyshield/Cargo.toml`](../../../src/programs/keyshield/Cargo.toml) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-014` | [`src/programs/keyshield/src/ed25519_bind.rs`](../../../src/programs/keyshield/src/ed25519_bind.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-015` | [`src/programs/keyshield/src/error.rs`](../../../src/programs/keyshield/src/error.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-016` | [`src/programs/keyshield/src/guards.rs`](../../../src/programs/keyshield/src/guards.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-017` | [`src/programs/keyshield/src/instructions/access_key.rs`](../../../src/programs/keyshield/src/instructions/access_key.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-018` | [`src/programs/keyshield/src/instructions/agent_access.rs`](../../../src/programs/keyshield/src/instructions/agent_access.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-019` | [`src/programs/keyshield/src/instructions/clawback.rs`](../../../src/programs/keyshield/src/instructions/clawback.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-020` | [`src/programs/keyshield/src/instructions/mod.rs`](../../../src/programs/keyshield/src/instructions/mod.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-021` | [`src/programs/keyshield/src/instructions/mpp_settle.rs`](../../../src/programs/keyshield/src/instructions/mpp_settle.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-022` | [`src/programs/keyshield/src/instructions/open_stream.rs`](../../../src/programs/keyshield/src/instructions/open_stream.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-023` | [`src/programs/keyshield/src/instructions/pay_x402.rs`](../../../src/programs/keyshield/src/instructions/pay_x402.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-024` | [`src/programs/keyshield/src/instructions/payment_stream.rs`](../../../src/programs/keyshield/src/instructions/payment_stream.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-025` | [`src/programs/keyshield/src/instructions/revocation.rs`](../../../src/programs/keyshield/src/instructions/revocation.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-026` | [`src/programs/keyshield/src/instructions/share_key.rs`](../../../src/programs/keyshield/src/instructions/share_key.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-027` | [`src/programs/keyshield/src/instructions/store_key.rs`](../../../src/programs/keyshield/src/instructions/store_key.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-028` | [`src/programs/keyshield/src/instructions/universal_vault.rs`](../../../src/programs/keyshield/src/instructions/universal_vault.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-029` | [`src/programs/keyshield/src/instructions/withdraw.rs`](../../../src/programs/keyshield/src/instructions/withdraw.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-030` | [`src/programs/keyshield/src/instructions/zk_vault.rs`](../../../src/programs/keyshield/src/instructions/zk_vault.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-031` | [`src/programs/keyshield/src/lib.rs`](../../../src/programs/keyshield/src/lib.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-032` | [`src/programs/keyshield/src/pda.rs`](../../../src/programs/keyshield/src/pda.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-033` | [`src/programs/keyshield/src/state.rs`](../../../src/programs/keyshield/src/state.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-034` | [`src/programs/keyshield/src/zk_verify.rs`](../../../src/programs/keyshield/src/zk_verify.rs) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-035` | [`src/web/lib/mpp-capture.ts`](../../../src/web/lib/mpp-capture.ts) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-036` | [`src/web/lib/mpp-wallet-open.ts`](../../../src/web/lib/mpp-wallet-open.ts) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
| `KS-07-037` | [`src/web/lib/solana.ts`](../../../src/web/lib/solana.ts) | On-chain program, MPP settlement, or Devnet operator script. | 03, 09 | path + filename (static) | statically inspected; runtime status not verified |
