//! KeyShield Agentic - Universal Vault State
//!
//! Expanded vault system supporting:
//! - Policy-based access control with time locks and rate limits
//! - Key groups (e.g., "all-openai", "payment-usdc", "universal")
//! - Agent access with Bonsol ZK proofs and Arcium MPC
//! - x402 streaming payments support

use pinocchio::pubkey::Pubkey;

/// Maximum number of key groups per vault
pub const MAX_KEY_GROUPS: usize = 16;

/// Maximum number of agents per vault
pub const MAX_AGENTS: usize = 32;

/// Maximum number of policy rules per vault
pub const MAX_POLICY_RULES: usize = 64;

/// Maximum length of policy name
pub const MAX_POLICY_NAME_LEN: usize = 64;

/// Maximum length of allowed endpoints/models
pub const MAX_ALLOWED_LIST_LEN: usize = 128;

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
    Universal = 255, // Special: grants access to everything
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
    /// Rule type (1 byte)
    pub rule_type: u8,
    /// Is rule enabled (1 byte)
    pub enabled: u8,
    /// Rule data (variable, max 62 bytes)
    /// For DomainAllow/Block: domain string
    /// For RateLimit: calls_per_hour (4 bytes) + tokens_per_min (4 bytes)
    /// For MaxSpend: max_spend_u64 (8 bytes)
    /// For OutputRedact: regex pattern
    /// For AllowedTool: tool name
    pub data: [u8; 62],
    /// Length of actual data used (1 byte)
    pub data_len: u8,
    /// Reserved (31 bytes)
    pub _reserved: [u8; 31],
}

impl PolicyRule {
    pub const SIZE: usize = 1 + 1 + 62 + 1 + 31; // 96 bytes

    pub fn new_domain_allow(domain: &[u8]) -> Option<Self> {
        if domain.len() > 62 {
            return None;
        }
        let mut rule = Self {
            rule_type: PolicyRuleType::DomainAllow as u8,
            enabled: 1,
            data: [0; 62],
            data_len: domain.len() as u8,
            _reserved: [0; 31],
        };
        rule.data[..domain.len()].copy_from_slice(domain);
        Some(rule)
    }

    pub fn new_domain_block(domain: &[u8]) -> Option<Self> {
        if domain.len() > 62 {
            return None;
        }
        let mut rule = Self {
            rule_type: PolicyRuleType::DomainBlock as u8,
            enabled: 1,
            data: [0; 62],
            data_len: domain.len() as u8,
            _reserved: [0; 31],
        };
        rule.data[..domain.len()].copy_from_slice(domain);
        Some(rule)
    }

    pub fn new_rate_limit(calls_per_hour: u32, tokens_per_min: u32) -> Self {
        let mut rule = Self {
            rule_type: PolicyRuleType::RateLimit as u8,
            enabled: 1,
            data: [0; 62],
            data_len: 8,
            _reserved: [0; 31],
        };
        rule.data[0..4].copy_from_slice(&calls_per_hour.to_le_bytes());
        rule.data[4..8].copy_from_slice(&tokens_per_min.to_le_bytes());
        rule
    }

    pub fn new_max_spend(max_spend: u64) -> Self {
        let mut rule = Self {
            rule_type: PolicyRuleType::MaxSpend as u8,
            enabled: 1,
            data: [0; 62],
            data_len: 8,
            _reserved: [0; 31],
        };
        rule.data[0..8].copy_from_slice(&max_spend.to_le_bytes());
        rule
    }

    pub fn get_domain(&self) -> Option<&[u8]> {
        if self.rule_type == PolicyRuleType::DomainAllow as u8 
            || self.rule_type == PolicyRuleType::DomainBlock as u8 {
            Some(&self.data[..self.data_len as usize])
        } else {
            None
        }
    }
}

/// Agent access grant (128 bytes)
#[repr(C)]
#[derive(Clone, Copy)]
pub struct AgentGrant {
    /// Agent's public key (32 bytes)
    pub agent_pubkey: Pubkey,
    /// Key group this grant applies to (1 byte)
    pub key_group: u8,
    /// Rate limit: calls per hour (4 bytes)
    pub rate_limit_calls_per_hour: u32,
    /// Rate limit: tokens per minute (4 bytes)
    pub rate_limit_tokens_per_min: u32,
    /// Session timeout in seconds (8 bytes)
    pub session_timeout: u64,
    /// Max spend in USDC micro-units (8 bytes) (1 USDC = 1,000,000 micro-USDC)
    pub max_spend_micro_usdc: u64,
    /// Payment stream enabled (1 byte)
    pub payment_stream_enabled: u8,
    /// Is grant active/revoked (1 byte)
    pub is_active: u8,
    /// Number of allowed endpoints (1 byte)
    pub allowed_endpoints_count: u8,
    /// Number of allowed models (1 byte)
    pub allowed_models_count: u8,
    /// Last access timestamp (8 bytes)
    pub last_access: u64,
    /// Cumulative spend in micro-USDC (8 bytes)
    pub cumulative_spend: u64,
    /// Ephemeral signer bump (1 byte, 255 = none)
    pub ephemeral_signer_bump: u8,
    /// Created at timestamp (8 bytes)
    pub created_at: u64,
    /// Reserved (15 bytes)
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

    pub fn check_rate_limit(&self, current_time: u64, calls_this_hour: u32, tokens_this_min: u32) -> bool {
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
    /// Group type (1 byte)
    pub group_type: u8,
    /// Is active (1 byte)
    pub is_active: u8,
    /// Number of keys in this group (1 byte)
    pub key_count: u8,
    /// Reserved (1 byte)
    pub _reserved: u8,
    /// Key hashes - references to encrypted keys (32 bytes, up to 8 keys * 4 bytes each)
    pub key_hashes: [u8; 32],
    /// Created at (8 bytes)
    pub created_at: u64,
}

impl KeyGroupEntry {
    pub const SIZE: usize = 1 + 1 + 1 + 1 + 32 + 8; // 44 bytes

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

/// Ephemeral signer record (for custodian-style wallet) (64 bytes)
#[repr(C)]
#[derive(Clone, Copy)]
pub struct EphemeralSigner {
    /// Agent that owns this signer (32 bytes)
    pub agent_pubkey: Pubkey,
    /// Ephemeral signer's public key (32 bytes)
    pub ephemeral_pubkey: Pubkey,
}

impl EphemeralSigner {
    pub const SIZE: usize = 64;
}

/// Payment stream state (80 bytes)
#[repr(C)]
#[derive(Clone, Copy)]
pub struct PaymentStream {
    /// Service URL hash (32 bytes)
    pub service_url_hash: [u8; 32],
    /// Agent receiving payment (32 bytes)
    pub agent_pubkey: Pubkey,
    /// Rate per unit in micro-USDC (8 bytes)
    pub rate_per_unit_micro_usdc: u64,
    /// Unit type: 0 = per_call, 1 = per_token (1 byte)
    pub unit_type: u8,
    /// Is stream active (1 byte)
    pub is_active: u8,
    /// Settlement interval in seconds (4 bytes)
    pub settlement_interval_secs: u32,
    /// Last settlement timestamp (8 bytes)
    pub last_settlement: u64,
    /// Accumulated amount pending settlement (8 bytes)
    pub pending_amount: u64,
    /// Reserved (14 bytes)
    pub _reserved: [u8; 14],
}

impl PaymentStream {
    pub const SIZE: usize = 32 + 32 + 8 + 1 + 1 + 4 + 8 + 8 + 14; // 108 bytes

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
/// ONE wallet → ONE UniversalVault → MULTIPLE key groups + agent grants + policies
///
/// Size calculation:
/// - discriminator: 8 bytes
/// - owner: 32 bytes
/// - created_at: 8 bytes
/// - updated_at: 8 bytes
/// - vault_flags: 4 bytes
/// - key_group_count: 1 byte
/// - agent_grant_count: 1 byte
/// - policy_rule_count: 1 byte
/// - payment_stream_count: 1 byte
/// - key_groups: 16 * 44 = 704 bytes
/// - agent_grants: 32 * 128 = 4096 bytes
/// - policy_rules: 64 * 96 = 6144 bytes
/// - payment_streams: 8 * 108 = 864 bytes
/// - ephemeral_signers: 8 * 64 = 512 bytes
/// - reserved: 1024 bytes
/// Total: ~18,392 bytes
#[repr(C)]
pub struct UniversalVault {
    /// Discriminator: "univault" (8 bytes)
    pub discriminator: [u8; 8],
    /// Owner public key (32 bytes)
    pub owner: Pubkey,
    /// Timestamp when vault was created (8 bytes)
    pub created_at: u64,
    /// Timestamp when vault was last updated (8 bytes)
    pub updated_at: u64,
    /// Vault flags (4 bytes)
    /// Bit 0: time_lock_enabled
    /// Bit 1: require_zk_proof
    /// Bit 2: require_mpc
    /// Bit 3: payment_enabled
    pub vault_flags: u32,
    /// Number of key groups (1 byte)
    pub key_group_count: u8,
    /// Number of agent grants (1 byte)
    pub agent_grant_count: u8,
    /// Number of policy rules (1 byte)
    pub policy_rule_count: u8,
    /// Number of active payment streams (1 byte)
    pub payment_stream_count: u8,
    /// Key groups array (16 * 44 = 704 bytes)
    pub key_groups: [KeyGroupEntry; MAX_KEY_GROUPS],
    /// Agent grants array (32 * 128 = 4096 bytes)
    pub agent_grants: [AgentGrant; MAX_AGENTS],
    /// Policy rules array (64 * 96 = 6144 bytes)
    pub policy_rules: [PolicyRule; MAX_POLICY_RULES],
    /// Payment streams array (8 * 108 = 864 bytes)
    pub payment_streams: [PaymentStream; 8],
    /// Ephemeral signers (8 * 64 = 512 bytes)
    pub ephemeral_signers: [EphemeralSigner; 8],
    /// Reserved for future use (1024 bytes)
    pub _reserved: [u8; 1024],
}

impl UniversalVault {
    pub const DISCRIMINATOR: [u8; 8] = *b"univault";
    // Size: 8 + 32 + 8 + 8 + 4 + 1 + 1 + 1 + 1 + 704 + 4096 + 6144 + 864 + 512 + 1024
    pub const SIZE: usize = 18400;

    /// Create a new empty universal vault
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

    /// Verify discriminator
    pub fn verify_discriminator(&self) -> bool {
        self.discriminator == Self::DISCRIMINATOR
    }

    /// Check if time lock is enabled
    pub fn is_time_lock_enabled(&self) -> bool {
        (self.vault_flags & 0x01) != 0
    }

    /// Check if ZK proof is required
    pub fn is_zk_proof_required(&self) -> bool {
        (self.vault_flags & 0x02) != 0
    }

    /// Check if MPC is required
    pub fn is_mpc_required(&self) -> bool {
        (self.vault_flags & 0x04) != 0
    }

    /// Check if payments are enabled
    pub fn is_payment_enabled(&self) -> bool {
        (self.vault_flags & 0x08) != 0
    }

    /// Add a key group
    pub fn add_key_group(&mut self, group_type: u8) -> Option<usize> {
        if self.key_group_count >= MAX_KEY_GROUPS as u8 {
            return None;
        }

        for (idx, group) in self.key_groups.iter_mut().enumerate() {
            if group.group_type == 0 || group.group_type == group_type {
                *group = KeyGroupEntry::new(group_type);
                self.key_group_count += 1;
                return Some(idx);
            }
        }
        None
    }

    /// Find a key group by type
    pub fn find_key_group(&self, group_type: u8) -> Option<usize> {
        for (idx, group) in self.key_groups.iter().enumerate() {
            if group.group_type == group_type && group.is_active == 1 {
                return Some(idx);
            }
        }
        None
    }

    /// Add an agent grant
    pub fn add_agent_grant(&mut self, grant: AgentGrant) -> Option<usize> {
        if self.agent_grant_count >= MAX_AGENTS as u8 {
            return None;
        }

        for (idx, existing) in self.agent_grants.iter_mut().enumerate() {
            if existing.agent_pubkey == Pubkey::default() {
                *existing = grant;
                self.agent_grant_count += 1;
                return Some(idx);
            }
        }
        None
    }

    /// Find agent grant by agent pubkey
    pub fn find_agent_grant(&self, agent_pubkey: &Pubkey) -> Option<usize> {
        for (idx, grant) in self.agent_grants.iter().enumerate() {
            if grant.agent_pubkey == *agent_pubkey && grant.is_active == 1 {
                return Some(idx);
            }
        }
        None
    }

    /// Revoke an agent grant
    pub fn revoke_agent_grant(&mut self, agent_pubkey: &Pubkey) -> bool {
        if let Some(idx) = self.find_agent_grant(agent_pubkey) {
            self.agent_grants[idx].is_active = 0;
            return true;
        }
        false
    }

    /// Add a policy rule
    pub fn add_policy_rule(&mut self, rule: PolicyRule) -> Option<usize> {
        if self.policy_rule_count >= MAX_POLICY_RULES as u8 {
            return None;
        }

        for (idx, existing) in self.policy_rules.iter_mut().enumerate() {
            if existing.rule_type == 0 {
                *existing = rule;
                self.policy_rule_count += 1;
                return Some(idx);
            }
        }
        None
    }

    /// Check if domain is allowed
    pub fn is_domain_allowed(&self, domain: &[u8]) -> bool {
        let mut allowed = true; // Default allow if no rules

        for rule in &self.policy_rules {
            if rule.enabled == 0 {
                continue;
            }

            if let Some(rule_domain) = rule.get_domain() {
                if rule.rule_type == PolicyRuleType::DomainAllow as u8 {
                    if domain == rule_domain {
                        allowed = true;
                    }
                } else if rule.rule_type == PolicyRuleType::DomainBlock as u8 {
                    if domain == rule_domain {
                        allowed = false;
                    }
                }
            }
        }

        allowed
    }

    /// Add a payment stream
    pub fn add_payment_stream(&mut self, stream: PaymentStream) -> Option<usize> {
        if self.payment_stream_count >= 8 {
            return None;
        }

        for (idx, existing) in self.payment_streams.iter_mut().enumerate() {
            if existing.service_url_hash == [0; 32] {
                *existing = stream;
                self.payment_stream_count += 1;
                return Some(idx);
            }
        }
        None
    }

    /// Find payment stream by service URL hash
    pub fn find_payment_stream(&self, service_url_hash: &[u8; 32]) -> Option<usize> {
        for (idx, stream) in self.payment_streams.iter().enumerate() {
            if stream.service_url_hash == *service_url_hash && stream.is_active == 1 {
                return Some(idx);
            }
        }
        None
    }
}

/// Vault flags constants
pub mod vault_flags {
    pub const TIME_LOCK_ENABLED: u32 = 0x01;
    pub const REQUIRE_ZK_PROOF: u32 = 0x02;
    pub const REQUIRE_MPC: u32 = 0x04;
    pub const PAYMENT_ENABLED: u32 = 0x08;
}
