//! Read-only client for the v2-mvp session store.
//!
//! See `proxy-rs/specs/02-session-format.md` (and ADR-001 §"Engineering
//! action items") for the connection-pool requirement.

use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use rusqlite::OptionalExtension;

#[derive(thiserror::Error, Debug)]
pub enum SessionError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("decrypt failed")]
    Decrypt,
    #[error("connection mutex poisoned")]
    Poisoned,
}

#[derive(Clone, Debug)]
pub struct Session {
    pub user_id: String,
    pub password: String,
}

/// Number of read-only SQLite connections in the pool. Spec 02 calls for 4-8;
/// 4 is the floor of that range and matches the dominant request-fan-out for
/// the proxy's per-request token lookup.
const POOL_SIZE: usize = 4;

/// Read-only handle. The Python writer keeps the DB in WAL, so multiple
/// read-only Rust connections can SELECT in parallel without blocking each
/// other or the writer.
///
/// Implementation: a fixed-size pool of 4 connections fronted by an
/// `AtomicUsize` round-robin counter; each entry is `Mutex<Connection>` so
/// the SELECT itself is serialized per connection (rusqlite::Connection is
/// `Send` but not `Sync`).
pub struct SessionStore {
    pool: Vec<Mutex<rusqlite::Connection>>,
    next: AtomicUsize,
    server_key: [u8; 32],
}

impl SessionStore {
    pub fn open(db_path: &Path, server_secret: &str) -> Result<Self, SessionError> {
        let mut pool = Vec::with_capacity(POOL_SIZE);
        for _ in 0..POOL_SIZE {
            let conn = rusqlite::Connection::open_with_flags(
                db_path,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
            )?;
            pool.push(Mutex::new(conn));
        }
        Ok(Self {
            pool,
            next: AtomicUsize::new(0),
            server_key: derive_server_key(server_secret),
        })
    }

    /// Look up a session by token. Returns `Ok(None)` for misses, expired
    /// rows, or unknown tokens. `Err(Decrypt)` only on a row whose
    /// `enc_pass` failed AES-GCM authentication (almost always means a
    /// rotated `SERVER_SECRET`).
    pub fn get(&self, token: &str) -> Result<Option<Session>, SessionError> {
        // Round-robin picks one of the pooled connections. Wraparound is
        // implicit thanks to modulo on the pool length.
        let idx = self.next.fetch_add(1, Ordering::Relaxed) % self.pool.len();
        let conn = self.pool[idx].lock().map_err(|_| SessionError::Poisoned)?;

        // The expiry filter is a SQL predicate so Rust never sees a stale
        // row. Mirrors the `expires_at > ?` check in `session.get`. Using
        // `strftime('%s','now')` instead of binding `time::now` keeps the
        // clock authoritative inside SQLite.
        let mut stmt = conn.prepare_cached(
            "SELECT user_id, enc_pass FROM sessions \
             WHERE token = ? AND expires_at > strftime('%s','now')",
        )?;

        let row: Option<(String, Vec<u8>)> = stmt
            .query_row([token], |row| Ok((row.get(0)?, row.get(1)?)))
            .optional()?;

        let Some((user_id, enc_pass)) = row else {
            return Ok(None);
        };

        let password = decrypt_pass(&self.server_key, &enc_pass)?;
        Ok(Some(Session { user_id, password }))
    }
}

/// Decrypts `enc_pass = nonce[12] || ciphertext_with_tag` using the
/// server key. Mirrors `session._decrypt`.
fn decrypt_pass(server_key: &[u8; 32], enc_pass: &[u8]) -> Result<String, SessionError> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Key, Nonce};

    if enc_pass.len() < 12 + 16 {
        return Err(SessionError::Decrypt);
    }
    let (nonce, ciphertext) = enc_pass.split_at(12);

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(server_key));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| SessionError::Decrypt)?;

    String::from_utf8(plaintext).map_err(|_| SessionError::Decrypt)
}

/// `server_key = SHA-256(SERVER_SECRET.utf8)` — same derivation as
/// `session._server_key`.
pub(crate) fn derive_server_key(secret: &str) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(secret.as_bytes());
    h.finalize().into()
}
