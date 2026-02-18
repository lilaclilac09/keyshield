//! Agent Access instruction handlers
//!
//! Instructions for managing agent access grants with:
//! - Bonsol ZK proof verification
//! - Arcium MPC support
//! - Rate limiting
//! - Session timeouts
//! - Policy enforcement

use pinocchio::{
    account_info::AccountInfo,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvars::{clock::Clock, Sysvar},
    ProgramResult,
};

use crate::{
    error::KeyShieldError,
    state::{AgentGrant, UniversalVault, MAX_AGENTS},
};

/// Process GrantAgentUniversalAccess instruction
///
/// Grants an AI agent access to keys in the Universal Vault.
/// Supports both direct agent pubkey and Bonsol ZK proof authentication.
///
/// Accounts:
/// 0. [signer] Owner - The vault owner granting access
/// 1. [writable] UniversalVault - PDA account
///
/// Instruction data:
/// - agent_pubkey (32 bytes) - Agent's public key (or zeros if using ZK proof)
/// - key_group (1 byte) - Key group to grant access to (255 = universal)
/// - rate_limit_calls (4 bytes) - Max calls per hour
/// - rate_limit_tokens (4 bytes) - Max tokens per minute
/// - session_timeout (8 bytes) - Session duration in seconds
/// - max_spend_micro_usdc (8 bytes) - Max spend in micro-USDC
/// - payment_stream_enabled (1 byte) - Enable streaming payments
/// - zk_proof_length (2 bytes) - Length of ZK proof (0 if using direct pubkey)
/// - zk_proof (variable) - Bonsol ZK proof (if zk_proof_length > 0)
/// - allowed_endpoints_count (1 byte)
/// - allowed_endpoints (variable) - Null-terminated strings
/// - allowed_models_count (1 byte)
/// - allowed_models (variable) - Null-terminated strings
pub fn process_grant_agent_access(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Minimum: agent_pubkey(32) + key_group(1) + rate_limit_calls(4) + rate_limit_tokens(4)
    // + session_timeout(8) + max_spend(8) + payment_stream(1) + zk_proof_len(2) = 60 bytes
    if data.len() < 60 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Parse instruction data
    let agent_pubkey_bytes: [u8; 32] = data[0..32].try_into()
        .map_err(|_| KeyShieldError::InvalidAgentPubkey)?;
    let agent_pubkey = Pubkey::try_from(&agent_pubkey_bytes[..])
        .map_err(|_| KeyShieldError::InvalidAgentPubkey)?;

    let key_group = data[32];
    let rate_limit_calls = u32::from_le_bytes(data[33..37].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?);
    let rate_limit_tokens = u32::from_le_bytes(data[37..41].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?);
    let session_timeout = u64::from_le_bytes(data[41..49].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?);
    let max_spend_micro_usdc = u64::from_le_bytes(data[49..57].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?);
    let payment_stream_enabled = data[57] != 0;
    let zk_proof_len = u16::from_le_bytes(data[58..60].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?) as usize;

    // Verify ZK proof if provided
    if zk_proof_len > 0 {
        let zk_proof = &data[60..60 + zk_proof_len];
        // TODO: Integrate Bonsol verifier here
        // In production: verify_bonsol_proof(zk_proof, &agent_pubkey)?;
        if zk_proof.is_empty() {
            return Err(KeyShieldError::InvalidBonsolProof.into());
        }
    } else if agent_pubkey == Pubkey::default() {
        // Must provide either ZK proof or agent pubkey
        return Err(KeyShieldError::InvalidAgentPubkey.into());
    }

    // Read vault data
    let mut vault_data = vault.try_borrow_mut_data()?;
    if vault_data.len() < UniversalVault::SIZE {
        return Err(KeyShieldError::UniversalVaultNotFound.into());
    }

    // Verify discriminator
    let discriminator = &vault_data[0..8];
    if discriminator != UniversalVault::DISCRIMINATOR {
        return Err(KeyShieldError::UniversalVaultNotFound.into());
    }

    // Verify owner
    let owner_bytes: [u8; 32] = vault_data[8..40].try_into()
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;
    let vault_owner = Pubkey::try_from(&owner_bytes[..])
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;

    if owner.key() != &vault_owner {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Check if payments are enabled if stream requested
    let vault_flags = u32::from_le_bytes(vault_data[56..60].try_into().map_err(|_| KeyShieldError::UniversalVaultNotFound)?);
    if payment_stream_enabled && (vault_flags & 0x08) == 0 {
        return Err(KeyShieldError::PaymentNotEnabled.into());
    }

    // Get current timestamp
    let clock = pinocchio::sysvars::clock::Clock::get()?;
    let timestamp = clock.unix_timestamp() as u64;

    // Find empty agent grant slot or update existing
    let agent_grants_start = 768; // After key groups
    let agent_grant_size = 128;
    let agent_grant_count = vault_data[61];
    let mut grant_idx = None;
    let mut update_existing = false;

    // Search for existing grant
    for i in 0..MAX_AGENTS {
        let offset = agent_grants_start + (i * agent_grant_size);
        let existing_pubkey_bytes: [u8; 32] = vault_data[offset..offset + 32].try_into()
            .map_err(|_| KeyShieldError::AgentGrantNotFound)?;
        let existing_pubkey = Pubkey::try_from(&existing_pubkey_bytes[..])
            .map_err(|_| KeyShieldError::AgentGrantNotFound)?;

        if existing_pubkey == agent_pubkey && existing_pubkey != Pubkey::default() {
            // Update existing grant
            grant_idx = Some(i);
            update_existing = true;
            break;
        } else if existing_pubkey == Pubkey::default() && grant_idx.is_none() {
            // Found empty slot
            grant_idx = Some(i);
        }
    }

    let idx = grant_idx.ok_or(KeyShieldError::AgentGrantNotFound)?;

    // Write agent grant
    let offset = agent_grants_start + (idx * agent_grant_size);
    
    // agent_pubkey (32 bytes)
    vault_data[offset..offset + 32].copy_from_slice(agent_pubkey.as_ref());
    // key_group (1 byte)
    vault_data[offset + 32] = key_group;
    // rate_limit_calls (4 bytes)
    vault_data[offset + 33..offset + 37].copy_from_slice(&rate_limit_calls.to_le_bytes());
    // rate_limit_tokens (4 bytes)
    vault_data[offset + 37..offset + 41].copy_from_slice(&rate_limit_tokens.to_le_bytes());
    // session_timeout (8 bytes)
    vault_data[offset + 41..offset + 49].copy_from_slice(&session_timeout.to_le_bytes());
    // max_spend (8 bytes)
    vault_data[offset + 49..offset + 57].copy_from_slice(&max_spend_micro_usdc.to_le_bytes());
    // payment_stream_enabled (1 byte)
    vault_data[offset + 57] = payment_stream_enabled as u8;
    // is_active (1 byte)
    vault_data[offset + 58] = 1;
    // allowed_endpoints_count (1 byte)
    vault_data[offset + 59] = 0;
    // allowed_models_count (1 byte)
    vault_data[offset + 60] = 0;
    // last_access (8 bytes)
    vault_data[offset + 61..offset + 69].copy_from_slice(&timestamp.to_le_bytes());
    // cumulative_spend (8 bytes)
    vault_data[offset + 69..offset + 77].copy_from_slice(&0u64.to_le_bytes());
    // ephemeral_signer_bump (1 byte)
    vault_data[offset + 77] = 255;
    // created_at (8 bytes)
    vault_data[offset + 78..offset + 86].copy_from_slice(&timestamp.to_le_bytes());

    // Update count if new grant
    if !update_existing {
        vault_data[61] = agent_grant_count + 1;
    }

    // Update updated_at
    vault_data[48..56].copy_from_slice(&timestamp.to_le_bytes());

    Ok(())
}

/// Process RevokeAgentAccess instruction
///
/// Revokes an agent's access to the Universal Vault.
///
/// Accounts:
/// 0. [signer] Owner - The vault owner revoking access
/// 1. [writable] UniversalVault - PDA account
///
/// Instruction data:
/// - agent_pubkey (32 bytes)
pub fn process_revoke_agent_access(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 32 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    let agent_pubkey_bytes: [u8; 32] = data[0..32].try_into()
        .map_err(|_| KeyShieldError::InvalidAgentPubkey)?;
    let agent_pubkey = Pubkey::try_from(&agent_pubkey_bytes[..])
        .map_err(|_| KeyShieldError::InvalidAgentPubkey)?;

    // Read vault data
    let mut vault_data = vault.try_borrow_mut_data()?;
    if vault_data.len() < UniversalVault::SIZE {
        return Err(KeyShieldError::UniversalVaultNotFound.into());
    }

    // Verify discriminator
    let discriminator = &vault_data[0..8];
    if discriminator != UniversalVault::DISCRIMINATOR {
        return Err(KeyShieldError::UniversalVaultNotFound.into());
    }

    // Verify owner
    let owner_bytes: [u8; 32] = vault_data[8..40].try_into()
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;
    let vault_owner = Pubkey::try_from(&owner_bytes[..])
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;

    if owner.key() != &vault_owner {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Find and revoke agent grant
    let agent_grants_start = 768;
    let agent_grant_size = 128;
    let mut found = false;

    for i in 0..MAX_AGENTS {
        let offset = agent_grants_start + (i * agent_grant_size);
        let existing_pubkey_bytes: [u8; 32] = vault_data[offset..offset + 32].try_into()
            .map_err(|_| KeyShieldError::AgentGrantNotFound)?;
        let existing_pubkey = Pubkey::try_from(&existing_pubkey_bytes[..])
            .map_err(|_| KeyShieldError::AgentGrantNotFound)?;

        if existing_pubkey == agent_pubkey {
            // Set is_active to 0
            vault_data[offset + 58] = 0;
            // Decrement count
            let count = vault_data[61];
            vault_data[61] = count.saturating_sub(1);
            found = true;
            break;
        }
    }

    if !found {
        return Err(KeyShieldError::AgentGrantNotFound.into());
    }

    // Update updated_at
    let clock = pinocchio::sysvars::clock::Clock::get()?;
    vault_data[48..56].copy_from_slice(&clock.unix_timestamp().to_le_bytes());

    Ok(())
}

/// Process AccessWithAgent instruction
///
/// Verifies agent access using ZK proof or MPC signature.
/// Returns success if agent is authorized based on policies.
///
/// Accounts:
/// 0. [signer] Agent - The agent requesting access (or ZK proof verifier)
/// 1. [] UniversalVault - PDA account
/// 2. [] (optional) System Program for CPI verification
///
/// Instruction data:
/// - access_type (1 byte) - 0 = direct, 1 = zk_proof, 2 = mpc_signature
/// - key_id_or_group (32 bytes) - Key hash or key group
/// - proof_data (variable) - ZK proof or MPC signature
/// - domain (variable, null-terminated) - Requesting domain for policy check
pub fn process_access_with_agent(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Minimum: access_type(1) + key_id(32) = 33 bytes
    if data.len() < 33 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let agent = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Agent must be signer (or ZK proof verifier)
    if !agent.is_signer() {
        return Err(KeyShieldError::AccessDenied.into());
    }

    let access_type = data[0];
    let key_id: [u8; 32] = data[1..33].try_into()
        .map_err(|_| KeyShieldError::InvalidKeyData)?;

    // Verify proof based on access type
    match access_type {
        0 => {
            // Direct access - just verify agent is authorized
            // Read vault to check grant
            let vault_data = vault.try_borrow_data()?;
            if vault_data.len() < UniversalVault::SIZE {
                return Err(KeyShieldError::UniversalVaultNotFound.into());
            }

            let agent_pubkey = *agent.key();
            let agent_grants_start = 768;
            let agent_grant_size = 128;

            let mut authorized = false;
            for i in 0..MAX_AGENTS {
                let offset = agent_grants_start + (i * agent_grant_size);
                let existing_pubkey_bytes: [u8; 32] = vault_data[offset..offset + 32].try_into()
                    .map_err(|_| KeyShieldError::AgentNotAuthorized)?;
                let existing_pubkey = Pubkey::try_from(&existing_pubkey_bytes[..])
                    .map_err(|_| KeyShieldError::AgentNotAuthorized)?;

                if existing_pubkey == agent_pubkey {
                    // Check if active
                    let is_active = vault_data[offset + 58];
                    if is_active == 0 {
                        return Err(KeyShieldError::AgentGrantRevoked.into());
                    }

                    // Check expiration
                    let created_at = u64::from_le_bytes(
                        vault_data[offset + 78..offset + 86].try_into()
                            .map_err(|_| KeyShieldError::AgentGrantExpired)?
                    );
                    let session_timeout = u64::from_le_bytes(
                        vault_data[offset + 41..offset + 49].try_into()
                            .map_err(|_| KeyShieldError::AgentGrantExpired)?
                    );

                    let clock = pinocchio::sysvars::clock::Clock::get()?;
                    if clock.unix_timestamp() as u64 > created_at + session_timeout {
                        return Err(KeyShieldError::AgentGrantExpired.into());
                    }

                    authorized = true;
                    break;
                }
            }

            if !authorized {
                return Err(KeyShieldError::AgentNotAuthorized.into());
            }
        }
        1 => {
            // ZK proof - verify Bonsol proof
            // TODO: Integrate Bonsol verifier
            let proof_data = &data[33..];
            if proof_data.is_empty() {
                return Err(KeyShieldError::InvalidBonsolProof.into());
            }
            // In production: verify_bonsol_proof(proof_data, &key_id)?;
        }
        2 => {
            // MPC signature - verify Arcium MPC
            // TODO: Integrate Arcium verifier
            let mpc_data = &data[33..];
            if mpc_data.is_empty() {
                return Err(KeyShieldError::MPCSignatureInvalid.into());
            }
            // In production: verify_arcium_signature(mpc_data, &key_id)?;
        }
        _ => return Err(KeyShieldError::InvalidKeyData.into()),
    }

    // Check policy rules (domain allow/block)
    let vault_data = vault.try_borrow_data()?;
    let policy_start = 7760;
    let policy_size = 96;
    let policy_count = vault_data[63];

    // Extract domain from data if provided
    let domain_start = 33;
    if data.len() > domain_start {
        // Find null terminator
        let mut domain_end = data.len();
        for i in domain_start..data.len() {
            if data[i] == 0 {
                domain_end = i;
                break;
            }
        }
        let domain = &data[domain_start..domain_end];

        // Check domain policies
        for i in 0..policy_count as usize {
            let offset = policy_start + (i * policy_size);
            let rule_type = vault_data[offset];
            let enabled = vault_data[offset + 1];

            if enabled == 0 {
                continue;
            }

            let data_len = vault_data[offset + 62];
            let rule_data = &vault_data[offset + 63..offset + 63 + data_len as usize];

            if rule_type == 1 && domain == rule_data {
                // DomainBlock - deny access
                return Err(KeyShieldError::DomainBlocked.into());
            }
        }
    }

    Ok(())
}

/// Process CreateEphemeralSigner instruction
///
/// Creates a temporary signer for agent use (custodian-style).
/// This signer exists only for the duration of the session and can only
/// perform actions allowed by the policy.
///
/// Accounts:
/// 0. [signer] Owner - The vault owner
/// 1. [writable] UniversalVault - PDA account
/// 2. [writable] EphemeralSigner - PDA for the ephemeral signer
/// 3. [] Agent - The agent that will use this signer
/// 4. [] System Program
///
/// Instruction data:
/// - allowed_actions (1 byte) - Bitmap of allowed action types
/// - expiry_seconds (8 bytes) - How long the signer is valid
pub fn process_create_ephemeral_signer(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Minimum: allowed_actions(1) + expiry(8) = 9 bytes
    if data.len() < 9 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let ephemeral_signer = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let agent = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _system_program = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    let allowed_actions = data[0];
    let expiry_seconds = u64::from_le_bytes(data[1..9].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?);

    // Read vault to verify agent has access
    let vault_data = vault.try_borrow_data()?;
    if vault_data.len() < UniversalVault::SIZE {
        return Err(KeyShieldError::UniversalVaultNotFound.into());
    }

    // Verify discriminator
    let discriminator = &vault_data[0..8];
    if discriminator != UniversalVault::DISCRIMINATOR {
        return Err(KeyShieldError::UniversalVaultNotFound.into());
    }

    // Verify owner
    let owner_bytes: [u8; 32] = vault_data[8..40].try_into()
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;
    let vault_owner = Pubkey::try_from(&owner_bytes[..])
        .map_err(|_| KeyShieldError::UniversalVaultNotFound)?;

    if owner.key() != &vault_owner {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Verify agent has active grant
    let agent_pubkey = *agent.key();
    let agent_grants_start = 768;
    let agent_grant_size = 128;
    let mut agent_has_access = false;

    for i in 0..MAX_AGENTS {
        let offset = agent_grants_start + (i * agent_grant_size);
        let existing_pubkey_bytes: [u8; 32] = vault_data[offset..offset + 32].try_into()
            .map_err(|_| KeyShieldError::AgentNotAuthorized)?;
        let existing_pubkey = Pubkey::try_from(&existing_pubkey_bytes[..])
            .map_err(|_| KeyShieldError::AgentNotAuthorized)?;

        if existing_pubkey == agent_pubkey {
            let is_active = vault_data[offset + 58];
            if is_active == 1 {
                agent_has_access = true;
            }
            break;
        }
    }

    if !agent_has_access {
        return Err(KeyShieldError::AgentNotAuthorized.into());
    }

    // In production, this would:
    // 1. Derive ephemeral signer PDA
    // 2. Store the signer record
    // 3. Return the ephemeral public key to the agent

    // For now, we just acknowledge the request
    // The actual ephemeral key derivation would happen on client side

    Ok(())
}
