//! PDA (Program Derived Address) utilities
//! 
//! Note: PDA derivation is done on the client side. This module provides
//! verification utilities. The actual derivation uses standard Solana
//! findProgramAddress which is implemented in the frontend.

use pinocchio::{
    pubkey::Pubkey,
    program_error::ProgramError,
};

use crate::error::KeyShieldError;

/// Verify vault PDA matches expected seeds
/// The frontend derives the PDA, and we verify the account owner matches program_id
/// This is a simplified check - full PDA verification would require hashing in no_std
pub fn derive_vault_pda(
    _program_id: &Pubkey,
    _owner: &Pubkey,
) -> Result<(Pubkey, u8), ProgramError> {
    // Since we can't easily derive PDAs in no_std without proper hashing,
    // we return a placeholder. The actual PDA will be verified by checking
    // that the account's owner is the program (which is done in the instruction handler).
    // The frontend will derive the correct PDA using findProgramAddressSync.
    // 
    // For now, return an error to force the frontend to handle PDA derivation.
    // In a production system, you'd use a proper hashing library or CPI to system program.
    Err(KeyShieldError::InvalidVaultOwner.into())
}

/// Verify share PDA matches expected seeds
pub fn derive_share_pda(
    _program_id: &Pubkey,
    _vault: &Pubkey,
    _recipient: &Pubkey,
) -> Result<(Pubkey, u8), ProgramError> {
    // Same as above - PDA derivation handled by frontend
    Err(KeyShieldError::AccessDenied.into())
}
