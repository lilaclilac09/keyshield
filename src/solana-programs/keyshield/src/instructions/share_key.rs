//! Share key instruction handler (with MPC and time-lock support)

use pinocchio::{
    account_info::AccountInfo,
    instruction::Signer,
    program_error::ProgramError,
    pubkey::Pubkey,
    seeds,
    sysvars::Sysvar,
    sysvars::rent::Rent,
    ProgramResult,
};

use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};

use crate::{
    error::KeyShieldError,
    state::Vault,
};

const SHARE_SEED: &[u8] = b"share";
const SHARE_SIZE: usize = 64;

/// Process share key instruction
/// 
/// Accounts:
/// 0. [signer] Owner - The vault owner sharing the key
/// 1. [] Vault - PDA account containing the encrypted key
/// 2. [writable] Share - PDA account for the share record
/// 3. [] Recipient - The wallet receiving the share
/// 4. [] System Program
/// 
/// Instruction data:
/// - recipient (32 bytes) - Public key of recipient
/// - mpc_data (variable) - Arcium MPC computation data
/// - time_lock (8 bytes, optional) - Timestamp when share becomes accessible
pub fn process_share_key(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Minimum data:
    // - recipient (32)
    // - time_lock (8)
    // - share_bump (1)
    // = 41 bytes
    if data.len() < 41 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let share = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let recipient = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _system_program = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Read vault data
    let vault_data = vault.try_borrow_data()?;
    if vault_data.len() < Vault::SIZE {
        return Err(KeyShieldError::VaultNotFound.into());
    }

    // Verify discriminator
    let discriminator = &vault_data[0..8];
    if discriminator != Vault::DISCRIMINATOR {
        return Err(KeyShieldError::VaultNotFound.into());
    }

    // Verify owner
    let owner_bytes: [u8; 32] = vault_data[8..40].try_into()
        .map_err(|_| KeyShieldError::VaultNotFound)?;
    let vault_owner = Pubkey::try_from(&owner_bytes[..])
        .map_err(|_| KeyShieldError::VaultNotFound)?;

    if owner.key() != &vault_owner {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Parse recipient from data
    let recipient_bytes: [u8; 32] = data[0..32].try_into()
        .map_err(|_| KeyShieldError::InvalidKeyData)?;
    let recipient_pubkey = Pubkey::try_from(&recipient_bytes[..])
        .map_err(|_| KeyShieldError::InvalidKeyData)?;

    // Verify recipient account matches
    if recipient.key() != &recipient_pubkey {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    // Parse time_lock
    let _time_lock = u64::from_le_bytes(
        data[32..40].try_into().map_err(|_| KeyShieldError::InvalidTimeLock)?
    );

    // Parse share PDA bump (passed by client).
    let share_bump = data[40];
    let bump_ref = &[share_bump];
    let share_seeds = seeds!(
        SHARE_SEED,
        vault.key().as_ref(),
        recipient_pubkey.as_ref(),
        bump_ref
    );
    let share_signer = Signer::from(&share_seeds);

    // Initialize share PDA if needed (create/allocate/assign + rent top-up).
    if !share.is_owned_by(program_id) {
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(SHARE_SIZE);

        if share.lamports() == 0 && share.data_is_empty() {
            CreateAccount {
                from: owner,
                to: share,
                lamports: min_balance,
                space: SHARE_SIZE as u64,
                owner: program_id,
            }
            .invoke_signed(&[share_signer.clone()])?;
        } else {
            if share.data_len() < SHARE_SIZE {
                Allocate {
                    account: share,
                    space: SHARE_SIZE as u64,
                }
                .invoke_signed(&[share_signer.clone()])?;
            }

            Assign {
                account: share,
                owner: program_id,
            }
            .invoke_signed(&[share_signer.clone()])?;

            let current_balance = share.lamports();
            if current_balance < min_balance {
                Transfer {
                    from: owner,
                    to: share,
                    lamports: min_balance - current_balance,
                }
                .invoke()?;
            }
        }
    }

    // Get MPC hash from vault
    let _mpc_hash: [u8; 32] = vault_data[200..232].try_into()
        .map_err(|_| KeyShieldError::VaultNotFound)?;

    // TODO: Integrate Arcium MPC computation here
    // Example: arcium_arcis::mpc_compute(&encrypted_key, &recipient_pubkey)?;
    
    // Store share record (simplified - in production would include more metadata)
    let mut share_data = share.try_borrow_mut_data()?;
    if share_data.len() < 64 {
        return Err(ProgramError::AccountDataTooSmall);
    }

    // Write share metadata: vault (32) + recipient (32)
    share_data[0..32].copy_from_slice(vault.key().as_ref());
    share_data[32..64].copy_from_slice(recipient_pubkey.as_ref());
    
    // In production, would also store:
    // - MPC computation result
    // - Time lock timestamp
    // - Access conditions

    Ok(())
}
