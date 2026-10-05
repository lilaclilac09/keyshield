//! Store key instruction handler

use pinocchio::{
    account_info::AccountInfo,
    instruction::Signer,
    program_error::ProgramError,
    pubkey::Pubkey,
    seeds,
    sysvars::rent::Rent,
    sysvars::Sysvar,
    ProgramResult,
};

use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};

use crate::{
    error::KeyShieldError,
    state::Vault,
};

const VAULT_SEED: &[u8] = b"vault";

/// Process store key instruction
/// 
/// Stores a new API key in the vault. Creates the vault if it doesn't exist.
/// Architecture: ONE wallet → ONE vault → MULTIPLE keys
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
    // Expected data:
    // - encrypted_key_hash (32)
    // - timestamp (8)
    // - key_type (1)
    // - vault_bump (1)
    // = 42 bytes (simplified - no longer need zk_commit/mpc_hash per key)
    if data.len() < 42 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _system_program = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Parse instruction data
    let mut encrypted_key_hash = [0u8; 32];
    encrypted_key_hash.copy_from_slice(&data[0..32]);
    
    let timestamp = u64::from_le_bytes(
        data[32..40].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?
    );
    
    let key_type = data[40];
    let vault_bump = data[41];

    // Setup PDA seeds
    let bump_ref = &[vault_bump];
    let vault_seeds = seeds!(VAULT_SEED, owner.key().as_ref(), bump_ref);
    let vault_signer = Signer::from(&vault_seeds);

    let is_initialized = vault.is_owned_by(program_id);

    // If vault doesn't exist, create it
    if !is_initialized {
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(Vault::SIZE);

        // Create account
        if vault.lamports() == 0 && vault.data_is_empty() {
            CreateAccount {
                from: owner,
                to: vault,
                lamports: min_balance,
                space: Vault::SIZE as u64,
                owner: program_id,
            }
            .invoke_signed(&[vault_signer.clone()])?;
        } else {
            // Account exists but not owned by program - allocate and assign
            if vault.data_len() < Vault::SIZE {
                Allocate {
                    account: vault,
                    space: Vault::SIZE as u64,
                }
                .invoke_signed(&[vault_signer.clone()])?;
            }

            Assign {
                account: vault,
                owner: program_id,
            }
            .invoke_signed(&[vault_signer.clone()])?;

            let current_balance = vault.lamports();
            if current_balance < min_balance {
                Transfer {
                    from: owner,
                    to: vault,
                    lamports: min_balance - current_balance,
                }
                .invoke()?;
            }
        }

        // Initialize new vault (empty)
        let vault_state = Vault::new(*owner.key(), timestamp);
        serialize_vault(&vault_state, vault)?;
    }

    // Now add the key to the vault (whether new or existing)
    let vault_data = vault.try_borrow_mut_data()?;
    if vault_data.len() < Vault::SIZE {
        return Err(ProgramError::AccountDataTooSmall);
    }

    // Deserialize vault
    let mut vault_state = deserialize_vault(&vault_data)?;

    // Verify owner matches
    if vault_state.owner != *owner.key() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Check if key already exists (prevent duplicates)
    if vault_state.find_key(&encrypted_key_hash).is_some() {
        return Err(KeyShieldError::VaultAlreadyExists.into()); // Reuse error for "key already exists"
    }

    // Add key to vault
    let _key_index = vault_state.add_key(encrypted_key_hash, key_type)
        .ok_or(KeyShieldError::InvalidKeyData)?; // Vault is full

    drop(vault_data);

    // Serialize updated vault
    serialize_vault(&vault_state, vault)?;

    Ok(())
}

/// Deserialize vault from account data
fn deserialize_vault(data: &[u8]) -> Result<Vault, ProgramError> {
    if data.len() < Vault::SIZE {
        return Err(ProgramError::AccountDataTooSmall);
    }

    // Verify discriminator
    let discriminator: [u8; 8] = data[0..8].try_into()
        .map_err(|_| ProgramError::InvalidAccountData)?;
    
    if discriminator != Vault::DISCRIMINATOR {
        return Err(ProgramError::InvalidAccountData);
    }

    // Parse owner
    let owner_bytes: [u8; 32] = data[8..40].try_into()
        .map_err(|_| ProgramError::InvalidAccountData)?;
    let owner = Pubkey::from(owner_bytes);

    // Parse key_count
    let key_count = data[40];

    // Parse keys array (8 keys * 34 bytes = 272 bytes)
    let mut keys = [crate::state::KeyEntry::empty(); crate::state::MAX_KEYS_PER_VAULT];
    for i in 0..crate::state::MAX_KEYS_PER_VAULT {
        let offset = 41 + (i * crate::state::KeyEntry::SIZE);
        let entry_data = &data[offset..offset + crate::state::KeyEntry::SIZE];
        
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&entry_data[0..32]);
        let key_type = entry_data[32];
        let access_flags = entry_data[33];

        keys[i] = crate::state::KeyEntry {
            encrypted_key_hash: hash,
            key_type,
            access_flags,
        };
    }

    // Parse created_at (offset: 41 + 272 = 313)
    let created_at = u64::from_le_bytes(
        data[313..321].try_into().map_err(|_| ProgramError::InvalidAccountData)?
    );

    // Parse vault_flags (offset: 321)
    let vault_flags = data[321];

    Ok(Vault {
        discriminator,
        owner,
        key_count,
        keys,
        created_at,
        vault_flags,
        _reserved: [0; 150],
    })
}

/// Serialize vault to account data
fn serialize_vault(vault: &Vault, vault_account: &AccountInfo) -> ProgramResult {
    let mut data = vault_account.try_borrow_mut_data()?;
    if data.len() < Vault::SIZE {
        return Err(ProgramError::AccountDataTooSmall);
    }

    // Write discriminator
    data[0..8].copy_from_slice(&vault.discriminator);
    // Write owner
    data[8..40].copy_from_slice(vault.owner.as_ref());
    // Write key_count
    data[40] = vault.key_count;
    
    // Write keys array
    for (i, key) in vault.keys.iter().enumerate() {
        let offset = 41 + (i * crate::state::KeyEntry::SIZE);
        data[offset..offset + 32].copy_from_slice(&key.encrypted_key_hash);
        data[offset + 32] = key.key_type;
        data[offset + 33] = key.access_flags;
    }

    // Write created_at (offset: 41 + 272 = 313)
    data[313..321].copy_from_slice(&vault.created_at.to_le_bytes());
    
    // Write vault_flags (offset: 321)
    data[321] = vault.vault_flags;

    // Reserved bytes remain as-is

    Ok(())
}
