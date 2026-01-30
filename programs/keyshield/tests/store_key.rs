//! Mollusk integration tests for StoreKey instruction.
//!
//! Run from workspace root: `cargo build-sbf && SBF_OUT_DIR=target/deploy cargo test -p keyshield store_key`

mod common;

use common::{program_id, vault_pda};
use mollusk_svm::{
    program::keyed_account_for_system_program,
    result::Check,
    Mollusk,
};
use solana_sdk::{
    account::AccountSharedData,
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program,
};

fn build_store_key_data(
    encrypted_key_hash: [u8; 32],
    zk_commit: [u8; 32],
    mpc_hash: [u8; 32],
    timestamp: u64,
    key_type: u8,
    vault_bump: u8,
) -> Vec<u8> {
    let mut data = vec![0u8]; // discriminator StoreKey = 0
    data.extend_from_slice(&encrypted_key_hash);
    data.extend_from_slice(&zk_commit);
    data.extend_from_slice(&mpc_hash);
    data.extend_from_slice(&timestamp.to_le_bytes());
    data.push(key_type);
    data.push(vault_bump);
    data
}

#[test]
fn test_store_key_success() {
    std::env::set_var("SBF_OUT_DIR", "target/deploy");

    let program_id = program_id();
    let mut mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let (vault_pda, vault_bump) = vault_pda(&owner);

    let owner_lamports = 10_000_000;
    let owner_account = AccountSharedData::new(owner_lamports, 0, &system_program::id());

    let vault_account = AccountSharedData::default();

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

    assert!(result.program_result.is_ok());
}

#[test]
fn test_store_key_double_init_fails() {
    std::env::set_var("SBF_OUT_DIR", "target/deploy");

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let (vault_pda, vault_bump) = vault_pda(&owner);

    let owner_lamports = 10_000_000;
    let owner_account = AccountSharedData::new(owner_lamports, 0, &system_program::id());
    let vault_account = AccountSharedData::default();

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
    assert!(result.program_result.is_ok());

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
    std::env::set_var("SBF_OUT_DIR", "target/deploy");

    let program_id = program_id();
    let mut mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let (vault_pda, vault_bump) = vault_pda(&owner);

    let owner_account = AccountSharedData::new(10_000_000, 0, &system_program::id());
    let vault_account = AccountSharedData::default();

    let data = build_store_key_data(
        [1u8; 32],
        [2u8; 32],
        [3u8; 32],
        0,
        0,
        vault_bump,
    );

    let mut instruction = Instruction::new_with_bytes(
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
