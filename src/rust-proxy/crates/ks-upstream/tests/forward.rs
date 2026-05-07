//! Integration tests for `UpstreamClients::forward()` for non-Helius upstreams.
//!
//! Each test stands up a `wiremock::MockServer`, points the `UpstreamClients`
//! at it via `with_bases(...)`, sends one request through `forward()`, and
//! asserts that the mock received the right path, query string, auth header,
//! and body bytes per spec 04 + ADR-001.

use std::collections::HashMap;

use bytes::Bytes;
use http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode};
use ks_upstream::{UpstreamClients, UpstreamId};
use wiremock::matchers::any;
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

const API_KEY: &str = "test-secret-key-123";

async fn fixture(upstream: UpstreamId) -> (MockServer, UpstreamClients) {
    let mock_server = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string(r#"{"ok":true}"#)
                .insert_header("content-type", "application/json"),
        )
        .mount(&mock_server)
        .await;
    let mut overrides = HashMap::new();
    overrides.insert(upstream, mock_server.uri());
    let clients = UpstreamClients::with_bases(overrides);
    (mock_server, clients)
}

fn json_headers() -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert(
        http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    // These three should always be dropped.
    h.insert(http::header::HOST, HeaderValue::from_static("example.com"));
    h.insert(http::header::CONTENT_LENGTH, HeaderValue::from_static("99"));
    h.insert(
        http::header::AUTHORIZATION,
        HeaderValue::from_static("Bearer should-be-dropped"),
    );
    h
}

fn assert_dropped_request_headers(req: &Request) {
    // Original Authorization, Host, Content-Length should never reach upstream
    // verbatim. Host is rewritten by hyper to the mock's host:port; what matters
    // is that the **original** "example.com" is gone.
    let host = req
        .headers
        .get("host")
        .map(|v| v.to_str().unwrap_or(""))
        .unwrap_or("");
    assert!(
        !host.contains("example.com"),
        "host header should be rewritten, got: {host}"
    );
    assert!(
        req.headers.get("content-length").is_some(),
        "transport layer sets content-length",
    );
    // Authorization is replaced (or absent) - the dropped Bearer must be gone.
    let auth = req
        .headers
        .get("authorization")
        .map(|v| v.to_str().unwrap_or(""))
        .unwrap_or("");
    assert!(
        !auth.contains("should-be-dropped"),
        "original Authorization should be dropped, got: {auth}"
    );
}

#[tokio::test]
async fn openai_bearer_auth_drops_content_type_then_reinjects() {
    let (mock, clients) = fixture(UpstreamId::Openai).await;
    let mut headers = json_headers();
    // A content-type provided by the client should be dropped (AI provider rule)
    // and then reinjected to application/json.
    headers.insert(
        http::header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain"),
    );
    let body = Bytes::from_static(br#"{"hello":"world"}"#);
    let resp = clients
        .forward(
            UpstreamId::Openai,
            &Method::POST,
            "/v1/chat/completions",
            None,
            &headers,
            body.clone(),
            API_KEY,
        )
        .await
        .expect("forward ok");
    assert_eq!(resp.status, StatusCode::OK);

    let reqs = mock.received_requests().await.expect("received requests");
    assert_eq!(reqs.len(), 1);
    let r = &reqs[0];
    assert_eq!(r.method, Method::POST);
    assert_eq!(r.url.path(), "/v1/chat/completions");
    assert_eq!(r.url.query(), None);
    assert_eq!(r.body.as_slice(), body.as_ref());
    assert_eq!(
        r.headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        format!("Bearer {API_KEY}")
    );
    assert_eq!(
        r.headers
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "application/json",
        "AI providers re-inject content-type after dropping it",
    );
    assert_dropped_request_headers(r);
}

#[tokio::test]
async fn anthropic_uses_x_api_key_and_default_version() {
    let (mock, clients) = fixture(UpstreamId::Anthropic).await;
    let body = Bytes::from_static(br#"{"model":"claude-3-5"}"#);
    clients
        .forward(
            UpstreamId::Anthropic,
            &Method::POST,
            "/v1/messages",
            None,
            &json_headers(),
            body.clone(),
            API_KEY,
        )
        .await
        .expect("forward ok");

    let reqs = mock.received_requests().await.unwrap();
    assert_eq!(reqs.len(), 1);
    let r = &reqs[0];
    assert_eq!(r.url.path(), "/v1/messages");
    assert_eq!(r.body.as_slice(), body.as_ref());
    assert_eq!(
        r.headers
            .get("x-api-key")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        API_KEY
    );
    assert_eq!(
        r.headers
            .get("anthropic-version")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "2023-06-01",
        "Anthropic gets default version when client didn't supply one"
    );
    assert!(
        r.headers.get("authorization").is_none(),
        "Anthropic doesn't get Bearer auth"
    );
}

#[tokio::test]
async fn anthropic_client_supplied_version_wins() {
    let (mock, clients) = fixture(UpstreamId::Anthropic).await;
    let mut headers = json_headers();
    headers.insert(
        HeaderName::from_static("anthropic-version"),
        HeaderValue::from_static("2025-01-01"),
    );
    clients
        .forward(
            UpstreamId::Anthropic,
            &Method::POST,
            "/v1/messages",
            None,
            &headers,
            Bytes::from_static(b"{}"),
            API_KEY,
        )
        .await
        .expect("forward ok");

    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert_eq!(
        r.headers
            .get("anthropic-version")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "2025-01-01",
        "client-supplied anthropic-version wins (ADR-001 #6)",
    );
}

#[tokio::test]
async fn mistral_bearer_auth() {
    let (mock, clients) = fixture(UpstreamId::Mistral).await;
    clients
        .forward(
            UpstreamId::Mistral,
            &Method::GET,
            "/v1/models",
            None,
            &json_headers(),
            Bytes::new(),
            API_KEY,
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert_eq!(r.method, Method::GET);
    assert_eq!(r.url.path(), "/v1/models");
    assert_eq!(
        r.headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        format!("Bearer {API_KEY}")
    );
}

#[tokio::test]
async fn cohere_bearer_auth() {
    let (mock, clients) = fixture(UpstreamId::Cohere).await;
    let body = Bytes::from_static(br#"{"texts":["hi"]}"#);
    clients
        .forward(
            UpstreamId::Cohere,
            &Method::POST,
            "/v1/embed",
            None,
            &json_headers(),
            body.clone(),
            API_KEY,
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert_eq!(r.url.path(), "/v1/embed");
    assert_eq!(r.body.as_slice(), body.as_ref());
    assert_eq!(
        r.headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        format!("Bearer {API_KEY}")
    );
}

#[tokio::test]
async fn groq_bearer_auth_no_openai_suffix() {
    // Note: tested base url is the mock; the production Groq base is
    // `https://api.groq.com` (no `/openai`) — see ADR-001 #3.
    let (mock, clients) = fixture(UpstreamId::Groq).await;
    let body = Bytes::from_static(br#"{"model":"llama"}"#);
    clients
        .forward(
            UpstreamId::Groq,
            &Method::POST,
            "/openai/v1/chat/completions",
            None,
            &json_headers(),
            body.clone(),
            API_KEY,
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert_eq!(r.url.path(), "/openai/v1/chat/completions");
    assert_eq!(r.body.as_slice(), body.as_ref());
    assert_eq!(
        r.headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        format!("Bearer {API_KEY}")
    );
    // Sanity: production Groq base must not have `/openai` baked in.
    assert_eq!(UpstreamId::Groq.base_url(), "https://api.groq.com");
}

#[tokio::test]
async fn zerox_uses_zerox_api_key_header() {
    let (mock, clients) = fixture(UpstreamId::ZeroX).await;
    clients
        .forward(
            UpstreamId::ZeroX,
            &Method::GET,
            "/swap/v1/quote",
            Some("sellToken=ETH&buyToken=DAI"),
            &json_headers(),
            Bytes::new(),
            API_KEY,
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert_eq!(r.url.path(), "/swap/v1/quote");
    assert_eq!(r.url.query(), Some("sellToken=ETH&buyToken=DAI"));
    assert_eq!(
        r.headers
            .get("0x-api-key")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        API_KEY
    );
    assert!(
        r.headers.get("authorization").is_none(),
        "0x doesn't use Bearer auth"
    );
    // 0x is NOT an AI provider — it should NOT drop content-type, so the
    // client-supplied content-type from json_headers() should pass through.
    assert_eq!(
        r.headers
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "application/json",
        "0x preserves client content-type"
    );
}

#[tokio::test]
async fn titan_bearer_when_key_present() {
    let (mock, clients) = fixture(UpstreamId::Titan).await;
    let body = Bytes::from_static(br#"{"jsonrpc":"2.0"}"#);
    clients
        .forward(
            UpstreamId::Titan,
            &Method::POST,
            "/",
            None,
            &json_headers(),
            body.clone(),
            API_KEY,
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert_eq!(r.url.path(), "/");
    assert_eq!(r.body.as_slice(), body.as_ref());
    assert_eq!(
        r.headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        format!("Bearer {API_KEY}")
    );
}

#[tokio::test]
async fn titan_no_auth_when_key_empty() {
    let (mock, clients) = fixture(UpstreamId::Titan).await;
    clients
        .forward(
            UpstreamId::Titan,
            &Method::POST,
            "/",
            None,
            &json_headers(),
            Bytes::from_static(b"{}"),
            "",
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert!(
        r.headers.get("authorization").is_none(),
        "Titan with empty key sends no Authorization (spec 04)"
    );
}

#[tokio::test]
async fn pyth_appends_query_param_when_key_present() {
    let (mock, clients) = fixture(UpstreamId::Pyth).await;
    clients
        .forward(
            UpstreamId::Pyth,
            &Method::GET,
            "/v2/updates/price/latest",
            Some("ids[]=abc"),
            &json_headers(),
            Bytes::new(),
            API_KEY,
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert_eq!(r.url.path(), "/v2/updates/price/latest");
    let q = r.url.query().unwrap_or("");
    assert!(
        q.contains("ids[]=abc") || q.contains("ids%5B%5D=abc"),
        "preserves existing query, got: {q}"
    );
    assert!(
        q.ends_with(&format!("api_key={API_KEY}")),
        "appends api_key=<key> at end, got: {q}"
    );
    assert!(
        r.headers.get("authorization").is_none(),
        "Pyth uses query-param auth, not headers"
    );
}

#[tokio::test]
async fn pyth_passthrough_when_key_empty() {
    let (mock, clients) = fixture(UpstreamId::Pyth).await;
    clients
        .forward(
            UpstreamId::Pyth,
            &Method::GET,
            "/v2/updates/price/latest",
            Some("ids[]=abc"),
            &json_headers(),
            Bytes::new(),
            "",
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    let q = r.url.query().unwrap_or("");
    assert!(
        !q.contains("api_key="),
        "no api_key when key is empty, got: {q}"
    );
}

#[tokio::test]
async fn pyth_creates_query_when_no_existing_query() {
    let (mock, clients) = fixture(UpstreamId::Pyth).await;
    clients
        .forward(
            UpstreamId::Pyth,
            &Method::GET,
            "/v2/updates/price/latest",
            None,
            &json_headers(),
            Bytes::new(),
            API_KEY,
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert_eq!(
        r.url.query().unwrap_or(""),
        format!("api_key={API_KEY}"),
        "creates query when none existed",
    );
}

#[tokio::test]
async fn alchemy_bearer_auth() {
    let (mock, clients) = fixture(UpstreamId::Alchemy).await;
    let body = Bytes::from_static(br#"{"jsonrpc":"2.0","method":"eth_blockNumber"}"#);
    clients
        .forward(
            UpstreamId::Alchemy,
            &Method::POST,
            "/v2",
            None,
            &json_headers(),
            body.clone(),
            API_KEY,
        )
        .await
        .expect("forward ok");
    let reqs = mock.received_requests().await.unwrap();
    let r = &reqs[0];
    assert_eq!(r.url.path(), "/v2");
    assert_eq!(r.body.as_slice(), body.as_ref());
    assert_eq!(
        r.headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        format!("Bearer {API_KEY}")
    );
    // AI provider rule: content-type was dropped from client and re-injected.
    assert_eq!(
        r.headers
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "application/json"
    );
}

#[tokio::test]
async fn body_too_large_rejected() {
    let clients = UpstreamClients::new();
    let big = Bytes::from(vec![b'x'; 1_000_001]);
    let err = clients
        .forward(
            UpstreamId::Openai,
            &Method::POST,
            "/v1/chat",
            None,
            &json_headers(),
            big,
            API_KEY,
        )
        .await
        .expect_err("expected PayloadTooLarge");
    assert!(matches!(err, ks_upstream::UpstreamError::PayloadTooLarge));
}

#[tokio::test]
async fn response_drops_content_encoding() {
    let mock_server = MockServer::start().await;
    Mock::given(any())
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string("{}")
                .insert_header("content-encoding", "gzip")
                .insert_header("x-keep", "yes"),
        )
        .mount(&mock_server)
        .await;
    let mut overrides = HashMap::new();
    overrides.insert(UpstreamId::Cohere, mock_server.uri());
    let clients = UpstreamClients::with_bases(overrides);

    let resp = clients
        .forward(
            UpstreamId::Cohere,
            &Method::GET,
            "/v1/models",
            None,
            &HeaderMap::new(),
            Bytes::new(),
            API_KEY,
        )
        .await
        .expect("forward ok");
    assert!(
        resp.headers.get("content-encoding").is_none(),
        "content-encoding dropped from response (server.py:802)"
    );
    assert_eq!(
        resp.headers
            .get("x-keep")
            .and_then(|v| v.to_str().ok())
            .unwrap(),
        "yes",
        "other response headers preserved"
    );
}
