//! KeyShield - Private API Vault on Solana
//!
//! A decentralized API key vault that stores encrypted keys on-chain with:
//! - ZK proofs (Bonsol) for access verification without revealing secrets
//! - MPC (Arcium) for secure agent-to-agent communication
//! - Threshold crypto (Lit Protocol) for time-locked/wallet-based sharing

#![no_std]

pub mod error;
pub mod instructions;
pub mod pda;
pub mod state;

use instructions::{
    store_key::process_store_key,
    access_key::process_access_key,
    share_key::process_share_key,
    Instruction,
};
use pinocchio::{
    account_info::AccountInfo,
    default_allocator,
    nostd_panic_handler,
    program_entrypoint,
    program_error::ProgramError,
    pubkey::Pubkey,
    ProgramResult,
};

program_entrypoint!(process_instruction);
default_allocator!();
nostd_panic_handler!();

/// Program entrypoint
fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // Instruction data must have at least 1 byte for discriminator
    if instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }

    // Parse instruction discriminator (first byte)
    let instruction = Instruction::try_from_u8(instruction_data[0])
        .ok_or(ProgramError::InvalidInstructionData)?;

    // Route to instruction handler (skip discriminator byte)
    let data = &instruction_data[1..];

    match instruction {
        Instruction::StoreKey => process_store_key(program_id, accounts, data),
        Instruction::AccessKey => process_access_key(program_id, accounts, data),
        Instruction::ShareKey => process_share_key(program_id, accounts, data),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_instruction_discriminators() {
        assert_eq!(Instruction::try_from_u8(0), Some(Instruction::StoreKey));
        assert_eq!(Instruction::try_from_u8(1), Some(Instruction::AccessKey));
        assert_eq!(Instruction::try_from_u8(2), Some(Instruction::ShareKey));
        assert_eq!(Instruction::try_from_u8(3), None);
    }
}
