//! Cargo-test wrapper for the Stage-1 oracle-diff harness.
//!
//! Spawns `python3 tests/oracle_diff/harness.py` and asserts it exits 0.
//! Run with `cargo test -p ks-proxy --release --test oracle_diff
//! oracle_diff_passes -- --nocapture --ignored` (gated on `--ignored`
//! because it spawns subprocesses and binds ports — not safe to run in
//! the regular suite).
//!
//! For a more readable invocation, prefer:
//!   `bash proxy-rs/scripts/run_oracle_diff.sh`

use std::path::PathBuf;
use std::process::{Command, Stdio};

#[test]
#[ignore = "spawns Python + Rust servers, binds :8000/:8001 — run via run_oracle_diff.sh"]
fn oracle_diff_passes() {
    // Locate the workspace root: this test sits at
    // `proxy-rs/tests/oracle_diff.rs`, the repo root is two levels up.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // CARGO_MANIFEST_DIR points to the ks-proxy crate (since this file
    // lives under `tests/` for that crate). Walk up to find proxy-rs.
    let proxy_rs = find_proxy_rs(&manifest_dir).expect("proxy-rs root");
    let harness = proxy_rs.join("tests").join("oracle_diff").join("harness.py");
    assert!(harness.is_file(), "missing harness.py at {harness:?}");

    let python = std::env::var("KS_PYTHON")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "python3".to_string());

    let mut child = Command::new(&python)
        .arg(&harness)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap_or_else(|e| panic!("failed to spawn {python} {harness:?}: {e}"));

    let status = child.wait().expect("harness wait");
    assert!(status.success(), "oracle_diff harness exited {status:?}");
}

fn find_proxy_rs(start: &PathBuf) -> Option<PathBuf> {
    let mut cur = start.clone();
    loop {
        if cur.join("BOUNDARY.md").is_file() {
            return Some(cur);
        }
        if !cur.pop() {
            return None;
        }
    }
}

