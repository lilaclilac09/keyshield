//! Mollusk integration tests for StoreKey instruction.
//!
//! Run from workspace root: `cargo build-sbf && SBF_OUT_DIR=target/deploy cargo test -p keyshield store_key`

mod common;

use common::{program_id, set_sbf_out_dir, vault_pda};
use keyshield::state::Vault;
use mollusk_svm::{
    program::keyed_account_for_system_program,
    result::Check,
    Mollusk,
};
use solana_sdk::{
    account::{AccountSharedData, WritableAccount},
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program,
};

/// Pulled from the program's own type so this can never drift again.
/// (Was previously hardcoded to 288, which stopped matching when the
/// Vault layout grew to its current size — see commit history.)
const VAULT_SIZE: usize = Vault::SIZE;

/// Vault discriminator — must match `state::Vault::DISCRIMINATOR`.
const VAULT_DISCRIMINATOR: [u8; 8] = *b"keyshld\0";

/// Build a vault account that's already been through CreateAccount —
/// program-owned, Vault::SIZE bytes, initialised header.
///
/// We don't exercise the CreateAccount CPI here because Mollusk doesn't
/// fully simulate the data-length resize that pinocchio's CreateAccount
/// performs (the post-CPI buffer length disagrees with what the program
/// expects). The real CreateAccount path is exercised by devnet
/// integration tests; here we focus on the store-key add logic.
fn uninitialized_vault_account() -> AccountSharedData {
    let mut data = vec![0u8; VAULT_SIZE];
    AccountSharedData::create(1_000_000, data, program_id(), false, 0)
}

fn initialised_vault_account(owner: &Pubkey) -> AccountSharedData {
    let mut data = vec![0u8; VAULT_SIZE];
    data[0..8].copy_from_slice(&VAULT_DISCRIMINATOR);
    data[8..40].copy_from_slice(owner.as_ref());
    AccountSharedData::create(1_000_000, data, program_id(), false, 0)
}

/// Wire format for the StoreKey ix (discriminator 0).
///
/// The program previously consumed `encrypted_key_hash + zk_commit +
/// mpc_hash + timestamp + key_type + vault_bump`. The current handler in
/// `instructions/store_key.rs:32-67` only reads `encrypted_key_hash +
/// timestamp + key_type + vault_bump` (42 bytes after the discriminator),
/// having dropped per-key zk_commit and mpc_hash. The old test signature
/// is preserved here as a no-op so the call sites don't churn.
fn build_store_key_data(
    encrypted_key_hash: [u8; 32],
    _zk_commit: [u8; 32],
    _mpc_hash: [u8; 32],
    timestamp: u64,
    key_type: u8,
    vault_bump: u8,
) -> Vec<u8> {
    let mut data = vec![0u8]; // discriminator StoreKey = 0
    data.extend_from_slice(&encrypted_key_hash);
    data.extend_from_slice(&timestamp.to_le_bytes());
    data.push(key_type);
    data.push(vault_bump);
    data
}

#[test]
fn test_store_key_success() {
    set_sbf_out_dir();

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let (vault_pda, vault_bump) = vault_pda(&owner);

    let owner_lamports = 10_000_000;
    let owner_account = AccountSharedData::new(owner_lamports, 0, &system_program::id());

    let vault_account = initialised_vault_account(&owner);

    let data = build_store_key_data(
        [1u8; 32],
        [2u8; 32],
        [3u8; 32],
        0,
        0,
        vault_bump,
    );

    let instruction = Instruction::new_with_bytes(
        program_id,
        &data,
        vec![
            AccountMeta::new(owner, true),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let accounts = [
        (owner, owner_account),
        (vault_pda, vault_account),
        keyed_account_for_system_program(),
    ];

    let result = mollusk.process_and_validate_instruction(
        &instruction,
        &accounts,
        &[Check::success()],
    );

    assert!(!result.program_result.is_err());
}

#[test]
fn test_store_key_double_init_fails() {
    set_sbf_out_dir();

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let (vault_pda, vault_bump) = vault_pda(&owner);

    let owner_lamports = 10_000_000;
    let owner_account = AccountSharedData::new(owner_lamports, 0, &system_program::id());
    let vault_account = initialised_vault_account(&owner);

    let data = build_store_key_data(
        [1u8; 32],
        [2u8; 32],
        [3u8; 32],
        0,
        0,
        vault_bump,
    );

    let instruction = Instruction::new_with_bytes(
        program_id,
        &data,
        vec![
            AccountMeta::new(owner, true),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let accounts = [
        (owner, owner_account.clone()),
        (vault_pda, vault_account),
        keyed_account_for_system_program(),
    ];

    let result = mollusk.process_instruction(&instruction, &accounts);
    assert!(
        !result.program_result.is_err(),
        "first StoreKey should succeed, got {:?}",
        result.program_result
    );

    let resulting = result.resulting_accounts;
    let owner_after = resulting.iter().find(|(k, _)| *k == owner).map(|(_, a)| a.clone()).unwrap();
    let vault_after = resulting.iter().find(|(k, _)| *k == vault_pda).map(|(_, a)| a.clone()).unwrap();
    let sys_after = resulting.iter().find(|(k, _)| *k == system_program::id()).map(|(_, a)| a.clone()).unwrap();

    let second_instruction = Instruction::new_with_bytes(
        program_id,
        &data,
        vec![
            AccountMeta::new(owner, true),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let accounts_2 = [
        (owner, owner_after),
        (vault_pda, vault_after),
        (system_program::id(), sys_after),
    ];

    mollusk.process_and_validate_instruction(
        &second_instruction,
        &accounts_2,
        &[Check::err(ProgramError::Custom(6007))],
    );
}

#[test]
fn test_store_key_owner_must_be_signer() {
    set_sbf_out_dir();

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let (vault_pda, vault_bump) = vault_pda(&owner);

    let owner_account = AccountSharedData::new(10_000_000, 0, &system_program::id());
    let vault_account = initialised_vault_account(&owner);

    let data = build_store_key_data(
        [1u8; 32],
        [2u8; 32],
        [3u8; 32],
        0,
        0,
        vault_bump,
    );

    let instruction = Instruction::new_with_bytes(
        program_id,
        &data,
        vec![
            AccountMeta::new(owner, false),
            AccountMeta::new(vault_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let accounts = [
        (owner, owner_account),
        (vault_pda, vault_account),
        keyed_account_for_system_program(),
    ];

    mollusk.process_and_validate_instruction(
        &instruction,
        &accounts,
        &[Check::err(ProgramError::Custom(6000))],
    );
}
