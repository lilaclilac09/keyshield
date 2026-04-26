use pinocchio::program_error::ProgramError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum KeyShieldError {
    // Original errors (6000-6008)
    InvalidVaultOwner = 6000,
    VaultNotFound = 6001,
    InvalidEncryptionData = 6002,
    InvalidZKProof = 6003,
    InvalidMPCHash = 6004,
    AccessDenied = 6005,
    InvalidTimeLock = 6006,
    VaultAlreadyExists = 6007,
    InvalidKeyData = 6008,

    // Universal Vault errors (6010-6029)
    UniversalVaultNotFound = 6010,
    UniversalVaultAlreadyExists = 6011,
    InvalidPolicyRule = 6012,
    PolicyRuleOverflow = 6013,
    InvalidKeyGroup = 6014,

    // Agent grant errors (6030-6049)
    AgentNotAuthorized = 6030,
    AgentGrantNotFound = 6031,
    AgentGrantRevoked = 6032,
    AgentGrantExpired = 6033,
    RateLimitExceeded = 6034,
    MaxSpendExceeded = 6035,
    SessionTimeout = 6036,
    InvalidAgentPubkey = 6037,
    InvalidSessionToken = 6038,

    // Payment stream errors (6050-6069)
    PaymentStreamNotFound = 6050,
    PaymentStreamActive = 6051,
    PaymentStreamInactive = 6052,
    InsufficientBalance = 6053,
    SettlementFailed = 6054,
    InvalidPaymentAmount = 6055,
    PaymentNotEnabled = 6056,

    // Ephemeral signer errors (6070-6079)
    EphemeralSignerNotFound = 6070,
    EphemeralSignerExpired = 6071,
    InvalidEphemeralSigner = 6072,

    // Policy errors (6080-6089)
    PolicyViolation = 6080,
    DomainBlocked = 6081,
    ToolNotAllowed = 6082,
    OutputRedactionRequired = 6083,

    // Codes 6090-6093 (BonsolVerificationFailed, ArciumMPCFailed,
    // InvalidBonsolProof, MPCSignatureInvalid) were removed when the
    // Bonsol/Arcium stub branches were deleted from agent_access.rs.
    // Do not reuse these numbers — old clients may still match on them.
}

impl From<KeyShieldError> for ProgramError {
    fn from(e: KeyShieldError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
