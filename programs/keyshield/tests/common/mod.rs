//! Shared fixtures and helpers for Mollusk integration tests.
//!
//! Run from workspace root after building: `cargo build-sbf && SBF_OUT_DIR=target/deploy cargo test -p keyshield`

use solana_sdk::pubkey::Pubkey;

/// Fixed program ID for tests (deterministic PDAs).
pub fn program_id() -> Pubkey {
    Pubkey::new_from_array([0u8; 32])
}

/// Derive vault PDA (seeds: b"vault", owner).
pub fn vault_pda(owner: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"vault", owner.as_ref()], &program_id())
}

/// Derive share PDA (seeds: b"share", vault, recipient).
pub fn share_pda(vault: &Pubkey, recipient: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"share", vault.as_ref(), recipient.as_ref()],
        &program_id(),
    )
}
