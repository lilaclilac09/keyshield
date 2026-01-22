//! Example Oracle Program
//!
//! This is an example Solana program that demonstrates how on-chain programs
//! can consume API data from the KeyShield oracle service.
//!
//! The oracle service:
//! 1. Reads vault from on-chain
//! 2. Decrypts API key using Lit Protocol (off-chain)
//! 3. Calls external API (GitHub/Helius/Google Gemini) (off-chain)
//! 4. Posts results to this program via transaction (on-chain)

#![no_std]

pub mod error;
pub mod instructions;
pub mod state;

use instructions::{
    store_result::process_store_result,
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
        Instruction::StoreResult => process_store_result(program_id, accounts, data),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_instruction_discriminator() {
        // Test that instruction discriminators are valid
        assert!(Instruction::try_from_u8(0).is_some());
    }
}
