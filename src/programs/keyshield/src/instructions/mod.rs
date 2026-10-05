//! Instruction handlers

pub mod access_key;
pub mod agent_access;
pub mod payment_stream;
pub mod share_key;
pub mod store_key;
pub mod universal_vault;
// Spec 10 — Embedded wallet pillar (ix #24-#27).
pub mod clawback;
pub mod mpp_settle;
pub mod open_stream;
pub mod pay_x402;
pub mod revocation;
pub mod withdraw;
pub mod zk_vault;

/// Instruction discriminator enum
///
/// Discriminators:
/// 0-2: Original KeyShield instructions (legacy compatibility)
/// 10-19: Universal Vault instructions
/// 20-23: Agent Access instructions
/// 24-27: Embedded Wallet (spec 10) instructions
/// 30-39: Legacy Payment Stream instructions
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

    // Agent Access instructions (20-23)
    GrantAgentAccess = 20,
    RevokeAgentAccess = 21,
    AccessWithAgent = 22,
    CreateEphemeralSigner = 23,

    // Embedded Wallet — Spec 10 Phase 10.1 + 10.2 (24-27)
    OpenPaymentStream = 24,
    PayX402 = 25,
    MppSettle = 26,
    WithdrawAgentWallet = 27,
    ForceClawback = 28,
    SetRevocationBit = 29,

    // Legacy Payment Stream instructions (30-39)
    GrantAgentPaymentAccess = 30,
    SettlePayment = 31,
    PayForService = 32,
    ClosePaymentStream = 33,

    // Passkey-commitment escrow (40-43). Scaffold tagged; Groth16 fail-closed.
    InitZkVault = 40,
    UpdateZkPolicy = 41,
    ExecuteZkAction = 42,
    RevokeZkGrant = 43,
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

            // Embedded Wallet (spec 10)
            24 => Some(Instruction::OpenPaymentStream),
            25 => Some(Instruction::PayX402),
            26 => Some(Instruction::MppSettle),
            27 => Some(Instruction::WithdrawAgentWallet),
            28 => Some(Instruction::ForceClawback),
            29 => Some(Instruction::SetRevocationBit),

            // Legacy Payment Stream
            30 => Some(Instruction::GrantAgentPaymentAccess),
            31 => Some(Instruction::SettlePayment),
            32 => Some(Instruction::PayForService),
            33 => Some(Instruction::ClosePaymentStream),

            40 => Some(Instruction::InitZkVault),
            41 => Some(Instruction::UpdateZkPolicy),
            42 => Some(Instruction::ExecuteZkAction),
            43 => Some(Instruction::RevokeZkGrant),

            _ => None,
        }
    }
}
