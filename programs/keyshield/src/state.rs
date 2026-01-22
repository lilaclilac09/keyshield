//! Vault state structure

use pinocchio::pubkey::Pubkey;

/// Vault account structure (288 bytes)
/// Stores encrypted API key data with privacy metadata
/// Note: Full Lit Protocol ciphertext (1-5 KB) is stored off-chain.
/// Only the dataToEncryptHash (32 bytes) is stored on-chain.
#[repr(C)]
pub struct Vault {
    /// Discriminator: "keyshield" (8 bytes)
    pub discriminator: [u8; 8],
    /// Owner public key (32 bytes)
    pub owner: Pubkey,
    /// Lit Protocol dataToEncryptHash - reference to encrypted data (32 bytes)
    /// Full ciphertext is stored off-chain (IndexedDB/IPFS)
    pub encrypted_key_hash: [u8; 32],
    /// ZK commitment (Bonsol) (32 bytes)
    pub zk_commit: [u8; 32],
    /// MPC hash (Arcium) (32 bytes)
    pub mpc_hash: [u8; 32],
    /// Timestamp for time-locked access (8 bytes)
    pub created_at: u64,
    /// Access control flags (1 byte)
    pub access_flags: u8,
    /// Reserved for future use (143 bytes)
    pub _reserved: [u8; 143],
}

impl Vault {
    pub const DISCRIMINATOR: [u8; 8] = *b"keyshld\0";
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 1 + 143; // 288 bytes

    /// Create a new vault instance
    pub fn new(
        owner: Pubkey,
        encrypted_key_hash: [u8; 32],
        zk_commit: [u8; 32],
        mpc_hash: [u8; 32],
        created_at: u64,
    ) -> Self {
        Self {
            discriminator: Self::DISCRIMINATOR,
            owner,
            encrypted_key_hash,
            zk_commit,
            mpc_hash,
            created_at,
            access_flags: 0,
            _reserved: [0; 143],
        }
    }

    /// Verify discriminator
    pub fn verify_discriminator(&self) -> bool {
        self.discriminator == Self::DISCRIMINATOR
    }

    /// Check if vault is time-locked
    pub fn is_time_locked(&self, current_timestamp: u64) -> bool {
        // Check if access_flags bit 0 is set (time-locked)
        (self.access_flags & 0x01) != 0 && current_timestamp < self.created_at
    }

    /// Get key type from access_flags
    /// Bits 1-3: Key type (GitHub=1, Helius=2, GoogleGemini=3, Generic=0)
    pub fn get_key_type(&self) -> u8 {
        (self.access_flags >> 1) & 0x07
    }

    /// Set key type in access_flags
    /// Bits 1-3: Key type (GitHub=1, Helius=2, GoogleGemini=3, Generic=0)
    pub fn set_key_type(&mut self, key_type: u8) {
        // Clear bits 1-3
        self.access_flags &= !0x0E;
        // Set new key type (shift left by 1, mask to 3 bits)
        self.access_flags |= ((key_type & 0x07) << 1);
    }
}

/// Key type constants
pub mod key_type {
    pub const GENERIC: u8 = 0;
    pub const GITHUB: u8 = 1;
    pub const HELIUS: u8 = 2;
    pub const GOOGLE_GEMINI: u8 = 3;
}
