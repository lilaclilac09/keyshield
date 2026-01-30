//! Mollusk integration tests for AccessKey instruction.
//! Run from workspace root: `cargo build-sbf && SBF_OUT_DIR=target/deploy cargo test -p keyshield access_key`

mod common;

use common::{program_id, set_sbf_out_dir, vault_pda};
use mollusk_svm::{result::Check, Mollusk};
use solana_sdk::{
    account::{AccountSharedData, WritableAccount},
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program,
};

const VAULT_DISCRIMINATOR: [u8; 8] = *b"keyshld\0";

fn make_initialized_vault_account(owner: &Pubkey) -> AccountSharedData {
    let mut data = vec![0u8; 288];
    data[0..8].copy_from_slice(&VAULT_DISCRIMINATOR);
    data[8..40].copy_from_slice(owner.as_ref());
    AccountSharedData::create(1_000_000, data, program_id(), false, 0)
}

#[test]
fn test_access_key_owner_succeeds() {
    set_sbf_out_dir();

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let (vault_pda, _) = vault_pda(&owner);

    let owner_account = AccountSharedData::new(10_000_000, 0, &system_program::id());
    let vault_account = make_initialized_vault_account(&owner);

    let instruction = Instruction::new_with_bytes(
        program_id,
        &[1u8],
        vec![
            AccountMeta::new_readonly(owner, true),
            AccountMeta::new_readonly(vault_pda, false),
        ],
    );

    let accounts = [
        (owner, owner_account),
        (vault_pda, vault_account),
    ];

    mollusk.process_and_validate_instruction(&instruction, &accounts, &[Check::success()]);
}

#[test]
fn test_access_key_non_owner_no_proof_fails() {
    set_sbf_out_dir();

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let requester = Pubkey::new_unique();
    let (vault_pda, _) = vault_pda(&owner);

    let requester_account = AccountSharedData::new(10_000_000, 0, &system_program::id());
    let vault_account = make_initialized_vault_account(&owner);

    // Discriminator 1 (AccessKey) only; handler receives empty data -> InvalidZKProof
    let instruction = Instruction::new_with_bytes(
        program_id,
        &[1u8],
        vec![
            AccountMeta::new_readonly(requester, true),
            AccountMeta::new_readonly(vault_pda, false),
        ],
    );

    let accounts = [
        (requester, requester_account),
        (vault_pda, vault_account),
    ];

    mollusk.process_and_validate_instruction(
        &instruction,
        &accounts,
        &[Check::err(ProgramError::Custom(6003))],
    );
}

#[test]
fn test_access_key_non_owner_with_proof_succeeds() {
    set_sbf_out_dir();

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let requester = Pubkey::new_unique();
    let (vault_pda, _) = vault_pda(&owner);

    let requester_account = AccountSharedData::new(10_000_000, 0, &system_program::id());
    let vault_account = make_initialized_vault_account(&owner);

    // Discriminator 1 (AccessKey) + non-empty proof placeholder so handler accepts
    let instruction = Instruction::new_with_bytes(
        program_id,
        &[1u8, 0u8],
        vec![
            AccountMeta::new_readonly(requester, true),
            AccountMeta::new_readonly(vault_pda, false),
        ],
    );

    let accounts = [
        (requester, requester_account),
        (vault_pda, vault_account),
    ];

    mollusk.process_and_validate_instruction(&instruction, &accounts, &[Check::success()]);
}
