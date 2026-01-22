//! Share key instruction handler (with MPC and time-lock support)

use pinocchio::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    ProgramResult,
};

use crate::{
    error::KeyShieldError,
    pda::{derive_share_pda, derive_vault_pda},
    state::Vault,
};

/// Process share key instruction
/// 
/// Accounts:
/// 0. [signer] Owner - The vault owner sharing the key
/// 1. [] Vault - PDA account containing the encrypted key
/// 2. [writable] Share - PDA account for the share record
/// 3. [] Recipient - The wallet receiving the share
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
    // Minimum data: recipient (32) + time_lock (8) = 40 bytes
    if data.len() < 40 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let share = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let recipient = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Read vault data
    let vault_data = vault.data.borrow();
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

    if *owner.key != vault_owner {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Parse recipient from data
    let recipient_bytes: [u8; 32] = data[0..32].try_into()
        .map_err(|_| KeyShieldError::InvalidKeyData)?;
    let recipient_pubkey = Pubkey::try_from(&recipient_bytes[..])
        .map_err(|_| KeyShieldError::InvalidKeyData)?;

    // Verify recipient account matches
    if *recipient.key != recipient_pubkey {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    // Parse time_lock
    let time_lock = u64::from_le_bytes(
        data[32..40].try_into().map_err(|_| KeyShieldError::InvalidTimeLock)?
    );

    // Verify share PDA
    let (expected_share_pda, _bump) = derive_share_pda(program_id, vault.key, &recipient_pubkey)?;
    if *share.key != expected_share_pda {
        return Err(KeyShieldError::AccessDenied.into());
    }

    // Get MPC hash from vault
    let mpc_hash: [u8; 32] = vault_data[200..232].try_into()
        .map_err(|_| KeyShieldError::VaultNotFound)?;

    // TODO: Integrate Arcium MPC computation here
    // Example: arcium_arcis::mpc_compute(&encrypted_key, &recipient_pubkey)?;
    
    // Store share record (simplified - in production would include more metadata)
    let mut share_data = share.data.borrow_mut();
    if share_data.len() < 64 {
        return Err(ProgramError::AccountDataTooSmall);
    }

    // Write share metadata: vault (32) + recipient (32)
    share_data[0..32].copy_from_slice(vault.key.as_ref());
    share_data[32..64].copy_from_slice(recipient_pubkey.as_ref());
    
    // In production, would also store:
    // - MPC computation result
    // - Time lock timestamp
    // - Access conditions

    Ok(())
}
