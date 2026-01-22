//! Store key instruction handler

use pinocchio::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    ProgramResult,
};

use crate::{
    error::KeyShieldError,
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
    // Expected data: encrypted_key_hash (32) + zk_commit (32) + mpc_hash (32) + timestamp (8) + key_type (1) = 105 bytes
    if data.len() < 105 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Verify vault account owner is this program (PDA property)
    // The frontend will derive the correct PDA using findProgramAddressSync
    unsafe {
        if vault.owner() != program_id {
            return Err(KeyShieldError::InvalidVaultOwner.into());
        }
    }

    // Check if vault already exists and is initialized
    // If account data is empty or smaller than expected, it's uninitialized and we can proceed
    let vault_data = vault.try_borrow_data()?;
    let vault_data_len = vault_data.len();
    
    // If account has data and is the right size, check if it's already initialized
    if vault_data_len >= Vault::SIZE {
        // Check discriminator to see if it's already initialized
        let existing_discriminator = &vault_data[0..8];
        if existing_discriminator == Vault::DISCRIMINATOR {
            return Err(KeyShieldError::VaultAlreadyExists.into());
        }
    }
    // If account is empty or smaller than expected, it's uninitialized - we'll initialize it
    drop(vault_data);

    // Parse instruction data
    let mut encrypted_key_hash = [0u8; 32];
    encrypted_key_hash.copy_from_slice(&data[0..32]);
    
    let mut zk_commit = [0u8; 32];
    zk_commit.copy_from_slice(&data[32..64]);
    
    let mut mpc_hash = [0u8; 32];
    mpc_hash.copy_from_slice(&data[64..96]);
    
    let timestamp = u64::from_le_bytes(
        data[96..104].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?
    );
    
    let key_type = data[104];

    // Create vault state
    let mut vault_state = Vault::new(
        *owner.key(),
        encrypted_key_hash,
        zk_commit,
        mpc_hash,
        timestamp,
    );
    
    // Set key type in access_flags
    vault_state.set_key_type(key_type);

    // Serialize and write to account
    let mut vault_data = vault.try_borrow_mut_data()?;
    if vault_data.len() < Vault::SIZE {
        return Err(ProgramError::AccountDataTooSmall);
    }

    // Write discriminator
    vault_data[0..8].copy_from_slice(&vault_state.discriminator);
    // Write owner
    vault_data[8..40].copy_from_slice(vault_state.owner.as_ref());
    // Write encrypted_key_hash (32 bytes)
    vault_data[40..72].copy_from_slice(&vault_state.encrypted_key_hash);
    // Write zk_commit
    vault_data[72..104].copy_from_slice(&vault_state.zk_commit);
    // Write mpc_hash
    vault_data[104..136].copy_from_slice(&vault_state.mpc_hash);
    // Write created_at
    vault_data[136..144].copy_from_slice(&vault_state.created_at.to_le_bytes());
    // Write access_flags
    vault_data[144] = vault_state.access_flags;
    // Reserved bytes remain zero

    Ok(())
}
