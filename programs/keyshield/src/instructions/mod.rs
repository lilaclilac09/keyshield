//! Instruction handlers

pub mod store_key;
pub mod access_key;
pub mod share_key;
pub mod universal_vault;
pub mod agent_access;
pub mod payment_stream;

/// Instruction discriminator enum
/// 
/// Discriminators:
/// 0-2: Original KeyShield instructions (legacy compatibility)
/// 10-19: Universal Vault instructions
/// 20-29: Agent Access instructions
/// 30-39: Payment Stream instructions
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Instruction {
    // Legacy instructions (0-2)
    StoreKey = 0,
    AccessKey = 1,
    ShareKey = 2,

    // Universal Vault instructions (10-19)
    CreateUniversalVault = 10,
    UpdateUniversalPolicy = 11,
    AddKeyToGroup = 12,

    // Agent Access instructions (20-29)
    GrantAgentAccess = 20,
    RevokeAgentAccess = 21,
    AccessWithAgent = 22,
    CreateEphemeralSigner = 23,

    // Payment Stream instructions (30-39)
    GrantAgentPaymentAccess = 30,
    SettlePayment = 31,
    PayForService = 32,
    ClosePaymentStream = 33,
}

impl Instruction {
    pub fn try_from_u8(value: u8) -> Option<Self> {
        match value {
            // Legacy
            0 => Some(Instruction::StoreKey),
            1 => Some(Instruction::AccessKey),
            2 => Some(Instruction::ShareKey),
            
            // Universal Vault
            10 => Some(Instruction::CreateUniversalVault),
            11 => Some(Instruction::UpdateUniversalPolicy),
            12 => Some(Instruction::AddKeyToGroup),
            
            // Agent Access
            20 => Some(Instruction::GrantAgentAccess),
            21 => Some(Instruction::RevokeAgentAccess),
            22 => Some(Instruction::AccessWithAgent),
            23 => Some(Instruction::CreateEphemeralSigner),
            
            // Payment Stream
            30 => Some(Instruction::GrantAgentPaymentAccess),
            31 => Some(Instruction::SettlePayment),
            32 => Some(Instruction::PayForService),
            33 => Some(Instruction::ClosePaymentStream),
            
            _ => None,
        }
    }
}
