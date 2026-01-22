//! PDA (Program Derived Address) utilities

use pinocchio::{
    pubkey::Pubkey,
    program_error::ProgramError,
};

use crate::error::KeyShieldError;

/// Derive vault PDA for a given owner
pub fn derive_vault_pda(
    program_id: &Pubkey,
    owner: &Pubkey,
) -> Result<(Pubkey, u8), ProgramError> {
    let seeds = &[
        b"vault",
        owner.as_ref(),
    ];
    
    Pubkey::try_find_program_address(seeds, program_id)
        .ok_or(KeyShieldError::InvalidVaultOwner.into())
}

/// Derive share PDA for key sharing
pub fn derive_share_pda(
    program_id: &Pubkey,
    vault: &Pubkey,
    recipient: &Pubkey,
) -> Result<(Pubkey, u8), ProgramError> {
    let seeds = &[
        b"share",
        vault.as_ref(),
        recipient.as_ref(),
    ];
    
    Pubkey::try_find_program_address(seeds, program_id)
        .ok_or(KeyShieldError::AccessDenied.into())
}
