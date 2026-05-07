//! Shared fixtures and helpers for Mollusk integration tests.
//!
//! Run from workspace root after building: `cargo build-sbf && cargo test -p keyshield`

use solana_sdk::pubkey::Pubkey;

/// Set SBF_OUT_DIR so Mollusk finds keyshield.so (works when cwd is package or workspace).
pub fn set_sbf_out_dir() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let sbf_out = std::path::Path::new(manifest_dir)
        .join("../../target/deploy")
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from("target/deploy"));
    std::env::set_var("SBF_OUT_DIR", sbf_out);
}

/// Fixed program ID for tests (deterministic PDAs).
///
/// MUST NOT be the all-zeroes pubkey — that's the System Program's ID,
/// and the Solana runtime will short-circuit to its built-in handler
/// before our loaded `.so` ever runs, leaving every test failing with
/// `Custom(6001)` (System Program's "account already in use" or a
/// similar code that happens to overlap with our VaultNotFound).
pub fn program_id() -> Pubkey {
    Pubkey::new_from_array([1u8; 32])
}

/// Derive vault PDA (seeds: b"vault", owner).
pub fn vault_pda(owner: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"vault", owner.as_ref()], &program_id())
}

/// Derive share PDA (seeds: b"share", vault, recipient).
#[allow(dead_code)]
pub fn share_pda(vault: &Pubkey, recipient: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"share", vault.as_ref(), recipient.as_ref()],
        &program_id(),
    )
}
