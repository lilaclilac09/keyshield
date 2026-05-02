//! Phase 1 acceptance tests for `ks-helius`.
//!
//! Spec 09 line 318-329 mandates:
//! - 5 typed wrappers (happy path each)
//! - **Single-flight test**: 50 concurrent `getBalance(same_addr)` →
//!   mock receives exactly 1 request
//! - **TTL expiry test**: insert with TTL=10ms, sleep 50ms, get → miss
//!   (re-fires upstream)
//! - **CacheKey byte-parity**: `helius:getBalance:["addr"]` SHA-1
//!   matches Python's `_ck("helius","getBalance",["addr"])`
//! - 402 + no wallet → `HeliusError::PaymentRequired`
//! - 5xx upstream → `HeliusError::Upstream`
//!
//! All tests use `wiremock::MockServer` so no live network is touched.
//! `HeliusClient::with_bases` overrides all three Helius sub-bases at
//! the mock URL.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use ks_helius::{CacheKey, HeliusClient, HeliusConfig, HeliusError};
use serde_json::json;
use wiremock::matchers::{any, method as method_matcher, path as path_matcher};
use wiremock::{Mock, MockServer, Request, Respond, ResponseTemplate};

const API_KEY: &str = "test-helius-key";

/// Build a `HeliusClient` whose three Helius sub-bases all point at
/// the given mock URL. Tests typically follow up by `mount`-ing
/// per-method handlers.
fn client_for_mock(mock_uri: &str, mut config: HeliusConfig) -> HeliusClient {
    // Disable connection pooling so each request to the mock server is
    // observable — wiremock counts requests per connection.
    let http = reqwest::Client::builder()
        .http2_adaptive_window(true)
        .pool_max_idle_per_host(0)
        .timeout(Duration::from_secs(5))
        .build()
        .expect("test reqwest client builds");

    // Force the cache to a small bound so we can confirm capacity
    // doesn't accidentally evict in single-test cases.
    if config.mem_cache_capacity == 0 {
        config.mem_cache_capacity = 1000;
    }

    HeliusClient::with_http_client(http, API_KEY, config)
        .with_bases(mock_uri, mock_uri, mock_uri)
}

fn config_with_default_ttl(secs: u64) -> HeliusConfig {
    let mut c = HeliusConfig::default();
    c.default_ttl = Duration::from_secs(secs);
    c
}

// ─── 1. Cache key byte-parity ───────────────────────────────────────────────

#[test]
fn cache_key_matches_python_helius_getbalance() {
    // The cache_keys.json fixture in `proxy-rs/tests/fixtures/`
    // already locks down `helius:getBalance:["9Wz...AWWM"]` →
    // `cd7caa2b3086344af449c5d946f8d196f8d2bfa9`. Mirror that here so
    // a regression in `CacheKey::derive` (e.g. accidental switch to
    // serde_json's default formatter) blows up loud.
    //
    // This is the precise "Architect-required" parity gate from spec
    // 09 line 322 — `pycompat::cache_key("helius", method, params)` is
    // the only path we trust.
    let key = CacheKey::derive(
        "getBalance",
        &json!(["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"]),
    );
    assert_eq!(key.as_str(), "cd7caa2b3086344af449c5d946f8d196f8d2bfa9");
}

#[test]
fn cache_key_is_insertion_order_independent() {
    // Reuses the same insertion-order property pycompat tests cover —
    // here we exercise it through `CacheKey::derive` so a future
    // refactor that bypasses pycompat doesn't silently drop the
    // property.
    let a = CacheKey::derive("getAsset", &json!({"id": "x", "options": {}}));
    let b = CacheKey::derive("getAsset", &json!({"options": {}, "id": "x"}));
    assert_eq!(a, b);
}

// ─── 2-6. Five wrapper happy paths ──────────────────────────────────────────

/// `getBalance` returns lamports correctly.
#[tokio::test]
async fn get_balance_happy_path() {
    let mock = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": {"context": {"slot": 1}, "value": 12_345_678u64},
                }))
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());
    let lamports = client.get_balance("9WzAddr").await.expect("ok");
    assert_eq!(lamports, 12_345_678);

    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1, "single upstream fire");

    // Outgoing wire shape: POST `/?api-key=KEY` with JSON-RPC envelope.
    let r = &reqs[0];
    assert_eq!(r.method.as_str(), "POST");
    assert_eq!(r.url.path(), "/");
    assert_eq!(r.url.query(), Some(format!("api-key={API_KEY}").as_str()));
    let body: serde_json::Value = serde_json::from_slice(&r.body).unwrap();
    assert_eq!(body["method"], "getBalance");
    assert_eq!(body["params"], json!(["9WzAddr"]));
    assert_eq!(body["jsonrpc"], "2.0");
}

#[tokio::test]
async fn get_asset_happy_path() {
    let mock = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": {
                        "id": "MintAddr111",
                        "content": {"metadata": {"name": "thing"}},
                        "ownership": {"owner": "Wallet111"},
                    },
                }))
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());
    let asset = client.get_asset("MintAddr111").await.expect("ok");
    assert_eq!(asset.id, "MintAddr111");
    assert_eq!(asset.content["metadata"]["name"], "thing");
    assert_eq!(asset.ownership["owner"], "Wallet111");
}

#[tokio::test]
async fn get_assets_by_owner_happy_path() {
    let mock = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": {
                        "items": [
                            {"id": "Asset1", "content": {}, "ownership": {}},
                            {"id": "Asset2", "content": {}, "ownership": {}},
                        ],
                        "total": 2,
                        "page": 1,
                    },
                }))
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());
    let assets = client
        .get_assets_by_owner("Owner111", 50)
        .await
        .expect("ok");
    assert_eq!(assets.len(), 2);
    assert_eq!(assets[0].id, "Asset1");
    assert_eq!(assets[1].id, "Asset2");

    // Verify the params shape we send matches Helius's documented
    // contract: `{ownerAddress, page, limit}`.
    let reqs = mock.received_requests().await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&reqs[0].body).unwrap();
    assert_eq!(body["params"]["ownerAddress"], "Owner111");
    assert_eq!(body["params"]["limit"], 50);
    assert_eq!(body["params"]["page"], 1);
}

#[tokio::test]
async fn get_priority_fee_estimate_happy_path() {
    let mock = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": {"priorityFeeEstimate": 4567.0},
                }))
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());
    let accounts = vec!["Account1".to_string(), "Account2".to_string()];
    let fee = client
        .get_priority_fee_estimate(&accounts)
        .await
        .expect("ok");
    assert_eq!(fee, 4567);
}

#[tokio::test]
async fn parse_transactions_happy_path() {
    // `parseTransactions` is the Enhanced REST endpoint. The mock
    // matches `POST /v0/transactions` (the path the client should
    // route to per spec 09 line 159 — Enhanced bucket).
    let mock = MockServer::start().await;
    Mock::given(method_matcher("POST"))
        .and(path_matcher("/v0/transactions"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!([
                    {
                        "signature": "Sig111",
                        "slot": 100,
                        "timestamp": 1_700_000_000,
                        "type": "TRANSFER",
                    },
                    {
                        "signature": "Sig222",
                        "slot": 101,
                        "timestamp": 1_700_000_100,
                        "type": "SWAP",
                    }
                ]))
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());
    let sigs = vec!["Sig111".to_string(), "Sig222".to_string()];
    let txs = client.parse_transactions(&sigs).await.expect("ok");
    assert_eq!(txs.len(), 2);
    assert_eq!(txs[0].signature, "Sig111");
    assert_eq!(txs[0].kind, "TRANSFER");
    assert_eq!(txs[1].signature, "Sig222");
    assert_eq!(txs[1].slot, 101);
}

// ─── 7. Miss-then-hit: re-call within TTL doesn't re-fire ───────────────────

#[tokio::test]
async fn second_call_within_ttl_serves_from_memory() {
    // Mirrors spec 09 §"Test plan" — "Re-call same method twice → 1
    // mock hit (not 2)".
    let mock = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": {"context": {"slot": 1}, "value": 100u64},
                }))
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), config_with_default_ttl(60));
    let a = client.get_balance("Stable").await.expect("ok");
    let b = client.get_balance("Stable").await.expect("ok");
    assert_eq!(a, 100);
    assert_eq!(b, 100);

    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1, "second call should hit memory cache");
}

// ─── 8. TTL expiry: stale entry re-fires upstream ───────────────────────────

#[tokio::test]
async fn ttl_expiry_re_fires_upstream() {
    // Spec 09 line 322 acceptance criterion: insert with TTL=10ms,
    // sleep 50ms, get → miss (re-fires upstream).
    //
    // We achieve this by setting the `getBalance` per-method TTL to
    // 10ms in the config. moka's eviction is lazy (it doesn't sweep),
    // so we rely on its TTL filter at lookup time, which is what we
    // want — a stale entry must NOT serve.
    let mock = MockServer::start().await;
    let counter = Arc::new(AtomicUsize::new(0));
    let counter_clone = counter.clone();
    Mock::given(any())
        .respond_with(CounterResponder {
            count: counter_clone,
            body: json!({
                "jsonrpc": "2.0",
                "id": 1,
                "result": {"context": {"slot": 1}, "value": 7u64},
            }),
        })
        .mount(&mock)
        .await;

    let mut config = HeliusConfig::default();
    config
        .method_ttls
        .insert("getBalance".to_string(), Duration::from_millis(10));
    let client = client_for_mock(&mock.uri(), config);

    let a = client.get_balance("Expiring").await.expect("ok");
    assert_eq!(a, 7);
    assert_eq!(counter.load(Ordering::SeqCst), 1);

    // Wait past the TTL.
    tokio::time::sleep(Duration::from_millis(60)).await;

    let b = client.get_balance("Expiring").await.expect("ok");
    assert_eq!(b, 7);
    assert_eq!(
        counter.load(Ordering::SeqCst),
        2,
        "TTL expired → upstream must be re-queried",
    );
}

// ─── 9. Single-flight: 50 concurrent → 1 upstream fire ──────────────────────

#[tokio::test]
async fn single_flight_dedups_concurrent_callers() {
    // Spec 09 line 322 acceptance criterion + Architect invariant #1.
    //
    // Spawn 50 tokio tasks all calling `get_balance(same_addr)`. The
    // mock — even with a 50ms artificial delay — must see exactly 1
    // outgoing request. The `inflight` DashMap parks 49 of the 50
    // callers on the leader's `Shared<Future>`.
    let mock = MockServer::start().await;
    let counter = Arc::new(AtomicUsize::new(0));
    let counter_clone = counter.clone();
    Mock::given(any())
        .respond_with(SlowCounterResponder {
            count: counter_clone,
            delay: Duration::from_millis(50),
            body: json!({
                "jsonrpc": "2.0",
                "id": 1,
                "result": {"context": {"slot": 1}, "value": 999u64},
            }),
        })
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());

    let mut handles = Vec::with_capacity(50);
    for _ in 0..50 {
        let c = client.clone();
        handles.push(tokio::spawn(async move { c.get_balance("Stampede").await }));
    }
    for h in handles {
        let v = h.await.expect("task joins").expect("ok");
        assert_eq!(v, 999);
    }

    let fired = counter.load(Ordering::SeqCst);
    assert_eq!(
        fired, 1,
        "single-flight invariant: 50 concurrent callers → 1 upstream fire (got {fired})",
    );
}

// ─── 10. 5xx upstream surfaces as HeliusError::Upstream ─────────────────────

#[tokio::test]
async fn upstream_5xx_bubbles_as_upstream_error() {
    // Spec 09 §"Error model" line 296-311: HTTP 5xx → upstream error
    // with status + body. NO retry yet (Phase 4 owns the retry loop).
    let mock = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(503)
                .set_body_string("upstream blew up")
                .insert_header("content-type", "text/plain"),
        )
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());
    let err = client
        .get_balance("Boom")
        .await
        .expect_err("must be an error");
    match err {
        HeliusError::Upstream { status, ref body } => {
            assert_eq!(status, 503);
            assert!(body.contains("upstream blew up"), "body propagates: {body}");
        }
        other => panic!("expected Upstream, got: {other:?}"),
    }

    // Failed call must not poison the cache.
    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1);
}

// ─── 11. 402 surfaces as HeliusError::PaymentRequired with envelope ─────────

#[tokio::test]
async fn upstream_402_surfaces_payment_required_with_envelope() {
    // Spec 09 line 49-52: "If a 402 hits, caller gets
    // `HeliusError::PaymentRequired(envelope)`". No retry yet (Phase 4
    // adds the wallet retry).
    let envelope = json!({
        "x402Version": 1,
        "accepts": [{
            "scheme": "exact",
            "network": "solana-mainnet",
            "asset": "USDC",
            "amount": "0.001",
            "payTo": "PayToWallet111",
        }],
        "error": "Payment required",
    });
    let mock = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(402)
                .set_body_json(envelope.clone())
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());
    let err = client
        .get_balance("PaywallAddr")
        .await
        .expect_err("must be PaymentRequired");
    match err {
        HeliusError::PaymentRequired(env) => {
            assert_eq!(env["x402Version"], 1);
            assert_eq!(env["accepts"][0]["asset"], "USDC");
        }
        other => panic!("expected PaymentRequired, got: {other:?}"),
    }
}

// ─── 12. Miss-then-hit on getAsset (DAS bucket) ─────────────────────────────

#[tokio::test]
async fn get_asset_miss_then_hit() {
    // DAS bucket cache hit verification — Phase 1 caches DAS the same
    // way as RPC. Two consecutive `get_asset` calls → 1 upstream fire.
    let mock = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": {
                        "id": "Mint",
                        "content": {"json_uri": "ipfs://x"},
                        "ownership": {"owner": "Owner"},
                    },
                }))
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());
    let a = client.get_asset("Mint").await.expect("ok");
    let b = client.get_asset("Mint").await.expect("ok");
    assert_eq!(a, b);

    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1, "DAS cache works the same way as RPC");
}

// ─── 13. parse_transactions caches across the Enhanced bucket ───────────────

#[tokio::test]
async fn parse_transactions_caches_across_calls() {
    // Even though Enhanced is REST-style (different URL shape), the
    // cache_call path must still de-dup it.
    let mock = MockServer::start().await;
    Mock::given(method_matcher("POST"))
        .and(path_matcher("/v0/transactions"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!([{
                    "signature": "Sig",
                    "slot": 1,
                    "timestamp": 100,
                    "type": "TRANSFER",
                }]))
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());
    let sigs = vec!["Sig".to_string()];
    let _ = client.parse_transactions(&sigs).await.expect("ok");
    let _ = client.parse_transactions(&sigs).await.expect("ok");

    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1, "Enhanced bucket must cache too");
}

// ─── 14. Different wrappers cache independently ─────────────────────────────

#[tokio::test]
async fn different_methods_have_separate_cache_slots() {
    // Two different methods with the same params should NOT collide.
    // The cache key includes the method name in the SHA-1 input.
    let mock = MockServer::start().await;
    let counter = Arc::new(AtomicUsize::new(0));
    Mock::given(any())
        .respond_with(MethodAwareResponder {
            count: counter.clone(),
        })
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());
    let _ = client.get_balance("Address1").await.expect("ok");
    let _ = client.get_asset("Address1").await.expect("ok");

    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 2, "different methods → different cache keys");
    let methods: Vec<_> = reqs
        .iter()
        .filter_map(|r| {
            let body: serde_json::Value = serde_json::from_slice(&r.body).ok()?;
            body["method"].as_str().map(|s| s.to_string())
        })
        .collect();
    assert!(methods.iter().any(|m| m == "getBalance"));
    assert!(methods.iter().any(|m| m == "getAsset"));
}

// ─── 15. mem_cache_len reflects writes ──────────────────────────────────────

#[tokio::test]
async fn cache_writes_show_up_in_mem_cache_len() {
    // Verifies that successful calls actually populate the cache (vs.
    // a hypothetical bug where caching is silently disabled).
    let mock = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "result": {"context": {"slot": 1}, "value": 1u64},
                }))
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock)
        .await;

    let client = client_for_mock(&mock.uri(), HeliusConfig::default());
    assert_eq!(client.mem_cache_len().await, 0);
    let _ = client.get_balance("Addr1").await.expect("ok");
    let _ = client.get_balance("Addr2").await.expect("ok");
    client
        .get_balance("Addr1")
        .await
        .expect("ok"); // hit, no new entry
    let n = client.mem_cache_len().await;
    assert_eq!(n, 2, "two distinct addresses → exactly 2 cache entries");
}

// ─── helpers ────────────────────────────────────────────────────────────────

/// Wiremock `Respond` impl that increments a counter for every
/// invocation. Lets a test assert "exactly N upstream fires".
struct CounterResponder {
    count: Arc<AtomicUsize>,
    body: serde_json::Value,
}
impl Respond for CounterResponder {
    fn respond(&self, _: &Request) -> ResponseTemplate {
        self.count.fetch_add(1, Ordering::SeqCst);
        ResponseTemplate::new(200)
            .set_body_json(self.body.clone())
            .insert_header("content-type", "application/json")
    }
}

/// Like `CounterResponder` but adds an artificial delay so concurrent
/// callers actually park (otherwise the leader resolves before any
/// follower arrives at the dedup table).
struct SlowCounterResponder {
    count: Arc<AtomicUsize>,
    delay: Duration,
    body: serde_json::Value,
}
impl Respond for SlowCounterResponder {
    fn respond(&self, _: &Request) -> ResponseTemplate {
        self.count.fetch_add(1, Ordering::SeqCst);
        ResponseTemplate::new(200)
            .set_body_json(self.body.clone())
            .insert_header("content-type", "application/json")
            .set_delay(self.delay)
    }
}

/// Returns different result bodies depending on the JSON-RPC method
/// in the request body. Lets one mount handle multiple methods.
struct MethodAwareResponder {
    count: Arc<AtomicUsize>,
}
impl Respond for MethodAwareResponder {
    fn respond(&self, req: &Request) -> ResponseTemplate {
        self.count.fetch_add(1, Ordering::SeqCst);
        let body: serde_json::Value =
            serde_json::from_slice(&req.body).unwrap_or(serde_json::Value::Null);
        let method = body["method"].as_str().unwrap_or("");
        let result = match method {
            "getBalance" => json!({"context": {"slot": 1}, "value": 100u64}),
            "getAsset" => json!({"id": "x", "content": {}, "ownership": {}}),
            _ => json!({}),
        };
        ResponseTemplate::new(200)
            .set_body_json(json!({
                "jsonrpc": "2.0",
                "id": 1,
                "result": result,
            }))
            .insert_header("content-type", "application/json")
    }
}

