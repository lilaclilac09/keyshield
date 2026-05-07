//! Oracle tests for `ks-vault`.
//!
//! Strategy: we drive the Python `vault.store(...)` (the authoritative
//! writer) via `proxy-rs/scripts/seed_vault_fixtures.py`, then read the
//! resulting `.enc` files back through `ks_vault::load`. Any byte-level
//! divergence from the Python format would fail the auth tag.
//!
//! The script itself monkey-patches `vault.VAULT_DIR` to a tmp path so we
//! never pollute the real `v2-mvp/vault/` tree.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use ks_vault::{load, VaultError, VaultPath};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Fixture {
    user_id: String,
    upstream: String,
    password: String,
    expected_plaintext: String,
}

#[derive(Debug, Deserialize)]
struct Manifest {
    fixtures: Vec<Fixture>,
    #[allow(dead_code)]
    vault_root: String,
}

/// Locate the Python interpreter. Tests honor `KS_PYTHON` (e.g. when CI
/// pins a specific virtualenv with the `cryptography` package installed).
/// Default falls back to the project's local venv if present, then PATH.
fn python_bin() -> String {
    if let Ok(p) = env::var("KS_PYTHON") {
        return p;
    }
    // The repo has a venv at v2-mvp/.venv with cryptography installed.
    // Prefer it so tests don't hard-depend on a system-wide install.
    let venv = repo_root().join("v2-mvp/.venv/bin/python3");
    if venv.exists() {
        return venv.to_string_lossy().into_owned();
    }
    "python3".into()
}

fn repo_root() -> PathBuf {
    // `CARGO_MANIFEST_DIR` is `proxy-rs/crates/ks-vault`. Repo root is two
    // levels up from there.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .expect("ks-vault crate must live three levels under repo root")
}

fn proxy_rs_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .expect("ks-vault crate must live two levels under proxy-rs/")
}

/// Cheap unique-tmp-dir helper. We avoid pulling in a new dev dep just for
/// tempfile; collision resistance only needs to outlive one test process.
fn unique_tmp_dir(label: &str) -> PathBuf {
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir = env::temp_dir().join(format!("ks-vault-{label}-{pid}-{nanos}-{n}"));
    fs::create_dir_all(&dir).expect("create tmp dir");
    dir
}

/// Run `seed_vault_fixtures.py <out_dir>` and parse the manifest.
fn seed_fixtures() -> (PathBuf, Manifest) {
    let out_dir = unique_tmp_dir("fixtures");
    let script = proxy_rs_dir().join("scripts/seed_vault_fixtures.py");
    let py = python_bin();

    let output = Command::new(&py)
        .arg(&script)
        .arg(&out_dir)
        .output()
        .unwrap_or_else(|e| {
            panic!(
                "failed to spawn `{} {} {}`: {e}\n\
                 hint: set KS_PYTHON to a python with `cryptography` installed",
                py,
                script.display(),
                out_dir.display()
            )
        });
    assert!(
        output.status.success(),
        "seed_vault_fixtures.py exited {:?}\nstdout: {}\nstderr: {}",
        output.status.code(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );

    let manifest_path = out_dir.join("manifest.json");
    let raw = fs::read_to_string(&manifest_path)
        .unwrap_or_else(|e| panic!("read manifest at {}: {e}", manifest_path.display()));
    let manifest: Manifest =
        serde_json::from_str(&raw).expect("manifest.json must match the script's schema");
    (out_dir, manifest)
}

#[test]
fn happy_path_decrypts_match_python_plaintext() {
    let (root, manifest) = seed_fixtures();
    let vault = VaultPath::new(&root);

    assert_eq!(
        manifest.fixtures.len(),
        5,
        "spec calls for exactly 5 happy-path fixtures"
    );

    for fx in &manifest.fixtures {
        let plaintext = load(&vault, &fx.user_id, &fx.upstream, &fx.password)
            .unwrap_or_else(|e| {
                panic!(
                    "load failed for {}/{}: {e:?}",
                    fx.user_id, fx.upstream
                )
            });
        assert_eq!(
            plaintext, fx.expected_plaintext,
            "decrypted bytes for {}/{} diverged from Python source plaintext",
            fx.user_id, fx.upstream
        );
    }
}

#[test]
fn missing_entry_returns_not_found() {
    let (root, _) = seed_fixtures();
    let vault = VaultPath::new(&root);
    let err = load(&vault, "no-such-user", "openai", "anything")
        .expect_err("missing entry must error, not succeed");
    assert!(
        matches!(err, VaultError::NotFound),
        "expected NotFound, got {err:?}"
    );
}

#[test]
fn wrong_password_returns_bad_password() {
    let (root, manifest) = seed_fixtures();
    let vault = VaultPath::new(&root);
    let fx = &manifest.fixtures[0];
    let err = load(&vault, &fx.user_id, &fx.upstream, "definitely-wrong-pw")
        .expect_err("wrong pw must error");
    assert!(
        matches!(err, VaultError::BadPassword),
        "expected BadPassword, got {err:?}"
    );
}

#[test]
fn truncated_file_fails_decrypt() {
    let (root, manifest) = seed_fixtures();
    let fx = &manifest.fixtures[0];
    // Drop the last byte → corrupts the GCM tag → AES-GCM rejects.
    // Spec 01 says this surfaces as either Malformed (if too short to
    // contain headers) or BadPassword (tag rejection); for a single-byte
    // truncation of a real fixture, the bytes are still long enough that
    // BadPassword wins.
    let path = root.join(&fx.user_id).join(format!("{}.enc", fx.upstream));
    let mut bytes = fs::read(&path).expect("read fixture");
    bytes.pop();
    fs::write(&path, &bytes).expect("write truncated fixture");

    let vault = VaultPath::new(&root);
    let err =
        load(&vault, &fx.user_id, &fx.upstream, &fx.password).expect_err("truncated must error");
    assert!(
        matches!(err, VaultError::BadPassword),
        "expected BadPassword for tag-truncation, got {err:?}"
    );
}

#[test]
fn header_short_file_is_malformed() {
    // Construct a file too short to contain even the (salt + nonce + tag)
    // headers. Spec 01 maps this to `Malformed`.
    let root = unique_tmp_dir("malformed");
    let user_dir = root.join("user");
    fs::create_dir_all(&user_dir).unwrap();
    fs::write(user_dir.join("openai.enc"), vec![0u8; 10]).unwrap();

    let vault = VaultPath::new(&root);
    let err = load(&vault, "user", "openai", "pw").expect_err("short file must error");
    assert!(
        matches!(err, VaultError::Malformed),
        "expected Malformed for sub-header file, got {err:?}"
    );
}
