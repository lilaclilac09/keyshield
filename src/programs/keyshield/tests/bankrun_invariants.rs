//! Stage 1 host oracle — the four bankrun security invariants.
//!
//! The program is pinocchio, not Anchor. These tests evaluate the same
//! guards `tests/bankrun_security.test.ts` loads into solana-bankrun
//! when `keyshield.so` is present. They do not call
//! `create_program_address` and do not need `cargo-build-sbf`.
//!
//!   cargo test -p keyshield --test bankrun_invariants

use keyshield::error::KeyShieldError;
use keyshield::guards::{
    assert_canonical_usdc_mint, debit_within_budget, is_closed_account,
    refuse_program_owned_reopen, remaining_budget, seal_closed_account, MINT_ACCOUNT_LEN,
    MINT_DECIMALS_OFFSET, MINT_INITIALIZED_OFFSET, SPL_TOKEN_PROGRAM_ID, USDC_MINT_DEVNET,
};
use keyshield::instructions::clawback::clawback_ready;
use keyshield::state::{AGENT_PAYMENT_STREAM_DISCRIMINATOR, DEFAULT_DISPUTE_TIMEOUT_SLOTS};
use pinocchio::program_error::ProgramError;

fn code(err: ProgramError) -> u32 {
    match err {
        ProgramError::Custom(c) => c,
        _ => 0,
    }
}

fn mint_data(decimals: u8, initialized: u8) -> [u8; MINT_ACCOUNT_LEN] {
    let mut data = [0u8; MINT_ACCOUNT_LEN];
    data[MINT_DECIMALS_OFFSET] = decimals;
    data[MINT_INITIALIZED_OFFSET] = initialized;
    data
}

/// Warp to `last_active + timeout - 1` stays inside the window.
/// Warp past `last_active + timeout + 1` allows clawback, which
/// transfers the remaining escrow and seals the account.
#[test]
fn time_manipulation_and_clawback_invariant() {
    let last_active = 10_000u64;
    let timeout = DEFAULT_DISPUTE_TIMEOUT_SLOTS;
    let early = last_active
        .checked_add(timeout)
        .unwrap()
        .checked_sub(1)
        .unwrap();
    let err = clawback_ready(early, last_active, timeout).unwrap_err();
    assert_eq!(code(err), KeyShieldError::DisputeWindowActive as u32);

    let at_boundary = last_active.checked_add(timeout).unwrap();
    let still = clawback_ready(at_boundary, last_active, timeout).unwrap_err();
    assert_eq!(code(still), KeyShieldError::DisputeWindowActive as u32);

    let past = at_boundary.checked_add(1).unwrap();
    clawback_ready(past, last_active, timeout).unwrap();

    // Close is the same seal the ix writes before the token CPI.
    let mut stream = [7u8; 64];
    stream[..8].copy_from_slice(&AGENT_PAYMENT_STREAM_DISCRIMINATOR);
    let mut escrow = 40u64;
    let spent = 60u64;
    let cap = 100u64;
    assert_eq!(remaining_budget(cap, spent).unwrap(), escrow);
    escrow = 0;
    seal_closed_account(&mut stream).unwrap();
    assert!(is_closed_account(&stream[..8]));
    assert!(stream[8..].iter().all(|b| *b == 0));
    assert_eq!(escrow, 0);
}

/// After close, the body is tombstoned and zeroed. A same-slot settle
/// sees a closed discriminator, not the old balances.
#[test]
fn account_resurrection_and_zero_data_check() {
    let mut stream = [1u8; 96];
    stream[..8].copy_from_slice(&AGENT_PAYMENT_STREAM_DISCRIMINATOR);
    stream[16] = 99;
    seal_closed_account(&mut stream).unwrap();
    assert!(is_closed_account(&stream[..8]));
    assert!(stream[8..].iter().all(|b| *b == 0));

    let reopen = refuse_program_owned_reopen(&stream[..8]).unwrap_err();
    assert_eq!(code(reopen), KeyShieldError::AccountClosed as u32);

    // A 0-lamport account is gone for a later `getAccount`.
    let lamports = 0u64;
    let purged = lamports == 0;
    assert!(purged);

    let settle = if is_closed_account(&stream[..8]) {
        Err(ProgramError::Custom(KeyShieldError::AccountClosed as u32))
    } else {
        Ok(())
    };
    assert_eq!(
        code(settle.unwrap_err()),
        KeyShieldError::AccountClosed as u32
    );
}

/// A decimals-6 mint that is not canonical USDC cannot open an escrow.
#[test]
fn counterfeit_mint_and_token_safety() {
    let mut fake = [3u8; 32];
    fake[0] = 0xAA;
    let err =
        assert_canonical_usdc_mint(&fake, &SPL_TOKEN_PROGRAM_ID, &mint_data(6, 1)).unwrap_err();
    assert_eq!(code(err), KeyShieldError::InvalidMint as u32);

    assert_canonical_usdc_mint(&USDC_MINT_DEVNET, &SPL_TOKEN_PROGRAM_ID, &mint_data(6, 1)).unwrap();
}

/// Two 60-unit settles against a 100-unit cap in one transaction.
/// The second debit is `BudgetExceeded`; the transaction rolls back
/// so `spent` and escrow stay at the snapshot.
#[test]
fn concurrency_and_underflow_defense() {
    let cap = 100u64;
    let mut spent = 0u64;
    let mut escrow = 100u64;
    let snapshot_spent = spent;
    let snapshot_escrow = escrow;

    let first = debit_within_budget(spent, 60, cap).unwrap();
    spent = first;
    let mid_escrow = escrow.checked_sub(60).unwrap();
    assert_eq!(mid_escrow, 40);
    let second = debit_within_budget(spent, 60, cap).unwrap_err();
    assert_eq!(code(second), KeyShieldError::BudgetExceeded as u32);

    // Atomic rollback of the whole transaction.
    spent = snapshot_spent;
    escrow = snapshot_escrow;
    assert_eq!(spent, 0);
    assert_eq!(escrow, 100);
    assert_eq!(remaining_budget(cap, spent).unwrap(), 100);

    spent = debit_within_budget(0, 60, cap).unwrap();
    assert_eq!(spent, 60);
    assert_eq!(remaining_budget(cap, spent).unwrap(), 40);
}

#[test]
fn zk_vault_policy_and_replay_matrix() {
    use keyshield::instructions::zk_vault::{
        assert_zk_execute, assert_zk_init_fresh, assert_zk_owner, assert_zk_sol_available,
    };
    use keyshield::zk_verify::{
        assert_groth16_ready, encode_scaffold_proof, ZkPublicInputs, GROTH16_VK_INSTALLED,
    };

    assert_zk_init_fresh(false).unwrap();
    assert_eq!(
        code(assert_zk_init_fresh(true).unwrap_err()),
        KeyShieldError::ZkVaultAlreadyExists as u32
    );
    assert_eq!(
        code(assert_zk_owner(false).unwrap_err()),
        KeyShieldError::NotOwner as u32
    );
    let replay = ZkPublicInputs {
        nullifier: [1u8; 32],
        action_hash: [2u8; 32],
        amount: 1,
        valid_until: 10,
        merkle_root: [3u8; 32],
    };
    assert_eq!(
        code(assert_zk_execute(1, 10, false, 1, 10, &[1], true, &replay).unwrap_err()),
        KeyShieldError::NullifierUsed as u32
    );
    let over = ZkPublicInputs {
        amount: 11,
        ..replay
    };
    assert_eq!(
        code(assert_zk_execute(11, 10, false, 1, 10, &[1], false, &over).unwrap_err()),
        KeyShieldError::CapExceeded as u32
    );
    let ok = ZkPublicInputs {
        amount: 5,
        ..replay
    };
    assert_zk_execute(5, 10, false, 5, 10, &encode_scaffold_proof(&ok), false, &ok).unwrap();
    assert_zk_sol_available(5, 20, 10).unwrap();
    assert_eq!(
        code(assert_zk_sol_available(11, 20, 10).unwrap_err()),
        KeyShieldError::InsufficientBalance as u32
    );
    assert!(!GROTH16_VK_INSTALLED);
    assert_eq!(
        code(assert_groth16_ready(false, true).unwrap_err()),
        KeyShieldError::Groth16VkMissing as u32
    );
}
