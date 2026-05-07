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

/// Vault account size — pulled from the live Vault::SIZE so the test
/// stays in sync with the layout. Was hardcoded `288` from V0.
const VAULT_SIZE: usize = Vault::SIZE;

/// Create an uninitialized vault account with 288 bytes so the program can Assign and write.
fn uninitialized_vault_account() -> AccountSharedData {
    AccountSharedData::create(
        1_000_000,
        vec![0u8; VAULT_SIZE],
        system_program::id(),
        false,
        0,
    )
}

/// Build the StoreKey instruction payload.
///
/// IMPORTANT: this layout must match what `process_store_key` reads
/// in src/instructions/store_key.rs. The handler was simplified to
/// drop the V0 `zk_commit` and `mpc_hash` fields (no longer per-key).
/// Sending the old 107-byte payload would cause the program to read
/// the bump from the wrong offset (byte 9 of zk_commit instead of
/// the real bump byte), which then produces a wrong PDA derivation
/// and a PrivilegeEscalation when the program calls
/// system_program::Assign with PDA-signed seeds.
fn build_store_key_data(
    encrypted_key_hash: [u8; 32],
    timestamp: u64,
    key_type: u8,
    vault_bump: u8,
) -> Vec<u8> {
    let mut data = vec![0u8]; // discriminator StoreKey = 0
    data.extend_from_slice(&encrypted_key_hash);     // 32 bytes
    data.extend_from_slice(&timestamp.to_le_bytes()); // 8 bytes
    data.push(key_type);                              // 1 byte
    data.push(vault_bump);                            // 1 byte
    // = 42 bytes after the discriminator
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

    let vault_account = uninitialized_vault_account();

    let data = build_store_key_data([1u8; 32], 0, 0, vault_bump);

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
    let vault_account = uninitialized_vault_account();

    let data = build_store_key_data([1u8; 32], 0, 0, vault_bump);

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
    let vault_account = uninitialized_vault_account();

    let data = build_store_key_data([1u8; 32], 0, 0, vault_bump);

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
