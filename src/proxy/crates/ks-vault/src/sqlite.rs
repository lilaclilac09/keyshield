//! SQLite reader for the `vault_items` table.
//!
//! The Python backend stores upstream API keys in a single SQLite DB
//! (`src/backend/data/vault_shim.db` by default, configurable via
//! `KS_DATA_DIR`). This module gives the Rust hot-path proxy a read-only
//! handle so it can resolve `(user_id, upstream)` → plaintext API key
//! without round-tripping through the Python `/vproxy` endpoint.
//!
//! Schema (matches `src/backend/routes/vault.py`):
//!   vault_items(id, user_id, name, type, upstream, value, tags,
//!               created_at, updated_at, expires_at,
//!               cipher, iv, cipher_v)
//!
//! For Path A local-dev `value` holds plaintext. Production Path A uses
//! the `cipher` / `iv` columns and decrypts client-side or at the CF
//! Worker edge — this reader only handles the plaintext fast-path.

use std::path::Path;

#[derive(thiserror::Error, Debug)]
pub enum SqliteVaultError {
    #[error("vault DB io: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("no vault key for user={user_id} upstream={upstream}")]
    NotFound { user_id: String, upstream: String },
}

/// Resolve `(user_id, upstream)` → plaintext upstream API key.
///
/// Picks the most recently created non-empty row when the user has
/// multiple entries for the same upstream (rotation / multiple
/// projects). Same query shape as Python's `vault_proxy_route`.
pub fn lookup_upstream_key(
    db_path: &Path,
    user_id: &str,
    upstream: &str,
) -> Result<String, SqliteVaultError> {
    let conn = rusqlite::Connection::open(db_path)?;
    conn.query_row(
        "SELECT value FROM vault_items \
         WHERE user_id = ?1 AND upstream = ?2 AND value != '' \
         ORDER BY created_at DESC LIMIT 1",
        rusqlite::params![user_id, upstream],
        |row| row.get::<_, String>(0),
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => SqliteVaultError::NotFound {
            user_id: user_id.to_string(),
            upstream: upstream.to_string(),
        },
        e => SqliteVaultError::Db(e),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    fn make_db() -> NamedTempFile {
        let f = NamedTempFile::new().unwrap();
        let conn = rusqlite::Connection::open(f.path()).unwrap();
        conn.execute_batch(
            "CREATE TABLE vault_items (
                id         TEXT NOT NULL,
                user_id    TEXT NOT NULL,
                name       TEXT NOT NULL,
                type       TEXT NOT NULL DEFAULT 'api_key',
                upstream   TEXT NOT NULL DEFAULT '',
                value      TEXT NOT NULL DEFAULT '',
                tags       TEXT NOT NULL DEFAULT '[]',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                expires_at REAL,
                cipher     TEXT NOT NULL DEFAULT '',
                iv         TEXT NOT NULL DEFAULT '',
                cipher_v   INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (id, user_id)
            );",
        )
        .unwrap();
        f
    }

    fn insert(db: &Path, user: &str, upstream: &str, value: &str, created_at: f64) {
        rusqlite::Connection::open(db)
            .unwrap()
            .execute(
                "INSERT INTO vault_items (id, user_id, name, upstream, value, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                rusqlite::params![format!("id_{}", value), user, "test", upstream, value, created_at],
            )
            .unwrap();
    }

    #[test]
    fn returns_plaintext_value() {
        let f = make_db();
        insert(f.path(), "alice", "helius", "sk-helius-real", 100.0);
        let got = lookup_upstream_key(f.path(), "alice", "helius").unwrap();
        assert_eq!(got, "sk-helius-real");
    }

    #[test]
    fn picks_most_recent_when_multiple() {
        let f = make_db();
        insert(f.path(), "alice", "helius", "old-key", 100.0);
        insert(f.path(), "alice", "helius", "new-key", 200.0);
        let got = lookup_upstream_key(f.path(), "alice", "helius").unwrap();
        assert_eq!(got, "new-key");
    }

    #[test]
    fn skips_empty_value_rows() {
        let f = make_db();
        insert(f.path(), "alice", "helius", "", 200.0); // empty / cipher-only row
        insert(f.path(), "alice", "helius", "plaintext-key", 100.0);
        let got = lookup_upstream_key(f.path(), "alice", "helius").unwrap();
        assert_eq!(got, "plaintext-key");
    }

    #[test]
    fn not_found_for_missing_upstream() {
        let f = make_db();
        insert(f.path(), "alice", "openai", "sk-openai", 100.0);
        let err = lookup_upstream_key(f.path(), "alice", "helius").unwrap_err();
        assert!(matches!(err, SqliteVaultError::NotFound { .. }));
    }

    #[test]
    fn not_found_for_different_user() {
        let f = make_db();
        insert(f.path(), "alice", "helius", "alice-key", 100.0);
        let err = lookup_upstream_key(f.path(), "bob", "helius").unwrap_err();
        assert!(matches!(err, SqliteVaultError::NotFound { .. }));
    }
}
