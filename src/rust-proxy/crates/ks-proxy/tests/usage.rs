//! Cost-table parity test: invoke the Python `extract_token_usage` on a
//! curated body set, dump `(tok_in, tok_out, cost)` to a manifest, then
//! call the Rust port on the same bytes and assert byte-equal results.
//!
//! Drift = under/over-charging users (per ADR-001 #7 + spec 07-bridge).

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use ks_proxy::usage::extract_token_usage;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Fixture {
    label: String,
    upstream: String,
    body_b64: String,
    tok_in: u64,
    tok_out: u64,
    cost: f64,
}

#[derive(Debug, Deserialize)]
struct Manifest {
    fixtures: Vec<Fixture>,
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
        .expect("ks-proxy crate must live three levels under repo root")
}

fn proxy_rs_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .expect("ks-proxy crate must live two levels under proxy-rs/")
}

fn unique_tmp_dir(label: &str) -> PathBuf {
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir = env::temp_dir().join(format!("ks-proxy-usage-{label}-{pid}-{nanos}-{n}"));
    fs::create_dir_all(&dir).expect("create tmp dir");
    dir
}

fn dump_python_fixtures() -> Manifest {
    let out_dir = unique_tmp_dir("fixtures");
    let script = proxy_rs_dir().join("scripts/dump_usage_fixtures.py");
    let py = python_bin();

    let output = Command::new(&py)
        .arg(&script)
        .arg(&out_dir)
        .output()
        .unwrap_or_else(|e| {
            panic!(
                "failed to spawn `{} {} {}`: {e}\n\
                 hint: set KS_PYTHON to a python3 binary if `python3` isn't on PATH",
                py,
                script.display(),
                out_dir.display()
            )
        });
    assert!(
        output.status.success(),
        "dump_usage_fixtures.py exited {:?}\nstdout: {}\nstderr: {}",
        output.status.code(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );

    let manifest_path = out_dir.join("manifest.json");
    let raw = fs::read_to_string(&manifest_path)
        .unwrap_or_else(|e| panic!("read manifest at {}: {e}", manifest_path.display()));
    serde_json::from_str(&raw).expect("manifest.json must match the script's schema")
}

fn approx_eq(a: f64, b: f64) -> bool {
    // 1e-9 tolerance — both sides do `tokens/1000 * rate` in IEEE-754,
    // so the only divergence is bit-for-bit f64 ops in different orders.
    // For the magnitudes in the cost table (≤ 0.01) 1e-9 is comfortably
    // tighter than any real divergence.
    (a - b).abs() < 1e-9
}

#[test]
fn rust_extract_token_usage_matches_python() {
    let manifest = dump_python_fixtures();
    assert!(
        manifest.fixtures.len() >= 4,
        "manifest must include the 4 spec-required fixtures (got {})",
        manifest.fixtures.len()
    );

    // Spec requires at minimum:
    //   1. OpenAI w/ usage    → cost includes tok_in*0.003/1000 + tok_out*0.012/1000
    //   2. Anthropic w/ usage → input_tokens / output_tokens, 0.003/0.015
    //   3. Malformed body     → (0,0,flat_cost(upstream))
    //   4. Body w/o usage     → (0,0,flat_cost(upstream))
    let labels: std::collections::HashSet<&str> =
        manifest.fixtures.iter().map(|f| f.label.as_str()).collect();
    for needed in [
        "openai_with_usage",
        "anthropic_with_usage",
        "malformed_body",
        "missing_usage_field",
    ] {
        assert!(
            labels.contains(needed),
            "fixture '{needed}' missing from manifest"
        );
    }

    for fx in &manifest.fixtures {
        let body = base64::engine::general_purpose::STANDARD
            .decode(&fx.body_b64)
            .expect("body_b64 must be base64");
        let (rust_in, rust_out, rust_cost) = extract_token_usage(&fx.upstream, &body);
        assert_eq!(
            rust_in, fx.tok_in,
            "tok_in mismatch for {}: rust={rust_in} python={}",
            fx.label, fx.tok_in
        );
        assert_eq!(
            rust_out, fx.tok_out,
            "tok_out mismatch for {}: rust={rust_out} python={}",
            fx.label, fx.tok_out
        );
        assert!(
            approx_eq(rust_cost, fx.cost),
            "cost mismatch for {}: rust={rust_cost} python={} (delta {:e})",
            fx.label,
            fx.cost,
            (rust_cost - fx.cost).abs()
        );
    }
}

#[test]
fn empty_body_uses_flat_cost() {
    let (tok_in, tok_out, cost) = extract_token_usage("helius", b"");
    assert_eq!(tok_in, 0);
    assert_eq!(tok_out, 0);
    assert!(approx_eq(cost, 0.00001));
}

#[test]
fn unknown_upstream_returns_zero_cost_when_no_tokens() {
    // Mirror python: cost==0 → flat_cost (which is 0 for unknown upstream).
    let (tok_in, tok_out, cost) = extract_token_usage("does-not-exist", b"{}");
    assert_eq!(tok_in, 0);
    assert_eq!(tok_out, 0);
    assert!(approx_eq(cost, 0.0));
}
