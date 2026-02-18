//! Universal Vault instruction handlers
//!
//! Instructions for creating and managing the Universal Vault PDA

use pinocchio::{
    account_info::AccountInfo,
    instruction::Signer,
    program_error::ProgramError,
    pubkey::Pubkey,
    seeds,
    sysvars::rent::Rent,
    sysvars::Sysvar,
    ProgramResult,
};

use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};

use crate::{
    error::KeyShieldError,
    state::{UniversalVault, vault_flags},
};

const VAULT_SEED: &[u8] = b"universal_vault";

/// Process CreateUniversalVault instruction
///
/// Creates a new Universal Vault PDA for the owner's wallet.
/// This is the master vault that holds all key groups, agent grants, and policies.
///
/// Accounts:
/// 0. [signer] Owner - The wallet creating the vault
/// 1. [writable] UniversalVault - PDA account to store vault data
/// 2. [] System Program
///
/// Instruction data:
/// - vault_bump (1 byte)
pub fn process_create_universal_vault(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 1 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let _system_program = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    let vault_bump = data[0];

    // Check if vault already exists
    let is_initialized = vault.is_owned_by(program_id);
    if is_initialized {
        // Verify it's a UniversalVault by checking discriminator
        let vault_data = vault.try_borrow_data()?;
        if vault_data.len() >= 8 {
            let discriminator = &vault_data[0..8];
            if discriminator == UniversalVault::DISCRIMINATOR {
                return Err(KeyShieldError::UniversalVaultAlreadyExists.into());
            }
        }
        // Account exists but not a UniversalVault - reassign
    }

    // Setup PDA seeds
    let bump_ref = &[vault_bump];
    let vault_seeds = seeds!(VAULT_SEED, owner.key().as_ref(), bump_ref);
    let vault_signer = Signer::from(&vault_seeds);

    let rent = Rent::get()?;
    let min_balance = rent.minimum_balance(UniversalVault::SIZE);

    // Create or reassign account
    if !is_initialized {
        if vault.lamports() == 0 && vault.data_is_empty() {
            CreateAccount {
                from: owner,
                to: vault,
                lamports: min_balance,
                space: UniversalVault::SIZE as u64,
                owner: program_id,
            }
            .invoke_signed(&[vault_signer.clone()])?;
        } else {
            // Account exists but not owned by program - allocate and assign
            if vault.data_len() < UniversalVault::SIZE {
                Allocate {
                    account: vault,
                    space: UniversalVault::SIZE as u64,
                }
                .invoke_signed(&[vault_signer.clone()])?;
            }

            Assign {
                account: vault,
                owner: program_id,
            }
            .invoke_signed(&[vault_signer.clone()])?;

            let current_balance = vault.lamports();
            if current_balance < min_balance {
                Transfer {
                    from: owner,
                    to: vault,
                    lamports: min_balance - current_balance,
                }
                .invoke()?;
            }
        }
    }

    // Get current timestamp
    let clock = pinocchio_sysvar::clock::Clock::get()?;
    let timestamp = clock.unix_timestamp() as u64;

    // Initialize new vault
    let vault_state = UniversalVault::new(*owner.key(), timestamp);
    serialize_universal_vault(&vault_state, vault)?;

    Ok(())
}

/// Process UpdateUniversalPolicy instruction
///
/// Updates vault-level policies including:
/// - Enabling/disabling time locks
/// - Requiring ZK proofs for access
/// - Requiring MPC for agent access
/// - Enabling/disabling payments
///
/// Accounts:
/// 0. [signer] Owner - The vault owner
/// 1. [writable] UniversalVault - PDA account
///
/// Instruction data:
/// - flags (4 bytes) - New vault flags
/// - update_type (1 byte) - Type of update (0 = set_flags, 1 = add_policy_rule, 2 = remove_policy_rule)
/// - policy_rule (variable, for add/remove) - Policy rule data
pub fn process_update_universal_policy(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Minimum: flags (4) + update_type (1) = 5 bytes
    if data.len() < 5 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    // Parse flags
    let flags = u32::from_le_bytes(data[0..4].try_into().map_err(|_| KeyShieldError::InvalidKeyData)?);
    let update_type = data[4];

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

    // Get current timestamp
    let clock = pinocchio_sysvar::clock::Clock::get()?;
    let timestamp = clock.unix_timestamp() as u64;

    match update_type {
        // Set flags
        0 => {
            // Write new flags (offset: 56)
            vault_data[56..60].copy_from_slice(&flags.to_le_bytes());
            // Write updated_at (offset: 48)
            vault_data[48..56].copy_from_slice(&timestamp.to_le_bytes());
        }
        // Add policy rule
        1 => {
            let rule_data = &data[5..];
            if rule_data.len() < 96 {
                return Err(KeyShieldError::InvalidPolicyRule.into());
            }

            // Find empty policy slot (starts at offset: 7760)
            let policy_start = 7760;
            let policy_size = 96;
            let mut found = false;

            for i in 0..64 {
                let offset = policy_start + (i * policy_size);
                if vault_data[offset] == 0 {
                    // Empty slot found - write rule
                    vault_data[offset..offset + rule_data.len()].copy_from_slice(rule_data);
                    // Increment policy_rule_count (offset: 63)
                    let count = vault_data[63];
                    vault_data[63] = count + 1;
                    found = true;
                    break;
                }
            }

            if !found {
                return Err(KeyShieldError::PolicyRuleOverflow.into());
            }

            // Update updated_at
            vault_data[48..56].copy_from_slice(&timestamp.to_le_bytes());
        }
        // Remove policy rule
        2 => {
            let rule_index = data[5] as usize;
            if rule_index >= 64 {
                return Err(KeyShieldError::InvalidPolicyRule.into());
            }

            // Clear policy slot
            let policy_start = 7760;
            let offset = policy_start + (rule_index * 96);
            vault_data[offset] = 0; // Set rule_type to 0 (disabled)

            // Decrement policy_rule_count
            let count = vault_data[63];
            vault_data[63] = count.saturating_sub(1);

            // Update updated_at
            vault_data[48..56].copy_from_slice(&timestamp.to_le_bytes());
        }
        _ => return Err(KeyShieldError::InvalidKeyData.into()),
    }

    Ok(())
}

/// Process AddKeyToGroup instruction
///
/// Adds a key to a specific key group within the Universal Vault.
///
/// Accounts:
/// 0. [signer] Owner - The vault owner
/// 1. [writable] UniversalVault - PDA account
///
/// Instruction data:
/// - key_hash (32 bytes)
/// - key_group (1 byte)
pub fn process_add_key_to_group(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 33 {
        return Err(KeyShieldError::InvalidKeyData.into());
    }

    let accounts_iter = &mut accounts.iter();
    let owner = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;
    let vault = accounts_iter.next().ok_or(ProgramError::NotEnoughAccountKeys)?;

    // Verify owner is signer
    if !owner.is_signer() {
        return Err(KeyShieldError::InvalidVaultOwner.into());
    }

    let key_hash: [u8; 32] = data[0..32].try_into()
        .map_err(|_| KeyShieldError::InvalidKeyData)?;
    let key_group = data[32];

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

    // Find or create key group
    let key_group_count = vault_data[60];
    let key_groups_start = 64;
    let key_group_size = 44;
    let mut group_idx = None;

    // Search for existing group
    for i in 0..MAX_KEY_GROUPS {
        let offset = key_groups_start + (i * key_group_size);
        if vault_data[offset] == key_group && vault_data[offset + 1] == 1 {
            group_idx = Some(i);
            break;
        }
    }

    // Create new group if not found
    if group_idx.is_none() {
        for i in 0..MAX_KEY_GROUPS {
            let offset = key_groups_start + (i * key_group_size);
            if vault_data[offset] == 0 {
                // Empty slot - create new group
                vault_data[offset] = key_group; // group_type
                vault_data[offset + 1] = 1; // is_active
                vault_data[offset + 2] = 0; // key_count
                vault_data[offset + 3] = 0; // reserved
                // key_hashes at offset + 4 (32 bytes)
                // created_at at offset + 40 (8 bytes)
                let clock = pinocchio_sysvar::clock::Clock::get()?;
                vault_data[offset + 40..offset + 48].copy_from_slice(&clock.unix_timestamp().to_le_bytes());

                vault_data[60] = key_group_count + 1;
                group_idx = Some(i);
                break;
            }
        }
    }

    let idx = group_idx.ok_or(KeyShieldError::InvalidKeyGroup)?;

    // Add key hash to group
    let group_offset = key_groups_start + (idx * key_group_size);
    let key_count = vault_data[group_offset + 2];

    if key_count >= 8 {
        return Err(KeyShieldError::InvalidKeyGroup.into()); // Group full
    }

    // Find empty key slot (offset + 4 to offset + 36, 4 bytes each)
    let key_slot_offset = group_offset + 4 + (key_count as usize * 4);
    vault_data[key_slot_offset..key_slot_offset + 4].copy_from_slice(&key_hash[0..4]); // Store first 4 bytes as ref

    vault_data[group_offset + 2] = key_count + 1;

    // Update updated_at
    let clock = pinocchio_sysvar::clock::Clock::get()?;
    vault_data[48..56].copy_from_slice(&clock.unix_timestamp().to_le_bytes());

    Ok(())
}

/// Serialize UniversalVault to account data
fn serialize_universal_vault(vault: &UniversalVault, vault_account: &AccountInfo) -> ProgramResult {
    let mut data = vault_account.try_borrow_mut_data()?;
    if data.len() < UniversalVault::SIZE {
        return Err(ProgramError::AccountDataTooSmall);
    }

    // Write discriminator
    data[0..8].copy_from_slice(&vault.discriminator);
    // Write owner
    data[8..40].copy_from_slice(vault.owner.as_ref());
    // Write created_at
    data[40..48].copy_from_slice(&vault.created_at.to_le_bytes());
    // Write updated_at
    data[48..56].copy_from_slice(&vault.updated_at.to_le_bytes());
    // Write vault_flags
    data[56..60].copy_from_slice(&vault.vault_flags.to_le_bytes());
    // Write counts
    data[60] = vault.key_group_count;
    data[61] = vault.agent_grant_count;
    data[62] = vault.policy_rule_count;
    data[63] = vault.payment_stream_count;

    // Write key groups (start: 64, size: 44 each)
    for (i, group) in vault.key_groups.iter().enumerate() {
        let offset = 64 + (i * 44);
        data[offset] = group.group_type;
        data[offset + 1] = group.is_active;
        data[offset + 2] = group.key_count;
        data[offset + 3] = group._reserved;
        data[offset + 4..offset + 36].copy_from_slice(&group.key_hashes);
        data[offset + 36..offset + 44].copy_from_slice(&group.created_at.to_le_bytes());
    }

    // Agent grants, policy rules, payment streams, ephemeral signers would be serialized similarly
    // For brevity, they're left as zero-initialized in this implementation

    Ok(())
}
