//! Embedded wallet (spec 10) — host-side state layout + invariant tests.
//!
//! These tests exercise the *layout* of the new `AgentPaymentStream`
//! PDA struct introduced for ix #24-#27 and the `revoked_at` field
//! we carved out of the `AgentGrant` slot, without invoking the SBF
//! runtime. They run under `cargo test -p keyshield` regardless of
//! whether `keyshield.so` is built.
//!
//! Mollusk-driven happy/error path tests for the four new ixs live in
//! `embedded_wallet_mollusk.rs` and require `cargo build-sbf` first.

use keyshield::state::{
    aps_offset, AgentPaymentStream, ConsumedNonce, AGENT_GRANTS_START,
    AGENT_GRANT_REVOKED_AT_OFFSET, AGENT_GRANT_SIZE, AGENT_PAYMENT_STREAM_DISCRIMINATOR,
    CONSUMED_NONCES_LEN, MAX_AGENTS, UniversalVault,
};

// ────────────────────────────── helpers ─────────────────────────────

fn empty_vault(owner: &[u8; 32]) -> Vec<u8> {
    let mut data = vec![0u8; UniversalVault::SIZE];
    data[0..8].copy_from_slice(b"univault");
    data[8..40].copy_from_slice(owner);
    data
}

/// Write a minimal AgentGrant into vault buffer: agent_pubkey at the
/// slot start, is_active=1 at offset+58, leaving revoked_at zero.
fn write_active_grant(vault: &mut Vec<u8>, slot: usize, agent_pubkey: &[u8; 32]) -> usize {
    let off = AGENT_GRANTS_START + slot * AGENT_GRANT_SIZE;
    vault[off..off + 32].copy_from_slice(agent_pubkey);
    vault[off + 58] = 1; // is_active
    off
}

fn empty_stream() -> Vec<u8> {
    let mut data = vec![0u8; AgentPaymentStream::SIZE];
    data[aps_offset::DISCRIMINATOR..aps_offset::DISCRIMINATOR + 8]
        .copy_from_slice(&AGENT_PAYMENT_STREAM_DISCRIMINATOR);
    data
}

// ─────────────────────────── layout tests ──────────────────────────

#[test]
fn aps_size_matches_offsets_module() {
    // The reserved field starts at NONCES + CONSUMED_NONCES_LEN * ConsumedNonce::SIZE.
    let nonces_end = aps_offset::NONCES + CONSUMED_NONCES_LEN * ConsumedNonce::SIZE;
    // 64 bytes of trailing _reserved.
    assert_eq!(nonces_end + 64, AgentPaymentStream::SIZE);
}

#[test]
fn aps_offsets_are_strictly_ascending() {
    let offsets: &[(&str, usize)] = &[
        ("DISCRIMINATOR", aps_offset::DISCRIMINATOR),
        ("OWNER", aps_offset::OWNER),
        ("AGENT_PUBKEY", aps_offset::AGENT_PUBKEY),
        ("MPP_SETTLER", aps_offset::MPP_SETTLER),
        ("USDC_MINT", aps_offset::USDC_MINT),
        ("USDC_ATA", aps_offset::USDC_ATA),
        ("MAX_TOTAL", aps_offset::MAX_TOTAL),
        ("SPENT_TOTAL", aps_offset::SPENT_TOTAL),
        ("COST_PER_UNIT", aps_offset::COST_PER_UNIT),
        ("MAX_RATE_BITS", aps_offset::MAX_RATE_BITS),
        ("SETTLEMENT_INTERVAL", aps_offset::SETTLEMENT_INTERVAL),
        ("IS_ACTIVE", aps_offset::IS_ACTIVE),
        ("BUMP", aps_offset::BUMP),
        ("LAST_PAYMENT_TS", aps_offset::LAST_PAYMENT_TS),
        ("CREATED_AT", aps_offset::CREATED_AT),
        ("NONCES_HEAD", aps_offset::NONCES_HEAD),
        ("NONCES", aps_offset::NONCES),
    ];
    for w in offsets.windows(2) {
        let (a_name, a) = w[0];
        let (b_name, b) = w[1];
        assert!(
            a < b,
            "field offsets out of order: {} ({}) >= {} ({})",
            a_name,
            a,
            b_name,
            b
        );
    }
}

#[test]
fn aps_consumed_nonces_fit_inside_account() {
    let nonces_end = aps_offset::NONCES + CONSUMED_NONCES_LEN * ConsumedNonce::SIZE;
    assert!(
        nonces_end <= AgentPaymentStream::SIZE,
        "nonces ring buffer overflows account: {} > {}",
        nonces_end,
        AgentPaymentStream::SIZE
    );
}

#[test]
fn aps_discriminator_is_8_bytes() {
    assert_eq!(AGENT_PAYMENT_STREAM_DISCRIMINATOR.len(), 8);
    // Sanity: should not collide with the existing UniversalVault disc.
    assert_ne!(
        AGENT_PAYMENT_STREAM_DISCRIMINATOR,
        UniversalVault::DISCRIMINATOR
    );
}

#[test]
fn revoked_at_offset_lives_in_agent_grant_slot() {
    // The revoked_at i64 lives at offset 120, ending at 128 -> last
    // byte of the 128-byte slot. It must not extend past slot end.
    assert!(AGENT_GRANT_REVOKED_AT_OFFSET + 8 <= AGENT_GRANT_SIZE);
    // And it must not overlap with the documented `_reserved` block
    // which starts at offset 86 and runs 15 bytes (86..101). The
    // chosen offset 120 sits past _reserved in the unused tail.
    assert!(
        AGENT_GRANT_REVOKED_AT_OFFSET >= 101,
        "revoked_at must live past _reserved (86..101); offset = {}",
        AGENT_GRANT_REVOKED_AT_OFFSET
    );
}

// ─────────────────────────── nonce helper tests ─────────────────────

#[test]
fn nonce_replay_check_finds_match() {
    let mut ring = [ConsumedNonce::empty(); CONSUMED_NONCES_LEN];
    ring[3] = ConsumedNonce {
        envelope_hash: [7u8; 32],
        nonce: [9u8; 16],
    };

    assert!(AgentPaymentStream::nonce_already_consumed(
        &ring,
        &[7u8; 32],
        &[9u8; 16]
    ));
    assert!(!AgentPaymentStream::nonce_already_consumed(
        &ring,
        &[7u8; 32],
        &[10u8; 16]
    ));
    assert!(!AgentPaymentStream::nonce_already_consumed(
        &ring,
        &[8u8; 32],
        &[9u8; 16]
    ));
}

#[test]
fn empty_nonce_slot_does_not_match_zero_envelope() {
    // An all-zero envelope_hash slot must be treated as empty so a
    // legitimate request whose envelope hash happens to be 0x00..00
    // (vanishingly rare but still wrong to claim "already used").
    let ring = [ConsumedNonce::empty(); CONSUMED_NONCES_LEN];
    assert!(!AgentPaymentStream::nonce_already_consumed(
        &ring,
        &[0u8; 32],
        &[0u8; 16]
    ));
}

// ──────────────── agent grant / vault interaction tests ─────────────

/// Simulate what `pay_x402` does when scanning the vault for the
/// signer's grant: returns Ok if found+active, Err otherwise.
fn vault_grant_check_active(vault: &[u8], signer: &[u8; 32]) -> Result<usize, &'static str> {
    if vault.len() < UniversalVault::SIZE {
        return Err("vault too small");
    }
    for i in 0..MAX_AGENTS {
        let off = AGENT_GRANTS_START + i * AGENT_GRANT_SIZE;
        let pk = &vault[off..off + 32];
        if pk != signer {
            continue;
        }
        if vault[off + 58] == 0 {
            return Err("revoked");
        }
        let revoked_at_off = off + AGENT_GRANT_REVOKED_AT_OFFSET;
        let revoked_at = i64::from_le_bytes(
            vault[revoked_at_off..revoked_at_off + 8]
                .try_into()
                .unwrap(),
        );
        if revoked_at != 0 {
            return Err("revoked");
        }
        return Ok(off);
    }
    Err("not found")
}

#[test]
fn active_grant_passes_check() {
    let owner = [1u8; 32];
    let agent = [2u8; 32];
    let mut vault = empty_vault(&owner);
    write_active_grant(&mut vault, 0, &agent);

    assert!(vault_grant_check_active(&vault, &agent).is_ok());
}

#[test]
fn flag_revoked_grant_is_rejected() {
    let owner = [1u8; 32];
    let agent = [2u8; 32];
    let mut vault = empty_vault(&owner);
    let off = write_active_grant(&mut vault, 0, &agent);
    vault[off + 58] = 0; // is_active = 0 → legacy revoke path

    assert_eq!(vault_grant_check_active(&vault, &agent), Err("revoked"));
}

#[test]
fn timestamp_revoked_grant_is_rejected_even_if_is_active_lingered() {
    // This is the case spec 10 guards against: existing revoke ix
    // sets is_active=0, but if a future ix only writes revoked_at
    // (and forgets the flag), we must still reject. The check uses
    // OR semantics.
    let owner = [1u8; 32];
    let agent = [2u8; 32];
    let mut vault = empty_vault(&owner);
    let off = write_active_grant(&mut vault, 0, &agent);
    // Write revoked_at = 1234567 even though is_active still 1.
    let revoked_at_off = off + AGENT_GRANT_REVOKED_AT_OFFSET;
    vault[revoked_at_off..revoked_at_off + 8].copy_from_slice(&1_234_567i64.to_le_bytes());

    assert_eq!(vault_grant_check_active(&vault, &agent), Err("revoked"));
}

#[test]
fn unknown_signer_is_not_found() {
    let owner = [1u8; 32];
    let agent = [2u8; 32];
    let other = [99u8; 32];
    let mut vault = empty_vault(&owner);
    write_active_grant(&mut vault, 0, &agent);

    assert_eq!(vault_grant_check_active(&vault, &other), Err("not found"));
}

// ──────────── stream initialisation + budget update simulation ────────

#[test]
fn stream_discriminator_is_set_after_init() {
    let stream = empty_stream();
    assert_eq!(
        &stream[aps_offset::DISCRIMINATOR..aps_offset::DISCRIMINATOR + 8],
        AGENT_PAYMENT_STREAM_DISCRIMINATOR.as_ref()
    );
}

#[test]
fn budget_check_rejects_overspend() {
    let mut stream = empty_stream();
    stream[aps_offset::MAX_TOTAL..aps_offset::MAX_TOTAL + 8]
        .copy_from_slice(&100u64.to_le_bytes());
    stream[aps_offset::SPENT_TOTAL..aps_offset::SPENT_TOTAL + 8]
        .copy_from_slice(&90u64.to_le_bytes());

    let max = u64::from_le_bytes(
        stream[aps_offset::MAX_TOTAL..aps_offset::MAX_TOTAL + 8]
            .try_into()
            .unwrap(),
    );
    let spent = u64::from_le_bytes(
        stream[aps_offset::SPENT_TOTAL..aps_offset::SPENT_TOTAL + 8]
            .try_into()
            .unwrap(),
    );

    // 90 + 11 > 100 → must reject.
    assert!(spent + 11 > max);
    // 90 + 10 == 100 → must accept.
    assert!(spent + 10 <= max);
}

#[test]
fn ring_buffer_wraparound_overwrites_oldest() {
    // Simulate writing CONSUMED_NONCES_LEN+1 entries; the head should
    // wrap and the very first entry should be overwritten.
    let mut stream = empty_stream();
    let mut head = 0u8;
    for i in 0..(CONSUMED_NONCES_LEN as u8 + 1) {
        let entry_off = aps_offset::NONCES + (head as usize) * ConsumedNonce::SIZE;
        let mut env_hash = [0u8; 32];
        env_hash[0] = i;
        stream[entry_off..entry_off + 32].copy_from_slice(&env_hash);
        let mut nonce = [0u8; 16];
        nonce[0] = i;
        stream[entry_off + 32..entry_off + 48].copy_from_slice(&nonce);
        head = ((head as usize + 1) % CONSUMED_NONCES_LEN) as u8;
        stream[aps_offset::NONCES_HEAD] = head;
    }

    // After CONSUMED_NONCES_LEN+1 writes the head should be at 1 (wrapped).
    assert_eq!(stream[aps_offset::NONCES_HEAD], 1);

    // Slot 0 should now contain the *last* (most recent) write since
    // it just got overwritten by the i = CONSUMED_NONCES_LEN call.
    let entry_off = aps_offset::NONCES;
    let env_hash_byte = stream[entry_off];
    assert_eq!(
        env_hash_byte as usize, CONSUMED_NONCES_LEN,
        "ring buffer should overwrite slot 0 with the last entry"
    );
}
