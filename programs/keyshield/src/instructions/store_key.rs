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
    // - zk_commit (32)
    // - mpc_hash (32)
    // - timestamp (8)
    // - key_type (1)
    // - vault_bump (1)
    // = 106 bytes
    if data.len() < 106 {
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

    // Parse PDA bump (passed by client). This allows us to sign CPIs for the PDA without
    // doing PDA hashing on-chain (no_std-friendly).
    let vault_bump = data[105];
    let bump_ref = &[vault_bump];
    let vault_seeds = seeds!(VAULT_SEED, owner.key().as_ref(), bump_ref);
    let vault_signer = Signer::from(&vault_seeds);

    // If the vault account is not owned by this program yet, initialize it as a PDA.
    // We intentionally *don't* try to derive/verify the PDA address on-chain; instead,
    // `invoke_signed` will only mark the account as signed if seeds+bump match the PDA.
    if !vault.is_owned_by(program_id) {
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(Vault::SIZE);

        // Common case: account doesn't exist yet (0 lamports, 0 data).
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
            // Less common: address already has lamports (e.g. someone transferred SOL to the PDA
            // before initialization). In that case, allocate + assign, and top up rent if needed.
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
