//! KeyShield Agentic - Universal API-Key + Payment Vault on Solana
//!
//! A decentralized API key vault that serves BOTH humans and autonomous AI agents:
//! - Humans: Auto-detect/save/autofill browser extension
//! - Agents: Bonsol ZK proofs + Arcium MPC + x402 streaming payments
//!
//! Security principles:
//! - Agents NEVER see raw API keys or private keys
//! - All decryption happens via Lit + Bonsol ZK proof or Arcium MPC share
//! - Human wallet always remains the ultimate owner with revocable policies
//! - Full OpenClaw skill ecosystem compatibility

#![no_std]

/// Borrow vault account data (immutable) and assert it's large enough for UniversalVault.
/// Returns early with UniversalVaultNotFound if the account is too small.
macro_rules! borrow_vault {
    ($vault:expr) => {{
        let _d = $vault.try_borrow_data()?;
        if _d.len() < $crate::state::UniversalVault::SIZE {
            return Err($crate::error::KeyShieldError::UniversalVaultNotFound.into());
        }
        _d
    }};
}

/// Borrow vault account data (mutable) and assert it's large enough for UniversalVault.
/// Returns early with UniversalVaultNotFound if the account is too small.
macro_rules! borrow_vault_mut {
    ($vault:expr) => {{
        let _d = $vault.try_borrow_mut_data()?;
        if _d.len() < $crate::state::UniversalVault::SIZE {
            return Err($crate::error::KeyShieldError::UniversalVaultNotFound.into());
        }
        _d
    }};
}

pub mod error;
pub mod instructions;
pub mod pda;
pub mod state;

use instructions::{
    store_key::process_store_key,
    access_key::process_access_key,
    share_key::process_share_key,
    universal_vault::{
        process_create_universal_vault,
        process_update_universal_policy,
        process_add_key_to_group,
    },
    agent_access::{
        process_grant_agent_access,
        process_revoke_agent_access,
        process_access_with_agent,
        process_create_ephemeral_signer,
    },
    payment_stream::{
        process_grant_agent_payment_access,
        process_settle_payment,
        process_pay_for_service,
        process_close_payment_stream,
    },
    open_stream::process_open_payment_stream,
    pay_x402::process_pay_x402,
    mpp_settle::process_mpp_settle,
    withdraw::process_withdraw_agent_wallet,
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
/// 
/// Routes all instruction calls to their respective handlers based on discriminator:
/// - 0-2: Legacy KeyShield (StoreKey, AccessKey, ShareKey)
/// - 10-12: Universal Vault (Create, UpdatePolicy, AddKeyToGroup)
/// - 20-23: Agent Access (Grant, Revoke, AccessWithAgent, CreateEphemeralSigner)
/// - 30-33: Payment Stream (GrantPayment, Settle, PayForService, CloseStream)
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
        // Legacy instructions
        Instruction::StoreKey => process_store_key(program_id, accounts, data),
        Instruction::AccessKey => process_access_key(program_id, accounts, data),
        Instruction::ShareKey => process_share_key(program_id, accounts, data),
        
        // Universal Vault instructions
        Instruction::CreateUniversalVault => process_create_universal_vault(program_id, accounts, data),
        Instruction::UpdateUniversalPolicy => process_update_universal_policy(program_id, accounts, data),
        Instruction::AddKeyToGroup => process_add_key_to_group(program_id, accounts, data),
        
        // Agent Access instructions
        Instruction::GrantAgentAccess => process_grant_agent_access(program_id, accounts, data),
        Instruction::RevokeAgentAccess => process_revoke_agent_access(program_id, accounts, data),
        Instruction::AccessWithAgent => process_access_with_agent(program_id, accounts, data),
        Instruction::CreateEphemeralSigner => process_create_ephemeral_signer(program_id, accounts, data),
        
        // Payment Stream instructions
        Instruction::GrantAgentPaymentAccess => process_grant_agent_payment_access(program_id, accounts, data),
        Instruction::SettlePayment => process_settle_payment(program_id, accounts, data),
        Instruction::PayForService => process_pay_for_service(program_id, accounts, data),
        Instruction::ClosePaymentStream => process_close_payment_stream(program_id, accounts, data),

        // Embedded Wallet — spec 10 Phase 10.1 + 10.2
        Instruction::OpenPaymentStream => process_open_payment_stream(program_id, accounts, data),
        Instruction::PayX402 => process_pay_x402(program_id, accounts, data),
        Instruction::MppSettle => process_mpp_settle(program_id, accounts, data),
        Instruction::WithdrawAgentWallet => process_withdraw_agent_wallet(program_id, accounts, data),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_instruction_discriminators() {
        // Legacy
        assert_eq!(Instruction::try_from_u8(0), Some(Instruction::StoreKey));
        assert_eq!(Instruction::try_from_u8(1), Some(Instruction::AccessKey));
        assert_eq!(Instruction::try_from_u8(2), Some(Instruction::ShareKey));
        
        // Universal Vault
        assert_eq!(Instruction::try_from_u8(10), Some(Instruction::CreateUniversalVault));
        assert_eq!(Instruction::try_from_u8(11), Some(Instruction::UpdateUniversalPolicy));
        assert_eq!(Instruction::try_from_u8(12), Some(Instruction::AddKeyToGroup));
        
        // Agent Access
        assert_eq!(Instruction::try_from_u8(20), Some(Instruction::GrantAgentAccess));
        assert_eq!(Instruction::try_from_u8(21), Some(Instruction::RevokeAgentAccess));
        assert_eq!(Instruction::try_from_u8(22), Some(Instruction::AccessWithAgent));
        assert_eq!(Instruction::try_from_u8(23), Some(Instruction::CreateEphemeralSigner));
        
        // Embedded Wallet (spec 10)
        assert_eq!(Instruction::try_from_u8(24), Some(Instruction::OpenPaymentStream));
        assert_eq!(Instruction::try_from_u8(25), Some(Instruction::PayX402));
        assert_eq!(Instruction::try_from_u8(26), Some(Instruction::MppSettle));
        assert_eq!(Instruction::try_from_u8(27), Some(Instruction::WithdrawAgentWallet));

        // Payment Stream
        assert_eq!(Instruction::try_from_u8(30), Some(Instruction::GrantAgentPaymentAccess));
        assert_eq!(Instruction::try_from_u8(31), Some(Instruction::SettlePayment));
        assert_eq!(Instruction::try_from_u8(32), Some(Instruction::PayForService));
        assert_eq!(Instruction::try_from_u8(33), Some(Instruction::ClosePaymentStream));

        // Invalid
        assert_eq!(Instruction::try_from_u8(3), None);
        assert_eq!(Instruction::try_from_u8(9), None);
        assert_eq!(Instruction::try_from_u8(28), None);
        assert_eq!(Instruction::try_from_u8(99), None);
    }
}
