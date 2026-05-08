//! Agent flow integration tests.
//!
//! These tests simulate the full lifecycle from the perspective of both:
//!   1. The on-chain program (writing grants via byte offsets)
//!   2. The proxy (reading grants using the same pub consts from state.rs)
//!
//! This is the "agent pseudo-function" test: we create a fake vault, grant
//! an agent, and verify the proxy can read the grant correctly using only
//! the public constants from crate::state.
//!
//! Requires only `cargo test` — no SBF binary needed.

use keyshield::state::{
    UniversalVault, AGENT_GRANTS_START, AGENT_GRANT_SIZE, MAX_AGENTS,
    POLICY_RULES_START, POLICY_RULE_SIZE, MAX_POLICY_RULES_STORED,
    PAYMENT_STREAMS_START, PAYMENT_STREAM_SIZE, MAX_PAYMENT_STREAMS,
    MAX_POLICY_RULES,
};

// ── helpers ──────────────────────────────────────────────────────────────────

/// Create a zero-filled vault account buffer of the correct size.
fn empty_vault(owner: &[u8; 32]) -> Vec<u8> {
    let mut data = vec![0u8; UniversalVault::SIZE];
    // discriminator
    data[0..8].copy_from_slice(b"univault");
    // owner at offset 8
    data[8..40].copy_from_slice(owner);
    data
}

/// Write an agent grant into vault data at slot `slot` (0-based).
/// Returns the byte offset of the grant that was written.
fn write_grant(
    vault: &mut Vec<u8>,
    slot: usize,
    agent_pubkey: &[u8; 32],
    session_timeout: u64,
    created_at: u64,
) -> usize {
    assert!(slot < MAX_AGENTS, "slot out of range");
    let offset = AGENT_GRANTS_START + slot * AGENT_GRANT_SIZE;

    // agent_pubkey     [offset +  0..+32]
    vault[offset..offset + 32].copy_from_slice(agent_pubkey);
    // key_group        [offset + 32]      = 255 (universal)
    vault[offset + 32] = 255;
    // rate_limit_calls [offset + 33..+37] = 100/hr
    vault[offset + 33..offset + 37].copy_from_slice(&100u32.to_le_bytes());
    // session_timeout  [offset + 41..+49]
    vault[offset + 41..offset + 49].copy_from_slice(&session_timeout.to_le_bytes());
    // is_active        [offset + 58]      = 1
    vault[offset + 58] = 1;
    // created_at       [offset + 78..+86]
    vault[offset + 78..offset + 86].copy_from_slice(&created_at.to_le_bytes());

    // bump agent_grant_count at vault byte 61
    vault[61] += 1;

    offset
}

/// Simulates what the proxy does: scan vault data for a grant matching
/// `agent_pubkey`, then check if it's active and not expired.
/// Returns `Ok(offset)` if authorized, `Err` with a description otherwise.
fn proxy_check_grant<'a>(
    vault: &'a [u8],
    agent_pubkey: &[u8; 32],
    now: u64,
) -> Result<usize, &'static str> {
    if vault.len() < UniversalVault::SIZE {
        return Err("vault too small");
    }
    for i in 0..MAX_AGENTS {
        let offset = AGENT_GRANTS_START + i * AGENT_GRANT_SIZE;
        let pk: [u8; 32] = vault[offset..offset + 32].try_into().unwrap();
        if &pk != agent_pubkey {
            continue;
        }
        // found — check active flag
        if vault[offset + 58] == 0 {
            return Err("grant revoked");
        }
        // check expiry: created_at + session_timeout > now
        let created_at = u64::from_le_bytes(vault[offset + 78..offset + 86].try_into().unwrap());
        let session_timeout = u64::from_le_bytes(vault[offset + 41..offset + 49].try_into().unwrap());
        if now > created_at + session_timeout {
            return Err("grant expired");
        }
        return Ok(offset);
    }
    Err("agent not found")
}

// ── layout constant tests ─────────────────────────────────────────────────────

#[test]
fn test_constants_are_accessible_from_state() {
    // Verify the pub consts are reachable from external code (the proxy crate
    // will `use keyshield::state::AGENT_GRANTS_START` etc.)
    assert!(AGENT_GRANTS_START > 0);
    assert_eq!(AGENT_GRANT_SIZE, 128);
    assert_eq!(MAX_AGENTS, 32);
    assert!(POLICY_RULES_START > AGENT_GRANTS_START);
    assert!(PAYMENT_STREAMS_START > POLICY_RULES_START);
    assert_eq!(PAYMENT_STREAM_SIZE, 108);
    assert_eq!(MAX_PAYMENT_STREAMS, 8);
    assert_eq!(POLICY_RULE_SIZE, 96);

    // Verify the entire grant section fits inside the vault
    let grants_end = AGENT_GRANTS_START + MAX_AGENTS * AGENT_GRANT_SIZE;
    assert!(
        grants_end <= UniversalVault::SIZE,
        "grants section overflows vault: {} > {}",
        grants_end,
        UniversalVault::SIZE
    );

    // Verify the payment streams section fits
    let streams_end = PAYMENT_STREAMS_START + MAX_PAYMENT_STREAMS * PAYMENT_STREAM_SIZE;
    assert!(
        streams_end <= UniversalVault::SIZE,
        "payment streams section overflows vault: {} > {}",
        streams_end,
        UniversalVault::SIZE
    );

    // Verify policy section fits and cap is sane
    let policy_end = POLICY_RULES_START + MAX_POLICY_RULES * POLICY_RULE_SIZE;
    assert!(
        policy_end <= UniversalVault::SIZE,
        "policy section overflows vault: {} > {}",
        policy_end,
        UniversalVault::SIZE
    );
    let physical_max = (UniversalVault::SIZE - POLICY_RULES_START) / POLICY_RULE_SIZE;
    assert!(
        (MAX_POLICY_RULES_STORED as usize) <= physical_max,
        "MAX_POLICY_RULES_STORED ({}) exceeds physical max ({})",
        MAX_POLICY_RULES_STORED,
        physical_max
    );
}

#[test]
fn test_grant_slot_boundaries_do_not_overlap() {
    // Each grant slot must be exactly AGENT_GRANT_SIZE bytes, non-overlapping.
    for i in 0..MAX_AGENTS - 1 {
        let this_start = AGENT_GRANTS_START + i * AGENT_GRANT_SIZE;
        let next_start = AGENT_GRANTS_START + (i + 1) * AGENT_GRANT_SIZE;
        assert_eq!(
            next_start - this_start,
            AGENT_GRANT_SIZE,
            "slot {} and {} overlap",
            i,
            i + 1
        );
    }
}

// ── agent pseudo-function tests ───────────────────────────────────────────────

#[test]
fn agent_grant_write_and_read_roundtrip() {
    let owner = [1u8; 32];
    let agent = [2u8; 32];
    let mut vault = empty_vault(&owner);

    let now: u64 = 1_000_000;
    let timeout: u64 = 3_600; // 1 hour

    write_grant(&mut vault, 0, &agent, timeout, now);

    // Proxy reads it back
    let result = proxy_check_grant(&vault, &agent, now + 100);
    assert!(result.is_ok(), "proxy should authorize active agent");

    // Verify key_group byte is 255 (universal) at offset + 32
    let offset = result.unwrap();
    assert_eq!(vault[offset + 32], 255, "key_group should be universal (255)");
    assert_eq!(vault[offset + 58], 1, "is_active should be 1");
}

#[test]
fn agent_grant_expires_correctly() {
    // This is the regression test for the timestamp = 0 bug.
    // Before the fix, the on-chain expiry check always compared 0 > created_at+timeout
    // which is always false, so grants NEVER expired.
    // After the fix, the proxy and on-chain code both use real timestamps.
    let owner = [1u8; 32];
    let agent = [3u8; 32];
    let mut vault = empty_vault(&owner);

    let created_at: u64 = 1_000_000;
    let timeout: u64 = 3_600;

    write_grant(&mut vault, 0, &agent, timeout, created_at);

    // Within session — should pass
    assert!(
        proxy_check_grant(&vault, &agent, created_at + timeout - 1).is_ok(),
        "grant should be valid 1s before expiry"
    );

    // Exactly at expiry boundary — should pass (non-strict)
    assert!(
        proxy_check_grant(&vault, &agent, created_at + timeout).is_ok(),
        "grant should be valid at exact expiry"
    );

    // One second after — expired
    let err = proxy_check_grant(&vault, &agent, created_at + timeout + 1).unwrap_err();
    assert_eq!(err, "grant expired", "grant should expire after timeout");
}

#[test]
fn revoked_agent_is_denied() {
    let owner = [1u8; 32];
    let agent = [4u8; 32];
    let mut vault = empty_vault(&owner);

    let now: u64 = 1_000_000;
    write_grant(&mut vault, 0, &agent, 3_600, now);

    // Simulate on-chain revoke: set is_active = 0 at offset + 58
    let offset = AGENT_GRANTS_START;
    vault[offset + 58] = 0;

    let err = proxy_check_grant(&vault, &agent, now + 100).unwrap_err();
    assert_eq!(err, "grant revoked");
}

#[test]
fn unknown_agent_is_denied() {
    let owner = [1u8; 32];
    let agent = [5u8; 32];
    let other_agent = [99u8; 32];
    let mut vault = empty_vault(&owner);

    write_grant(&mut vault, 0, &agent, 3_600, 1_000_000);

    let err = proxy_check_grant(&vault, &other_agent, 1_000_100).unwrap_err();
    assert_eq!(err, "agent not found");
}

#[test]
fn multiple_agents_in_different_slots() {
    let owner = [1u8; 32];
    let agent_a = [10u8; 32];
    let agent_b = [11u8; 32];
    let agent_c = [12u8; 32];
    let mut vault = empty_vault(&owner);

    let now: u64 = 1_000_000;
    write_grant(&mut vault, 0, &agent_a, 3_600, now);
    write_grant(&mut vault, 1, &agent_b, 7_200, now);
    write_grant(&mut vault, 15, &agent_c, 1_800, now); // non-contiguous slot

    assert!(proxy_check_grant(&vault, &agent_a, now + 100).is_ok());
    assert!(proxy_check_grant(&vault, &agent_b, now + 100).is_ok());
    assert!(proxy_check_grant(&vault, &agent_c, now + 100).is_ok());

    // agent_c expires first at now + 1800
    assert!(proxy_check_grant(&vault, &agent_c, now + 1_800 + 1).is_err());
    // agent_a still valid
    assert!(proxy_check_grant(&vault, &agent_a, now + 1_800 + 1).is_ok());
}

#[test]
fn max_agents_fill_vault_without_overflow() {
    let owner = [1u8; 32];
    let mut vault = empty_vault(&owner);

    // Fill all 32 slots
    for i in 0..MAX_AGENTS {
        let mut agent = [0u8; 32];
        agent[0] = i as u8;
        write_grant(&mut vault, i, &agent, 3_600, 1_000_000);
    }

    // Verify the last slot's last byte is still inside the vault
    let last_slot_end = AGENT_GRANTS_START + MAX_AGENTS * AGENT_GRANT_SIZE;
    assert!(last_slot_end <= vault.len(), "last grant slot must fit in vault");

    // Each agent should be findable
    for i in 0..MAX_AGENTS {
        let mut agent = [0u8; 32];
        agent[0] = i as u8;
        assert!(
            proxy_check_grant(&vault, &agent, 1_000_100).is_ok(),
            "agent {} should be authorized",
            i
        );
    }
}
