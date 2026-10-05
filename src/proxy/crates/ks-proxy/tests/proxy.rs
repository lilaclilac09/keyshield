//! End-to-end tests for the ks-proxy hot-path router.
//!
//! Strategy:
//!   1. Spawn `seed_proxy_fixtures.py` to create a vault + sessions.db with
//!      two users (one self-custodian, one platform-only).
//!   2. Stand up two `wiremock::MockServer`s — one for an upstream, one
//!      for the Python control plane (balance / log / fallthrough).
//!   3. Build the real `AppState` against those mocks and exercise the
//!      axum router directly with `tower::ServiceExt::oneshot` — no socket.

use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use ks_cache::TtlCache;
use ks_proxy::bridge::{LogBuffer, PythonBridge};
use ks_proxy::{router, AppState};
use ks_session::SessionStore;
use ks_upstream::{UpstreamClients, UpstreamId};
use ks_vault::VaultPath;
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use serde::Deserialize;
use serde_json::Value;

/// Per-binary install of the Prometheus recorder for `router(state, ph)`.
/// `install_recorder()` panics if called twice, so we guard with OnceLock.
/// Each integration test target runs in its own process, so this is
/// scoped to this binary's lifetime.
fn test_prometheus() -> PrometheusHandle {
    use std::sync::OnceLock;
    static HANDLE: OnceLock<PrometheusHandle> = OnceLock::new();
    HANDLE
        .get_or_init(|| {
            PrometheusBuilder::new()
                .install_recorder()
                .expect("install prometheus recorder for tests")
        })
        .clone()
}
use tower::ServiceExt;
use wiremock::matchers::{any, header, method, path as path_matcher, path_regex};
use wiremock::{Mock, MockServer, ResponseTemplate};

// ─── manifest types ──────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct StoredKey {
    upstream: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct UserFx {
    user_id: String,
    #[allow(dead_code)]
    password: String,
    token: String,
    #[allow(dead_code)]
    #[serde(default)]
    stored_keys: Vec<StoredKey>,
}

#[derive(Debug, Deserialize)]
struct Manifest {
    vault_root: String,
    session_db: String,
    server_secret: String,
    user_a: UserFx,
    user_b: UserFx,
}

// ─── python helpers ──────────────────────────────────────────────────────────

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
    // Post-SOTA: src/rust-proxy/crates/ks-proxy is four levels deep.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .expect("ks-proxy crate must live four levels under repo root")
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
    let dir = env::temp_dir().join(format!("ks-proxy-int-{label}-{pid}-{nanos}-{n}"));
    fs::create_dir_all(&dir).expect("create tmp dir");
    dir
}

fn seed_fixtures() -> Manifest {
    let out_dir = unique_tmp_dir("fixtures");
    let script = proxy_rs_dir().join("scripts/seed_proxy_fixtures.py");
    let py = python_bin();

    let output = Command::new(&py)
        .arg(&script)
        .arg(&out_dir)
        .output()
        .unwrap_or_else(|e| {
            panic!(
                "failed to spawn `{} {} {}`: {e}",
                py,
                script.display(),
                out_dir.display()
            )
        });
    assert!(
        output.status.success(),
        "seed_proxy_fixtures.py exited {:?}\nstdout: {}\nstderr: {}",
        output.status.code(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );

    let raw = fs::read_to_string(out_dir.join("manifest.json")).unwrap();
    serde_json::from_str(&raw).unwrap()
}

// ─── state harness ───────────────────────────────────────────────────────────

struct Harness {
    state: AppState,
    upstream_mock: MockServer,
    python_mock: MockServer,
    manifest: Manifest,
    /// Keep alive so the spawned drain task isn't garbage-collected mid-test.
    #[allow(dead_code)]
    log_task: ks_proxy::bridge::LogBufferTask,
}

impl Harness {
    async fn build(upstream_id: UpstreamId, balance_usd: f64) -> Self {
        let manifest = seed_fixtures();
        let upstream_mock = MockServer::start().await;
        let python_mock = MockServer::start().await;

        // Default upstream behavior: 200 with a tiny OpenAI-shaped body so
        // the usage extractor has something realistic to chew on.
        Mock::given(any())
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "application/json")
                    .set_body_string(
                        r#"{"id":"x","usage":{"prompt_tokens":3,"completion_tokens":4}}"#,
                    ),
            )
            .mount(&upstream_mock)
            .await;

        // Python /_internal/balance/* returns the requested balance.
        Mock::given(method("GET"))
            .and(path_regex(r"/_internal/balance/.*"))
            .and(header("X-Internal-Secret", "test-secret"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "balance_usd": balance_usd,
                })),
            )
            .mount(&python_mock)
            .await;

        // Python /_internal/log silently accepts batches.
        Mock::given(method("POST"))
            .and(path_matcher("/_internal/log"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({"ingested": 0})),
            )
            .mount(&python_mock)
            .await;

        // Catch-all fallthrough: echo back a marker so we can verify the
        // request was reverse-proxied.
        Mock::given(any())
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "application/json")
                    .insert_header("x-from-python", "yes")
                    .set_body_string(r#"{"from":"python-mock"}"#),
            )
            .mount(&python_mock)
            .await;

        let mut overrides = HashMap::new();
        overrides.insert(upstream_id, upstream_mock.uri());
        let upstreams = Arc::new(UpstreamClients::with_bases(overrides));

        let sessions = Arc::new(
            SessionStore::open(Path::new(&manifest.session_db), &manifest.server_secret)
                .expect("open session db read-only"),
        );

        let bridge = Arc::new(PythonBridge::new(
            python_mock.uri(),
            "test-secret".to_string(),
        ));
        let (log_buffer, log_task) = LogBuffer::spawn(bridge.clone());

        let vault_db_dir = tempfile::tempdir().expect("tempdir for vault db");
        let vault_db_path = vault_db_dir.path().join("vault_shim.db");
        // Intentionally don't create the file — vault NotFound is fail-open
        // for the Helius fast-path. Keep the TempDir alive on the harness
        // so it isn't dropped early.
        let helius = Arc::new(ks_helius::HeliusClient::with_api_key(
            "placeholder",
            ks_helius::HeliusConfig::default(),
        ));

        let state = AppState {
            vault: VaultPath::new(&manifest.vault_root),
            sessions,
            upstreams,
            cache: Arc::new(TtlCache::new()),
            bridge,
            log_buffer,
            stealth: false,
            vault_db_path,
            helius,
        };
        // Keep tempdir alive via leak — test process exits soon enough.
        std::mem::forget(vault_db_dir);

        Self {
            state,
            upstream_mock,
            python_mock,
            manifest,
            log_task,
        }
    }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

fn bearer(token: &str) -> String {
    format!("Bearer {token}")
}

async fn body_to_string(resp: axum::response::Response) -> (StatusCode, axum::http::HeaderMap, String) {
    let status = resp.status();
    let headers = resp.headers().clone();
    let bytes = resp
        .into_body()
        .collect()
        .await
        .expect("collect body")
        .to_bytes();
    let s = String::from_utf8_lossy(&bytes).to_string();
    (status, headers, s)
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[tokio::test]
async fn self_custodian_happy_path() {
    let h = Harness::build(UpstreamId::Openai, 0.0).await;
    let app = router(h.state.clone(), test_prometheus());

    let req = Request::builder()
        .method("POST")
        .uri("/proxy/openai/v1/chat/completions")
        .header("authorization", bearer(&h.manifest.user_a.token))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"hi":1}"#.to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, headers, body) = body_to_string(resp).await;

    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(
        headers
            .get("x-ks-key-type")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "self_custodian"
    );
    assert!(headers.get("x-ks-cache").is_some());
    assert!(
        headers.get("transfer-encoding").is_none(),
        "hop-by-hop transfer-encoding must not be forwarded"
    );
    assert!(
        headers.get("connection").is_none(),
        "hop-by-hop connection must not be forwarded"
    );

    // Upstream received the request with the user's stored sk-self-custodian-key.
    let reqs = h.upstream_mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1);
    assert_eq!(
        reqs[0]
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "Bearer sk-self-custodian-key"
    );

    // Python should NOT have been called for balance — alice is self-custodian.
    let py_reqs = h.python_mock.received_requests().await.unwrap();
    assert!(
        py_reqs
            .iter()
            .all(|r| !r.url.path().starts_with("/_internal/balance")),
        "self-custodian path must skip balance check"
    );
}

#[tokio::test]
async fn platform_key_with_balance_succeeds() {
    let h = Harness::build(UpstreamId::Openai, 5.0).await;

    // bob has no vault entry → platform fallback.
    env::set_var("OPENAI_API_KEY", "platform-test-key");

    let app = router(h.state.clone(), test_prometheus());
    let req = Request::builder()
        .method("POST")
        .uri("/proxy/openai/v1/chat/completions")
        .header("authorization", bearer(&h.manifest.user_b.token))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"hi":1}"#.to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, headers, body) = body_to_string(resp).await;
    env::remove_var("OPENAI_API_KEY");

    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(
        headers
            .get("x-ks-key-type")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "platform"
    );

    let upstream_reqs = h.upstream_mock.received_requests().await.unwrap();
    assert_eq!(upstream_reqs.len(), 1);
    assert_eq!(
        upstream_reqs[0]
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "Bearer platform-test-key"
    );

    // Balance was queried.
    let py_reqs = h.python_mock.received_requests().await.unwrap();
    assert!(
        py_reqs
            .iter()
            .any(|r| r.url.path() == format!("/_internal/balance/{}", h.manifest.user_b.user_id)),
        "platform path must call balance"
    );
}

#[tokio::test]
async fn platform_key_zero_balance_returns_402() {
    let h = Harness::build(UpstreamId::Openai, 0.0).await;
    env::set_var("OPENAI_API_KEY", "platform-test-key");

    let app = router(h.state.clone(), test_prometheus());
    let req = Request::builder()
        .method("POST")
        .uri("/proxy/openai/v1/chat/completions")
        .header("authorization", bearer(&h.manifest.user_b.token))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"hi":1}"#.to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, headers, body) = body_to_string(resp).await;
    env::remove_var("OPENAI_API_KEY");

    assert_eq!(status, StatusCode::PAYMENT_REQUIRED, "body: {body}");
    assert_eq!(
        headers
            .get("X-Payment-Required")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "x402"
    );

    // Body shape mirrors server.py:355-375.
    let parsed: Value = serde_json::from_str(&body).expect("body must be JSON");
    assert_eq!(parsed["x402Version"], 1);
    assert_eq!(parsed["error"], "X-PAYMENT-REQUIRED");
    assert_eq!(parsed["accepts"][0]["scheme"], "exact");
    assert_eq!(parsed["accepts"][0]["network"], "base-sepolia");
    assert_eq!(parsed["accepts"][0]["maxAmountRequired"], "10000");
    assert_eq!(parsed["accepts"][0]["mimeType"], "application/json");

    // No upstream call for a 402 — the proxy short-circuits.
    let upstream_reqs = h.upstream_mock.received_requests().await.unwrap();
    assert_eq!(upstream_reqs.len(), 0);
}

#[tokio::test]
async fn unknown_token_returns_401() {
    let h = Harness::build(UpstreamId::Openai, 0.0).await;
    let app = router(h.state.clone(), test_prometheus());
    let req = Request::builder()
        .method("POST")
        .uri("/proxy/openai/v1/chat/completions")
        .header("authorization", bearer("not-a-real-token"))
        .body(Body::from("{}".to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, _headers, body) = body_to_string(resp).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "body: {body}");
}

#[tokio::test]
async fn missing_bearer_returns_401() {
    let h = Harness::build(UpstreamId::Openai, 0.0).await;
    let app = router(h.state.clone(), test_prometheus());
    let req = Request::builder()
        .method("POST")
        .uri("/proxy/openai/v1/chat/completions")
        .body(Body::from("{}".to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn unknown_upstream_returns_404() {
    let h = Harness::build(UpstreamId::Openai, 0.0).await;
    let app = router(h.state.clone(), test_prometheus());
    let req = Request::builder()
        .method("POST")
        .uri("/proxy/notreal/v1/x")
        .header("authorization", bearer(&h.manifest.user_a.token))
        .body(Body::from("{}".to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, _headers, body) = body_to_string(resp).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body, "unknown upstream");
}

#[tokio::test]
async fn batch_5_parallel_items_succeed() {
    // Use mistral as the test upstream too, but only override openai for
    // this batch test — items below all target openai for simplicity.
    let h = Harness::build(UpstreamId::Openai, 5.0).await;
    let app = router(h.state.clone(), test_prometheus());

    let body = serde_json::json!({
        "requests": [
            {"upstream": "openai", "method": "POST", "path": "v1/chat/completions", "body": {"i": 0}},
            {"upstream": "openai", "method": "POST", "path": "v1/chat/completions", "body": {"i": 1}},
            {"upstream": "openai", "method": "POST", "path": "v1/chat/completions", "body": {"i": 2}},
            {"upstream": "openai", "method": "POST", "path": "v1/chat/completions", "body": {"i": 3}},
            {"upstream": "openai", "method": "POST", "path": "v1/chat/completions", "body": {"i": 4}}
        ]
    });

    let req = Request::builder()
        .method("POST")
        .uri("/manage/batch")
        .header("authorization", bearer(&h.manifest.user_a.token))
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, _headers, body) = body_to_string(resp).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");

    let parsed: Value = serde_json::from_str(&body).unwrap();
    let results = parsed["results"].as_array().expect("results array");
    assert_eq!(results.len(), 5);
    for r in results {
        assert_eq!(r["status"], 200, "item failed: {r}");
        assert!(r["error"].is_null(), "item had error: {r}");
        assert!(r["data"].is_object(), "item missing data: {r}");
    }
}

#[tokio::test]
async fn batch_21_items_returns_400() {
    let h = Harness::build(UpstreamId::Openai, 5.0).await;
    let app = router(h.state.clone(), test_prometheus());

    let mut requests = Vec::with_capacity(21);
    for i in 0..21 {
        requests.push(serde_json::json!({
            "upstream": "openai",
            "method": "POST",
            "path": "v1/x",
            "body": {"i": i}
        }));
    }
    let body = serde_json::json!({"requests": requests});

    let req = Request::builder()
        .method("POST")
        .uri("/manage/batch")
        .header("authorization", bearer(&h.manifest.user_a.token))
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, _headers, body) = body_to_string(resp).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body, "batch limit is 20");
}

#[tokio::test]
async fn batch_with_one_unknown_upstream_returns_per_item_error() {
    let h = Harness::build(UpstreamId::Openai, 5.0).await;
    let app = router(h.state.clone(), test_prometheus());

    let body = serde_json::json!({
        "requests": [
            {"upstream": "openai", "method": "POST", "path": "v1/x", "body": {"i": 1}},
            {"upstream": "this-is-not-real", "method": "POST", "path": "/", "body": {}},
            {"upstream": "openai", "method": "POST", "path": "v1/y", "body": {"i": 2}}
        ]
    });

    let req = Request::builder()
        .method("POST")
        .uri("/manage/batch")
        .header("authorization", bearer(&h.manifest.user_a.token))
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, _headers, body) = body_to_string(resp).await;
    assert_eq!(status, StatusCode::OK, "batch should succeed even if one item is bad: {body}");

    let parsed: Value = serde_json::from_str(&body).unwrap();
    let results = parsed["results"].as_array().unwrap();
    assert_eq!(results.len(), 3);
    assert_eq!(results[0]["status"], 200);
    // Verbatim error string per ADR-001 #10.
    assert_eq!(results[1]["error"], "unknown upstream");
    assert_eq!(results[2]["status"], 200);
}

#[tokio::test]
async fn fallthrough_is_reverse_proxied_to_python() {
    let h = Harness::build(UpstreamId::Openai, 0.0).await;
    let app = router(h.state.clone(), test_prometheus());

    let req = Request::builder()
        .method("GET")
        .uri("/auth/login?ping=1")
        .header("x-ks-test", "from-test")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, headers, body) = body_to_string(resp).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers
            .get("x-from-python")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "yes",
        "response must be the python mock's reply"
    );
    assert!(body.contains("python-mock"));

    // Verify the python mock got the path, query, and the test header.
    let py_reqs = h.python_mock.received_requests().await.unwrap();
    let auth_reqs: Vec<_> = py_reqs
        .iter()
        .filter(|r| r.url.path() == "/auth/login")
        .collect();
    assert_eq!(auth_reqs.len(), 1);
    assert_eq!(auth_reqs[0].url.query(), Some("ping=1"));
    assert_eq!(
        auth_reqs[0]
            .headers
            .get("x-ks-test")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "from-test"
    );
}

#[tokio::test]
async fn health_endpoint_works() {
    let h = Harness::build(UpstreamId::Openai, 0.0).await;
    let app = router(h.state.clone(), test_prometheus());

    let req = Request::builder()
        .uri("/health")
        .body(Body::empty())
        .unwrap();
    let resp = app.oneshot(req).await.unwrap();
    let (status, _headers, body) = body_to_string(resp).await;
    assert_eq!(status, StatusCode::OK);
    let parsed: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(parsed["status"], "ok");
    assert_eq!(parsed["version"], "0.1");
    assert!(parsed["cache_entries"].is_number());
}

#[tokio::test]
async fn payload_too_large_returns_413() {
    let h = Harness::build(UpstreamId::Openai, 5.0).await;
    let app = router(h.state.clone(), test_prometheus());
    let big = vec![b'x'; 1_000_001];

    let req = Request::builder()
        .method("POST")
        .uri("/proxy/openai/v1/x")
        .header("authorization", bearer(&h.manifest.user_a.token))
        .header("content-type", "application/octet-stream")
        .body(Body::from(big))
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[test]
fn retain_end_to_end_headers_drops_hop_by_hop() {
    use axum::http::{header, HeaderMap, HeaderValue};
    use ks_proxy::handlers::retain_end_to_end_headers;

    let mut src = HeaderMap::new();
    src.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/event-stream"));
    src.insert(header::TRANSFER_ENCODING, HeaderValue::from_static("chunked"));
    src.insert(header::CONNECTION, HeaderValue::from_static("keep-alive"));
    src.insert("x-ks-mock-mode", HeaderValue::from_static("fast"));
    src.insert(header::CONTENT_LENGTH, HeaderValue::from_static("12"));

    let out = retain_end_to_end_headers(&src);
    assert_eq!(
        out.get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok()),
        Some("text/event-stream")
    );
    assert_eq!(
        out.get("x-ks-mock-mode").and_then(|v| v.to_str().ok()),
        Some("fast")
    );
    assert!(out.get(header::TRANSFER_ENCODING).is_none());
    assert!(out.get(header::CONNECTION).is_none());
    assert!(out.get(header::CONTENT_LENGTH).is_none());
}
