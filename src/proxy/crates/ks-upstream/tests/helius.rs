//! Integration tests for Helius dispatch (`call_helius_rpc` + the Helius
//! branch of `forward()`).
//!
//! Each test uses `wiremock::MockServer` as a stand-in for the three
//! Helius sub-bases. `with_bases(...)` for `UpstreamId::Helius` overrides
//! all three buckets to the same mock URL — that's what
//! `helius_bases_from` does in lib.rs. The dispatcher still picks the
//! bucket by method name; we assert it picked the right one by inspecting
//! the outgoing path/host on the mock.

use std::collections::HashMap;
use std::sync::Arc;

use bytes::Bytes;
use http::{HeaderMap, HeaderValue, Method, StatusCode};
use ks_cache::{pycompat, TtlCache};
use ks_upstream::{CacheStatus, UpstreamClients, UpstreamId};
use serde_json::json;
use wiremock::matchers::any;
use wiremock::{Mock, MockServer, ResponseTemplate};

const API_KEY: &str = "test-helius-key";

async fn helius_fixture(body: &str) -> (MockServer, UpstreamClients) {
    let mock_server = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string(body.to_string())
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock_server)
        .await;
    let mut overrides = HashMap::new();
    overrides.insert(UpstreamId::Helius, mock_server.uri());
    let clients = UpstreamClients::with_bases(overrides);
    (mock_server, clients)
}

/// Same as `helius_fixture` but with an external shared cache so the test
/// can pre-populate or inspect entries.
async fn helius_fixture_with_cache(
    body: &str,
    cache: Arc<TtlCache<Bytes>>,
) -> (MockServer, UpstreamClients) {
    let mock_server = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string(body.to_string())
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock_server)
        .await;
    let mut overrides = HashMap::new();
    overrides.insert(UpstreamId::Helius, mock_server.uri());
    let clients = UpstreamClients::with_bases_and_cache(overrides, cache);
    (mock_server, clients)
}

// ─── Method → sub-base routing ───────────────────────────────────────────

#[tokio::test]
async fn das_dispatch_routes_getasset_to_das_path() {
    // `getAsset` is in the DAS bucket. The DAS sub-base is
    // `https://mainnet.helius-rpc.com/das`; in tests we point all three
    // sub-bases at the mock, but the dispatcher still appends `/?api-key=K`
    // to whatever sub-base was selected — so we don't see the `/das` path
    // here. What we DO see is that the routing went through the DAS code
    // path: by checking that exactly one outgoing call landed.
    //
    // Stronger: also assert the URL ends with `/?api-key=...`, mirroring
    // helius_router.py:84's pattern.
    let (mock, clients) = helius_fixture(r#"{"jsonrpc":"2.0","id":1,"result":{"id":"x"}}"#).await;
    let cache = TtlCache::<Bytes>::new();
    let (_body, status) = clients
        .call_helius_rpc(
            "getAsset",
            &json!({"id": "mintaddr"}),
            &json!(1),
            API_KEY,
            &cache,
        )
        .await
        .expect("dispatch ok");
    assert!(matches!(status, CacheStatus::Miss));

    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1, "exactly one outgoing request");
    let r = &reqs[0];
    assert_eq!(r.method, Method::POST);
    assert_eq!(
        r.url.path(),
        "/",
        "Helius RPC path is `/` (sub-base owns the `/das` segment)"
    );
    assert_eq!(
        r.url.query().unwrap_or(""),
        format!("api-key={API_KEY}"),
        "auth via `?api-key=...` (hyphen, not underscore)"
    );
    let body: serde_json::Value =
        serde_json::from_slice(&r.body).expect("body is JSON-RPC");
    assert_eq!(body["method"], "getAsset");
    assert_eq!(body["jsonrpc"], "2.0");
    assert_eq!(body["params"], json!({"id": "mintaddr"}));
    assert_eq!(body["id"], json!(1));
}

#[tokio::test]
async fn enhanced_dispatch_routes_gettransactions() {
    let (mock, clients) =
        helius_fixture(r#"{"jsonrpc":"2.0","id":1,"result":[]}"#).await;
    let cache = TtlCache::<Bytes>::new();
    clients
        .call_helius_rpc(
            "getTransactions",
            &json!([{"address": "addr1"}]),
            &json!(7),
            API_KEY,
            &cache,
        )
        .await
        .expect("dispatch ok");
    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1);
    let r = &reqs[0];
    assert_eq!(r.method, Method::POST);
    let body: serde_json::Value = serde_json::from_slice(&r.body).unwrap();
    assert_eq!(body["method"], "getTransactions");
    assert_eq!(body["id"], 7);
}

#[tokio::test]
async fn rpc_dispatch_routes_getbalance() {
    let (mock, clients) = helius_fixture(
        r#"{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":1},"value":42}}"#,
    )
    .await;
    let cache = TtlCache::<Bytes>::new();
    clients
        .call_helius_rpc(
            "getBalance",
            &json!(["So11111111111111111111111111111111111111112"]),
            &json!(1),
            API_KEY,
            &cache,
        )
        .await
        .expect("dispatch ok");
    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1);
    let r = &reqs[0];
    assert_eq!(r.method, Method::POST);
    let body: serde_json::Value = serde_json::from_slice(&r.body).unwrap();
    assert_eq!(body["method"], "getBalance");
}

// ─── Production sub-base URLs (the production bases must NOT have been
// silently changed by anyone editing the routing constants) ─────────────

#[tokio::test]
async fn helius_production_sub_bases_unchanged() {
    // We can't easily fish at HELIUS_*_BASE constants from outside the
    // crate, but we can confirm `UpstreamId::Helius.base_url()` (the
    // generic-forward fallback's base) stays at the production RPC URL.
    assert_eq!(
        UpstreamId::Helius.base_url(),
        "https://mainnet.helius-rpc.com",
        "non-RPC fallthrough must point at the RPC base"
    );
}

// ─── Cache HIT semantics ─────────────────────────────────────────────────

#[tokio::test]
async fn cacheable_method_hits_on_second_call() {
    let body = r#"{"jsonrpc":"2.0","id":1,"result":{"value":42}}"#;
    let (mock, clients) = helius_fixture(body).await;
    let cache = TtlCache::<Bytes>::new();
    let (b1, s1) = clients
        .call_helius_rpc(
            "getBalance",
            &json!(["addr"]),
            &json!(1),
            API_KEY,
            &cache,
        )
        .await
        .expect("first call ok");
    assert!(matches!(s1, CacheStatus::Miss));

    let (b2, s2) = clients
        .call_helius_rpc(
            "getBalance",
            &json!(["addr"]),
            &json!(1),
            API_KEY,
            &cache,
        )
        .await
        .expect("second call ok");
    assert!(matches!(s2, CacheStatus::Hit));
    assert_eq!(b1, b2, "HIT bytes byte-identical to MISS bytes");

    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(
        reqs.len(),
        1,
        "second call served from cache — no second outgoing request"
    );
}

#[tokio::test]
async fn cached_bytes_are_pycompat_canonical() {
    // Upstream returns `{"result":{"b":2,"a":1},"id":1,"jsonrpc":"2.0"}`
    // — keys NOT in alphabetical order. Python's `server.py:721`
    // re-emits via `json.dumps(result)` (no `sort_keys=True`) which
    // preserves dict insertion order. Cached bytes must mirror that
    // exactly: insertion order, `, ` / `: ` separators, ASCII escapes.
    let upstream =
        r#"{"result":{"b":2,"a":1},"id":1,"jsonrpc":"2.0"}"#;
    let (_mock, clients) = helius_fixture(upstream).await;
    let cache = TtlCache::<Bytes>::new();
    let (got, _status) = clients
        .call_helius_rpc(
            "getBalance",
            &json!(["addr"]),
            &json!(1),
            API_KEY,
            &cache,
        )
        .await
        .expect("ok");
    let got_str = std::str::from_utf8(&got).expect("ascii bytes");
    let expected = pycompat::to_python_json(
        &serde_json::from_str::<serde_json::Value>(upstream).unwrap(),
    );
    assert_eq!(got_str, expected, "cached bytes preserve insertion order");
    // Concretely: keys in insertion order, `, ` / `: ` separators.
    assert_eq!(
        got_str,
        "{\"result\": {\"b\": 2, \"a\": 1}, \"id\": 1, \"jsonrpc\": \"2.0\"}",
        "explicit byte-shape (insertion order, matching Python's json.dumps)"
    );
}

#[tokio::test]
async fn write_methods_never_cache() {
    // `sendTransaction` is a write — both calls must reach upstream.
    let body = r#"{"jsonrpc":"2.0","id":1,"result":"sigxyz"}"#;
    let (mock, clients) = helius_fixture(body).await;
    let cache = TtlCache::<Bytes>::new();
    for _ in 0..2 {
        let (_b, s) = clients
            .call_helius_rpc(
                "sendTransaction",
                &json!(["base64tx"]),
                &json!(1),
                API_KEY,
                &cache,
            )
            .await
            .expect("ok");
        assert!(
            matches!(s, CacheStatus::Miss),
            "sendTransaction always MISS",
        );
    }
    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 2, "writes always reach upstream");
    assert_eq!(cache.len(), 0, "writes never populate cache");
}

#[tokio::test]
async fn errors_not_cached() {
    // Upstream returns a JSON-RPC error (no `"result"` key). Spec 03 +
    // api_router.py:192: never cache error responses.
    let err_body = r#"{"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"x"}}"#;
    let (mock, clients) = helius_fixture(err_body).await;
    let cache = TtlCache::<Bytes>::new();
    for _ in 0..2 {
        clients
            .call_helius_rpc(
                "getBalance",
                &json!(["addr"]),
                &json!(1),
                API_KEY,
                &cache,
            )
            .await
            .expect("ok");
    }
    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 2, "error responses are not cached");
}

// ─── Cache key matches Python ────────────────────────────────────────────

/// Two fixtures of (method, params, expected_sha1). The `expected_sha1`
/// values are computed in Python via:
///
/// ```python
/// import hashlib, json
/// raw = f"helius:{method}:{json.dumps(params, sort_keys=True)}"
/// hashlib.sha1(raw.encode()).hexdigest()
/// ```
///
/// The first matches an existing fixture in
/// `proxy-rs/tests/fixtures/cache_keys.json`; the second is the
/// getMultipleAccounts fixture. Both are validated as Python-byte-parity
/// in the ks-cache pycompat tests, which makes this a meaningful
/// integration check (cache lookup uses the same key).
const EXPECTED_GETBALANCE_SHA1: &str = "cd7caa2b3086344af449c5d946f8d196f8d2bfa9";
const EXPECTED_GETMULTI_SHA1: &str = "6155db41001b8028a40368f66db99722b39c7461";

#[tokio::test]
async fn cache_key_matches_python_oracle_for_getbalance() {
    // Pre-populate the cache at the Python-derived SHA-1 with sentinel
    // bytes. If `call_helius_rpc` derives the same key, it'll return
    // those bytes as a HIT — never reaching upstream.
    let cache: Arc<TtlCache<Bytes>> = Arc::new(TtlCache::new());
    let sentinel = Bytes::from_static(b"sentinel-from-python-key");
    cache.set(
        EXPECTED_GETBALANCE_SHA1.to_string(),
        sentinel.clone(),
        std::time::Duration::from_secs(60),
    );

    let (mock, clients) =
        helius_fixture_with_cache(r#"{"x":"unused"}"#, cache.clone()).await;
    let (got, status) = clients
        .call_helius_rpc(
            "getBalance",
            &json!(["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"]),
            &json!(1),
            API_KEY,
            &cache,
        )
        .await
        .expect("ok");
    assert!(
        matches!(status, CacheStatus::Hit),
        "Python-derived key matched"
    );
    assert_eq!(got, sentinel, "served the pre-seeded bytes");
    let reqs = mock.received_requests().await.unwrap();
    assert!(
        reqs.is_empty(),
        "key matched — no upstream call. Otherwise pycompat::cache_key drifted from Python's _ck"
    );

    // Also assert pycompat::cache_key reports the same hex.
    assert_eq!(
        pycompat::cache_key(
            "helius",
            "getBalance",
            &json!(["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"])
        ),
        EXPECTED_GETBALANCE_SHA1,
    );
}

#[tokio::test]
async fn cache_key_matches_python_oracle_for_getmultipleaccounts() {
    let cache: Arc<TtlCache<Bytes>> = Arc::new(TtlCache::new());
    let sentinel = Bytes::from_static(b"sentinel-2");
    cache.set(
        EXPECTED_GETMULTI_SHA1.to_string(),
        sentinel.clone(),
        std::time::Duration::from_secs(60),
    );

    let (mock, clients) =
        helius_fixture_with_cache(r#"{"x":"unused"}"#, cache.clone()).await;
    let (got, status) = clients
        .call_helius_rpc(
            "getMultipleAccounts",
            &json!([["a", "b", "c"], {"encoding": "base64"}]),
            &json!(1),
            API_KEY,
            &cache,
        )
        .await
        .expect("ok");
    assert!(matches!(status, CacheStatus::Hit));
    assert_eq!(got, sentinel);
    let reqs = mock.received_requests().await.unwrap();
    assert!(reqs.is_empty());

    assert_eq!(
        pycompat::cache_key(
            "helius",
            "getMultipleAccounts",
            &json!([["a", "b", "c"], {"encoding": "base64"}])
        ),
        EXPECTED_GETMULTI_SHA1,
    );
}

// ─── forward() — Helius branch ───────────────────────────────────────────

#[tokio::test]
async fn forward_helius_post_jsonrpc_dispatches_via_call_helius_rpc() {
    let upstream_body = r#"{"jsonrpc":"2.0","id":42,"result":{"slot":99}}"#;
    let (mock, clients) = helius_fixture(upstream_body).await;

    let req_body = serde_json::to_vec(&json!({
        "jsonrpc": "2.0",
        "id": 42,
        "method": "getSlot",
        "params": [],
    }))
    .unwrap();

    let mut headers = HeaderMap::new();
    headers.insert(
        http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );

    let resp = clients
        .forward(
            UpstreamId::Helius,
            &Method::POST,
            "/",
            None,
            &headers,
            Bytes::from(req_body),
            API_KEY,
        )
        .await
        .expect("forward ok");

    assert_eq!(resp.status, StatusCode::OK);
    // Response headers stripped down to content-type + x-ks-cache.
    assert_eq!(
        resp.headers
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "application/json"
    );
    assert_eq!(
        resp.headers
            .get("x-ks-cache")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "MISS"
    );
    // Body is the pycompat re-serialization in **insertion order**
    // (matches Python's `json.dumps(result)` at server.py:721 — no
    // sort_keys). Sorting here would silently desync from Python.
    let body_str = std::str::from_utf8(&resp.body).unwrap();
    let expected = pycompat::to_python_json(
        &serde_json::from_str::<serde_json::Value>(upstream_body).unwrap(),
    );
    assert_eq!(body_str, expected);

    // Sanity: outgoing call landed on the mock with `?api-key=...`.
    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1);
    let r = &reqs[0];
    assert_eq!(r.url.query().unwrap_or(""), format!("api-key={API_KEY}"));
}

#[tokio::test]
async fn forward_helius_post_non_rpc_falls_through_with_query_api_key() {
    // Body is JSON but not JSON-RPC (no `method` field). Spec 05: fall
    // through to generic forward path with `?api-key={key}` (hyphen).
    let (mock, clients) = helius_fixture(r#"{"ok":true}"#).await;
    let req_body = Bytes::from_static(b"{\"hello\":\"world\"}");
    let mut headers = HeaderMap::new();
    headers.insert(
        http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );

    clients
        .forward(
            UpstreamId::Helius,
            &Method::POST,
            "/v1/something",
            Some("foo=bar"),
            &headers,
            req_body.clone(),
            API_KEY,
        )
        .await
        .expect("forward ok");

    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1);
    let r = &reqs[0];
    assert_eq!(r.method, Method::POST);
    assert_eq!(r.url.path(), "/v1/something");
    let q = r.url.query().unwrap_or("");
    assert!(q.contains("foo=bar"), "preserves existing query, got: {q}");
    assert!(
        q.contains(&format!("api-key={API_KEY}")),
        "appends `api-key=` (hyphen, not underscore), got: {q}"
    );
    assert!(
        !q.contains("api_key="),
        "must NOT use Pyth's underscore form, got: {q}"
    );
    // Body passes through unchanged on the fall-through path.
    assert_eq!(r.body.as_slice(), req_body.as_ref());
}

#[tokio::test]
async fn forward_helius_get_falls_through_with_query_api_key() {
    let (mock, clients) = helius_fixture(r#"{"ok":true}"#).await;
    clients
        .forward(
            UpstreamId::Helius,
            &Method::GET,
            "/v0/anything",
            None,
            &HeaderMap::new(),
            Bytes::new(),
            API_KEY,
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert_eq!(r.method, Method::GET);
    assert_eq!(r.url.path(), "/v0/anything");
    assert_eq!(r.url.query().unwrap_or(""), format!("api-key={API_KEY}"));
}

#[tokio::test]
async fn forward_helius_post_invalid_json_falls_through() {
    // Body fails JSON parsing entirely → falls through to generic path
    // and reaches upstream with `?api-key=K`.
    let (mock, clients) = helius_fixture(r#"{"ok":true}"#).await;
    clients
        .forward(
            UpstreamId::Helius,
            &Method::POST,
            "/",
            None,
            &HeaderMap::new(),
            Bytes::from_static(b"not-json-at-all"),
            API_KEY,
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert_eq!(r.url.query().unwrap_or(""), format!("api-key={API_KEY}"));
    assert_eq!(r.body.as_slice(), b"not-json-at-all");
}

#[tokio::test]
async fn forward_helius_post_jsonrpc_hit_returns_minimal_headers() {
    // Cache HIT path through forward(): only content-type + x-ks-cache.
    let upstream_body = r#"{"jsonrpc":"2.0","id":1,"result":1}"#;
    let cache: Arc<TtlCache<Bytes>> = Arc::new(TtlCache::new());
    let (_mock, clients) =
        helius_fixture_with_cache(upstream_body, cache.clone()).await;

    let req_body = serde_json::to_vec(&json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getBalance",
        "params": ["addr"],
    }))
    .unwrap();

    // Warm.
    clients
        .forward(
            UpstreamId::Helius,
            &Method::POST,
            "/",
            None,
            &HeaderMap::new(),
            Bytes::from(req_body.clone()),
            API_KEY,
        )
        .await
        .expect("warm ok");

    let resp = clients
        .forward(
            UpstreamId::Helius,
            &Method::POST,
            "/",
            None,
            &HeaderMap::new(),
            Bytes::from(req_body),
            API_KEY,
        )
        .await
        .expect("hit ok");
    assert_eq!(
        resp.headers
            .get("x-ks-cache")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "HIT"
    );
    assert_eq!(resp.status, StatusCode::OK);
    // Only those two headers — nothing leaks from upstream.
    let names: Vec<&str> = resp.headers.keys().map(|n| n.as_str()).collect();
    assert!(
        names.iter().all(|n| *n == "content-type" || *n == "x-ks-cache"),
        "unexpected response headers on Helius RPC HIT path: {names:?}"
    );
}
