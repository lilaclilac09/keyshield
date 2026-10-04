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

    // Bonsol/Arcium errors (6090-6099)
    BonsolVerificationFailed = 6090,
    ArciumMPCFailed = 6091,
    InvalidBonsolProof = 6092,
    MPCSignatureInvalid = 6093,

    // Embedded wallet errors - Phase 10.1/10.2 (6100-6107)
    BudgetExceeded = 6100,
    NonceReused = 6101,
    AgentRevoked = 6102,
    NotOwner = 6103,
    PaymentStreamExpired = 6104,
    InvalidEnvelope = 6105,
    InsufficientStreamBalance = 6106,
    NotMppSettler = 6107,
    /// `mpp_settle` carried no fulfillment artifact root. A zero or
    /// missing commitment cannot debit the stream escrow.
    UnverifiedFulfillment = 6108,
    /// Mint is not canonical USDC, or the escrow token account's mint
    /// or owner field does not match the stream.
    InvalidMint = 6109,
    /// The stream account is already tombstoned. A second close, or an
    /// open against that tombstone, does not move lamports or balances.
    AccountClosed = 6110,
    /// Settlement sequence is `<= last_settled_seq`.
    SettlementReplay = 6111,
    /// Stream account address is not the canonical
    /// `["agent_payment_stream", agent, owner, bump]` PDA.
    InvalidPda = 6112,
    /// `checked_add` / `checked_sub` failed. Distinct from
    /// `BudgetExceeded`, which is a cap check on a value that fit in u64.
    ArithmeticOverflow = 6113,
}

impl From<KeyShieldError> for ProgramError {
    fn from(e: KeyShieldError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
