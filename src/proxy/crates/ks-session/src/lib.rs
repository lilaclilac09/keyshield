//! Read-only client for the Python session store.
//!
//! Mirrors `src/backend/auth/session.py`: HMAC-SHA256 over a urlsafe-b64
//! JSON payload, optional `ksv2_` public prefix, `deleted_users` check, and
//! delegated claims (`aid` / `provider` / `scope` / `spend_cap_usd`).
//!
//! Legacy rows whose token is not `payload.hmac` (the oracle `expired`
//! hex fixture) still resolve via SQLite lookup + AES-GCM decrypt.

use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use rusqlite::OptionalExtension;
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

pub const TOKEN_PREFIX: &str = "ksv2_";

#[derive(thiserror::Error, Debug)]
pub enum SessionError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("decrypt failed")]
    Decrypt,
    #[error("connection mutex poisoned")]
    Poisoned,
}

#[derive(Clone, Debug, Default)]
pub struct Session {
    pub user_id: String,
    pub password: String,
    pub aid: Option<i64>,
    pub provider: Option<String>,
    pub scope: Option<Vec<String>>,
    pub spend_cap_usd: Option<f64>,
    pub vault_key_id: Option<String>,
    pub iat: Option<i64>,
}

impl Session {
    pub fn basic(user_id: impl Into<String>, password: impl Into<String>) -> Self {
        Self {
            user_id: user_id.into(),
            password: password.into(),
            ..Self::default()
        }
    }
}

/// Number of read-only SQLite connections in the pool. Spec 02 calls for 4-8;
/// 4 is the floor of that range and matches the dominant request-fan-out for
/// the proxy's per-request token lookup.
const POOL_SIZE: usize = 4;

/// Read-only handle. The Python writer keeps the DB in WAL, so multiple
/// read-only Rust connections can SELECT in parallel without blocking each
/// other or the writer.
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
        let idx = self.next.fetch_add(1, Ordering::Relaxed) % self.pool.len();
        let conn = self.pool[idx].lock().map_err(|_| SessionError::Poisoned)?;

        let claims = decode_hmac_payload(token, &self.server_key);
        if let Some(data) = claims.as_ref() {
            let now = unix_now();
            if now > data.get("exp").and_then(|v| v.as_i64()).unwrap_or(0) {
                return Ok(None);
            }
            if now < data.get("nbf").and_then(|v| v.as_i64()).unwrap_or(0) {
                return Ok(None);
            }
            if let Some(uid) = data.get("uid").and_then(|v| v.as_str()) {
                if is_deleted(&conn, uid)? {
                    return Ok(None);
                }
            }
        }

        let Some((user_id, enc_pass)) = lookup_row(&conn, token)? else {
            return Ok(None);
        };

        if claims.is_none() && is_deleted(&conn, &user_id)? {
            return Ok(None);
        }

        let password = decrypt_pass(&self.server_key, &enc_pass)?;
        Ok(Some(session_from_claims(user_id, password, claims.as_ref())))
    }
}

pub fn canonical_token(token: &str) -> &str {
    token.strip_prefix(TOKEN_PREFIX).unwrap_or(token)
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn decode_b64(s: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD.decode(s.trim_end_matches('=')).ok()
}

fn decode_hmac_payload(token: &str, server_key: &[u8; 32]) -> Option<serde_json::Value> {
    let canon = canonical_token(token);
    let (payload, sig) = canon.rsplit_once('.')?;
    if payload.is_empty() || sig.is_empty() {
        return None;
    }
    let mut mac = HmacSha256::new_from_slice(server_key).ok()?;
    mac.update(payload.as_bytes());
    let sig_bytes = decode_b64(sig)?;
    mac.verify_slice(&sig_bytes).ok()?;
    let json_bytes = decode_b64(payload)?;
    serde_json::from_slice(&json_bytes).ok()
}

fn is_no_such_table(err: &rusqlite::Error) -> bool {
    let msg = err.to_string();
    msg.contains("no such table") || msg.contains("no such column")
}

fn is_deleted(conn: &rusqlite::Connection, user_id: &str) -> Result<bool, SessionError> {
    let mut stmt = match conn.prepare_cached("SELECT 1 FROM deleted_users WHERE user_id = ?") {
        Ok(s) => s,
        Err(e) if is_no_such_table(&e) => return Ok(false),
        Err(e) => return Err(e.into()),
    };
    let row: Option<i32> = match stmt.query_row([user_id], |r| r.get(0)).optional() {
        Ok(v) => v,
        Err(e) if is_no_such_table(&e) => return Ok(false),
        Err(e) => return Err(e.into()),
    };
    Ok(row.is_some())
}

fn lookup_row(
    conn: &rusqlite::Connection,
    token: &str,
) -> Result<Option<(String, Vec<u8>)>, SessionError> {
    let canon = canonical_token(token);
    let mut stmt = conn.prepare_cached(
        "SELECT user_id, enc_pass FROM sessions \
         WHERE token = ? AND expires_at > strftime('%s','now')",
    )?;
    let row: Option<(String, Vec<u8>)> = stmt
        .query_row([canon], |row| Ok((row.get(0)?, row.get(1)?)))
        .optional()?;
    if row.is_some() {
        return Ok(row);
    }
    if canon != token {
        let row = stmt
            .query_row([token], |row| Ok((row.get(0)?, row.get(1)?)))
            .optional()?;
        return Ok(row);
    }
    Ok(None)
}

fn session_from_claims(
    user_id: String,
    password: String,
    claims: Option<&serde_json::Value>,
) -> Session {
    let mut sess = Session::basic(user_id, password);
    let Some(data) = claims else {
        return sess;
    };
    sess.aid = data.get("aid").and_then(|v| v.as_i64());
    sess.provider = data
        .get("provider")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    sess.scope = match data.get("scope") {
        Some(serde_json::Value::Array(arr)) => {
            let items: Vec<String> = arr
                .iter()
                .filter_map(|x| x.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            if items.is_empty() {
                None
            } else {
                Some(items)
            }
        }
        Some(serde_json::Value::String(s)) => {
            let items: Vec<String> = s
                .split(',')
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty())
                .collect();
            if items.is_empty() {
                None
            } else {
                Some(items)
            }
        }
        _ => None,
    };
    sess.spend_cap_usd = data.get("spend_cap_usd").and_then(|v| v.as_f64());
    sess.vault_key_id = data
        .get("vault_key_id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    sess.iat = data.get("iat").and_then(|v| v.as_i64());
    sess
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
/// `session._server_secret`.
pub(crate) fn derive_server_key(secret: &str) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(secret.as_bytes());
    h.finalize().into()
}
