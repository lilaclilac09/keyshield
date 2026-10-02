//! Axum handlers — thin glue. Real logic lives in the crates.
//!
//! See `proxy-rs/BOUNDARY.md` and `specs/06-batch.md`. Verbatim error
//! strings ("payload too large", "unknown upstream") are required by
//! ADR-001 #9 / #10 — Python tests assert on them.

use std::str::FromStr;
use std::time::Instant;

use axum::{
    body::{Body, to_bytes as body_to_bytes},
    extract::{Path, Request, State},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
    Json,
};
use bytes::Bytes;
use ks_upstream::{UpstreamError, UpstreamId};
use ks_vault::VaultError;
use serde_json::{json, Value};

use crate::bridge::UsageEntry;
use crate::stealth;
use crate::usage::extract_token_usage;
use crate::AppState;

/// `MAX_BODY = 1_000_000` (1 MB) — matches `server.py:59`. Both the
/// single-proxy and per-batch-item paths reject above this with a precise
/// error string.
const MAX_BODY: usize = 1_000_000;

/// JSON-RPC methods the Helius fast-path will service via `ks-helius`
/// `cached_call`. Anything outside this set falls through to the existing
/// ks-upstream pass-through, preserving the original behavior.
const HELIUS_FAST_PATH_METHODS: &[&str] = &[
    "getBalance",
    "getAsset",
    "getAssetBatch",
    "getAssetsByOwner",
    "getAssetsByCreator",
    "getSignaturesForAddress",
    "getTransactionsForAddress",
    "parseTransactions",
    "getPriorityFeeEstimate",
    "getLatestBlockhash",
    "getTokenAccountBalance",
];

// ─── /health ─────────────────────────────────────────────────────────────────

pub async fn health(State(state): State<AppState>, headers: HeaderMap) -> Response {
    // In stealth mode, /health must NOT leak that this is keyshield. Require
    // a valid bearer token; otherwise serve nginx 404.
    if state.stealth {
        let Some(token) = bearer_token(&headers) else {
            return stealth::nginx_404_response();
        };
        if let Err(_resp) = resolve_session(&state, token) {
            return stealth::nginx_404_response();
        }
    }
    Json(json!({
        "status": "ok",
        "version": "0.1",
        "cache_entries": state.cache.len(),
    }))
    .into_response()
}

// ─── /proxy/:upstream[/*path] ────────────────────────────────────────────────

/// Empty-path variant: `POST /proxy/helius/` (no trailing wildcard
/// segment). Axum 0.7's `*path` wildcard requires at least one segment,
/// so we route the bare `/proxy/:upstream` and `/proxy/:upstream/` cases
/// here and reuse the main `proxy` handler with an empty path. Mirrors
/// `server.py:778` which accepts `path=""`.
pub async fn proxy_no_path(
    State(state): State<AppState>,
    Path(upstream_str): Path<String>,
    req: Request,
) -> Response {
    proxy_inner(state, upstream_str, String::new(), req).await
}

/// `POST/GET/PUT/DELETE/PATCH /proxy/:upstream/*path`
pub async fn proxy(
    State(state): State<AppState>,
    Path((upstream_str, path)): Path<(String, String)>,
    req: Request,
) -> Response {
    proxy_inner(state, upstream_str, path, req).await
}

async fn proxy_inner(
    state: AppState,
    upstream_str: String,
    path: String,
    req: Request,
) -> Response {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let headers = req.headers().clone();

    // 1. Bearer extraction
    let token = match bearer_token(&headers) {
        Some(t) => t,
        None => {
            if state.stealth {
                return stealth::nginx_unauth_response(uri.path());
            }
            return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
        }
    };

    // 2. Session lookup. dev-bypass mirrors server.py:330. Clone the token
    //    so the MPP charging hook downstream can re-use it as the bearer.
    let session = match resolve_session(&state, token.clone()) {
        Ok(s) => s,
        Err(resp) => {
            if state.stealth {
                return stealth::nginx_unauth_response(uri.path());
            }
            return resp;
        }
    };

    // 3. UpstreamId — unknown upstream = 404 (server.py:781).
    let Ok(upstream_id) = UpstreamId::from_str(&upstream_str) else {
        return (StatusCode::NOT_FOUND, "unknown upstream").into_response();
    };

    if let Err((status, msg)) =
        crate::policy::check_proxy_access(&state, &session, &upstream_str, &path)
    {
        return (status, Json(json!({ "error": msg }))).into_response();
    }

    // 4. Read body (1MB cap = 413).
    let (_parts, body) = req.into_parts();
    let body_bytes: Bytes = match body_to_bytes(body, MAX_BODY).await {
        Ok(b) => b,
        Err(_) => return (StatusCode::PAYLOAD_TOO_LARGE, "payload too large").into_response(),
    };

    // 4.5. Helius fast-path: header key or vault key + ks-helius cached_call.
    // Falls through to the standard ks-upstream pass-through on any failure
    // (vault NotFound, JSON parse error, unknown method, helius error).
    let header_key = header_upstream_key(&headers);
    if upstream_str == "helius" {
        if let Some(resp) =
            helius_fast_path(&state, &session, &body_bytes, header_key.as_deref()).await
        {
            return resp;
        }
    }

    // 5. Resolve key: X-Upstream-API-Key header (Path A) → vault → platform.
    let (api_key, key_type) = if let Some(k) = header_key {
        (k, KeyType::Header)
    } else {
        match resolve_key(&state, &session, &upstream_str) {
            Ok(p) => p,
            Err(resp) => return resp,
        }
    };

    // 6. x402 check on platform key.
    if key_type == KeyType::Platform {
        let balance = state.bridge.balance(&session.user_id).await.unwrap_or_else(|err| {
            // Per spec 07: bridge failure → treat as 0 → 402. Logged warn.
            tracing::warn!(error = %err, user = %session.user_id, "balance bridge failed; treating as 0");
            0.0
        });
        if balance <= 0.0 {
            let body = x402_body(&upstream_str, &uri);
            let mut resp = (StatusCode::PAYMENT_REQUIRED, Json(body)).into_response();
            resp.headers_mut()
                .insert("X-Payment-Required", HeaderValue::from_static("x402"));
            return resp;
        }
    }

    // 7. Forward.
    let started = Instant::now();
    let query = uri.query();
    let upstream_resp = state
        .upstreams
        .forward(
            upstream_id,
            &method,
            &normalized_path(&path),
            query,
            &headers,
            body_bytes.clone(),
            &api_key,
        )
        .await;

    let latency_ms = started.elapsed().as_secs_f64() * 1000.0;

    let resp = match upstream_resp {
        Ok(r) => r,
        Err(UpstreamError::PayloadTooLarge) => {
            return (StatusCode::PAYLOAD_TOO_LARGE, "payload too large").into_response();
        }
        Err(UpstreamError::BadHeader) => {
            return (StatusCode::BAD_REQUEST, "invalid header in request").into_response();
        }
        Err(UpstreamError::Http(err)) => {
            tracing::warn!(error = %err, upstream = %upstream_str, "upstream http error");
            return (StatusCode::BAD_GATEWAY, "upstream unreachable").into_response();
        }
    };

    // 8. Headers: copy upstream headers, then add x-ks-cache + x-ks-key-type.
    let mut out_headers = resp.headers.clone();
    let cache_status =
        cache_status_from(&out_headers).unwrap_or(CacheStatus::Miss);
    out_headers.insert(
        HeaderName::from_static("x-ks-cache"),
        HeaderValue::from_static(cache_status.as_str()),
    );
    out_headers.insert(
        HeaderName::from_static("x-ks-key-type"),
        HeaderValue::from_static(key_type.as_str()),
    );

    // 9. Fire-and-forget usage log.
    let (tok_in, tok_out, cost) = extract_token_usage(&upstream_str, &resp.body);
    state.log_buffer.push(UsageEntry {
        user_id: session.user_id.clone(),
        upstream: upstream_str,
        key_type: key_type.as_str().to_string(),
        method: method.as_str().to_string(),
        path,
        tok_in,
        tok_out,
        cost,
        latency_ms,
        status: resp.status.as_u16(),
    });

    // 9.5. Generic MPP charging hook. After a successful upstream call,
    //     if the request carried `X-Mpp-Stream-Id: <u64>`, fire-and-forget
    //     a POST to the Python backend's `/mpp/streams/<id>/record` so the
    //     stream is debited. Generic across all upstreams; failures never
    //     block the hot path (see `PythonBridge::record_mpp_call`).
    if resp.status.as_u16() < 400 {
        if let Some(sid_str) = headers.get("x-mpp-stream-id").and_then(|v| v.to_str().ok()) {
            if let Ok(stream_id) = sid_str.parse::<u64>() {
                let tokens = tok_in.saturating_add(tok_out) as u32;
                state.bridge.record_mpp_call(stream_id, token.to_string(), tokens);
            }
        }
    }

    let mut response = Response::builder()
        .status(resp.status)
        .body(Body::from(resp.body))
        .expect("status + body always valid");
    *response.headers_mut() = out_headers;
    response
}

// ─── /manage/batch ───────────────────────────────────────────────────────────

#[derive(serde::Deserialize, Debug)]
struct BatchItem {
    upstream: String,
    #[serde(default)]
    path: String,
    #[serde(default = "default_method")]
    method: String,
    #[serde(default)]
    body: Value,
}

fn default_method() -> String {
    "POST".to_string()
}

#[derive(serde::Deserialize, Debug)]
struct BatchRequest {
    requests: Vec<BatchItem>,
}

/// `POST /manage/batch` — fan out up to 20 items concurrently. Each item's
/// shape matches the single-call contract; 21+ items → 400. Per-item bad
/// upstream / oversize → `{"error": ...}` so partial success is observable.
pub async fn batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let token = match bearer_token(&headers) {
        Some(t) => t,
        None => {
            if state.stealth {
                // /manage/batch is a non-`/` path → nginx 404.
                return stealth::nginx_404_response();
            }
            return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
        }
    };
    let session = match resolve_session(&state, token) {
        Ok(s) => s,
        Err(resp) => {
            if state.stealth {
                return stealth::nginx_404_response();
            }
            return resp;
        }
    };

    let req: BatchRequest = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, format!("invalid json: {e}")).into_response();
        }
    };

    if req.requests.len() > 20 {
        return (StatusCode::BAD_REQUEST, "batch limit is 20").into_response();
    }

    // tokio::JoinSet would lose ordering. We use `futures::future::join_all`
    // with a Vec<Future> to preserve per-index ordering. Each item runs on
    // its own task, so the runtime parallelizes.
    let mut futures = Vec::with_capacity(req.requests.len());
    for item in req.requests.into_iter() {
        let state = state.clone();
        let session = session.clone();
        futures.push(tokio::spawn(async move {
            run_batch_item(state, session, item).await
        }));
    }

    let mut results = Vec::with_capacity(futures.len());
    for f in futures {
        match f.await {
            Ok(value) => results.push(value),
            Err(e) => {
                results.push(json!({"error": format!("internal task error: {e}")}));
            }
        }
    }

    Json(json!({"results": results})).into_response()
}

async fn run_batch_item(
    state: AppState,
    session: ks_session::Session,
    item: BatchItem,
) -> Value {
    // Mirrors `server.py:run_one`. Verbatim error strings per ADR-001 #9, #10.
    if let Err((_status, msg)) =
        crate::policy::check_proxy_access(&state, &session, &item.upstream, &item.path)
    {
        return json!({ "error": msg });
    }

    let Ok(upstream_id) = UpstreamId::from_str(&item.upstream) else {
        return json!({"error": "unknown upstream"});
    };

    // Per-item key resolution mirrors single-proxy semantics. PermissionError
    // in Python becomes a 401 with detail; we propagate as `{"error": detail}`.
    let (api_key, _key_type) = match resolve_key(&state, &session, &item.upstream) {
        Ok(p) => p,
        Err(resp) => {
            // Pull detail out of the response — server.py uses HTTPException.detail.
            // Easier path: synthesize the same string we would have returned.
            let _ = resp; // 401 detail is deterministic
            return json!({
                "error": "unauthorized: no key stored and no platform key available"
            });
        }
    };

    // Serialize body for size-check + forward. server.py:858 uses
    // `json.dumps(item.body)` — we emit the same JSON shape.
    let raw: Vec<u8> = if item.body.is_null() {
        Vec::new()
    } else {
        serde_json::to_vec(&item.body).unwrap_or_default()
    };
    if raw.len() > MAX_BODY {
        return json!({"error": "payload too large"});
    }

    // Build minimal headers — Python's batch path injects content-type
    // unconditionally for the fallback branch and leaves provider auth to
    // the upstream layer.
    let mut headers = HeaderMap::new();
    headers.insert(
        http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );

    // Per-item HTTP method.
    let method = match Method::from_bytes(item.method.as_bytes()) {
        Ok(m) => m,
        Err(_) => return json!({"error": format!("invalid method: {}", item.method)}),
    };

    let path_for_call = if item.path.is_empty() { "/".to_string() } else { item.path.clone() };

    let body_bytes = Bytes::from(raw);
    let upstream_resp = state
        .upstreams
        .forward(
            upstream_id,
            &method,
            &normalized_path(&path_for_call),
            None,
            &headers,
            body_bytes,
            &api_key,
        )
        .await;

    match upstream_resp {
        Ok(r) => {
            let cache_status = cache_status_from(&r.headers).unwrap_or(CacheStatus::Miss);
            // Python returns parsed JSON or null.
            let data: Value = if r.body.is_empty() {
                Value::Null
            } else {
                serde_json::from_slice(&r.body).unwrap_or(Value::Null)
            };
            json!({
                "status": r.status.as_u16(),
                "cache": cache_status.as_str(),
                "data": data,
            })
        }
        Err(UpstreamError::PayloadTooLarge) => json!({"error": "payload too large"}),
        Err(UpstreamError::BadHeader) => json!({"error": "invalid header"}),
        Err(UpstreamError::Http(e)) => json!({"error": e.to_string()}),
    }
}

// ─── fallthrough → Python control plane ──────────────────────────────────────

const HOP_BY_HOP: &[&str] = &[
    "connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "host",
    "content-length",
];

/// Headers we strip from inbound client requests before reverse-proxying to
/// Python. `x-internal-secret` is the firewall token between Rust and Python
/// — clients must NOT be able to smuggle their own value; ks-proxy re-injects
/// it from `state.bridge.internal_secret` after stripping.
const STRIP_FROM_INBOUND: &[&str] = &["x-internal-secret"];

pub async fn fallthrough(State(state): State<AppState>, req: Request) -> Response {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let headers = req.headers().clone();

    // Stealth mode: any unauthed fallthrough request never reaches Python.
    // It gets the nginx welcome (for `/`) or nginx 404 (everything else).
    if state.stealth {
        let needs_nginx = match bearer_token(&headers) {
            None => true,
            Some(token) => resolve_session(&state, token).is_err(),
        };
        if needs_nginx {
            return stealth::nginx_unauth_response(uri.path());
        }
    }

    let (_parts, body) = req.into_parts();
    let body_bytes = match body_to_bytes(body, usize::MAX).await {
        Ok(b) => b,
        Err(e) => {
            return (StatusCode::BAD_REQUEST, format!("body read error: {e}")).into_response();
        }
    };

    let target = build_python_url(&state.bridge.base_url, &uri);

    let reqwest_method = match reqwest::Method::from_bytes(method.as_str().as_bytes()) {
        Ok(m) => m,
        Err(_) => return (StatusCode::BAD_REQUEST, "bad method").into_response(),
    };

    let mut builder = state
        .bridge
        .client
        .request(reqwest_method, &target)
        .body(body_bytes.to_vec());

    for (name, value) in headers.iter() {
        let lname = name.as_str();
        if HOP_BY_HOP.iter().any(|h| h.eq_ignore_ascii_case(lname)) {
            continue;
        }
        if STRIP_FROM_INBOUND.iter().any(|h| h.eq_ignore_ascii_case(lname)) {
            continue;
        }
        // reqwest accepts http::HeaderName/HeaderValue directly.
        builder = builder.header(name.as_str(), value.as_bytes());
    }

    // Firewall: Rust ↔ Python is gated by a shared secret. ks-proxy re-injects
    // this on every fallthrough so the client cannot reach Python by curling
    // :8001 directly. Empty secret = dev mode (Python fails open with warn).
    if !state.bridge.internal_secret.is_empty() {
        builder = builder.header("x-internal-secret", state.bridge.internal_secret.as_str());
    }

    let resp = match builder.send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(error = %e, target = %target, "fallthrough to python failed");
            return (StatusCode::BAD_GATEWAY, "python control plane unreachable").into_response();
        }
    };

    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut out_headers = HeaderMap::new();
    for (name, value) in resp.headers().iter() {
        let lname = name.as_str();
        if HOP_BY_HOP.iter().any(|h| h.eq_ignore_ascii_case(lname)) {
            continue;
        }
        // Construct fresh axum-side header values.
        if let (Ok(hn), Ok(hv)) = (
            HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            out_headers.append(hn, hv);
        }
    }
    let body = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            tracing::warn!(error = %e, "fallthrough body read failed");
            return (StatusCode::BAD_GATEWAY, "python body read error").into_response();
        }
    };

    let mut response = Response::builder()
        .status(status)
        .body(Body::from(body))
        .expect("status + body always valid");
    *response.headers_mut() = out_headers;
    response
}

fn build_python_url(base: &str, uri: &Uri) -> String {
    let path_and_query = uri
        .path_and_query()
        .map(|p| p.as_str())
        .unwrap_or_else(|| uri.path());
    format!("{}{}", base.trim_end_matches('/'), path_and_query)
}

// ─── helius fast-path ────────────────────────────────────────────────────────

/// Attempt to service a `/proxy/helius/*` POST via the in-process ks-helius
/// client. Returns `Some(response)` on success; `None` on any failure or
/// unknown method so the caller falls through to the existing ks-upstream
/// pass-through. Fail-open by design.
async fn helius_fast_path(
    state: &AppState,
    session: &ks_session::Session,
    body: &Bytes,
    header_key: Option<&str>,
) -> Option<Response> {
    // 1. Parse body as JSON-RPC `{method, params}`. Anything else falls
    //    through.
    #[derive(serde::Deserialize)]
    struct JsonRpcReq {
        method: String,
        #[serde(default)]
        params: Value,
    }
    let parsed: JsonRpcReq = serde_json::from_slice(body).ok()?;

    // 2. Restrict to the curated method list. Other methods (writes,
    //    sendTransaction, etc.) must keep flowing through pass-through.
    let static_method: &'static str = HELIUS_FAST_PATH_METHODS
        .iter()
        .copied()
        .find(|m| *m == parsed.method.as_str())?;

    // 3. Resolve the Helius key: Path A header first, then vault shim.
    let key = if let Some(k) = header_key {
        k.to_string()
    } else {
        match ks_vault::sqlite::lookup_upstream_key(
            &state.vault_db_path,
            &session.user_id,
            "helius",
        ) {
            Ok(k) => k,
            Err(ks_vault::SqliteVaultError::NotFound { .. }) => return None,
            Err(e) => {
                tracing::warn!(error = %e, "helius fast-path vault lookup failed; falling through");
                return None;
            }
        }
    };

    // 4. Fork the shared client. This shares the in-memory cache + HTTP/2
    //    pool across users; only the API key is per-fork.
    let fork = state.helius.fork_with_api_key(key);

    // 5. Fire via cached_call_with_state — surfaces HIT/MISS so the
    //    x-ks-cache header (and downstream PaymentBadge/VenueBadge in
    //    the dashboard) reflect real cache behavior, not a guess.
    let (value, cache_state): (Value, ks_helius::CacheState) = match fork
        .cached_call_with_state::<Value>(static_method, parsed.params, None)
        .await
    {
        Ok(pair) => pair,
        Err(e) => {
            tracing::warn!(error = %e, method = static_method, "helius fast-path cached_call_with_state failed; falling through");
            return None;
        }
    };

    // 6. Build 200 response with real cache state.
    let body = match serde_json::to_vec(&value) {
        Ok(b) => b,
        Err(e) => {
            tracing::warn!(error = %e, "helius fast-path serialize failed; falling through");
            return None;
        }
    };
    let cache_header = match cache_state {
        ks_helius::CacheState::Hit => "HIT",
        ks_helius::CacheState::Miss => "MISS",
    };
    let mut response = Response::builder()
        .status(StatusCode::OK)
        .body(Body::from(body))
        .ok()?;
    let h = response.headers_mut();
    h.insert(
        HeaderName::from_static("content-type"),
        HeaderValue::from_static("application/json"),
    );
    h.insert(
        HeaderName::from_static("x-ks-key-type"),
        HeaderValue::from_static("self_custodian"),
    );
    h.insert(
        HeaderName::from_static("x-ks-cache"),
        HeaderValue::from_static(cache_header),
    );
    Some(response)
}

// ─── shared helpers ──────────────────────────────────────────────────────────

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(http::header::AUTHORIZATION)?.to_str().ok()?;
    if !raw.starts_with("Bearer ") {
        return None;
    }
    Some(raw[7..].to_string())
}

fn header_upstream_key(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get("x-upstream-api-key")?.to_str().ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

fn resolve_session(state: &AppState, token: String) -> Result<ks_session::Session, Response> {
    if token == "dev-bypass" {
        return Ok(ks_session::Session::basic("dev-bypass", "dev-bypass"));
    }
    match state.sessions.get(&token) {
        Ok(Some(s)) => Ok(s),
        Ok(None) => Err((StatusCode::UNAUTHORIZED, "unauthorized").into_response()),
        Err(e) => {
            tracing::warn!(error = %e, "session lookup failed");
            Err((StatusCode::INTERNAL_SERVER_ERROR, "session lookup failed").into_response())
        }
    }
}

#[derive(Copy, Clone, PartialEq, Eq, Debug)]
enum KeyType {
    SelfCustodian,
    Platform,
    Header,
}

impl KeyType {
    fn as_str(self) -> &'static str {
        match self {
            KeyType::SelfCustodian => "self_custodian",
            KeyType::Platform => "platform",
            KeyType::Header => "user",
        }
    }
}

/// Vault first; fall back to env-based platform key. Mirrors `_resolve_key`
/// at server.py:338-352 plus the platform-key map at server.py:61-75.
fn resolve_key(
    state: &AppState,
    session: &ks_session::Session,
    upstream: &str,
) -> Result<(String, KeyType), Response> {
    match ks_vault::load(&state.vault, &session.user_id, upstream, &session.password) {
        Ok(key) => Ok((key, KeyType::SelfCustodian)),
        Err(VaultError::NotFound) | Err(VaultError::BadPassword) => {
            let env_key = platform_env_var(upstream);
            let platform_key = std::env::var(env_key).unwrap_or_default();
            if platform_key.is_empty() {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    "unauthorized: no key stored and no platform key available",
                )
                    .into_response());
            }
            Ok((platform_key, KeyType::Platform))
        }
        Err(e) => {
            tracing::warn!(error = %e, "vault read failed");
            Err((StatusCode::INTERNAL_SERVER_ERROR, "vault read failed").into_response())
        }
    }
}

/// Mirrors the ENV-name → upstream-name mapping from server.py:61-75.
fn platform_env_var(upstream: &str) -> &'static str {
    match upstream {
        "openai" => "OPENAI_API_KEY",
        "anthropic" => "ANTHROPIC_API_KEY",
        "mistral" => "MISTRAL_API_KEY",
        "cohere" => "COHERE_API_KEY",
        "groq" => "GROQ_API_KEY",
        "helius" => "HELIUS_API_KEY",
        "0x" => "ZEROX_API_KEY",
        "titan" => "TITAN_API_KEY",
        "pyth" => "PYTH_API_KEY",
        "alchemy" => "ALCHEMY_API_KEY",
        // Unknown upstream → empty env name; std::env::var returns empty.
        _ => "KS_UNUSED_PLATFORM_ENV",
    }
}

#[derive(Copy, Clone)]
enum CacheStatus {
    Hit,
    Miss,
}

impl CacheStatus {
    fn as_str(self) -> &'static str {
        match self {
            CacheStatus::Hit => "HIT",
            CacheStatus::Miss => "MISS",
        }
    }
}

/// Read the upstream's `x-ks-cache` (if Track C wired one) so we can
/// surface HIT/MISS to the client. Default = MISS.
fn cache_status_from(headers: &HeaderMap) -> Option<CacheStatus> {
    let v = headers.get("x-ks-cache")?.to_str().ok()?;
    match v {
        "HIT" | "hit" => Some(CacheStatus::Hit),
        "MISS" | "miss" => Some(CacheStatus::Miss),
        _ => None,
    }
}

/// `_x402_body(upstream, resource_url)` — verbatim from server.py:355-375.
/// Field order is preserved so JSON responses byte-match the Python oracle.
fn x402_body(upstream: &str, uri: &Uri) -> Value {
    // We can't read PAYMENT_ADDRESS in tests; provide an env override.
    let payment_address = std::env::var("PAYMENT_ADDRESS")
        .unwrap_or_else(|_| "0x0000000000000000000000000000000000000000".to_string());
    let usdc_base_sepolia = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    json!({
        "x402Version": 1,
        "error": "X-PAYMENT-REQUIRED",
        "accepts": [
            {
                "scheme": "exact",
                "network": "base-sepolia",
                "maxAmountRequired": "10000",
                "resource": uri.to_string(),
                "description": format!("KeyShield API proxy — {}", upstream),
                "mimeType": "application/json",
                "payTo": payment_address,
                "maxTimeoutSeconds": 300,
                "asset": usdc_base_sepolia,
                "extra": {"name": "USDC", "version": "2"},
            }
        ],
    })
}

/// `axum::Path` strips the leading `/` from the wildcard segment; the
/// upstream layer expects a path that joins cleanly onto the base. We
/// re-add the slash if the path doesn't already start with one.
fn normalized_path(p: &str) -> String {
    if p.starts_with('/') {
        p.to_string()
    } else {
        format!("/{p}")
    }
}

#[cfg(test)]
mod header_key_tests {
    use super::*;

    #[test]
    fn reads_x_upstream_api_key() {
        let mut h = HeaderMap::new();
        h.insert("x-upstream-api-key", HeaderValue::from_static("sk-test"));
        assert_eq!(header_upstream_key(&h).as_deref(), Some("sk-test"));
    }

    #[test]
    fn empty_header_is_none() {
        let mut h = HeaderMap::new();
        h.insert("x-upstream-api-key", HeaderValue::from_static("   "));
        assert_eq!(header_upstream_key(&h), None);
    }

    #[test]
    fn missing_header_is_none() {
        let h = HeaderMap::new();
        assert_eq!(header_upstream_key(&h), None);
    }
}

