//! Store key instruction handler

use pinocchio::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    ProgramResult,
};

use crate::{
    error::KeyShieldError,
    pda::derive_vault_pda,
    state::Vault,
};

/// Process store key instruction
/// 
/// Accounts:
/// 0. [signer] Owner - The wallet storing the key
/// 1. [writable] Vault - PDA account to store the encrypted key
/// 2. [] System Program
pub fn process_store_key(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Expected data: encrypted_key (128) + zk_commit (32) + mpc_hash (32) + timestamp (8) = 200 bytes
    if data.len() < 200 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Verify vault PDA
    let (expected_vault_pda, _bump) = derive_vault_pda(program_id, owner.key)?;
    if *vault.key != expected_vault_pda {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Check if vault already exists (skip if account is being initialized)
    let vault_data_len = vault.data.borrow().len();
    if vault_data_len > 0 && vault_data_len >= Vault::SIZE {
        // Check discriminator to see if it's already initialized
        let existing_discriminator = &vault.data.borrow()[0..8];
        if existing_discriminator == Vault::DISCRIMINATOR {
            return Err(KeyShieldError::VaultAlreadyExists.into());
        }
    }

    // Parse instruction data
    let mut encrypted_key = [0u8; 128];
    encrypted_key.copy_from_slice(&data[0..128]);
    
    let mut zk_commit = [0u8; 32];
    zk_commit.copy_from_slice(&data[128..160]);
    
    let mut mpc_hash = [0u8; 32];
    mpc_hash.copy_from_slice(&data[160..192]);
    
    let timestamp = u64::from_le_bytes(
        data[192..200].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?
    );

    // Create vault state
    let vault_state = Vault::new(
        *owner.key,
        encrypted_key,
        zk_commit,
        mpc_hash,
        timestamp,
    );

    // Serialize and write to account
    let mut vault_data = vault.data.borrow_mut();
    if vault_data.len() < Vault::SIZE {
        return Err(ProgramError::AccountDataTooSmall);
    }

    // Write discriminator
    vault_data[0..8].copy_from_slice(&vault_state.discriminator);
    // Write owner
    vault_data[8..40].copy_from_slice(vault_state.owner.as_ref());
    // Write encrypted_key
    vault_data[40..168].copy_from_slice(&vault_state.encrypted_key);
    // Write zk_commit
    vault_data[168..200].copy_from_slice(&vault_state.zk_commit);
    // Write mpc_hash
    vault_data[200..232].copy_from_slice(&vault_state.mpc_hash);
    // Write created_at
    vault_data[232..240].copy_from_slice(&vault_state.created_at.to_le_bytes());
    // Write access_flags
    vault_data[240] = vault_state.access_flags;
    // Reserved bytes remain zero

    Ok(())
}
