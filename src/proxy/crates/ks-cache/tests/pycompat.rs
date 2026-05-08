//! Integration tests for `ks_cache::pycompat`.
//!
//! These exercise byte-level parity with Python's
//! `json.dumps(..., sort_keys=True)` (the oracle the Rust port has to match
//! to keep cache HIT bytes and cache-key SHA-1s aligned with v2-mvp).
//!
//! Fixtures live under `proxy-rs/tests/fixtures/`. They are generated from
//! the real Python interpreter — never edit them by hand. Regenerate with
//! the one-liners in `proxy-rs/specs/08-python-compat.md` if the inputs
//! ever change.

use ks_cache::pycompat::{cache_key, to_canonical_json};
use serde_json::{json, Value};

const PYTHON_JSON_FIXTURE: &str =
    include_str!("../../../tests/fixtures/python_json.json");
const CACHE_KEYS_FIXTURE: &str =
    include_str!("../../../tests/fixtures/cache_keys.json");

#[test]
fn matches_python_json_dumps_sort_keys() {
    let parsed: Value = serde_json::from_str(PYTHON_JSON_FIXTURE)
        .expect("python_json.json is valid JSON");
    let inputs = parsed["inputs"].as_array().expect("inputs is an array");
    let expected = parsed["expected"].as_array().expect("expected is an array");
    assert_eq!(
        inputs.len(),
        expected.len(),
        "inputs and expected must be the same length"
    );
    assert!(
        !inputs.is_empty(),
        "fixture must not be empty — would silently pass"
    );

    for (i, (input, want)) in inputs.iter().zip(expected.iter()).enumerate() {
        let want = want.as_str().expect("expected entry is a string");
        let got = to_canonical_json(input);
        assert_eq!(
            got, want,
            "case {i} diverged from Python:\n  input:    {input}\n  expected: {want}\n  got:      {got}",
        );
    }
}

#[test]
fn matches_python_cache_key_sha1() {
    let cases: Value =
        serde_json::from_str(CACHE_KEYS_FIXTURE).expect("cache_keys.json is valid JSON");
    let cases = cases.as_array().expect("cache_keys.json is an array");
    assert!(!cases.is_empty(), "no cache_key fixtures");

    for (i, case) in cases.iter().enumerate() {
        let provider = case["provider"].as_str().expect("provider is a string");
        let key = case["key"].as_str().expect("key is a string");
        let payload = &case["payload"];
        let want = case["expected_sha1"]
            .as_str()
            .expect("expected_sha1 is a string");
        let got = cache_key(provider, key, payload);
        assert_eq!(
            got, want,
            "case {i} ({provider} / {key}) sha1 diverged from Python\n  payload: {payload}\n  expected: {want}\n  got:      {got}",
        );
        assert_eq!(got.len(), 40, "sha1 hex must be 40 chars");
    }
}

#[test]
fn diverges_from_default_serde_json() {
    // Sanity: prove pycompat is doing something. If a future serde_json
    // ever happened to pick the same separators, this test catches it
    // and forces us to think about whether we still need the helper.
    let v = json!({"a": 1, "b": 2});
    let pyc = to_canonical_json(&v);
    let std = serde_json::to_string(&v).unwrap();
    assert_ne!(pyc, std);
    assert_eq!(pyc, "{\"a\": 1, \"b\": 2}");
    assert_eq!(std, "{\"a\":1,\"b\":2}");
}

#[test]
fn at_least_one_fixture_diverges_from_default_serde_json() {
    // Stronger version of the above against the real fixture set: at
    // least one input must produce different bytes between pycompat and
    // serde_json's default. Otherwise we'd ship pycompat for nothing.
    let parsed: Value = serde_json::from_str(PYTHON_JSON_FIXTURE).unwrap();
    let inputs = parsed["inputs"].as_array().unwrap();

    let mut diverged = 0usize;
    for input in inputs {
        let pyc = to_canonical_json(input);
        let std = serde_json::to_string(input).unwrap();
        if pyc != std {
            diverged += 1;
        }
    }
    assert!(
        diverged > 0,
        "pycompat output matches serde_json on every fixture — pycompat is a no-op",
    );
}

#[test]
fn round_trips_through_value() {
    // For every fixture input, parsing pycompat output back to a Value
    // round-trips losslessly.
    let parsed: Value = serde_json::from_str(PYTHON_JSON_FIXTURE).unwrap();
    for input in parsed["inputs"].as_array().unwrap() {
        let serialized = to_canonical_json(input);
        let reparsed: Value = serde_json::from_str(&serialized).unwrap_or_else(|e| {
            panic!("pycompat output failed to re-parse: {e}\n  output: {serialized}")
        });
        assert_eq!(&reparsed, input, "round-trip mismatch:\n  input:      {input}\n  pycompat:   {serialized}\n  reparsed:   {reparsed}");
    }
}

#[test]
fn ascii_escapes_non_bmp() {
    // U+1F600 GRINNING FACE → surrogate pair 😀
    let v = json!({"emoji": "😀"});
    assert_eq!(to_canonical_json(&v), "{\"emoji\": \"\\ud83d\\ude00\"}");
}

#[test]
fn ascii_escapes_bmp() {
    // U+00E9 LATIN SMALL LETTER E WITH ACUTE
    let v = json!({"x": "é"});
    assert_eq!(to_canonical_json(&v), "{\"x\": \"\\u00e9\"}");
}

#[test]
fn sorts_nested_keys() {
    let v = json!({"z": 1, "a": {"y": 2, "b": 3}});
    assert_eq!(
        to_canonical_json(&v),
        "{\"a\": {\"b\": 3, \"y\": 2}, \"z\": 1}",
    );
}

#[test]
fn empty_containers() {
    assert_eq!(to_canonical_json(&json!([])), "[]");
    assert_eq!(to_canonical_json(&json!({})), "{}");
}

#[test]
fn standard_escapes() {
    // Mirrors the fixture's `escape` case directly.
    let v = json!({"escape": "\"\\\u{08}\u{0C}\n\r\t"});
    assert_eq!(
        to_canonical_json(&v),
        "{\"escape\": \"\\\"\\\\\\b\\f\\n\\r\\t\"}",
    );
}

#[test]
fn cache_key_has_expected_shape() {
    let h = cache_key("helius", "getBalance", &json!(["addr"]));
    assert_eq!(h.len(), 40);
    assert!(h.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
}

#[test]
fn cache_key_is_insertion_order_independent() {
    // Two semantically-equal payloads built in different key orders must
    // hash to the same SHA-1. If the workspace ever turns on
    // `serde_json/preserve_order` this test breaks loudly — which is the
    // signal we want, because cache HIT bytes would silently desync from
    // the Python oracle.
    let a = cache_key("helius", "x", &json!({"a": 1, "b": 2}));
    let b = cache_key("helius", "x", &json!({"b": 2, "a": 1}));
    assert_eq!(a, b);
}

#[test]
fn pycompat_output_is_pure_ascii() {
    // Internal invariant: PythonFormatter never writes a high byte. The
    // impl `debug_assert!`s this, but a plain `assert!` here also
    // exercises release builds and the non-BMP path.
    let v = json!({"emoji": "😀", "résumé": "café"});
    let s = to_canonical_json(&v);
    assert!(
        s.bytes().all(|b| b < 0x80),
        "pycompat emitted a non-ASCII byte: {s:?}",
    );
}
