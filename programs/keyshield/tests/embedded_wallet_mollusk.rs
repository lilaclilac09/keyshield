//! Mollusk integration tests for the embedded-wallet ixs (#24-#27).
//!
//! Run from workspace root:
//!   `cargo build-sbf && cargo test -p keyshield --test embedded_wallet_mollusk`
//!
//! Coverage (per spec 10 §test plan, line 561-565):
//!
//! ix #25 `pay_x402`:
//!   - replay rejected (NonceReused, 6101)
//!   - over-budget rejected (BudgetExceeded, 6100)
//!   - revoked agent rejected (AgentRevoked, 6102)
//!   - missing signer rejected
//!
//! ix #26 `mpp_settle`:
//!   - non-settler rejected (NotMppSettler, 6107)
//!
//! ix #27 `withdraw_agent_wallet`:
//!   - non-owner rejected (NotOwner, 6103)
//!   - not-revoked rejected (PaymentStreamActive, 6051)
//!
//! ix #24 `OpenPaymentStream`:
//!   - data-too-short rejected
//!   - non-signer owner rejected
//!
//! These tests target the error paths that abort *before* any SPL
//! Token Program CPI, so they don't require the SPL Token program to
//! be loaded into Mollusk. The happy-path (which CPIs into Token) is
//! covered end-to-end by the Surfpool integration test described in
//! spec 10 §test plan, not Mollusk.

mod common;

use common::{program_id, set_sbf_out_dir};
use keyshield::state::{
    aps_offset, AgentPaymentStream, AGENT_GRANTS_START, AGENT_GRANT_REVOKED_AT_OFFSET,
    AGENT_GRANT_SIZE, AGENT_PAYMENT_STREAM_DISCRIMINATOR, CONSUMED_NONCES_LEN, ConsumedNonce,
    UniversalVault,
};
use mollusk_svm::{result::Check, Mollusk};
use solana_sdk::{
    account::{AccountSharedData, WritableAccount},
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program,
};

// ───────────────────────────── helpers ─────────────────────────────

const VAULT_DISC: [u8; 8] = *b"univault";

fn make_vault_with_active_grant(
    owner: &Pubkey,
    agent: &Pubkey,
) -> AccountSharedData {
    let mut data = vec![0u8; UniversalVault::SIZE];
    data[0..8].copy_from_slice(&VAULT_DISC);
    data[8..40].copy_from_slice(owner.as_ref());

    // slot 0: agent active, revoked_at = 0.
    let off = AGENT_GRANTS_START;
    data[off..off + 32].copy_from_slice(agent.as_ref());
    data[off + 58] = 1;
    // revoked_at remains zero from the zero-fill.

    AccountSharedData::create(1_000_000_000, data, program_id(), false, 0)
}

fn make_vault_with_revoked_grant(
    owner: &Pubkey,
    agent: &Pubkey,
) -> AccountSharedData {
    let mut data = vec![0u8; UniversalVault::SIZE];
    data[0..8].copy_from_slice(&VAULT_DISC);
    data[8..40].copy_from_slice(owner.as_ref());
    let off = AGENT_GRANTS_START;
    data[off..off + 32].copy_from_slice(agent.as_ref());
    data[off + 58] = 1;
    // Mark revoked via the new revoked_at field even though is_active stays 1
    // (this is the path spec 10 explicitly tests — Q6 / 10.2 acceptance).
    let revoked_at_off = off + AGENT_GRANT_REVOKED_AT_OFFSET;
    data[revoked_at_off..revoked_at_off + 8].copy_from_slice(&1234567890i64.to_le_bytes());
    AccountSharedData::create(1_000_000_000, data, program_id(), false, 0)
}

#[allow(clippy::too_many_arguments)]
fn make_stream(
    owner: &Pubkey,
    agent: &Pubkey,
    settler: &Pubkey,
    usdc_mint: &Pubkey,
    usdc_ata: &Pubkey,
    max_total: u64,
    spent: u64,
    bump: u8,
    is_active: u8,
) -> AccountSharedData {
    let mut data = vec![0u8; AgentPaymentStream::SIZE];
    data[aps_offset::DISCRIMINATOR..aps_offset::DISCRIMINATOR + 8]
        .copy_from_slice(&AGENT_PAYMENT_STREAM_DISCRIMINATOR);
    data[aps_offset::OWNER..aps_offset::OWNER + 32].copy_from_slice(owner.as_ref());
    data[aps_offset::AGENT_PUBKEY..aps_offset::AGENT_PUBKEY + 32].copy_from_slice(agent.as_ref());
    data[aps_offset::MPP_SETTLER..aps_offset::MPP_SETTLER + 32].copy_from_slice(settler.as_ref());
    data[aps_offset::USDC_MINT..aps_offset::USDC_MINT + 32].copy_from_slice(usdc_mint.as_ref());
    data[aps_offset::USDC_ATA..aps_offset::USDC_ATA + 32].copy_from_slice(usdc_ata.as_ref());
    data[aps_offset::MAX_TOTAL..aps_offset::MAX_TOTAL + 8]
        .copy_from_slice(&max_total.to_le_bytes());
    data[aps_offset::SPENT_TOTAL..aps_offset::SPENT_TOTAL + 8]
        .copy_from_slice(&spent.to_le_bytes());
    // cost_per_unit = 1, so units_consumed maps 1:1 to micro-USDC.
    data[aps_offset::COST_PER_UNIT..aps_offset::COST_PER_UNIT + 8]
        .copy_from_slice(&1u64.to_le_bytes());
    data[aps_offset::IS_ACTIVE] = is_active;
    data[aps_offset::BUMP] = bump;
    AccountSharedData::create(2_000_000, data, program_id(), false, 0)
}

fn write_consumed_nonce(stream: &mut AccountSharedData, slot: usize, env_hash: &[u8; 32], nonce: &[u8; 16]) {
    let entry_off = aps_offset::NONCES + slot * ConsumedNonce::SIZE;
    let data = stream.data_as_mut_slice();
    data[entry_off..entry_off + 32].copy_from_slice(env_hash);
    data[entry_off + 32..entry_off + 48].copy_from_slice(nonce);
    // Bump head so wrap math stays sane.
    if (data[aps_offset::NONCES_HEAD] as usize) <= slot {
        data[aps_offset::NONCES_HEAD] = ((slot + 1) % CONSUMED_NONCES_LEN) as u8;
    }
}

fn fresh_owned_account() -> AccountSharedData {
    AccountSharedData::new(10_000_000, 0, &system_program::id())
}

fn empty_token_account(owner_pk: &Pubkey, mint: &Pubkey) -> AccountSharedData {
    // SPL token account layout is 165 bytes. We don't initialise the
    // SPL Token program in Mollusk for these tests — the on-chain
    // code will use the pubkey for equality checks only; SPL Token
    // CPIs short-circuit on errors before reaching us.
    let _ = (owner_pk, mint);
    AccountSharedData::create(2_039_280, vec![0u8; 165], spl_token_id(), false, 0)
}

fn spl_token_id() -> Pubkey {
    // Hard-coded pubkey for "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA".
    // Pulled from the SPL Token v3 mainnet program ID, base58-decoded.
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        .parse()
        .unwrap()
}

fn build_pay_x402_data(amount: u64, nonce: [u8; 16], expires_at: i64, env_hash: [u8; 32]) -> Vec<u8> {
    let mut data = vec![25u8]; // discriminator
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(&nonce);
    data.extend_from_slice(&expires_at.to_le_bytes());
    data.extend_from_slice(&env_hash);
    data
}

fn build_mpp_settle_data(units: u64) -> Vec<u8> {
    let mut data = vec![26u8];
    data.extend_from_slice(&units.to_le_bytes());
    data
}

fn build_withdraw_data(amount: u64) -> Vec<u8> {
    let mut data = vec![27u8];
    data.extend_from_slice(&amount.to_le_bytes());
    data
}

fn build_open_stream_data(
    bump: u8,
    max_total: u64,
    cost_per_unit: u64,
    max_rate_bits: u64,
    interval: u32,
) -> Vec<u8> {
    let mut data = vec![24u8];
    data.push(bump);
    data.extend_from_slice(&max_total.to_le_bytes());
    data.extend_from_slice(&cost_per_unit.to_le_bytes());
    data.extend_from_slice(&max_rate_bits.to_le_bytes());
    data.extend_from_slice(&interval.to_le_bytes());
    data
}

// ─────────────────────────── pay_x402 tests ─────────────────────────

#[test]
fn pay_x402_revoked_agent_rejected_with_6102() {
    set_sbf_out_dir();
    let pid = program_id();
    let mollusk = Mollusk::new(&pid, "keyshield");

    let owner = Pubkey::new_unique();
    let agent = Pubkey::new_unique();   // EphemeralSigner = agent's grant pubkey
    let settler = Pubkey::new_unique();
    let mint = Pubkey::new_unique();
    let stream_pk = Pubkey::new_unique();
    let stream_ata = Pubkey::new_unique();
    let recipient_ata = Pubkey::new_unique();

    let vault_pk = Pubkey::new_unique();
    let vault_acc = make_vault_with_revoked_grant(&owner, &agent);
    let stream_acc = make_stream(
        &owner, &agent, &settler, &mint, &stream_ata,
        100, 0, 254, 1,
    );

    let agent_acc = fresh_owned_account();
    let stream_ata_acc = empty_token_account(&stream_pk, &mint);
    let recip_ata_acc = empty_token_account(&owner, &mint);
    let mint_acc = AccountSharedData::create(1_461_600, vec![0u8; 82], spl_token_id(), false, 0);
    let token_program = AccountSharedData::create(1, vec![0u8; 1], pid, true, 0);
    let self_program = token_program.clone();

    let data = build_pay_x402_data(10, [1u8; 16], i64::MAX / 2, [9u8; 32]);

    let ix = Instruction::new_with_bytes(pid, &data, vec![
        AccountMeta::new_readonly(agent, true),
        AccountMeta::new_readonly(vault_pk, false),
        AccountMeta::new(stream_pk, false),
        AccountMeta::new(stream_ata, false),
        AccountMeta::new(recipient_ata, false),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new_readonly(spl_token_id(), false),
        AccountMeta::new_readonly(pid, false),
    ]);

    let accounts = [
        (agent, agent_acc),
        (vault_pk, vault_acc),
        (stream_pk, stream_acc),
        (stream_ata, stream_ata_acc),
        (recipient_ata, recip_ata_acc),
        (mint, mint_acc),
        (spl_token_id(), token_program),
        (pid, self_program),
    ];

    mollusk.process_and_validate_instruction(
        &ix,
        &accounts,
        &[Check::err(ProgramError::Custom(6102))],
    );
}

#[test]
fn pay_x402_replay_rejected_with_6101() {
    set_sbf_out_dir();
    let pid = program_id();
    let mollusk = Mollusk::new(&pid, "keyshield");

    let owner = Pubkey::new_unique();
    let agent = Pubkey::new_unique();
    let settler = Pubkey::new_unique();
    let mint = Pubkey::new_unique();
    let stream_pk = Pubkey::new_unique();
    let stream_ata = Pubkey::new_unique();
    let recipient_ata = Pubkey::new_unique();
    let vault_pk = Pubkey::new_unique();

    let vault_acc = make_vault_with_active_grant(&owner, &agent);

    let nonce = [42u8; 16];
    let env_hash = [77u8; 32];
    let mut stream_acc = make_stream(
        &owner, &agent, &settler, &mint, &stream_ata,
        1_000, 0, 254, 1,
    );
    write_consumed_nonce(&mut stream_acc, 0, &env_hash, &nonce);

    let agent_acc = fresh_owned_account();
    let stream_ata_acc = empty_token_account(&stream_pk, &mint);
    let recip_ata_acc = empty_token_account(&owner, &mint);
    let mint_acc = AccountSharedData::create(1_461_600, vec![0u8; 82], spl_token_id(), false, 0);
    let token_program = AccountSharedData::create(1, vec![0u8; 1], pid, true, 0);
    let self_program = token_program.clone();

    let data = build_pay_x402_data(10, nonce, i64::MAX / 2, env_hash);

    let ix = Instruction::new_with_bytes(pid, &data, vec![
        AccountMeta::new_readonly(agent, true),
        AccountMeta::new_readonly(vault_pk, false),
        AccountMeta::new(stream_pk, false),
        AccountMeta::new(stream_ata, false),
        AccountMeta::new(recipient_ata, false),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new_readonly(spl_token_id(), false),
        AccountMeta::new_readonly(pid, false),
    ]);

    let accounts = [
        (agent, agent_acc),
        (vault_pk, vault_acc),
        (stream_pk, stream_acc),
        (stream_ata, stream_ata_acc),
        (recipient_ata, recip_ata_acc),
        (mint, mint_acc),
        (spl_token_id(), token_program),
        (pid, self_program),
    ];

    mollusk.process_and_validate_instruction(
        &ix,
        &accounts,
        &[Check::err(ProgramError::Custom(6101))],
    );
}

#[test]
fn pay_x402_over_budget_rejected_with_6100() {
    set_sbf_out_dir();
    let pid = program_id();
    let mollusk = Mollusk::new(&pid, "keyshield");

    let owner = Pubkey::new_unique();
    let agent = Pubkey::new_unique();
    let settler = Pubkey::new_unique();
    let mint = Pubkey::new_unique();
    let stream_pk = Pubkey::new_unique();
    let stream_ata = Pubkey::new_unique();
    let recipient_ata = Pubkey::new_unique();
    let vault_pk = Pubkey::new_unique();

    let vault_acc = make_vault_with_active_grant(&owner, &agent);
    // max_total 100, already spent 95, asking for 10 → would be 105 > 100.
    let stream_acc = make_stream(
        &owner, &agent, &settler, &mint, &stream_ata,
        100, 95, 254, 1,
    );

    let agent_acc = fresh_owned_account();
    let stream_ata_acc = empty_token_account(&stream_pk, &mint);
    let recip_ata_acc = empty_token_account(&owner, &mint);
    let mint_acc = AccountSharedData::create(1_461_600, vec![0u8; 82], spl_token_id(), false, 0);
    let token_program = AccountSharedData::create(1, vec![0u8; 1], pid, true, 0);
    let self_program = token_program.clone();

    let data = build_pay_x402_data(10, [3u8; 16], i64::MAX / 2, [4u8; 32]);

    let ix = Instruction::new_with_bytes(pid, &data, vec![
        AccountMeta::new_readonly(agent, true),
        AccountMeta::new_readonly(vault_pk, false),
        AccountMeta::new(stream_pk, false),
        AccountMeta::new(stream_ata, false),
        AccountMeta::new(recipient_ata, false),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new_readonly(spl_token_id(), false),
        AccountMeta::new_readonly(pid, false),
    ]);

    let accounts = [
        (agent, agent_acc),
        (vault_pk, vault_acc),
        (stream_pk, stream_acc),
        (stream_ata, stream_ata_acc),
        (recipient_ata, recip_ata_acc),
        (mint, mint_acc),
        (spl_token_id(), token_program),
        (pid, self_program),
    ];

    mollusk.process_and_validate_instruction(
        &ix,
        &accounts,
        &[Check::err(ProgramError::Custom(6100))],
    );
}

#[test]
fn pay_x402_signer_must_be_signer() {
    set_sbf_out_dir();
    let pid = program_id();
    let mollusk = Mollusk::new(&pid, "keyshield");

    let owner = Pubkey::new_unique();
    let agent = Pubkey::new_unique();
    let settler = Pubkey::new_unique();
    let mint = Pubkey::new_unique();
    let stream_pk = Pubkey::new_unique();
    let stream_ata = Pubkey::new_unique();
    let recipient_ata = Pubkey::new_unique();
    let vault_pk = Pubkey::new_unique();

    let vault_acc = make_vault_with_active_grant(&owner, &agent);
    let stream_acc = make_stream(&owner, &agent, &settler, &mint, &stream_ata, 100, 0, 254, 1);

    let agent_acc = fresh_owned_account();
    let stream_ata_acc = empty_token_account(&stream_pk, &mint);
    let recip_ata_acc = empty_token_account(&owner, &mint);
    let mint_acc = AccountSharedData::create(1_461_600, vec![0u8; 82], spl_token_id(), false, 0);
    let token_program = AccountSharedData::create(1, vec![0u8; 1], pid, true, 0);
    let self_program = token_program.clone();

    let data = build_pay_x402_data(10, [1u8; 16], i64::MAX / 2, [2u8; 32]);

    // is_signer: false on agent — should fail with InvalidEphemeralSigner (6072).
    let ix = Instruction::new_with_bytes(pid, &data, vec![
        AccountMeta::new_readonly(agent, false),
        AccountMeta::new_readonly(vault_pk, false),
        AccountMeta::new(stream_pk, false),
        AccountMeta::new(stream_ata, false),
        AccountMeta::new(recipient_ata, false),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new_readonly(spl_token_id(), false),
        AccountMeta::new_readonly(pid, false),
    ]);

    let accounts = [
        (agent, agent_acc),
        (vault_pk, vault_acc),
        (stream_pk, stream_acc),
        (stream_ata, stream_ata_acc),
        (recipient_ata, recip_ata_acc),
        (mint, mint_acc),
        (spl_token_id(), token_program),
        (pid, self_program),
    ];

    mollusk.process_and_validate_instruction(
        &ix,
        &accounts,
        &[Check::err(ProgramError::Custom(6072))],
    );
}

// ──────────────────────── mpp_settle tests ──────────────────────────

#[test]
fn mpp_settle_non_settler_rejected_with_6107() {
    set_sbf_out_dir();
    let pid = program_id();
    let mollusk = Mollusk::new(&pid, "keyshield");

    let owner = Pubkey::new_unique();
    let agent = Pubkey::new_unique();
    let real_settler = Pubkey::new_unique();
    let imposter = Pubkey::new_unique(); // signs but isn't recorded as settler
    let mint = Pubkey::new_unique();
    let stream_pk = Pubkey::new_unique();
    let stream_ata = Pubkey::new_unique();
    let recipient_ata = Pubkey::new_unique();
    let vault_pk = Pubkey::new_unique();

    let vault_acc = make_vault_with_active_grant(&owner, &agent);
    let stream_acc = make_stream(&owner, &agent, &real_settler, &mint, &stream_ata, 1_000, 0, 254, 1);

    let imposter_acc = fresh_owned_account();
    let stream_ata_acc = empty_token_account(&stream_pk, &mint);
    let recip_ata_acc = empty_token_account(&owner, &mint);
    let mint_acc = AccountSharedData::create(1_461_600, vec![0u8; 82], spl_token_id(), false, 0);
    let token_program = AccountSharedData::create(1, vec![0u8; 1], pid, true, 0);

    let data = build_mpp_settle_data(5);

    let ix = Instruction::new_with_bytes(pid, &data, vec![
        AccountMeta::new_readonly(imposter, true),
        AccountMeta::new_readonly(vault_pk, false),
        AccountMeta::new(stream_pk, false),
        AccountMeta::new(stream_ata, false),
        AccountMeta::new(recipient_ata, false),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new_readonly(spl_token_id(), false),
    ]);

    let accounts = [
        (imposter, imposter_acc),
        (vault_pk, vault_acc),
        (stream_pk, stream_acc),
        (stream_ata, stream_ata_acc),
        (recipient_ata, recip_ata_acc),
        (mint, mint_acc),
        (spl_token_id(), token_program),
    ];

    mollusk.process_and_validate_instruction(
        &ix,
        &accounts,
        &[Check::err(ProgramError::Custom(6107))],
    );
}

// ──────────────── withdraw_agent_wallet tests ──────────────────────

#[test]
fn withdraw_non_owner_rejected_with_6103() {
    set_sbf_out_dir();
    let pid = program_id();
    let mollusk = Mollusk::new(&pid, "keyshield");

    let owner = Pubkey::new_unique();
    let imposter = Pubkey::new_unique();
    let agent = Pubkey::new_unique();
    let settler = Pubkey::new_unique();
    let mint = Pubkey::new_unique();
    let stream_pk = Pubkey::new_unique();
    let stream_ata = Pubkey::new_unique();
    let owner_ata = Pubkey::new_unique();
    let vault_pk = Pubkey::new_unique();

    let vault_acc = make_vault_with_revoked_grant(&owner, &agent);
    let stream_acc = make_stream(&owner, &agent, &settler, &mint, &stream_ata, 1_000, 0, 254, 1);

    let imposter_acc = fresh_owned_account();
    let stream_ata_acc = empty_token_account(&stream_pk, &mint);
    let owner_ata_acc = empty_token_account(&imposter, &mint);
    let mint_acc = AccountSharedData::create(1_461_600, vec![0u8; 82], spl_token_id(), false, 0);
    let token_program = AccountSharedData::create(1, vec![0u8; 1], pid, true, 0);

    let data = build_withdraw_data(0); // amount 0 so no transfer attempted

    let ix = Instruction::new_with_bytes(pid, &data, vec![
        AccountMeta::new(imposter, true),
        AccountMeta::new_readonly(vault_pk, false),
        AccountMeta::new(stream_pk, false),
        AccountMeta::new(stream_ata, false),
        AccountMeta::new(owner_ata, false),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new_readonly(spl_token_id(), false),
    ]);

    let accounts = [
        (imposter, imposter_acc),
        (vault_pk, vault_acc),
        (stream_pk, stream_acc),
        (stream_ata, stream_ata_acc),
        (owner_ata, owner_ata_acc),
        (mint, mint_acc),
        (spl_token_id(), token_program),
    ];

    mollusk.process_and_validate_instruction(
        &ix,
        &accounts,
        &[Check::err(ProgramError::Custom(6103))],
    );
}

#[test]
fn withdraw_not_revoked_rejected() {
    set_sbf_out_dir();
    let pid = program_id();
    let mollusk = Mollusk::new(&pid, "keyshield");

    let owner = Pubkey::new_unique();
    let agent = Pubkey::new_unique();
    let settler = Pubkey::new_unique();
    let mint = Pubkey::new_unique();
    let stream_pk = Pubkey::new_unique();
    let stream_ata = Pubkey::new_unique();
    let owner_ata = Pubkey::new_unique();
    let vault_pk = Pubkey::new_unique();

    // Active grant (NOT revoked) — the spec says we must reject in
    // this case so the owner is forced to revoke before reclaiming.
    let vault_acc = make_vault_with_active_grant(&owner, &agent);
    let stream_acc = make_stream(&owner, &agent, &settler, &mint, &stream_ata, 1_000, 0, 254, 1);

    let owner_acc = fresh_owned_account();
    let stream_ata_acc = empty_token_account(&stream_pk, &mint);
    let owner_ata_acc = empty_token_account(&owner, &mint);
    let mint_acc = AccountSharedData::create(1_461_600, vec![0u8; 82], spl_token_id(), false, 0);
    let token_program = AccountSharedData::create(1, vec![0u8; 1], pid, true, 0);

    let data = build_withdraw_data(0);

    let ix = Instruction::new_with_bytes(pid, &data, vec![
        AccountMeta::new(owner, true),
        AccountMeta::new_readonly(vault_pk, false),
        AccountMeta::new(stream_pk, false),
        AccountMeta::new(stream_ata, false),
        AccountMeta::new(owner_ata, false),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new_readonly(spl_token_id(), false),
    ]);

    let accounts = [
        (owner, owner_acc),
        (vault_pk, vault_acc),
        (stream_pk, stream_acc),
        (stream_ata, stream_ata_acc),
        (owner_ata, owner_ata_acc),
        (mint, mint_acc),
        (spl_token_id(), token_program),
    ];

    // Spec says reject; we use 6051 (PaymentStreamActive) to mean
    // "stream is still active because the grant isn't revoked".
    mollusk.process_and_validate_instruction(
        &ix,
        &accounts,
        &[Check::err(ProgramError::Custom(6051))],
    );
}

// ─────────────────── OpenPaymentStream tests ────────────────────────

#[test]
fn open_stream_data_too_short_rejected() {
    set_sbf_out_dir();
    let pid = program_id();
    let mollusk = Mollusk::new(&pid, "keyshield");

    let owner = Pubkey::new_unique();
    let agent = Pubkey::new_unique();
    let mint = Pubkey::new_unique();
    let usdc_ata = Pubkey::new_unique();
    let mpp_settler = Pubkey::new_unique();
    let stream_pk = Pubkey::new_unique();
    let vault_pk = Pubkey::new_unique();

    let vault_acc = make_vault_with_active_grant(&owner, &agent);
    let owner_acc = fresh_owned_account();
    let stream_acc = AccountSharedData::new(0, 0, &system_program::id());

    // Only 2 bytes of payload — should fail with InvalidKeyData (6008).
    let data = vec![24u8, 0x01];

    let ix = Instruction::new_with_bytes(pid, &data, vec![
        AccountMeta::new(owner, true),
        AccountMeta::new_readonly(vault_pk, false),
        AccountMeta::new(stream_pk, false),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new_readonly(usdc_ata, false),
        AccountMeta::new_readonly(agent, false),
        AccountMeta::new_readonly(mpp_settler, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ]);

    let accounts = [
        (owner, owner_acc),
        (vault_pk, vault_acc),
        (stream_pk, stream_acc),
        (mint, AccountSharedData::new(0, 0, &system_program::id())),
        (usdc_ata, AccountSharedData::new(0, 0, &system_program::id())),
        (agent, AccountSharedData::new(0, 0, &system_program::id())),
        (mpp_settler, AccountSharedData::new(0, 0, &system_program::id())),
        mollusk_svm::program::keyed_account_for_system_program(),
    ];

    mollusk.process_and_validate_instruction(
        &ix,
        &accounts,
        &[Check::err(ProgramError::Custom(6008))],
    );
}

#[test]
fn open_stream_owner_must_sign() {
    set_sbf_out_dir();
    let pid = program_id();
    let mollusk = Mollusk::new(&pid, "keyshield");

    let owner = Pubkey::new_unique();
    let agent = Pubkey::new_unique();
    let mint = Pubkey::new_unique();
    let usdc_ata = Pubkey::new_unique();
    let mpp_settler = Pubkey::new_unique();
    let stream_pk = Pubkey::new_unique();
    let vault_pk = Pubkey::new_unique();

    let vault_acc = make_vault_with_active_grant(&owner, &agent);
    let owner_acc = fresh_owned_account();
    let stream_acc = AccountSharedData::new(0, 0, &system_program::id());

    let data = build_open_stream_data(254, 1_000_000, 1, 0, 60);

    // is_signer = false on owner.
    let ix = Instruction::new_with_bytes(pid, &data, vec![
        AccountMeta::new(owner, false),
        AccountMeta::new_readonly(vault_pk, false),
        AccountMeta::new(stream_pk, false),
        AccountMeta::new_readonly(mint, false),
        AccountMeta::new_readonly(usdc_ata, false),
        AccountMeta::new_readonly(agent, false),
        AccountMeta::new_readonly(mpp_settler, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ]);

    let accounts = [
        (owner, owner_acc),
        (vault_pk, vault_acc),
        (stream_pk, stream_acc),
        (mint, AccountSharedData::new(0, 0, &system_program::id())),
        (usdc_ata, AccountSharedData::new(0, 0, &system_program::id())),
        (agent, AccountSharedData::new(0, 0, &system_program::id())),
        (mpp_settler, AccountSharedData::new(0, 0, &system_program::id())),
        mollusk_svm::program::keyed_account_for_system_program(),
    ];

    mollusk.process_and_validate_instruction(
        &ix,
        &accounts,
        &[Check::err(ProgramError::Custom(6103))], // NotOwner
    );
}
