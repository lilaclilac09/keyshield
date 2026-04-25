//! Mollusk integration tests for ShareKey instruction.
//! Run from workspace root: `cargo build-sbf && SBF_OUT_DIR=target/deploy cargo test -p keyshield share_key`

mod common;

use common::{program_id, set_sbf_out_dir, share_pda, vault_pda};
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

const VAULT_DISCRIMINATOR: [u8; 8] = *b"keyshld\0";

fn make_initialized_vault_account(owner: &Pubkey) -> AccountSharedData {
    let mut data = vec![0u8; Vault::SIZE];
    data[0..8].copy_from_slice(&VAULT_DISCRIMINATOR);
    data[8..40].copy_from_slice(owner.as_ref());
    AccountSharedData::create(1_000_000, data, program_id(), false, 0)
}

#[test]
fn test_share_key_owner_succeeds() {
    set_sbf_out_dir();

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let recipient = Pubkey::new_unique();
    let (vault_pda, _) = vault_pda(&owner);
    let (share_pda, share_bump) = share_pda(&vault_pda, &recipient);

    let owner_account = AccountSharedData::new(10_000_000, 0, &system_program::id());
    let vault_account = make_initialized_vault_account(&owner);
    // Share PDA must have 64 bytes so program can write vault + recipient
    let share_account = AccountSharedData::create(
        1_000_000,
        vec![0u8; 64],
        program_id,
        false,
        0,
    );
    let recipient_account = AccountSharedData::default();

    let mut data = vec![2u8];
    data.extend_from_slice(recipient.as_ref());
    data.extend_from_slice(&0u64.to_le_bytes());
    data.push(share_bump);

    let instruction = Instruction::new_with_bytes(
        program_id,
        &data,
        vec![
            AccountMeta::new(owner, true),
            AccountMeta::new_readonly(vault_pda, false),
            AccountMeta::new(share_pda, false),
            AccountMeta::new_readonly(recipient, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let accounts = [
        (owner, owner_account),
        (vault_pda, vault_account),
        (share_pda, share_account),
        (recipient, recipient_account),
        keyed_account_for_system_program(),
    ];

    mollusk.process_and_validate_instruction(&instruction, &accounts, &[Check::success()]);
}

#[test]
fn test_share_key_non_owner_fails() {
    set_sbf_out_dir();

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let non_owner = Pubkey::new_unique();
    let recipient = Pubkey::new_unique();
    let (vault_pda, _) = vault_pda(&owner);
    let (share_pda, share_bump) = share_pda(&vault_pda, &recipient);

    let non_owner_account = AccountSharedData::new(10_000_000, 0, &system_program::id());
    let vault_account = make_initialized_vault_account(&owner);
    let share_account = AccountSharedData::default();
    let recipient_account = AccountSharedData::default();

    let mut data = vec![2u8];
    data.extend_from_slice(recipient.as_ref());
    data.extend_from_slice(&0u64.to_le_bytes());
    data.push(share_bump);

    let instruction = Instruction::new_with_bytes(
        program_id,
        &data,
        vec![
            AccountMeta::new(non_owner, true),
            AccountMeta::new_readonly(vault_pda, false),
            AccountMeta::new(share_pda, false),
            AccountMeta::new_readonly(recipient, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
    );

    let accounts = [
        (non_owner, non_owner_account),
        (vault_pda, vault_account),
        (share_pda, share_account),
        (recipient, recipient_account),
        keyed_account_for_system_program(),
    ];

    mollusk.process_and_validate_instruction(
        &instruction,
        &accounts,
        &[Check::err(ProgramError::Custom(6000))],
    );
}
