//! Oracle tests for `ks-session`.
//!
//! Strategy: drive the Python `session.create(...)` writer (via
//! `proxy-rs/scripts/seed_session_fixtures.py`) against a tmp SQLite DB
//! and a tmp `SERVER_SECRET`, then open the same DB from Rust and assert
//! `SessionStore::get(token)` returns the same `(user_id, password)`.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use ks_session::{Session, SessionError, SessionStore};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Manifest {
    #[allow(dead_code)]
    scenario: String,
    db_path: String,
    server_secret: String,
    user_id: String,
    password: String,
    token: String,
}

fn python_bin() -> String {
    if let Ok(p) = env::var("KS_PYTHON") {
        return p;
    }
    let venv = repo_root().join("v2-mvp/.venv/bin/python3");
    if venv.exists() {
        return venv.to_string_lossy().into_owned();
    }
    "python3".into()
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .expect("ks-session crate must live three levels under repo root")
}

fn proxy_rs_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .expect("ks-session crate must live two levels under proxy-rs/")
}

fn unique_tmp_dir(label: &str) -> PathBuf {
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir = env::temp_dir().join(format!("ks-session-{label}-{pid}-{nanos}-{n}"));
    fs::create_dir_all(&dir).expect("create tmp dir");
    dir
}

fn run_seed(scenario: &str, server_secret: &str, user_id: &str, password: &str) -> Manifest {
    let out_dir = unique_tmp_dir(scenario);
    let script = proxy_rs_dir().join("scripts/seed_session_fixtures.py");
    let py = python_bin();

    let output = Command::new(&py)
        .arg(&script)
        .arg(scenario)
        .arg(&out_dir)
        .arg(server_secret)
        .arg(user_id)
        .arg(password)
        .output()
        .unwrap_or_else(|e| {
            panic!(
                "failed to spawn `{} {} {} {} {} {} {}`: {e}\n\
                 hint: set KS_PYTHON to a python with `cryptography` installed",
                py,
                script.display(),
                scenario,
                out_dir.display(),
                server_secret,
                user_id,
                password,
            )
        });
    assert!(
        output.status.success(),
        "seed_session_fixtures.py {scenario} exited {:?}\nstdout: {}\nstderr: {}",
        output.status.code(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );

    let raw = fs::read_to_string(out_dir.join("manifest.json")).expect("read manifest");
    serde_json::from_str(&raw).expect("manifest schema")
}

#[test]
fn fresh_session_round_trips_through_get() {
    let m = run_seed("fresh", "test-secret-A", "user_a", "pw_a");
    let store = SessionStore::open(Path::new(&m.db_path), &m.server_secret).expect("open");

    let got = store.get(&m.token).expect("get").expect("Some(session)");
    let Session { user_id, password } = got;
    assert_eq!(user_id, m.user_id);
    assert_eq!(password, m.password);
}

#[test]
fn unknown_token_returns_none() {
    let m = run_seed("fresh", "test-secret-A", "user_b", "pw_b");
    let store = SessionStore::open(Path::new(&m.db_path), &m.server_secret).expect("open");

    let got = store
        .get("00000000000000000000000000000000")
        .expect("get must not error");
    assert!(got.is_none(), "unknown token must miss, got {got:?}");
}

#[test]
fn expired_row_returns_none() {
    // The `expired` scenario inserts a row with `expires_at = now - 60`.
    // The SQL predicate `expires_at > strftime('%s','now')` filters it.
    let m = run_seed("expired", "test-secret-A", "user_c", "pw_c");
    let store = SessionStore::open(Path::new(&m.db_path), &m.server_secret).expect("open");

    let got = store.get(&m.token).expect("get must not error");
    assert!(
        got.is_none(),
        "expired row must be filtered by the SQL predicate, got {got:?}",
    );
}

#[test]
fn wrong_server_secret_returns_decrypt_error() {
    // Encrypt with secret A, open with secret B → AES-GCM tag rejects.
    let m = run_seed("decrypt-mismatch", "secret-A", "user_d", "pw_d");
    let store = SessionStore::open(Path::new(&m.db_path), "secret-B").expect("open");

    let err = store
        .get(&m.token)
        .expect_err("rotated secret must surface as Decrypt");
    assert!(
        matches!(err, SessionError::Decrypt),
        "expected Decrypt, got {err:?}",
    );
}

#[test]
fn pool_serves_concurrent_lookups() {
    // Smoke check that the 4-connection pool actually allows parallel reads.
    // We don't assert latency — just that 8 concurrent threads each get
    // a successful round-trip without deadlocking or poisoning a mutex.
    use std::sync::Arc;
    use std::thread;

    let m = run_seed("fresh", "test-secret-A", "user_pool", "pw_pool");
    let store = Arc::new(
        SessionStore::open(Path::new(&m.db_path), &m.server_secret).expect("open"),
    );

    let mut handles = Vec::new();
    for _ in 0..8 {
        let s = Arc::clone(&store);
        let token = m.token.clone();
        let want_user = m.user_id.clone();
        handles.push(thread::spawn(move || {
            let session = s.get(&token).expect("get").expect("Some");
            assert_eq!(session.user_id, want_user);
        }));
    }
    for h in handles {
        h.join().expect("thread panic");
    }
}
