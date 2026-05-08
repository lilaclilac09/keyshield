//! Stealth-mode integration tests.
//!
//! When `state.stealth == true`, the proxy must look like a vanilla nginx
//! server to anyone without a valid bearer token. We exercise the real
//! axum router with the same in-process `tower::ServiceExt` pattern as
//! `tests/proxy.rs` so we cover the full handler chain.
//!
//! Test matrix (matches the spec's acceptance list):
//!   1. stealth ON  + no token  + `/proxy/openai/...`  → 404 nginx + Server header
//!   2. stealth ON  + no token  + `/`                  → 200 nginx welcome
//!   3. stealth ON  + no token  + `/favicon.ico`       → 404 nginx
//!   4. stealth ON  + valid     + `/proxy/openai/...`  → normal 200, no nginx Server header
//!   5. stealth OFF + no token  + `/proxy/openai/...`  → 401 "unauthorized"
//!   6. stealth ON  + no token  + `/health`            → 404 nginx
//!   7. stealth ON  + valid     + `/health`            → normal `{"status":"ok",...}`

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
use ks_proxy::bridge::{LogBuffer, LogBufferTask, PythonBridge};
use ks_proxy::{router, AppState};
use ks_session::SessionStore;
use ks_upstream::{UpstreamClients, UpstreamId};
use ks_vault::VaultPath;
use serde::Deserialize;
use serde_json::Value;
use tower::ServiceExt;
use wiremock::matchers::{any, header, method, path as path_matcher, path_regex};
use wiremock::{Mock, MockServer, ResponseTemplate};

// ─── manifest types (mirrors tests/proxy.rs) ─────────────────────────────────

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct StoredKey {
    upstream: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct UserFx {
    #[allow(dead_code)]
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
    #[allow(dead_code)]
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
    let dir = env::temp_dir().join(format!("ks-proxy-stealth-{label}-{pid}-{nanos}-{n}"));
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
    #[allow(dead_code)]
    upstream_mock: MockServer,
    #[allow(dead_code)]
    python_mock: MockServer,
    manifest: Manifest,
    /// Keep alive so the spawned drain task isn't garbage-collected mid-test.
    #[allow(dead_code)]
    log_task: LogBufferTask,
}

impl Harness {
    async fn build(stealth_on: bool) -> Self {
        let manifest = seed_fixtures();
        let upstream_mock = MockServer::start().await;
        let python_mock = MockServer::start().await;

        // Default upstream behavior: 200 with a tiny OpenAI-shaped body.
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

        // Python /_internal/balance/* always returns 5.0 — tests with valid
        // tokens use self-custodian path so this branch is rarely hit.
        Mock::given(method("GET"))
            .and(path_regex(r"/_internal/balance/.*"))
            .and(header("X-Internal-Secret", "test-secret"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "balance_usd": 5.0_f64,
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

        // Catch-all fallthrough: marker so we can tell when something
        // accidentally fell through to Python.
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
        overrides.insert(UpstreamId::Openai, upstream_mock.uri());
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

        let state = AppState {
            vault: VaultPath::new(&manifest.vault_root),
            sessions,
            upstreams,
            cache: Arc::new(TtlCache::new()),
            bridge,
            log_buffer,
            stealth: stealth_on,
        };

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

async fn body_to_string(
    resp: axum::response::Response,
) -> (StatusCode, axum::http::HeaderMap, String) {
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

fn nginx_server_header(headers: &axum::http::HeaderMap) -> Option<&str> {
    headers.get("server").and_then(|v| v.to_str().ok())
}

// ─── tests ───────────────────────────────────────────────────────────────────

/// 1. Stealth ON + no token + protected proxy path → nginx 404 with the
///    pinned Server header and the canonical 404 body.
#[tokio::test]
async fn stealth_no_token_proxy_returns_nginx_404() {
    let h = Harness::build(true).await;
    let app = router(h.state.clone());

    let req = Request::builder()
        .method("GET")
        .uri("/proxy/openai/v1/chat/completions")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, headers, body) = body_to_string(resp).await;

    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(
        nginx_server_header(&headers),
        Some("nginx/1.24.0"),
        "stealth response must pin the nginx Server header"
    );
    assert_eq!(
        headers
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "text/html; charset=utf-8",
    );
    assert!(
        body.contains("404 Not Found") && body.contains("nginx/1.24.0"),
        "body must be the nginx 404 page, got: {body}"
    );
}

/// 2. Stealth ON + no token + `/` → nginx welcome (200 OK + welcome body).
#[tokio::test]
async fn stealth_no_token_root_returns_nginx_index() {
    let h = Harness::build(true).await;
    let app = router(h.state.clone());

    let req = Request::builder()
        .method("GET")
        .uri("/")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, headers, body) = body_to_string(resp).await;

    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(nginx_server_header(&headers), Some("nginx/1.24.0"));
    assert!(
        body.contains("Welcome to nginx!"),
        "body must be the nginx welcome page, got: {body}"
    );
}

/// 3. Stealth ON + no token + `/favicon.ico` → nginx 404. Confirms the
///    "doesn't look like keyshield" path goes through fallthrough → nginx
///    rather than reverse-proxying to Python.
#[tokio::test]
async fn stealth_no_token_favicon_returns_nginx_404() {
    let h = Harness::build(true).await;
    let app = router(h.state.clone());

    let req = Request::builder()
        .method("GET")
        .uri("/favicon.ico")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, headers, body) = body_to_string(resp).await;

    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(nginx_server_header(&headers), Some("nginx/1.24.0"));
    assert!(body.contains("404 Not Found"));
}

/// 4. Stealth ON + valid token → normal proxy behavior. The hot path
///    must not be polluted with the nginx Server header.
#[tokio::test]
async fn stealth_valid_token_proxy_works_normally() {
    let h = Harness::build(true).await;
    let app = router(h.state.clone());

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
    assert!(
        nginx_server_header(&headers) != Some("nginx/1.24.0"),
        "valid-token responses must NOT carry the nginx Server header"
    );
}

/// 5. Stealth OFF (default) + no token → 401 "unauthorized" — the existing
///    behavior must be preserved when the env var is unset.
#[tokio::test]
async fn stealth_off_no_token_returns_401() {
    let h = Harness::build(false).await;
    let app = router(h.state.clone());

    let req = Request::builder()
        .method("POST")
        .uri("/proxy/openai/v1/chat/completions")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, headers, body) = body_to_string(resp).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED, "body: {body}");
    assert_eq!(body, "unauthorized");
    assert!(
        nginx_server_header(&headers).is_none(),
        "stealth-OFF responses must not carry the nginx Server header"
    );
}

/// 6. Stealth ON + no token + `/health` → nginx 404. /health must not leak
///    that this is keyshield.
#[tokio::test]
async fn stealth_no_token_health_returns_nginx_404() {
    let h = Harness::build(true).await;
    let app = router(h.state.clone());

    let req = Request::builder()
        .uri("/health")
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, headers, body) = body_to_string(resp).await;

    assert_eq!(status, StatusCode::NOT_FOUND, "body: {body}");
    assert_eq!(nginx_server_header(&headers), Some("nginx/1.24.0"));
    assert!(
        body.contains("404 Not Found"),
        "/health must serve nginx 404 in stealth mode, got: {body}"
    );
}

/// 7. Stealth ON + valid token + `/health` → normal `{"status":"ok",...}`.
#[tokio::test]
async fn stealth_valid_token_health_returns_ok_json() {
    let h = Harness::build(true).await;
    let app = router(h.state.clone());

    let req = Request::builder()
        .uri("/health")
        .header("authorization", bearer(&h.manifest.user_a.token))
        .body(Body::empty())
        .unwrap();

    let resp = app.oneshot(req).await.unwrap();
    let (status, headers, body) = body_to_string(resp).await;

    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(
        nginx_server_header(&headers) != Some("nginx/1.24.0"),
        "authed /health must not carry the nginx Server header"
    );
    let parsed: Value = serde_json::from_str(&body).expect("body must be JSON");
    assert_eq!(parsed["status"], "ok");
    assert_eq!(parsed["version"], "0.1");
}
