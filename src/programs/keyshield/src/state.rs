//! KeyShield Agentic - Universal Vault State
//!
//! Contains both legacy Vault (for backward compatibility) and new UniversalVault

use pinocchio::pubkey::Pubkey;

// ==================== LEGACY VAULT (Backward Compatibility) ====================

/// Maximum number of keys that can be stored in a single vault
pub const MAX_KEYS_PER_VAULT: usize = 8;

/// Single key entry within a vault (34 bytes)
#[repr(C)]
#[derive(Clone, Copy)]
pub struct KeyEntry {
    pub encrypted_key_hash: [u8; 32],
    pub key_type: u8,
    pub access_flags: u8,
}

impl KeyEntry {
    pub const SIZE: usize = 32 + 1 + 1;
    
    pub fn is_empty(&self) -> bool {
        self.encrypted_key_hash.iter().all(|&b| b == 0)
    }
    
    pub fn empty() -> Self {
        Self {
            encrypted_key_hash: [0; 32],
            key_type: 0,
            access_flags: 0,
        }
    }
}

/// Vault account structure (legacy)
#[repr(C)]
pub struct Vault {
    pub discriminator: [u8; 8],
    pub owner: Pubkey,
    pub key_count: u8,
    pub keys: [KeyEntry; MAX_KEYS_PER_VAULT],
    pub created_at: u64,
    pub vault_flags: u8,
    pub _reserved: [u8; 150],
}

impl Vault {
    pub const DISCRIMINATOR: [u8; 8] = *b"keyshld\0";
    pub const SIZE: usize = 8 + 32 + 1 + (MAX_KEYS_PER_VAULT * KeyEntry::SIZE) + 8 + 1 + 150;

    pub fn new(owner: Pubkey, created_at: u64) -> Self {
        Self {
            discriminator: Self::DISCRIMINATOR,
            owner,
            key_count: 0,
            keys: [KeyEntry::empty(); MAX_KEYS_PER_VAULT],
            created_at,
            vault_flags: 0,
            _reserved: [0; 150],
        }
    }

    pub fn verify_discriminator(&self) -> bool {
        self.discriminator == Self::DISCRIMINATOR
    }

    pub fn add_key(&mut self, encrypted_key_hash: [u8; 32], key_type: u8) -> Option<usize> {
        if self.key_count >= MAX_KEYS_PER_VAULT as u8 {
            return None;
        }
        for (idx, entry) in self.keys.iter_mut().enumerate() {
            if entry.is_empty() {
                entry.encrypted_key_hash = encrypted_key_hash;
                entry.key_type = key_type;
                entry.access_flags = 0;
                self.key_count += 1;
                return Some(idx);
            }
        }
        None
    }

    pub fn find_key(&self, encrypted_key_hash: &[u8; 32]) -> Option<usize> {
        for (idx, entry) in self.keys.iter().enumerate() {
            if !entry.is_empty() && &entry.encrypted_key_hash == encrypted_key_hash {
                return Some(idx);
            }
        }
        None
    }

    pub fn remove_key(&mut self, encrypted_key_hash: &[u8; 32]) -> bool {
        if let Some(idx) = self.find_key(encrypted_key_hash) {
            self.keys[idx] = KeyEntry::empty();
            self.key_count = self.key_count.saturating_sub(1);
            return true;
        }
        false
    }

    pub fn get_key(&self, index: usize) -> Option<&KeyEntry> {
        if index < MAX_KEYS_PER_VAULT && !self.keys[index].is_empty() {
            Some(&self.keys[index])
        } else {
            None
        }
    }

    pub fn is_full(&self) -> bool {
        self.key_count >= MAX_KEYS_PER_VAULT as u8
    }

    pub fn is_empty(&self) -> bool {
        self.key_count == 0
    }
}

/// Key type constants
pub mod key_type {
    pub const GENERIC: u8 = 0;
    pub const GITHUB: u8 = 1;
    pub const HELIUS: u8 = 2;
    pub const GOOGLE_GEMINI: u8 = 3;
}

// ==================== NEW UNIVERSAL VAULT ====================

/// Maximum number of key groups per vault
pub const MAX_KEY_GROUPS: usize = 16;

/// Maximum number of agents per vault.
/// Reduced from 32 → 8 so UniversalVault fits Solana's per-tx
/// account-data growth cap (10240 bytes). The 8064-byte deployed
/// program (slot 461190304+ on devnet) is built against this.
pub const MAX_AGENTS: usize = 8;

/// Maximum number of payment streams per vault.
/// Reduced from 8 → 4 for the same Solana per-tx cap reason.
pub const MAX_PAYMENT_STREAMS: usize = 4;

/// Maximum number of policy rules per vault.
/// Reduced from 64 → 8 for the same Solana per-tx cap reason.
pub const MAX_POLICY_RULES: usize = 8;

/// Layout byte offsets for raw UniversalVault account data.
/// Used by on-chain instructions and proxy/src/vault.rs.
/// Do not change without updating all consumers and running the drift test.
pub const AGENT_GRANTS_START: usize = 768;   // 64-byte header + 16 × 44-byte KeyGroupEntry
pub const AGENT_GRANT_SIZE: usize = 128;
pub const POLICY_RULES_START: usize = 1792;  // AGENT_GRANTS_START + MAX_AGENTS (8) × AGENT_GRANT_SIZE (128)
pub const POLICY_RULE_SIZE: usize = 96;
pub const PAYMENT_STREAMS_START: usize = 2560; // POLICY_RULES_START + MAX_POLICY_RULES (8) × POLICY_RULE_SIZE (96)
pub const PAYMENT_STREAM_SIZE: usize = 108;
/// Hard cap for the policy loop: matches the new MAX_POLICY_RULES.
pub const MAX_POLICY_RULES_STORED: u8 = 8;

/// Key group types
#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum KeyGroup {
    Generic = 0,
    OpenAI = 1,
    Anthropic = 2,
    Stripe = 3,
    Vercel = 4,
    GitHub = 5,
    Google = 6,
    PaymentUSDC = 7,
    Universal = 255,
}

impl KeyGroup {
    pub fn from_u8(value: u8) -> Self {
        match value {
            0 => KeyGroup::Generic,
            1 => KeyGroup::OpenAI,
            2 => KeyGroup::Anthropic,
            3 => KeyGroup::Stripe,
            4 => KeyGroup::Vercel,
            5 => KeyGroup::GitHub,
            6 => KeyGroup::Google,
            7 => KeyGroup::PaymentUSDC,
            255 => KeyGroup::Universal,
            _ => KeyGroup::Generic,
        }
    }

    pub fn to_u8(&self) -> u8 {
        *self as u8
    }
}

/// Policy rule types
#[repr(u8)]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum PolicyRuleType {
    DomainAllow = 0,
    DomainBlock = 1,
    RateLimit = 2,
    MaxSpend = 3,
    OutputRedact = 4,
    AllowedTool = 5,
}

/// Single policy rule entry (96 bytes)
#[repr(C)]
#[derive(Clone, Copy)]
pub struct PolicyRule {
    pub rule_type: u8,
    pub enabled: u8,
    pub data: [u8; 62],
    pub data_len: u8,
    pub _reserved: [u8; 31],
}

impl PolicyRule {
    pub const SIZE: usize = 1 + 1 + 62 + 1 + 31;
}

/// Agent access grant (128 bytes)
#[repr(C)]
#[derive(Clone, Copy)]
pub struct AgentGrant {
    pub agent_pubkey: Pubkey,
    pub key_group: u8,
    pub rate_limit_calls_per_hour: u32,
    pub rate_limit_tokens_per_min: u32,
    pub session_timeout: u64,
    pub max_spend_micro_usdc: u64,
    pub payment_stream_enabled: u8,
    pub is_active: u8,
    pub allowed_endpoints_count: u8,
    pub allowed_models_count: u8,
    pub last_access: u64,
    pub cumulative_spend: u64,
    pub ephemeral_signer_bump: u8,
    pub created_at: u64,
    pub _reserved: [u8; 15],
}

impl AgentGrant {
    pub const SIZE: usize = 32 + 1 + 4 + 4 + 8 + 8 + 1 + 1 + 1 + 1 + 8 + 8 + 1 + 8 + 15;

    pub fn new(
        agent_pubkey: Pubkey,
        key_group: u8,
        rate_limit_calls_per_hour: u32,
        rate_limit_tokens_per_min: u32,
        session_timeout: u64,
        max_spend_micro_usdc: u64,
        payment_stream_enabled: bool,
    ) -> Self {
        Self {
            agent_pubkey,
            key_group,
            rate_limit_calls_per_hour,
            rate_limit_tokens_per_min,
            session_timeout,
            max_spend_micro_usdc,
            payment_stream_enabled: payment_stream_enabled as u8,
            is_active: 1,
            allowed_endpoints_count: 0,
            allowed_models_count: 0,
            last_access: 0,
            cumulative_spend: 0,
            ephemeral_signer_bump: 255,
            created_at: 0,
            _reserved: [0; 15],
        }
    }

    pub fn is_expired(&self, current_time: u64) -> bool {
        self.is_active == 0 || (self.created_at > 0 && current_time > self.created_at + self.session_timeout)
    }

    pub fn check_rate_limit(&self, _current_time: u64, calls_this_hour: u32, tokens_this_min: u32) -> bool {
        if self.is_active == 0 {
            return false;
        }
        calls_this_hour <= self.rate_limit_calls_per_hour 
            && tokens_this_min <= self.rate_limit_tokens_per_min
    }
}

/// Key group entry (40 bytes)
#[repr(C)]
#[derive(Clone, Copy)]
pub struct KeyGroupEntry {
    pub group_type: u8,
    pub is_active: u8,
    pub key_count: u8,
    pub _reserved: u8,
    pub key_hashes: [u8; 32],
    pub created_at: u64,
}

impl KeyGroupEntry {
    pub const SIZE: usize = 1 + 1 + 1 + 1 + 32 + 8;

    pub fn new(group_type: u8) -> Self {
        Self {
            group_type,
            is_active: 1,
            key_count: 0,
            _reserved: 0,
            key_hashes: [0; 32],
            created_at: 0,
        }
    }
}

/// Ephemeral signer record (64 bytes)
#[repr(C)]
#[derive(Clone, Copy)]
pub struct EphemeralSigner {
    pub agent_pubkey: Pubkey,
    pub ephemeral_pubkey: Pubkey,
}

impl EphemeralSigner {
    pub const SIZE: usize = 64;
}

/// Payment stream state (108 bytes)
#[repr(C)]
#[derive(Clone, Copy)]
pub struct PaymentStream {
    pub service_url_hash: [u8; 32],
    pub agent_pubkey: Pubkey,
    pub rate_per_unit_micro_usdc: u64,
    pub unit_type: u8,
    pub is_active: u8,
    pub settlement_interval_secs: u32,
    pub last_settlement: u64,
    pub pending_amount: u64,
    pub _reserved: [u8; 14],
}

impl PaymentStream {
    pub const SIZE: usize = 32 + 32 + 8 + 1 + 1 + 4 + 8 + 8 + 14;

    pub fn new(
        service_url_hash: [u8; 32],
        agent_pubkey: Pubkey,
        rate_per_unit_micro_usdc: u64,
        unit_type: u8,
        settlement_interval_secs: u32,
    ) -> Self {
        Self {
            service_url_hash,
            agent_pubkey,
            rate_per_unit_micro_usdc,
            unit_type,
            is_active: 1,
            settlement_interval_secs,
            last_settlement: 0,
            pending_amount: 0,
            _reserved: [0; 14],
        }
    }
}

// ==================== EMBEDDED WALLET (Spec 10) ====================
//
// New "agent embedded wallet" PDA introduced by spec 10
// (`proxy-rs/specs/10-embedded-wallet.md`). This struct lives in its
// own PDA account (NOT inside `UniversalVault`) so that:
//   1. Per-agent USDC token authority is a real on-chain account that
//      can own an associated token account.
//   2. The legacy `PaymentStream` struct (108 bytes embedded in vault)
//      keeps working for ix #30-#33 with no layout migration.
//
// Backwards compat note (per the engineer alpha/beta/gamma coordination memo):
// adding fields to the existing in-vault `PaymentStream` would have
// shifted byte offsets used by the proxy and existing tests, so the
// embedded-wallet pillar uses a fresh struct with a versioned
// discriminator instead.

/// Discriminator for AgentPaymentStream PDA accounts.
pub const AGENT_PAYMENT_STREAM_DISCRIMINATOR: [u8; 8] = *b"ksaywal1";

/// Number of (envelope_hash, nonce) pairs the on-chain replay ring
/// buffer remembers. Sized at 64 (down from spec's "256") so the PDA
/// fits comfortably in a single 10KiB account; if real-world use shows
/// 64 to be too small we bump and migrate. 64 entries x 48 bytes per
/// entry = 3072 bytes for the ring alone.
pub const CONSUMED_NONCES_LEN: usize = 64;

/// Single replay-protection entry written by `pay_x402`.
/// `envelope_hash` is the sha256 of the canonical `X402Envelope`,
/// `nonce` is the random 16 bytes the client picked for the call.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct ConsumedNonce {
    pub envelope_hash: [u8; 32],
    pub nonce: [u8; 16],
}

impl ConsumedNonce {
    pub const SIZE: usize = 32 + 16;

    pub fn empty() -> Self {
        Self { envelope_hash: [0; 32], nonce: [0; 16] }
    }

    pub fn is_empty(&self) -> bool {
        self.envelope_hash == [0u8; 32]
    }
}

/// Standalone Payment Stream PDA introduced by spec 10 for the embedded
/// wallet pillar. Each agent gets its own account; the agent's
/// EphemeralSigner spends out of `usdc_ata`.
///
/// Layout is `repr(C)` so byte offsets are stable across builds. The
/// `discriminator` field is the version tag - bump if fields change.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct AgentPaymentStream {
    /// Account-type tag: AGENT_PAYMENT_STREAM_DISCRIMINATOR.
    pub discriminator: [u8; 8],

    /// Wallet that owns the agent (= AgentGrant.owner = vault owner).
    pub owner: Pubkey,

    /// Pubkey of the AgentGrant this stream pays for. We bind one
    /// stream to one grant; revocation on the grant immediately blocks
    /// new payments from this stream.
    pub agent_pubkey: Pubkey,

    /// Server keypair authorised to call ix #26 (`mpp_settle`).
    pub mpp_settler_pubkey: Pubkey,

    /// USDC mint this stream is denominated in.
    pub usdc_mint: Pubkey,

    /// USDC associated token account owned by this stream PDA. Holds
    /// the actual escrowed dollars.
    pub usdc_ata: Pubkey,

    /// Hard budget cap in micro-USDC. Enforced on-chain; once reached
    /// every `pay_x402` / `mpp_settle` aborts with `BudgetExceeded`.
    pub max_total_micro_usdc: u64,

    /// Cumulative spent total in micro-USDC across all pay/settle ixs.
    pub spent_total_micro_usdc: u64,

    /// Per-unit cost (micro-USDC) for `mpp_settle`. Settler reports
    /// `units_consumed` and the on-chain code multiplies.
    pub cost_per_unit_micro_usdc: u64,

    /// Soft cap, off-chain enforced (see Q7). Stored on-chain only as
    /// a hint so reading clients can render budget UI consistently.
    /// Bits-of-f64 to keep the struct portable across hosts.
    pub max_rate_usd_per_min_bits: u64,

    /// Settler cadence advisory. Off-chain settler uses this; the
    /// on-chain code does not enforce it.
    pub settlement_interval_secs: u32,

    /// 1 = stream is open and accepting payments; 0 = closed (after
    /// `withdraw_agent_wallet`).
    ///
    /// There is no `StreamStatus` enum and no `PendingVerification` or
    /// `Settled` variant. `mpp_settle` debits `spent_total` while this
    /// flag stays 1. The account does not pass through a verification
    /// status; the fulfillment gate is the artifact root on that
    /// instruction. Python `mpp_streams.status` is the same pair:
    /// `open` until `close`, which sets `closed`.
    pub is_active: u8,

    /// PDA bump byte (so the program can re-sign as the stream).
    pub bump: u8,

    /// Padding to make the next field 8-byte aligned.
    pub _pad0: [u8; 2],

    /// Last successful payment timestamp (unix seconds). Updated by
    /// both `pay_x402` and `mpp_settle`.
    pub last_payment_ts: i64,

    /// Stream creation timestamp.
    pub created_at: i64,

    /// Ring buffer index pointing at the next slot to overwrite.
    /// Wraps at CONSUMED_NONCES_LEN.
    pub consumed_nonces_head: u8,

    /// Padding to keep the ring buffer 8-byte aligned.
    pub _pad1: [u8; 7],

    /// Replay-protection ring buffer.
    pub consumed_nonces: [ConsumedNonce; CONSUMED_NONCES_LEN],

    /// Settlement idempotency region. Layout (see `guards`):
    /// `[0..32]` last artifact root, `[32..40]` `last_settled_seq` as
    /// u64 LE, `[40..64]` three 8-byte fingerprints of recent roots.
    /// A replayed sequence or a remembered root does not debit.
    pub _reserved: [u8; 64],
}

impl AgentPaymentStream {
    pub const SIZE: usize = 8 + 32 * 5 + 8 * 4 + 4 + 1 + 1 + 2 + 8 + 8 + 1 + 7
        + (CONSUMED_NONCES_LEN * ConsumedNonce::SIZE) + 64;

    /// Decimals for SPL USDC. Hard-coded - every USDC mint we accept
    /// has 6 decimals.
    pub const USDC_DECIMALS: u8 = 6;

    /// Search the ring buffer for a matching (envelope_hash, nonce)
    /// pair. Returns `true` if the pair has already been consumed.
    pub fn nonce_already_consumed(
        consumed: &[ConsumedNonce; CONSUMED_NONCES_LEN],
        envelope_hash: &[u8; 32],
        nonce: &[u8; 16],
    ) -> bool {
        for entry in consumed.iter() {
            if entry.is_empty() {
                continue;
            }
            if &entry.envelope_hash == envelope_hash && &entry.nonce == nonce {
                return true;
            }
        }
        false
    }
}

/// Byte offsets for AgentPaymentStream fields. Used directly by ix
/// handlers so we do not pay for a full deserialize on every call.
/// MUST match the struct layout above.
pub mod aps_offset {
    pub const DISCRIMINATOR: usize = 0;
    pub const OWNER: usize = 8;
    pub const AGENT_PUBKEY: usize = 40;
    pub const MPP_SETTLER: usize = 72;
    pub const USDC_MINT: usize = 104;
    pub const USDC_ATA: usize = 136;
    pub const MAX_TOTAL: usize = 168;
    pub const SPENT_TOTAL: usize = 176;
    pub const COST_PER_UNIT: usize = 184;
    pub const MAX_RATE_BITS: usize = 192;
    pub const SETTLEMENT_INTERVAL: usize = 200;
    pub const IS_ACTIVE: usize = 204;
    pub const BUMP: usize = 205;
    // pad0 [206..208]
    pub const LAST_PAYMENT_TS: usize = 208;
    pub const CREATED_AT: usize = 216;
    pub const NONCES_HEAD: usize = 224;
    // pad1 [225..232]
    pub const NONCES: usize = 232;
    /// `NONCES + CONSUMED_NONCES_LEN * 48` = 232 + 3072.
    /// Bytes [0..32] of this region are the last settled artifact root.
    pub const RESERVED: usize = 3304;
}

/// Byte offset of `AgentGrant.revoked_at` within the 128-byte grant
/// slot. Spec 10 needs a real revocation timestamp (not just the
/// `is_active = 0` flag) so `pay_x402` can short-circuit. The agent
/// grant struct uses 86 bytes of named fields then 15 bytes of
/// `_reserved`, leaving the trailing 27 bytes (offsets 101..128) of
/// each 128-byte slot unused. We park `revoked_at: i64` at offset
/// 120 (8 bytes before the slot end) so it sits in unused trailing
/// space without touching `_reserved`.
pub const AGENT_GRANT_REVOKED_AT_OFFSET: usize = 120;

/// Universal Vault account structure
#[repr(C)]
pub struct UniversalVault {
    pub discriminator: [u8; 8],
    pub owner: Pubkey,
    pub created_at: u64,
    pub updated_at: u64,
    pub vault_flags: u32,
    pub key_group_count: u8,
    pub agent_grant_count: u8,
    pub policy_rule_count: u8,
    pub payment_stream_count: u8,
    pub key_groups: [KeyGroupEntry; MAX_KEY_GROUPS],
    pub agent_grants: [AgentGrant; MAX_AGENTS],
    pub policy_rules: [PolicyRule; MAX_POLICY_RULES],
    pub payment_streams: [PaymentStream; MAX_PAYMENT_STREAMS],
    // ephemeral_signers and _reserved removed — Solana per-tx data
    // growth cap is 10240 bytes; trimmed the vault to fit. The
    // EphemeralSigner flow lives in its own per-grant PDA per spec 10
    // anyway, not inside UniversalVault.
}

impl UniversalVault {
    pub const DISCRIMINATOR: [u8; 8] = *b"univault";
    /// Computed: 64-byte header + 16×44 key_groups (704)
    /// + 8×128 agent_grants (1024) + 8×96 policy_rules (768)
    /// + 4×108 payment_streams (432) = 2992 bytes.
    /// Matches the deployed devnet program (slot ≥461190304).
    pub const SIZE: usize = 2992;

    pub fn new(owner: Pubkey, created_at: u64) -> Self {
        Self {
            discriminator: Self::DISCRIMINATOR,
            owner,
            created_at,
            updated_at: created_at,
            vault_flags: 0,
            key_group_count: 0,
            agent_grant_count: 0,
            policy_rule_count: 0,
            payment_stream_count: 0,
            key_groups: [KeyGroupEntry::new(0); MAX_KEY_GROUPS],
            agent_grants: [AgentGrant::new(Pubkey::default(), 0, 0, 0, 0, 0, false); MAX_AGENTS],
            policy_rules: [PolicyRule {
                rule_type: 0,
                enabled: 0,
                data: [0; 62],
                data_len: 0,
                _reserved: [0; 31],
            }; MAX_POLICY_RULES],
            payment_streams: [PaymentStream::new([0; 32], Pubkey::default(), 0, 0, 0); MAX_PAYMENT_STREAMS],
        }
    }

    pub fn verify_discriminator(&self) -> bool {
        self.discriminator == Self::DISCRIMINATOR
    }

    pub fn is_time_lock_enabled(&self) -> bool {
        (self.vault_flags & 0x01) != 0
    }

    pub fn is_zk_proof_required(&self) -> bool {
        (self.vault_flags & 0x02) != 0
    }

    pub fn is_mpc_required(&self) -> bool {
        (self.vault_flags & 0x04) != 0
    }

    pub fn is_payment_enabled(&self) -> bool {
        (self.vault_flags & 0x08) != 0
    }
}

/// Vault flags constants
pub mod vault_flags {
    pub const TIME_LOCK_ENABLED: u32 = 0x01;
    pub const REQUIRE_ZK_PROOF: u32 = 0x02;
    pub const REQUIRE_MPC: u32 = 0x04;
    pub const PAYMENT_ENABLED: u32 = 0x08;
}
