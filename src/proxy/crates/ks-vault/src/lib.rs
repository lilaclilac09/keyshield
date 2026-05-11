//! AES-256-GCM vault file reader.
//!
//! Read-only client for vault files written by `v2-mvp/src/vault.py`.
//! See `proxy-rs/specs/01-vault-format.md` for the byte layout.
//!
//! Also exposes `sqlite::lookup_upstream_key` for the current vault
//! storage backend (`src/backend/data/vault_shim.db`).

pub mod sqlite;
pub use sqlite::{lookup_upstream_key, SqliteVaultError};

use std::path::PathBuf;

#[derive(thiserror::Error, Debug)]
pub enum VaultError {
    #[error("vault entry not found")]
    NotFound,
    #[error("decrypt failed (wrong password or corrupted file)")]
    BadPassword,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("malformed vault file")]
    Malformed,
}

#[derive(Clone, Debug)]
pub struct VaultPath {
    pub root: PathBuf,
}

impl VaultPath {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn entry_path(&self, user_id: &str, upstream: &str) -> PathBuf {
        self.root.join(user_id).join(format!("{upstream}.enc"))
    }
}

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KDF_ITERS: u32 = 100_000;
const KEY_LEN: usize = 32;
const MAX_VAULT_FILE: usize = 1_048_576;

/// Mirrors `vault.load(user_id, upstream, password)` in v2-mvp/src/vault.py.
pub fn load(
    vault: &VaultPath,
    user_id: &str,
    upstream: &str,
    password: &str,
) -> Result<String, VaultError> {
    let path = vault.entry_path(user_id, upstream);
    let payload = match std::fs::read(&path) {
        Ok(b) if b.len() > MAX_VAULT_FILE => return Err(VaultError::Malformed),
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(VaultError::NotFound),
        Err(e) => return Err(VaultError::Io(e)),
    };
    decrypt(&payload, password)
}

/// Decrypts a vault payload of `salt[16] || nonce[12] || ciphertext_with_tag`
/// using PBKDF2-HMAC-SHA256(password, salt, 100_000, 32) → AES-256-GCM(key, nonce, ct).
///
/// Mirrors the Python `vault.load` decrypt path; tag validation failure
/// (wrong password or tampered ciphertext) maps to `BadPassword`.
pub fn decrypt(payload: &[u8], password: &str) -> Result<String, VaultError> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};

    // GCM ciphertext is at least 16 bytes (the tag). Anything shorter than
    // salt + nonce + tag can't have come from `vault.store`.
    if payload.len() < SALT_LEN + NONCE_LEN + 16 {
        return Err(VaultError::Malformed);
    }
    let salt = &payload[..SALT_LEN];
    let nonce = &payload[SALT_LEN..SALT_LEN + NONCE_LEN];
    let ciphertext = &payload[SALT_LEN + NONCE_LEN..];

    let mut key_buf = [0u8; KEY_LEN];
    pbkdf2::pbkdf2_hmac::<sha2::Sha256>(password.as_bytes(), salt, KDF_ITERS, &mut key_buf);

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_buf));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| VaultError::BadPassword)?;

    String::from_utf8(plaintext).map_err(|_| VaultError::Malformed)
}
