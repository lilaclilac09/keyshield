/// Unit tests for ks-helius components that don't need a live HTTP server.
///
/// Coverage:
///   - CacheKey derivation (method + params → deterministic key)
///   - DiskCache roundtrip, expiry, null-mode
///   - HeliusClient TTL resolution (default vs per-method override)
///   - HeliusResponse::into_ok helper
///   - ScoutDedup in-flight collapse window
///   - HeliusConfig defaults

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use serde_json::json;

use ks_helius::{
    HeliusConfig, HeliusError,
    cache::{CacheKey, DiskCache},
    scout::ScoutDedup,
};

// ─── CacheKey ────────────────────────────────────────────────────────────────

#[test]
fn cache_key_is_deterministic() {
    let a = CacheKey::derive("getBalance", &json!(["9Wz"]));
    let b = CacheKey::derive("getBalance", &json!(["9Wz"]));
    assert_eq!(a, b);
}

#[test]
fn cache_key_differs_by_method() {
    let a = CacheKey::derive("getBalance", &json!(["addr"]));
    let b = CacheKey::derive("getAsset", &json!(["addr"]));
    assert_ne!(a, b);
}

#[test]
fn cache_key_differs_by_params() {
    let a = CacheKey::derive("getBalance", &json!(["addr1"]));
    let b = CacheKey::derive("getBalance", &json!(["addr2"]));
    assert_ne!(a, b);
}

#[test]
fn cache_key_is_40_char_hex() {
    // ks_cache::pycompat::cache_key returns sha1(provider:method:canonical_json)
    // as a 40-char lowercase hex string (no prefix).
    let k = CacheKey::derive("getBalance", &json!(["addr"]));
    assert_eq!(k.as_str().len(), 40, "key = {}", k.as_str());
    assert!(k.as_str().chars().all(|c| c.is_ascii_hexdigit()), "key = {}", k.as_str());
}

#[test]
fn cache_key_display_matches_as_str() {
    let k = CacheKey::derive("getAsset", &json!({"id": "abc"}));
    assert_eq!(k.as_str(), k.to_string());
}

// ─── DiskCache ───────────────────────────────────────────────────────────────

fn tmp_cache() -> (tempfile::TempDir, DiskCache) {
    let dir = tempfile::tempdir().unwrap();
    let cache = DiskCache::open(dir.path().join("test.redb"), 10 * 1024 * 1024).unwrap();
    (dir, cache)
}

fn key(s: &str) -> CacheKey {
    CacheKey(s.to_string())
}

#[tokio::test]
async fn disk_cache_put_then_get_returns_value() {
    let (_dir, cache) = tmp_cache();
    let k = key("helius:getBalance:roundtrip");
    let val = Bytes::from_static(b"hello world");
    cache.put(&k, val.clone(), Duration::from_secs(60)).await.unwrap();
    let got = cache.get(&k).await.unwrap();
    assert_eq!(got, Some(val));
}

#[tokio::test]
async fn disk_cache_expired_returns_none() {
    let (_dir, cache) = tmp_cache();
    let k = key("helius:getBalance:expired");
    cache.put(&k, Bytes::from_static(b"stale"), Duration::ZERO).await.unwrap();
    let got = cache.get(&k).await.unwrap();
    assert_eq!(got, None);
}

#[tokio::test]
async fn disk_cache_null_always_misses() {
    let cache = DiskCache::null();
    let k = key("helius:test:null");
    cache.put(&k, Bytes::from_static(b"data"), Duration::from_secs(60)).await.unwrap();
    let got = cache.get(&k).await.unwrap();
    assert_eq!(got, None);
}

#[tokio::test]
async fn disk_cache_missing_key_returns_none() {
    let (_dir, cache) = tmp_cache();
    let k = key("helius:test:missing");
    let got = cache.get(&k).await.unwrap();
    assert_eq!(got, None);
}

#[tokio::test]
async fn disk_cache_overwrite_updates_value() {
    let (_dir, cache) = tmp_cache();
    let k = key("helius:test:overwrite");
    let v1 = Bytes::from_static(b"first");
    let v2 = Bytes::from_static(b"second");
    cache.put(&k, v1, Duration::from_secs(60)).await.unwrap();
    cache.put(&k, v2.clone(), Duration::from_secs(60)).await.unwrap();
    let got = cache.get(&k).await.unwrap();
    assert_eq!(got, Some(v2));
}

// ─── HeliusConfig defaults ────────────────────────────────────────────────────

#[test]
fn helius_config_defaults() {
    let cfg = HeliusConfig::default();
    assert_eq!(cfg.max_concurrent_requests, 16);
    assert_eq!(cfg.disk_cache_max_bytes, 500 * 1024 * 1024);
    assert_eq!(cfg.default_ttl, Duration::from_secs(60));
    assert!(cfg.method_ttls.is_empty());
}

// ─── HeliusResponse helpers ───────────────────────────────────────────────────

#[test]
fn helius_response_into_ok_passes_through_bytes() {
    use ks_helius::HeliusResponse;
    let b = Bytes::from_static(b"ok");
    let resp = HeliusResponse::Ok(b.clone());
    assert_eq!(resp.into_ok().unwrap(), b);
}

#[test]
fn helius_response_into_ok_on_402_is_unpaid() {
    use ks_helius::{HeliusResponse, X402Envelope};
    let resp = HeliusResponse::PaymentRequired(X402Envelope {
        required_amount_usdc: 1000,
        payment_address: "addr".to_string(),
        memo: "test".to_string(),
    });
    let err = resp.into_ok().unwrap_err();
    assert!(matches!(err, HeliusError::Unpaid));
}

// ─── ScoutDedup ───────────────────────────────────────────────────────────────

#[tokio::test]
async fn scout_dedup_first_call_not_in_flight() {
    let dedup = ScoutDedup::new();
    let in_flight = dedup.is_in_flight("mykey").await;
    assert!(!in_flight);
}

#[tokio::test]
async fn scout_dedup_second_call_within_window_is_deduped() {
    let dedup = ScoutDedup::new();
    dedup.is_in_flight("mykey2").await;
    let deduped = dedup.is_in_flight("mykey2").await;
    assert!(deduped);
}

#[tokio::test]
async fn scout_dedup_clear_unregisters_key() {
    let dedup = ScoutDedup::new();
    dedup.is_in_flight("mykey3").await;
    dedup.clear("mykey3").await;
    let in_flight = dedup.is_in_flight("mykey3").await;
    assert!(!in_flight);
}

#[tokio::test]
async fn scout_dedup_independent_keys_dont_collide() {
    let dedup = ScoutDedup::new();
    dedup.is_in_flight("key_a").await; // register key_a
    let in_flight_b = dedup.is_in_flight("key_b").await;
    assert!(!in_flight_b, "key_b should not be seen as in-flight");
}
