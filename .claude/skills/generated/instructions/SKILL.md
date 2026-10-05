---
name: instructions
description: "Skill for the Instructions area of keyshield. 65 symbols across 15 files."
---

# Instructions

65 symbols | 15 files | Cohesion: 68%

## When to Use

- Working with code in `src/`
- Understanding how session_expired, process_access_key, process_grant_agent_access work
- Modifying instructions-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/programs/keyshield/src/instructions/mpp_settle.rs` | parse_settlement, parse_capture_signature, process_mpp_settle, payload_without_sequence_is_unverified, zero_sequence_is_replay (+12) |
| `src/programs/keyshield/src/guards.rs` | session_expired, is_closed_account, seal_closed_account, refuse_program_owned_reopen, assert_stream_pda (+9) |
| `src/programs/keyshield/src/instructions/revocation.rs` | revocation_bit, set_revocation_bit, assert_revocation_pda, process_set_revocation_bit, reject_revoked_session (+3) |
| `src/programs/keyshield/src/instructions/clawback.rs` | process_force_clawback, clawback_ready, equal_deadline_stays_inside_the_window, one_slot_past_the_window_is_ready, zero_timeout_uses_the_default (+1) |
| `src/programs/keyshield/src/instructions/agent_access.rs` | process_grant_agent_access, process_revoke_agent_access, process_access_with_agent, process_create_ephemeral_signer |
| `src/programs/keyshield/src/instructions/universal_vault.rs` | process_create_universal_vault, process_update_universal_policy, process_add_key_to_group, serialize_universal_vault |
| `src/programs/keyshield/src/instructions/payment_stream.rs` | process_grant_agent_payment_access, process_settle_payment, process_close_payment_stream |
| `src/programs/keyshield/tests/bankrun_invariants.rs` | time_manipulation_and_clawback_invariant, account_resurrection_and_zero_data_check |
| `src/programs/keyshield/src/instructions/access_key.rs` | process_access_key |
| `src/programs/keyshield/src/instructions/mod.rs` | try_from_u8 |

## Entry Points

Start here when exploring this area:

- **`session_expired`** (Function) — `src/programs/keyshield/src/guards.rs:254`
- **`process_access_key`** (Function) — `src/programs/keyshield/src/instructions/access_key.rs:22`
- **`process_grant_agent_access`** (Function) — `src/programs/keyshield/src/instructions/agent_access.rs:50`
- **`process_revoke_agent_access`** (Function) — `src/programs/keyshield/src/instructions/agent_access.rs:203`
- **`process_access_with_agent`** (Function) — `src/programs/keyshield/src/instructions/agent_access.rs:293`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `session_expired` | Function | `src/programs/keyshield/src/guards.rs` | 254 |
| `process_access_key` | Function | `src/programs/keyshield/src/instructions/access_key.rs` | 22 |
| `process_grant_agent_access` | Function | `src/programs/keyshield/src/instructions/agent_access.rs` | 50 |
| `process_revoke_agent_access` | Function | `src/programs/keyshield/src/instructions/agent_access.rs` | 203 |
| `process_access_with_agent` | Function | `src/programs/keyshield/src/instructions/agent_access.rs` | 293 |
| `process_create_ephemeral_signer` | Function | `src/programs/keyshield/src/instructions/agent_access.rs` | 442 |
| `try_from_u8` | Function | `src/programs/keyshield/src/instructions/mod.rs` | 59 |
| `process_grant_agent_payment_access` | Function | `src/programs/keyshield/src/instructions/payment_stream.rs` | 40 |
| `process_settle_payment` | Function | `src/programs/keyshield/src/instructions/payment_stream.rs` | 179 |
| `process_share_key` | Function | `src/programs/keyshield/src/instructions/share_key.rs` | 36 |
| `process_create_universal_vault` | Function | `src/programs/keyshield/src/instructions/universal_vault.rs` | 41 |
| `process_update_universal_policy` | Function | `src/programs/keyshield/src/instructions/universal_vault.rs` | 149 |
| `process_add_key_to_group` | Function | `src/programs/keyshield/src/instructions/universal_vault.rs` | 274 |
| `is_closed_account` | Function | `src/programs/keyshield/src/guards.rs` | 132 |
| `seal_closed_account` | Function | `src/programs/keyshield/src/guards.rs` | 140 |
| `refuse_program_owned_reopen` | Function | `src/programs/keyshield/src/guards.rs` | 204 |
| `assert_stream_pda` | Function | `src/programs/keyshield/src/guards.rs` | 219 |
| `process_force_clawback` | Function | `src/programs/keyshield/src/instructions/clawback.rs` | 64 |
| `process_open_payment_stream` | Function | `src/programs/keyshield/src/instructions/open_stream.rs` | 65 |
| `process_withdraw_agent_wallet` | Function | `src/programs/keyshield/src/instructions/withdraw.rs` | 53 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Process_instruction → From` | cross_community | 4 |
| `Process_instruction → Empty` | cross_community | 4 |
| `Process_instruction → KeyEntry` | cross_community | 4 |
| `Process_instruction → Vault` | cross_community | 4 |
| `Process_instruction → Serialize_vault` | cross_community | 3 |
| `Process_mpp_settle → Parse_artifact_root` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Tests | 17 calls |
| Cluster_216 | 2 calls |
| Cluster_208 | 1 calls |

## How to Explore

1. `context({name: "session_expired"})` — see callers and callees
2. `query({search_query: "instructions"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
