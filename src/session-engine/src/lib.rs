//! KeyShield host/WASM session engine.
//!
//! Critical safety lives here, not in TypeScript:
//! - `keys`: `secrecy` + `zeroize` session HMAC lifecycle
//! - `anchor`: SHA-256 context guard over the full payment payload
//! - `hvc`: Hold-Verify-Capture — a session signature never decrements
//!   settled quota unless RPC is `Confirmed` or explicit `Stub`
//!
//! The Pinocchio program (`keyshield`) stays `no_std` and does not
//! take these crates. `ks-proxy` also does not depend on them.

#![forbid(unsafe_code)]

pub mod anchor;
pub mod error;
pub mod hvc;
pub mod keys;
pub mod layout;
pub mod quota;

pub use anchor::context_anchor;
pub use error::EngineError;
pub use hvc::{Engine, HoldRequest, HoldTicket, Phase, Receipt, RpcOutcome};
pub use keys::SessionKey;
pub use layout::{assert_instruction_envelope, parse_mpp_settle, IxKind, MppSettleView};
pub use quota::QuotaLedger;

/// Conservative host CU weights (same as `keyshield::session_guard`).
pub const MAX_COMPUTE_UNITS: u64 = 5_000;
pub const CU_PARSE: u64 = 200;
pub const CU_PDA: u64 = 800;
pub const CU_TRANSFER: u64 = 1_500;
pub const CU_ED25519: u64 = 2_000;
pub const HONEST_SETTLE_CU: u64 = CU_PARSE + CU_PDA + CU_ED25519 + CU_TRANSFER;

#[cfg(test)]
mod cu_tests {
    use super::*;

    #[test]
    fn honest_path_is_exactly_4500_and_under_budget() {
        assert_eq!(HONEST_SETTLE_CU, 4_500);
        assert!(HONEST_SETTLE_CU < MAX_COMPUTE_UNITS);
    }
}
