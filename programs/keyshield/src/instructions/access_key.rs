//! Access key instruction handler (with ZK proof verification)

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

/// Process access key instruction
/// 
/// Accounts:
/// 0. [signer] Requester - The wallet requesting access
/// 1. [] Vault - PDA account containing the encrypted key
/// 
/// Instruction data:
/// - zk_proof (variable length) - Bonsol ZK proof for access verification
pub fn process_access_key(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let requester = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify requester is signer
    if !requester.is_signer {
        return Err(KeyShieldError::AccessDenied.into());
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

    // Deserialize vault
    let owner_bytes: [u8; 32] = vault_data[8..40].try_into()
        .map_err(|_| KeyShieldError::VaultNotFound)?;
    let owner = Pubkey::try_from(&owner_bytes[..])
        .map_err(|_| KeyShieldError::VaultNotFound)?;

    let zk_commit: [u8; 32] = vault_data[168..200].try_into()
        .map_err(|_| KeyShieldError::VaultNotFound)?;

    // Check if requester is owner
    if *requester.key == owner {
        // Owner has direct access, no proof needed
        return Ok(());
    }

    // For non-owners, verify ZK proof
    // In production, this would call Bonsol verifier
    // For now, we check if proof data exists
    if data.is_empty() {
        return Err(KeyShieldError::InvalidZKProof.into());
    }

    // TODO: Integrate Bonsol verifier here
    // Example: bonsol_interface::verify_proof(&zk_proof, &zk_commit)?;
    
    // Placeholder: Verify proof length (actual verification would happen here)
    // A real implementation would:
    // 1. Deserialize the ZK proof from data
    // 2. Call Bonsol verifier program
    // 3. Verify proof matches zk_commit
    
    // For now, we'll just check that proof data exists
    // In production, replace with actual Bonsol verification:
    // let proof = parse_zk_proof(data)?;
    // verify_bonsol_proof(&proof, &zk_commit)?;

    Ok(())
}
