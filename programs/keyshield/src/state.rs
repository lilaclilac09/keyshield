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

/// Maximum number of agents per vault
pub const MAX_AGENTS: usize = 32;

/// Maximum number of policy rules per vault
pub const MAX_POLICY_RULES: usize = 64;

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
    pub payment_streams: [PaymentStream; 8],
    pub ephemeral_signers: [EphemeralSigner; 8],
    pub _reserved: [u8; 1024],
}

impl UniversalVault {
    pub const DISCRIMINATOR: [u8; 8] = *b"univault";
    pub const SIZE: usize = 18400;

    /// Build a fully-initialised UniversalVault on the stack.
    ///
    /// Compiled only off-chain. The struct is 18 kB which is way past the
    /// 4 kB SBF stack limit, so on-chain code initialises the account
    /// in-place via `init_universal_vault_in_place` in the
    /// universal_vault instruction handler. This constructor stays
    /// available for tests / off-chain tooling that wants the typed shape.
    #[cfg(not(target_os = "solana"))]
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
            payment_streams: [PaymentStream::new([0; 32], Pubkey::default(), 0, 0, 0); 8],
            ephemeral_signers: [EphemeralSigner {
                agent_pubkey: Pubkey::default(),
                ephemeral_pubkey: Pubkey::default(),
            }; 8],
            _reserved: [0; 1024],
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
