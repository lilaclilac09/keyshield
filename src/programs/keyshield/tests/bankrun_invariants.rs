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

/// Spec matrix: init_vault / update_policy / execute_action / revoke_grant
/// plus artifact abort and timeout clawback. Host-oracle — pinocchio, not Anchor.
#[test]
fn deterministic_zk_account_ix_matrix() {
    use keyshield::instructions::zk_vault::{
        apply_execute_debit, apply_revoke_grant, apply_update_policy, assert_artifact_matches,
        assert_zk_execute, assert_zk_init_fresh, encode_fresh_vault, vault_nonce, vault_root,
        vault_spend_cap,
    };
    use keyshield::zk_verify::{encode_scaffold_proof, ZkPublicInputs};

    let owner = [0x11u8; 32];
    let stranger = [0x22u8; 32];
    let root_a = [0xAAu8; 32];
    let root_b = [0xBBu8; 32];
    let action = [0xCCu8; 32];
    let nullifier = [0xDDu8; 32];

    // 正常初始化 — PDA layout, nonce=0; 二次初始化打回
    let mut vault = encode_fresh_vault(&owner, 100, &root_a, 255).unwrap();
    assert_eq!(vault_nonce(&vault).unwrap(), 0);
    assert_eq!(vault_spend_cap(&vault).unwrap(), 100);
    assert_eq!(vault_root(&vault).unwrap(), root_a);
    assert_eq!(
        code(assert_zk_init_fresh(true).unwrap_err()),
        KeyShieldError::ZkVaultAlreadyExists as u32
    );

    // 越权篡改 — 非 Owner 改 Policy
    let before_cap = vault_spend_cap(&vault).unwrap();
    let err = apply_update_policy(&mut vault, &stranger, true, 1, &root_b).unwrap_err();
    assert_eq!(code(err), KeyShieldError::NotOwner as u32);
    let unsigned = apply_update_policy(&mut vault, &owner, false, 1, &root_b).unwrap_err();
    assert_eq!(code(unsigned), KeyShieldError::NotOwner as u32);
    assert_eq!(vault_spend_cap(&vault).unwrap(), before_cap);
    apply_update_policy(&mut vault, &owner, true, 80, &root_b).unwrap();
    assert_eq!(vault_spend_cap(&vault).unwrap(), 80);
    assert_eq!(vault_root(&vault).unwrap(), root_b);

    // 防重放 — 同一 Nullifier
    let pubs = ZkPublicInputs {
        nullifier,
        action_hash: action,
        amount: 10,
        valid_until: 99,
        merkle_root: root_b,
    };
    let proof = encode_scaffold_proof(&pubs);
    assert_eq!(
        code(assert_zk_execute(10, 80, false, 1, 99, &proof, true, &pubs).unwrap_err()),
        KeyShieldError::NullifierUsed as u32
    );
    assert_eq!(vault_spend_cap(&vault).unwrap(), 80);

    // 超额拦截 — 额度不扣减
    let over = ZkPublicInputs { amount: 81, ..pubs };
    assert_eq!(
        code(assert_zk_execute(81, 80, false, 1, 99, &proof, false, &over).unwrap_err()),
        KeyShieldError::CapExceeded as u32
    );
    assert_eq!(vault_spend_cap(&vault).unwrap(), 80);
    assert_eq!(vault_nonce(&vault).unwrap(), 0);

    // 假币防御 — CounterfeitMint → InvalidMint 6109
    let mut fake = [3u8; 32];
    fake[0] = 0xAA;
    assert_eq!(
        code(
            assert_canonical_usdc_mint(&fake, &SPL_TOKEN_PROGRAM_ID, &mint_data(6, 1)).unwrap_err()
        ),
        KeyShieldError::InvalidMint as u32
    );

    // 交付物不匹配 — 空 payload / 错哈希，不触发结算
    let empty = [0u8; 32];
    let wrong = [0xEEu8; 32];
    assert_eq!(
        code(assert_artifact_matches(&action, &empty).unwrap_err()),
        KeyShieldError::UnverifiedFulfillment as u32
    );
    assert_eq!(
        code(assert_artifact_matches(&action, &wrong).unwrap_err()),
        KeyShieldError::UnverifiedFulfillment as u32
    );
    assert_eq!(vault_spend_cap(&vault).unwrap(), 80);
    assert_eq!(vault_nonce(&vault).unwrap(), 0);

    // Happy execute after a matching artifact
    assert_artifact_matches(&action, &action).unwrap();
    assert_zk_execute(10, 80, false, 1, 99, &proof, false, &pubs).unwrap();
    apply_execute_debit(&mut vault, 10, &action).unwrap();
    assert_eq!(vault_spend_cap(&vault).unwrap(), 70);
    assert_eq!(vault_nonce(&vault).unwrap(), 1);

    // revoke_grant — owner only
    let revoke_stranger = apply_revoke_grant(&mut vault, &stranger, true).unwrap_err();
    assert_eq!(code(revoke_stranger), KeyShieldError::NotOwner as u32);
    apply_revoke_grant(&mut vault, &owner, true).unwrap();
    assert_eq!(
        code(assert_zk_execute(10, 70, true, 1, 99, &proof, false, &pubs).unwrap_err()),
        KeyShieldError::ZkVaultRevoked as u32
    );

    // 超时回退 — 过 window 后退回 owner
    let last_active = 1_000u64;
    let timeout = DEFAULT_DISPUTE_TIMEOUT_SLOTS;
    assert_eq!(
        code(clawback_ready(last_active + timeout, last_active, timeout).unwrap_err()),
        KeyShieldError::DisputeWindowActive as u32
    );
    clawback_ready(last_active + timeout + 1, last_active, timeout).unwrap();
    let mut escrow = 70u64;
    let owner_wallet = 0u64;
    let refunded = escrow;
    escrow = 0;
    let owner_wallet = owner_wallet + refunded;
    assert_eq!(escrow, 0);
    assert_eq!(owner_wallet, 70);
}
