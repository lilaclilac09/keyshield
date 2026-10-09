//! Fail-closed errors. None of these decrement settled quota.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineError {
    InvalidEnvelope,
    InvalidKey,
    InvalidSignature,
    Replay,
    QuotaExceeded,
    HoldNotFound,
    NotHeld,
    Indeterminate,
    SettlementFailed,
    ZeroAmount,
    ConservationBroken,
}

impl core::fmt::Display for EngineError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(match self {
            Self::InvalidEnvelope => "invalid instruction envelope",
            Self::InvalidKey => "invalid session key",
            Self::InvalidSignature => "invalid capture signature",
            Self::Replay => "context digest reused",
            Self::QuotaExceeded => "quota exceeded",
            Self::HoldNotFound => "hold not found",
            Self::NotHeld => "ticket is not in Held",
            Self::Indeterminate => "rpc outcome indeterminate",
            Self::SettlementFailed => "settlement failed",
            Self::ZeroAmount => "zero debit",
            Self::ConservationBroken => "available + held + settled != endowment",
        })
    }
}
