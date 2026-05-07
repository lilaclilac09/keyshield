//! Per-upstream HTTP/2 client + auth injection.
//!
//! See `proxy-rs/specs/04-upstream-auth.md` and `proxy-rs/specs/05-helius-routing.md`.

use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;

pub use ks_cache::TtlCache;
use ks_cache::pycompat;

const MAX_BODY: usize = 1_000_000;
const ANTHROPIC_DEFAULT_VERSION: &str = "2023-06-01";

// ─── Helius sub-base URLs (spec 05) ─────────────────────────────────────────
//
// Production routes are decided purely by the JSON-RPC `method` field (spec
// 05 "Method → bucket" + ADR-001). All three buckets use `?api-key={key}`
// auth. These mirror `v2-mvp/src/api_router.py:21-37`.
const HELIUS_RPC_BASE: &str = "https://mainnet.helius-rpc.com";
const HELIUS_DAS_BASE: &str = "https://mainnet.helius-rpc.com/das";
const HELIUS_ENHANCED_BASE: &str = "https://api.helius.xyz/v0";

/// Helius bucket assignment for a JSON-RPC method.
///
/// Mirrors `v2-mvp/src/api_router.py:158-167` (`_helius_provider`). The DAS /
/// Enhanced sets are closed enums today; new methods default to RPC.
fn helius_bucket(method: &str) -> HeliusBucket {
    match method {
        // DAS — NFT / asset queries
        "getAsset"
        | "getAssetBatch"
        | "getAssetProof"
        | "getAssetProofBatch"
        | "getAssetsByOwner"
        | "getAssetsByGroup"
        | "getAssetsByCreator"
        | "getAssetsByAuthority"
        | "searchAssets"
        | "getTokenAccounts"
        | "getNftEditions" => HeliusBucket::Das,
        // Enhanced — Helius-specific routes
        "getTransactions" | "getTokenBalances" => HeliusBucket::Enhanced,
        // Default — vanilla Solana JSON-RPC
        _ => HeliusBucket::Rpc,
    }
}

#[derive(Copy, Clone, Debug)]
enum HeliusBucket {
    Rpc,
    Das,
    Enhanced,
}

#[derive(Copy, Clone, Debug, Hash, Eq, PartialEq)]
pub enum UpstreamId {
    Helius,
    Openai,
    Anthropic,
    Mistral,
    Cohere,
    Groq,
    ZeroX,
    Titan,
    Pyth,
    Alchemy,
}

impl FromStr for UpstreamId {
    type Err = ();
    fn from_str(s: &str) -> Result<Self, ()> {
        Ok(match s {
            "helius" => UpstreamId::Helius,
            "openai" => UpstreamId::Openai,
            "anthropic" => UpstreamId::Anthropic,
            "mistral" => UpstreamId::Mistral,
            "cohere" => UpstreamId::Cohere,
            "groq" => UpstreamId::Groq,
            "0x" => UpstreamId::ZeroX,
            "titan" => UpstreamId::Titan,
            "pyth" => UpstreamId::Pyth,
            "alchemy" => UpstreamId::Alchemy,
            _ => return Err(()),
        })
    }
}

impl UpstreamId {
    pub fn base_url(self) -> &'static str {
        match self {
            UpstreamId::Helius => "https://mainnet.helius-rpc.com",
            UpstreamId::Openai => "https://api.openai.com",
            UpstreamId::Anthropic => "https://api.anthropic.com",
            UpstreamId::Mistral => "https://api.mistral.ai",
            UpstreamId::Cohere => "https://api.cohere.ai",
            // ADR-001 #3: Groq base is `https://api.groq.com` (no `/openai`).
            UpstreamId::Groq => "https://api.groq.com",
            UpstreamId::ZeroX => "https://api.0x.org",
            UpstreamId::Titan => "https://rpc.titanbuilder.xyz",
            UpstreamId::Pyth => "https://hermes.pyth.network",
            UpstreamId::Alchemy => "https://eth-mainnet.g.alchemy.com",
        }
    }

    fn all() -> [UpstreamId; 10] {
        [
            UpstreamId::Helius,
            UpstreamId::Openai,
            UpstreamId::Anthropic,
            UpstreamId::Mistral,
            UpstreamId::Cohere,
            UpstreamId::Groq,
            UpstreamId::ZeroX,
            UpstreamId::Titan,
            UpstreamId::Pyth,
            UpstreamId::Alchemy,
        ]
    }

    /// Whether the AI-provider header drop list applies (also drops
    /// `content-type` because Python's `api_router.call_rest` re-injects it).
    /// See spec 04 "Header forwarding rules" and ADR-001 #11.
    fn is_ai_provider(self) -> bool {
        matches!(
            self,
            UpstreamId::Openai
                | UpstreamId::Anthropic
                | UpstreamId::Mistral
                | UpstreamId::Cohere
                | UpstreamId::Groq
                | UpstreamId::Alchemy
        )
    }
}

#[derive(Debug)]
pub struct UpstreamResponse {
    pub status: http::StatusCode,
    pub headers: http::HeaderMap,
    pub body: bytes::Bytes,
}

#[derive(Debug, Copy, Clone)]
pub enum CacheStatus {
    Hit,
    Miss,
}

#[derive(thiserror::Error, Debug)]
pub enum UpstreamError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("body too large")]
    PayloadTooLarge,
    #[error("invalid header")]
    BadHeader,
}

pub struct UpstreamClients {
    pub clients: HashMap<UpstreamId, reqwest::Client>,
    /// Per-upstream base URL. Defaults to `UpstreamId::base_url()`; can be
    /// overridden via `with_bases()` for tests.
    bases: HashMap<UpstreamId, String>,
    /// Helius sub-base URLs. The single `UpstreamId::Helius` key in `bases`
    /// is used as the **RPC** base when an override is provided; DAS and
    /// Enhanced default to their production URLs unless explicitly set
    /// here. Tests use `with_bases_and_cache` to point all three at one
    /// mock server.
    helius_bases: HashMap<HeliusBucketKey, String>,
    /// Shared cache for Helius RPC responses (spec 03/05). `new()` and
    /// `with_bases()` allocate fresh; `with_bases_and_cache()` accepts an
    /// external `Arc<TtlCache>` so the proxy crate can share one cache
    /// across all entry points.
    cache: Arc<TtlCache<bytes::Bytes>>,
}

#[derive(Copy, Clone, Debug, Hash, Eq, PartialEq)]
enum HeliusBucketKey {
    Rpc,
    Das,
    Enhanced,
}

impl UpstreamClients {
    pub fn new() -> Self {
        Self::build(HashMap::new(), HashMap::new(), Arc::new(TtlCache::new()))
    }

    /// Test/override constructor: pre-build clients but route any explicitly-
    /// provided upstream to the given base URL instead of the production base.
    /// Anything not in `overrides` falls back to `UpstreamId::base_url()`.
    ///
    /// When `overrides` contains `UpstreamId::Helius`, that URL is used as
    /// **all three** Helius sub-bases (RPC / DAS / Enhanced). This is the
    /// shape tests want: one `MockServer` impersonates all three.
    pub fn with_bases(overrides: HashMap<UpstreamId, String>) -> Self {
        let helius_bases = Self::helius_bases_from(&overrides);
        Self::build(overrides, helius_bases, Arc::new(TtlCache::new()))
    }

    /// Like `with_bases`, but also accepts an external shared cache.
    /// Track D's `ks-proxy` uses this so cache HITs from `forward()` show
    /// up in `AppState.cache.len()` for `/health`.
    pub fn with_bases_and_cache(
        overrides: HashMap<UpstreamId, String>,
        cache: Arc<TtlCache<bytes::Bytes>>,
    ) -> Self {
        let helius_bases = Self::helius_bases_from(&overrides);
        Self::build(overrides, helius_bases, cache)
    }

    /// Map a single `UpstreamId::Helius` override to all three sub-buckets
    /// so tests can point the whole Helius surface at one mock server.
    fn helius_bases_from(
        overrides: &HashMap<UpstreamId, String>,
    ) -> HashMap<HeliusBucketKey, String> {
        let mut out = HashMap::with_capacity(3);
        if let Some(url) = overrides.get(&UpstreamId::Helius) {
            out.insert(HeliusBucketKey::Rpc, url.clone());
            out.insert(HeliusBucketKey::Das, url.clone());
            out.insert(HeliusBucketKey::Enhanced, url.clone());
        }
        out
    }

    fn build(
        overrides: HashMap<UpstreamId, String>,
        helius_bases: HashMap<HeliusBucketKey, String>,
        cache: Arc<TtlCache<bytes::Bytes>>,
    ) -> Self {
        let mut clients = HashMap::with_capacity(10);
        let mut bases = HashMap::with_capacity(10);
        for id in UpstreamId::all() {
            let client = reqwest::Client::builder()
                .http2_adaptive_window(true)
                .pool_max_idle_per_host(20)
                .timeout(Duration::from_secs(30))
                .build()
                .expect("reqwest client builder cannot fail with rustls + adaptive window");
            clients.insert(id, client);
            let base = overrides
                .get(&id)
                .cloned()
                .unwrap_or_else(|| id.base_url().to_string());
            bases.insert(id, base);
        }
        Self {
            clients,
            bases,
            helius_bases,
            cache,
        }
    }

    /// Shared cache used by `call_helius_rpc`. Track D needs read access
    /// to drive `/health`'s `cache_entries` counter.
    pub fn cache(&self) -> &Arc<TtlCache<bytes::Bytes>> {
        &self.cache
    }

    fn base_for(&self, id: UpstreamId) -> &str {
        self.bases
            .get(&id)
            .map(String::as_str)
            .unwrap_or_else(|| id.base_url())
    }

    fn helius_sub_base(&self, bucket: HeliusBucket) -> &str {
        let key = match bucket {
            HeliusBucket::Rpc => HeliusBucketKey::Rpc,
            HeliusBucket::Das => HeliusBucketKey::Das,
            HeliusBucket::Enhanced => HeliusBucketKey::Enhanced,
        };
        if let Some(url) = self.helius_bases.get(&key) {
            return url.as_str();
        }
        match bucket {
            HeliusBucket::Rpc => HELIUS_RPC_BASE,
            HeliusBucket::Das => HELIUS_DAS_BASE,
            HeliusBucket::Enhanced => HELIUS_ENHANCED_BASE,
        }
    }

    /// Route a request, applying the right auth + URL transform.
    pub async fn forward(
        &self,
        upstream: UpstreamId,
        method: &http::Method,
        path: &str,
        query: Option<&str>,
        headers: &http::HeaderMap,
        body: bytes::Bytes,
        api_key: &str,
    ) -> Result<UpstreamResponse, UpstreamError> {
        if body.len() > MAX_BODY {
            return Err(UpstreamError::PayloadTooLarge);
        }

        if upstream == UpstreamId::Helius {
            return self
                .forward_helius(method, path, query, headers, body, api_key)
                .await;
        }

        // REST cache (openai/anthropic GET /v1/models, openai POST
        // /v1/embeddings) — mirrors `api_router.call_rest` cache lookup.
        // Cache key matches Python's `_ck(provider, "{METHOD} {path}",
        // body.decode())`. We tag responses with `x-ks-cache: HIT/MISS`
        // so the proxy handler can surface it to the client.
        let rest_provider = rest_provider_name(upstream);
        let rest_ttl = rest_provider
            .and_then(|p| ks_cache::rest_route_ttl(p, method.as_str(), path));
        let rest_ck = if let (Some(p), Some(_)) = (rest_provider, rest_ttl) {
            let route_key = format!("{} {}", method.as_str(), path);
            let body_str = String::from_utf8_lossy(&body).to_string();
            Some(pycompat::cache_key(p, &route_key, &serde_json::Value::String(body_str)))
        } else {
            None
        };
        if let Some(ref k) = rest_ck {
            if let Some(hit) = self.cache.get(k) {
                let mut h = http::HeaderMap::with_capacity(2);
                h.insert(
                    http::header::CONTENT_TYPE,
                    http::HeaderValue::from_static("application/json"),
                );
                h.insert(
                    http::HeaderName::from_static("x-ks-cache"),
                    http::HeaderValue::from_static("HIT"),
                );
                return Ok(UpstreamResponse {
                    status: http::StatusCode::OK,
                    headers: h,
                    body: hit,
                });
            }
        }

        // Build outgoing headers per the per-upstream drop matrix
        // (spec 04 "Header forwarding rules" + ADR-001 #11).
        let drop_content_type = upstream.is_ai_provider();
        let mut out_headers = http::HeaderMap::with_capacity(headers.len() + 2);
        for (name, value) in headers.iter() {
            let lname = name.as_str();
            if lname.eq_ignore_ascii_case("host")
                || lname.eq_ignore_ascii_case("content-length")
                || lname.eq_ignore_ascii_case("authorization")
            {
                continue;
            }
            if drop_content_type && lname.eq_ignore_ascii_case("content-type") {
                continue;
            }
            out_headers.append(name.clone(), value.clone());
        }

        // For AI providers, Python's `call_rest` re-injects the content-type
        // unconditionally (api_router.py:219). Match that.
        if drop_content_type {
            out_headers.insert(
                http::header::CONTENT_TYPE,
                http::HeaderValue::from_static("application/json"),
            );
        }

        // Auth + query rewriting per spec 04.
        let mut effective_query = query.map(|s| s.to_string()).unwrap_or_default();

        match upstream {
            UpstreamId::Openai
            | UpstreamId::Mistral
            | UpstreamId::Cohere
            | UpstreamId::Groq
            | UpstreamId::Alchemy => {
                let value = http::HeaderValue::from_str(&format!("Bearer {api_key}"))
                    .map_err(|_| UpstreamError::BadHeader)?;
                out_headers.insert(http::header::AUTHORIZATION, value);
            }
            UpstreamId::Anthropic => {
                let key_value =
                    http::HeaderValue::from_str(api_key).map_err(|_| UpstreamError::BadHeader)?;
                out_headers.insert(
                    http::HeaderName::from_static("x-api-key"),
                    key_value,
                );
                // ADR-001 #6: client-supplied `anthropic-version` wins.
                let anthropic_version =
                    http::HeaderName::from_static("anthropic-version");
                if !out_headers.contains_key(&anthropic_version) {
                    out_headers.insert(
                        anthropic_version,
                        http::HeaderValue::from_static(ANTHROPIC_DEFAULT_VERSION),
                    );
                }
            }
            UpstreamId::ZeroX => {
                let value =
                    http::HeaderValue::from_str(api_key).map_err(|_| UpstreamError::BadHeader)?;
                out_headers.insert(
                    http::HeaderName::from_static("0x-api-key"),
                    value,
                );
            }
            UpstreamId::Titan => {
                if !api_key.is_empty() {
                    let value = http::HeaderValue::from_str(&format!("Bearer {api_key}"))
                        .map_err(|_| UpstreamError::BadHeader)?;
                    out_headers.insert(http::header::AUTHORIZATION, value);
                }
            }
            UpstreamId::Pyth => {
                if !api_key.is_empty() {
                    if effective_query.is_empty() {
                        effective_query = format!("api_key={api_key}");
                    } else {
                        effective_query.push('&');
                        effective_query.push_str("api_key=");
                        effective_query.push_str(api_key);
                    }
                }
            }
            UpstreamId::Helius => unreachable!("handled above"),
        }

        // Build URL: `{base}{path}?{query}` (path normalized to start with `/`).
        let base = self.base_for(upstream);
        let mut url = String::with_capacity(base.len() + path.len() + effective_query.len() + 2);
        url.push_str(base);
        if !path.starts_with('/') {
            url.push('/');
        }
        url.push_str(path);
        if !effective_query.is_empty() {
            url.push('?');
            url.push_str(&effective_query);
        }

        // Send via the matching pre-built client.
        let client = self
            .clients
            .get(&upstream)
            .expect("client built for every UpstreamId");

        let req = client
            .request(method.clone(), &url)
            .headers(out_headers)
            .body(body)
            .build()?;

        let resp = client.execute(req).await?;
        let status = resp.status();
        let mut resp_headers = resp.headers().clone();
        // Drop `content-encoding` (server.py:802).
        resp_headers.remove(http::header::CONTENT_ENCODING);
        let body = resp.bytes().await?;

        // Write REST cache on success (api_router.py:230 — only 200 OK).
        if let (Some(k), Some(ttl)) = (rest_ck, rest_ttl) {
            if status.is_success() {
                self.cache.set(k, body.clone(), ttl);
            }
        }
        // Tag MISS for AI providers; the proxy handler reads this to set
        // the response-side `x-ks-cache`. Don't override if upstream sent
        // its own (none of the public APIs do).
        if rest_provider.is_some()
            && !resp_headers.contains_key("x-ks-cache")
        {
            resp_headers.insert(
                http::HeaderName::from_static("x-ks-cache"),
                http::HeaderValue::from_static("MISS"),
            );
        }

        Ok(UpstreamResponse {
            status,
            headers: resp_headers,
            body,
        })
    }

    /// Helius JSON-RPC dispatch (spec 05).
    ///
    /// Routes by `method` to one of three sub-bases (RPC / DAS / Enhanced),
    /// applies the `?api-key={key}` query auth all three buckets share,
    /// and serves cacheable reads from `cache` after a one-time MISS.
    ///
    /// Cache contract (ADR-001 #1, #2): the cached value is the
    /// `pycompat::to_canonical_json` re-serialization of the upstream's
    /// parsed JSON response — NOT the raw upstream bytes. This is what
    /// guarantees byte-parity with Python's `json.dumps(result).encode()`
    /// at `server.py:721` for cache HITs.
    ///
    /// Writes (`sendTransaction`, `sendRawTransaction`, `simulateTransaction`)
    /// always go upstream and are never cached. Errors (responses without
    /// a `"result"` field) are also never cached, matching
    /// `api_router.py:192`.
    pub async fn call_helius_rpc(
        &self,
        method: &str,
        params: &serde_json::Value,
        rpc_id: &serde_json::Value,
        api_key: &str,
        cache: &TtlCache<bytes::Bytes>,
    ) -> Result<(bytes::Bytes, CacheStatus), UpstreamError> {
        let bucket = helius_bucket(method);
        let is_write = ks_cache::helius_is_write(method);
        let ttl = if is_write { None } else { ks_cache::helius_method_ttl(method) };

        // Cache lookup for cacheable read methods.
        // Key derivation matches `_ck` in `api_router.py:117` byte-for-byte
        // via `pycompat::cache_key` (spec 08 + ks-cache pycompat tests).
        let ck = if ttl.is_some() {
            Some(pycompat::cache_key("helius", method, params))
        } else {
            None
        };
        if let Some(ref k) = ck {
            if let Some(hit) = cache.get(k) {
                return Ok((hit, CacheStatus::Hit));
            }
        }

        // Build the JSON-RPC envelope. Outgoing request bytes don't need
        // pycompat parity — only the cached/returned response bytes do.
        let envelope = serde_json::json!({
            "jsonrpc": "2.0",
            "id": rpc_id,
            "method": method,
            "params": params,
        });
        let req_body =
            serde_json::to_vec(&envelope).expect("Value -> Vec<u8> never fails");

        // Pick sub-base by bucket and append `?api-key={key}`.
        let base = self.helius_sub_base(bucket);
        let mut url = String::with_capacity(base.len() + 16 + api_key.len());
        url.push_str(base);
        // Production base URLs already have a path (or empty); append `/`
        // before the query so all three buckets POST to a path that ends
        // with a slash. Mirrors `api_router.py:_build_url_and_headers`
        // (it builds `/?api-key=K` against an httpx base_url).
        url.push('/');
        url.push_str("?api-key=");
        url.push_str(api_key);

        // Use the prebuilt Helius client. Set content-type explicitly —
        // upstream wants `application/json`, and we drop nothing here.
        let client = self
            .clients
            .get(&UpstreamId::Helius)
            .expect("Helius client built");
        let mut headers = http::HeaderMap::with_capacity(1);
        headers.insert(
            http::header::CONTENT_TYPE,
            http::HeaderValue::from_static("application/json"),
        );
        let req = client
            .request(http::Method::POST, &url)
            .headers(headers)
            .body(req_body)
            .build()?;

        let resp = client.execute(req).await?;
        let status = resp.status();
        let upstream_bytes = resp.bytes().await?;

        // Re-serialize via pycompat for byte-parity with Python's
        // `json.dumps(result)` at server.py:721. If upstream returned
        // non-JSON or non-200, fall back to passing the bytes through.
        // (Python on the same path would crash on `resp.json()`; the
        // hot path on healthy upstreams always sees JSON.)
        //
        // Note: this is `to_python_json` (no sort), NOT
        // `to_canonical_json` (which sorts). Python's server.py:721
        // calls `json.dumps(result)` without `sort_keys=True`, so the
        // emitted bytes preserve the upstream's key order. We rely on
        // serde_json's `preserve_order` workspace feature to keep that
        // order intact through `Value` round-trip. `to_canonical_json`
        // is reserved for cache-key SHA-1 derivation only.
        let canonical = match serde_json::from_slice::<serde_json::Value>(&upstream_bytes) {
            Ok(parsed) => {
                let s = pycompat::to_python_json(&parsed);
                bytes::Bytes::from(s.into_bytes())
            }
            Err(_) => upstream_bytes,
        };

        // Cache only when the upstream returned a JSON-RPC success and the
        // method is cacheable. `api_router.py:192` checks `"result" in
        // result`; we replicate by re-parsing the canonical body. Cheap
        // since canonicalization just produced ASCII bytes.
        if let (Some(k), Some(ttl_dur)) = (ck, ttl) {
            if status.is_success() {
                if let Ok(parsed) =
                    serde_json::from_slice::<serde_json::Value>(&canonical)
                {
                    if parsed.get("result").is_some() {
                        cache.set(k, canonical.clone(), ttl_dur);
                    }
                }
            }
        }

        Ok((canonical, CacheStatus::Miss))
    }

    /// Helius dispatch from `forward()`. Per spec 05:
    /// - POST whose body parses as a JSON-RPC dict → `call_helius_rpc`,
    ///   then wrap in a 200 `application/json` response (server.py:721
    ///   drops every other upstream header on this branch).
    /// - GET, or POST with non-RPC body → generic forward with
    ///   `?api-key={key}` (hyphen!) appended to the query. Note this
    ///   diverges from Python's fall-through which uses `Authorization:
    ///   Bearer {key}` (server.py:771-775); the prompt specifies the
    ///   query-param form for Helius parity with the other Helius paths.
    async fn forward_helius(
        &self,
        method: &http::Method,
        path: &str,
        query: Option<&str>,
        headers: &http::HeaderMap,
        body: bytes::Bytes,
        api_key: &str,
    ) -> Result<UpstreamResponse, UpstreamError> {
        if method == http::Method::POST {
            if let Ok(rpc) = serde_json::from_slice::<serde_json::Value>(&body) {
                if let Some(rpc_obj) = rpc.as_object() {
                    if let Some(method_value) = rpc_obj.get("method") {
                        if let Some(method_str) = method_value.as_str() {
                            let params = rpc_obj
                                .get("params")
                                .cloned()
                                .unwrap_or(serde_json::Value::Array(Vec::new()));
                            let rpc_id =
                                rpc_obj.get("id").cloned().unwrap_or(serde_json::json!(1));
                            let (resp_bytes, cache_status) = self
                                .call_helius_rpc(
                                    method_str,
                                    &params,
                                    &rpc_id,
                                    api_key,
                                    &self.cache,
                                )
                                .await?;
                            // Mirror server.py:721/813 minus the surrounding
                            // wrapper: drop everything but content-type,
                            // attach x-ks-cache.
                            let mut resp_headers = http::HeaderMap::with_capacity(2);
                            resp_headers.insert(
                                http::header::CONTENT_TYPE,
                                http::HeaderValue::from_static("application/json"),
                            );
                            resp_headers.insert(
                                http::HeaderName::from_static("x-ks-cache"),
                                cache_header(cache_status),
                            );
                            return Ok(UpstreamResponse {
                                status: http::StatusCode::OK,
                                headers: resp_headers,
                                body: resp_bytes,
                            });
                        }
                    }
                }
            }
        }

        // Non-RPC fallthrough: generic forward to the Helius RPC base
        // with `?api-key={key}` appended to the query.
        let mut effective_query = query.map(|s| s.to_string()).unwrap_or_default();
        if !api_key.is_empty() {
            if !effective_query.is_empty() {
                effective_query.push('&');
            }
            effective_query.push_str("api-key=");
            effective_query.push_str(api_key);
        }

        let mut out_headers = http::HeaderMap::with_capacity(headers.len());
        for (name, value) in headers.iter() {
            let lname = name.as_str();
            if lname.eq_ignore_ascii_case("host")
                || lname.eq_ignore_ascii_case("content-length")
                || lname.eq_ignore_ascii_case("authorization")
            {
                continue;
            }
            out_headers.append(name.clone(), value.clone());
        }

        // Build URL against the Helius RPC base. Tests can override via
        // `with_bases`; production uses `HELIUS_RPC_BASE`.
        let base = self.base_for(UpstreamId::Helius);
        let mut url = String::with_capacity(base.len() + path.len() + effective_query.len() + 2);
        url.push_str(base);
        if !path.starts_with('/') {
            url.push('/');
        }
        url.push_str(path);
        if !effective_query.is_empty() {
            url.push('?');
            url.push_str(&effective_query);
        }

        let client = self
            .clients
            .get(&UpstreamId::Helius)
            .expect("Helius client built");
        let req = client
            .request(method.clone(), &url)
            .headers(out_headers)
            .body(body)
            .build()?;
        let resp = client.execute(req).await?;
        let status = resp.status();
        let mut resp_headers = resp.headers().clone();
        resp_headers.remove(http::header::CONTENT_ENCODING);
        let body = resp.bytes().await?;
        Ok(UpstreamResponse {
            status,
            headers: resp_headers,
            body,
        })
    }
}

fn cache_header(status: CacheStatus) -> http::HeaderValue {
    match status {
        CacheStatus::Hit => http::HeaderValue::from_static("HIT"),
        CacheStatus::Miss => http::HeaderValue::from_static("MISS"),
    }
}

/// Map an `UpstreamId` to the provider key the REST cache lookup uses.
/// Mirrors `api_router.PROVIDERS` keys for the AI surface only —
/// other upstreams have no REST cache rules today.
fn rest_provider_name(upstream: UpstreamId) -> Option<&'static str> {
    match upstream {
        UpstreamId::Openai => Some("openai"),
        UpstreamId::Anthropic => Some("anthropic"),
        _ => None,
    }
}

impl Default for UpstreamClients {
    fn default() -> Self {
        Self::new()
    }
}
