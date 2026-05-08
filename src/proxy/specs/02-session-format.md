# 02 — Session store format

> **Amendments (2026-04-29):** see ADR-001. The skeleton's `Mutex<Connection>`
> is a placeholder — implementation MUST be a pool of 4–8 read-only
> connections to avoid serializing the hot path behind one lock. Open
> with `SQLITE_OPEN_READ_ONLY` flag; do NOT use `immutable=1` (Python
> writes to the same file). WAL mode means readers don't block writers.

## Source of truth

`v2-mvp/src/session.py` (whole file).

## SQLite schema

```sql
CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    enc_pass   BLOB NOT NULL,
    expires_at INTEGER NOT NULL
);
```

Path: `v2-mvp/sessions.db` (configurable via `KS_SESSION_DB` env in Rust).

## Encryption of `enc_pass`

```
server_key = SHA-256(SERVER_SECRET.utf8)            # 32 bytes
nonce      = random_bytes(12)
ciphertext = AES-256-GCM-Encrypt(server_key, nonce, password.utf8, aad=empty)
enc_pass   = nonce || ciphertext                    # ciphertext includes 16-byte GCM tag
```

`SERVER_SECRET` is the Python env var. Rust reads the same env var. **Default
fallback in Python is the literal string `CHANGE-ME-IN-PROD-32-BYTES-MIN!!`**;
Rust must mirror this so dev environments work, and log a warning at startup
if the default is used.

## Expiry

`expires_at` is a Unix timestamp (seconds). Rows where `expires_at <= now()`
are stale. Python's `_db()` deletes them on every connection — Rust does
**not** delete; it stays read-only. Stale rows just don't match.

## Rust API

```rust
pub struct SessionStore {
    db: rusqlite::Connection,
    server_key: [u8; 32],
}

#[derive(Clone, Debug)]
pub struct Session {
    pub user_id: String,
    pub password: String,
}

#[derive(thiserror::Error, Debug)]
pub enum SessionError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("decrypt failed")]
    Decrypt,
}

impl SessionStore {
    pub fn open(db_path: &Path, server_secret: &str) -> Result<Self, SessionError>;
    pub fn get(&self, token: &str) -> Result<Option<Session>, SessionError>;
}
```

## Concurrency

Rust opens the SQLite file in **read-only mode** (`SQLITE_OPEN_READ_ONLY`)
and uses `PRAGMA journal_mode=WAL` semantics — the Python writer keeps the
DB in WAL because that's SQLite's default for FastAPI. WAL means readers
don't block on writes. Use a per-request `Connection`, or pool of 4–8
read-only connections, to avoid contention.

## Special token: `dev-bypass`

server.py:329-331 hard-codes:

```python
if token == "dev-bypass":
    return {"user_id": "dev-bypass", "password": "dev-bypass"}
```

Rust mirrors this in the proxy layer (not in `ks-session`) — keep
`ks-session` pure DB access, and let `ks-proxy` short-circuit when
`token == "dev-bypass"` AND `KS_DEV_BYPASS=1` env is set. Production
deployments leave the env unset; spec deviates from Python here by requiring
opt-in, which is a defensible safety improvement.

## Test plan

1. Bring up Python, hit `/auth/login {userId, password}`, capture the token.
2. Open `sessions.db` from Rust and call `SessionStore::get(token)`.
3. Assert returned `user_id` and `password` match.
4. Wait past `SESSION_TTL` (24h, or set a small TTL via env in tests) and
   verify `get` returns `None`.
5. Start fresh DB with `SERVER_SECRET=A`, write a session, switch
   `SERVER_SECRET=B`, verify Rust returns `Decrypt` error (not panic).
