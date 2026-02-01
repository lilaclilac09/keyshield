//! Vault state structure

use pinocchio::pubkey::Pubkey;

/// Maximum number of keys that can be stored in a single vault
pub const MAX_KEYS_PER_VAULT: usize = 8;

/// Single key entry within a vault (34 bytes)
/// Stores reference to encrypted key data with metadata
#[repr(C)]
#[derive(Clone, Copy)]
pub struct KeyEntry {
    /// Lit Protocol dataToEncryptHash - reference to encrypted data (32 bytes)
    /// Full ciphertext is stored off-chain (IndexedDB)
    pub encrypted_key_hash: [u8; 32],
    /// Key type (GitHub, Helius, etc.) (1 byte)
    pub key_type: u8,
    /// Access control flags for this key (1 byte)
    pub access_flags: u8,
}

impl KeyEntry {
    pub const SIZE: usize = 32 + 1 + 1; // 34 bytes
    
    /// Check if this entry is empty (all zeros)
    pub fn is_empty(&self) -> bool {
        self.encrypted_key_hash.iter().all(|&b| b == 0)
    }
    
    /// Create an empty key entry
    pub fn empty() -> Self {
        Self {
            encrypted_key_hash: [0; 32],
            key_type: 0,
            access_flags: 0,
        }
    }
}

/// Vault account structure
/// ONE wallet → ONE vault → MULTIPLE keys
/// Architecture:
/// - Each wallet derives ONE vault PDA: ["vault", owner.publicKey]
/// - That vault can store up to MAX_KEYS_PER_VAULT encrypted keys
/// - Each key is stored as a KeyEntry with its hash and metadata
/// - Full ciphertexts are stored off-chain in IndexedDB
#[repr(C)]
pub struct Vault {
    /// Discriminator: "keyshld\0" (8 bytes)
    pub discriminator: [u8; 8],
    /// Owner public key (32 bytes)
    pub owner: Pubkey,
    /// Number of keys currently stored (1 byte)
    pub key_count: u8,
    /// Array of key entries (8 * 34 = 272 bytes)
    pub keys: [KeyEntry; MAX_KEYS_PER_VAULT],
    /// Timestamp when vault was created (8 bytes)
    pub created_at: u64,
    /// Vault-level access flags (1 byte)
    pub vault_flags: u8,
    /// Reserved for future use (150 bytes)
    pub _reserved: [u8; 150],
}

impl Vault {
    pub const DISCRIMINATOR: [u8; 8] = *b"keyshld\0";
    // Size: 8 + 32 + 1 + (8 * 34) + 8 + 1 + 150 = 472 bytes
    pub const SIZE: usize = 8 + 32 + 1 + (MAX_KEYS_PER_VAULT * KeyEntry::SIZE) + 8 + 1 + 150;

    /// Create a new empty vault
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

    /// Verify discriminator
    pub fn verify_discriminator(&self) -> bool {
        self.discriminator == Self::DISCRIMINATOR
    }

    /// Add a key to the vault
    /// Returns the index where the key was added, or None if vault is full
    pub fn add_key(
        &mut self,
        encrypted_key_hash: [u8; 32],
        key_type: u8,
    ) -> Option<usize> {
        // Check if vault is full
        if self.key_count >= MAX_KEYS_PER_VAULT as u8 {
            return None;
        }

        // Find first empty slot
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

    /// Find a key by its hash
    /// Returns the index if found, None otherwise
    pub fn find_key(&self, encrypted_key_hash: &[u8; 32]) -> Option<usize> {
        for (idx, entry) in self.keys.iter().enumerate() {
            if !entry.is_empty() && &entry.encrypted_key_hash == encrypted_key_hash {
                return Some(idx);
            }
        }
        None
    }

    /// Remove a key from the vault by its hash
    /// Returns true if the key was found and removed
    pub fn remove_key(&mut self, encrypted_key_hash: &[u8; 32]) -> bool {
        if let Some(idx) = self.find_key(encrypted_key_hash) {
            self.keys[idx] = KeyEntry::empty();
            self.key_count = self.key_count.saturating_sub(1);
            return true;
        }
        false
    }

    /// Get a key entry by index
    pub fn get_key(&self, index: usize) -> Option<&KeyEntry> {
        if index < MAX_KEYS_PER_VAULT && !self.keys[index].is_empty() {
            Some(&self.keys[index])
        } else {
            None
        }
    }

    /// Check if vault is full
    pub fn is_full(&self) -> bool {
        self.key_count >= MAX_KEYS_PER_VAULT as u8
    }

    /// Check if vault is empty
    pub fn is_empty(&self) -> bool {
        self.key_count == 0
    }

    /// Check if vault is time-locked
    pub fn is_time_locked(&self, current_timestamp: u64) -> bool {
        // Check if vault_flags bit 0 is set (time-locked)
        (self.vault_flags & 0x01) != 0 && current_timestamp < self.created_at
    }
}

/// Key type constants
pub mod key_type {
    pub const GENERIC: u8 = 0;
    pub const GITHUB: u8 = 1;
    pub const HELIUS: u8 = 2;
    pub const GOOGLE_GEMINI: u8 = 3;
}
