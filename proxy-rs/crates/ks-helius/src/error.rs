/// Error type for the HeliusClient.
///
/// Class A = surface hard (no retry). Class B = caller may retry.
/// Per ADR-004 error classification.
#[derive(thiserror::Error, Debug)]
pub enum HeliusError {
    #[error("upstream http: {0}")]
    Http(#[from] reqwest::Error),

    #[error("upstream returned {status}: {body}")]
    Upstream { status: u16, body: String },

    /// 402 Payment Required returned and no wallet is configured.
    /// Class A — caller must configure an EmbeddedWallet to proceed.
    #[error("payment required and no wallet configured")]
    Unpaid,

    /// Wallet configured but the on-chain pay_x402 transaction failed.
    /// Class A after 1 retry.
    #[error("x402 payment failed: {0}")]
    Payment(String),

    #[error("json decode: {0}")]
    Json(#[from] serde_json::Error),

    #[error("disk cache: {0}")]
    Disk(#[from] redb::Error),

    /// Semaphore acquisition failed (system shutdown path).
    #[error("over concurrency budget")]
    Backpressure,
}

/// Raw response from `fire()` before cache or x402 handling.
pub enum HeliusResponse {
    Ok(bytes::Bytes),
    PaymentRequired(X402Envelope),
}

impl HeliusResponse {
    /// Unwrap `Ok` variant; return `HeliusError::Unpaid` for 402.
    pub fn into_ok(self) -> Result<bytes::Bytes, HeliusError> {
        match self {
            Self::Ok(b) => Ok(b),
            Self::PaymentRequired(_) => Err(HeliusError::Unpaid),
        }
    }
}

/// Opaque x402 envelope returned by Helius when payment is required.
/// Passed to `EmbeddedWallet::pay_x402` which returns a proof string.
#[derive(Debug, Clone)]
pub struct X402Envelope {
    pub required_amount_usdc: u64,
    pub payment_address: String,
    pub memo: String,
}
