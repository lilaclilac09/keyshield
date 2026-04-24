//! Mollusk integration tests for RevokeAllAgents instruction.
//!
//! Run from workspace root: `cargo build-sbf && SBF_OUT_DIR=target/deploy cargo test -p keyshield agent_access_revoke_all`

mod common;

use common::{program_id, set_sbf_out_dir, universal_vault_pda};
use mollusk_svm::{result::Check, Mollusk};
use solana_sdk::{
    account::{AccountSharedData, ReadableAccount, WritableAccount},
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
};

/// UniversalVault discriminator (must match state::UniversalVault::DISCRIMINATOR).
const UNIVERSAL_VAULT_DISCRIMINATOR: [u8; 8] = *b"univault";

/// UniversalVault total size (must match state::UniversalVault::SIZE).
const UNIVERSAL_VAULT_SIZE: usize = 18400;

/// Byte offsets inside UniversalVault.
const OFFSET_OWNER: usize = 8;
const OFFSET_UPDATED_AT: usize = 48;
const OFFSET_AGENT_GRANT_COUNT: usize = 61;
const OFFSET_AGENT_GRANTS_START: usize = 768;
const AGENT_GRANT_SIZE: usize = 128;

/// Build a UniversalVault account with `active_grant_count` active agent grants.
/// Each grant has a unique agent pubkey and `is_active = 1`.
fn make_universal_vault_with_grants(owner: &Pubkey, active_grant_count: u8) -> AccountSharedData {
    let mut data = vec![0u8; UNIVERSAL_VAULT_SIZE];

    // Discriminator and owner.
    data[0..8].copy_from_slice(&UNIVERSAL_VAULT_DISCRIMINATOR);
    data[OFFSET_OWNER..OFFSET_OWNER + 32].copy_from_slice(owner.as_ref());

    // agent_grant_count.
    data[OFFSET_AGENT_GRANT_COUNT] = active_grant_count;

    // Populate `active_grant_count` agent grants.
    for i in 0..active_grant_count as usize {
        let offset = OFFSET_AGENT_GRANTS_START + (i * AGENT_GRANT_SIZE);
        // Unique non-zero pubkey (the first byte = i + 1 makes the slot "occupied").
        let mut agent_pk = [0u8; 32];
        agent_pk[0] = (i as u8) + 1;
        data[offset..offset + 32].copy_from_slice(&agent_pk);
        // is_active at offset + 58.
        data[offset + 58] = 1;
    }

    AccountSharedData::create(1_000_000, data, program_id(), false, 0)
}

/// Build instruction data for RevokeAllAgents (discriminator 24, no payload).
fn build_revoke_all_data() -> Vec<u8> {
    vec![24u8]
}

#[test]
fn test_revoke_all_deactivates_every_grant() {
    set_sbf_out_dir();

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let (vault_pda, _bump) = universal_vault_pda(&owner);

    let owner_account = AccountSharedData::new(10_000_000, 0, &system_program::id());
    let vault_account = make_universal_vault_with_grants(&owner, 3);

    let instruction = Instruction::new_with_bytes(
        program_id,
        &build_revoke_all_data(),
        vec![
            AccountMeta::new_readonly(owner, true),
            AccountMeta::new(vault_pda, false),
        ],
    );

    let accounts = [(owner, owner_account), (vault_pda, vault_account)];

    let result = mollusk.process_and_validate_instruction(
        &instruction,
        &accounts,
        &[Check::success()],
    );

    // Find the resulting vault account and assert every grant is inactive.
    let resulting_vault = result
        .resulting_accounts
        .iter()
        .find(|(pk, _)| pk == &vault_pda)
        .expect("vault account in result")
        .1
        .clone();
    let vault_data = resulting_vault.data();

    // Count should have been reset to 0.
    assert_eq!(
        vault_data[OFFSET_AGENT_GRANT_COUNT], 0,
        "agent_grant_count should be 0 after revoke_all"
    );

    // Every previously-active grant should now have is_active = 0.
    for i in 0..3 {
        let offset = OFFSET_AGENT_GRANTS_START + (i * AGENT_GRANT_SIZE);
        assert_eq!(
            vault_data[offset + 58],
            0,
            "grant slot {i} should be deactivated"
        );
    }

    // updated_at should no longer be zero — proves Clock::get() was called
    // (P0 timestamp bug fix).
    let updated_at_bytes: [u8; 8] = vault_data[OFFSET_UPDATED_AT..OFFSET_UPDATED_AT + 8]
        .try_into()
        .unwrap();
    let updated_at = u64::from_le_bytes(updated_at_bytes);
    assert!(
        updated_at > 0,
        "updated_at should reflect Clock sysvar (was 0 before P0 fix)"
    );
}

#[test]
fn test_revoke_all_is_noop_on_empty_vault() {
    set_sbf_out_dir();

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let owner = Pubkey::new_unique();
    let (vault_pda, _) = universal_vault_pda(&owner);

    let owner_account = AccountSharedData::new(10_000_000, 0, &system_program::id());
    // Vault with 0 grants — revoke_all should still succeed.
    let vault_account = make_universal_vault_with_grants(&owner, 0);

    let instruction = Instruction::new_with_bytes(
        program_id,
        &build_revoke_all_data(),
        vec![
            AccountMeta::new_readonly(owner, true),
            AccountMeta::new(vault_pda, false),
        ],
    );

    let accounts = [(owner, owner_account), (vault_pda, vault_account)];

    mollusk.process_and_validate_instruction(&instruction, &accounts, &[Check::success()]);
}

#[test]
fn test_revoke_all_wrong_owner_fails() {
    set_sbf_out_dir();

    let program_id = program_id();
    let mollusk = Mollusk::new(&program_id, "keyshield");

    let real_owner = Pubkey::new_unique();
    let impostor = Pubkey::new_unique();
    let (vault_pda, _) = universal_vault_pda(&real_owner);

    // Vault is owned by `real_owner`, but `impostor` is the signer.
    let impostor_account = AccountSharedData::new(10_000_000, 0, &system_program::id());
    let vault_account = make_universal_vault_with_grants(&real_owner, 2);

    let instruction = Instruction::new_with_bytes(
        program_id,
        &build_revoke_all_data(),
        vec![
            AccountMeta::new_readonly(impostor, true),
            AccountMeta::new(vault_pda, false),
        ],
    );

    let accounts = [(impostor, impostor_account), (vault_pda, vault_account)];

    // InvalidVaultOwner = 6000 (see error.rs).
    mollusk.process_and_validate_instruction(
        &instruction,
        &accounts,
        &[Check::err(solana_sdk::program_error::ProgramError::Custom(6000))],
    );
}
