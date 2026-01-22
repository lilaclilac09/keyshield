//! Vault state structure

use pinocchio::pubkey::Pubkey;

/// Vault account structure (~256 bytes)
/// Stores encrypted API key data with privacy metadata
#[repr(C)]
pub struct Vault {
    /// Discriminator: "keyshield" (8 bytes)
    pub discriminator: [u8; 8],
    /// Owner public key (32 bytes)
    pub owner: Pubkey,
    /// Encrypted key blob (Lit Protocol) (128 bytes)
    pub encrypted_key: [u8; 128],
    /// ZK commitment (Bonsol) (32 bytes)
    pub zk_commit: [u8; 32],
    /// MPC hash (Arcium) (32 bytes)
    pub mpc_hash: [u8; 32],
    /// Timestamp for time-locked access (8 bytes)
    pub created_at: u64,
    /// Access control flags (1 byte)
    pub access_flags: u8,
    /// Reserved for future use (47 bytes)
    pub _reserved: [u8; 47],
}

impl Vault {
    pub const DISCRIMINATOR: [u8; 8] = *b"keyshld";
    pub const SIZE: usize = 8 + 32 + 128 + 32 + 32 + 8 + 1 + 47; // 288 bytes

    /// Create a new vault instance
    pub fn new(
        owner: Pubkey,
        encrypted_key: [u8; 128],
        zk_commit: [u8; 32],
        mpc_hash: [u8; 32],
        created_at: u64,
    ) -> Self {
        Self {
            discriminator: Self::DISCRIMINATOR,
            owner,
            encrypted_key,
            zk_commit,
            mpc_hash,
            created_at,
            access_flags: 0,
            _reserved: [0; 47],
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
}
