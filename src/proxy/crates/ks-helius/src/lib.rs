//! Typed Helius client with two-tier-cache and single-flight dedup.
//!
//! See `proxy-rs/specs/09-helius-client.md` (v2). Phase 0 + Phase 1
//! ship the scaffolding (`HeliusConfig`, `HeliusError`,
//! `PaymentInterceptor` trait stub) plus `cached_call` with the
//! Architect-mandated invariants:
//!
//! 1. **Single-flight**: 50 concurrent callers for the same `CacheKey`
//!    fire ONE upstream request — see `cached_call`'s `inflight`
//!    `DashMap` lookup that returns a `Shared<Future>` to all callers.
//! 2. **Disk records carry expiry**: deferred to Phase 2; the cache
//!    trait is shaped so adding a disk tier doesn't break the API.
//! 3. **CacheKey via `ks_cache::pycompat::cache_key`** — byte parity
//!    with Python's `_ck("helius", method, params)`.
//!
//! Five typed wrappers ship in v2 Phase 1: `get_balance`, `get_asset`,
//! `get_assets_by_owner`, `get_priority_fee_estimate`,
//! `parse_transactions`. The remaining 70-90 methods follow in Phase
//! 3b once the method audit (Phase 3a) lands.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;
use dashmap::DashMap;
use futures::future::{BoxFuture, FutureExt, Shared};
use moka::future::Cache;
use moka::policy::Expiry;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use ks_cache::pycompat;

/// Wire shape for a Helius JSON-RPC request.
const HELIUS_RPC_BASE: &str = "https://mainnet.helius-rpc.com";
const HELIUS_DAS_BASE: &str = "https://mainnet.helius-rpc.com";
const HELIUS_ENHANCED_BASE: &str = "https://api.helius.xyz/v0";

/// Identifies which Helius surface a method targets. Drives URL
/// selection in `fire`.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum HeliusBucket {
    /// Vanilla Solana JSON-RPC at `https://mainnet.helius-rpc.com/?api-key=K`.
    Rpc,
    /// DAS — NFT / asset queries at the same host (Helius routes DAS by method
    /// name internally).
    Das,
    /// Enhanced REST routes at `https://api.helius.xyz/v0`.
    Enhanced,
}

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
        // Enhanced — Helius-specific REST routes (parsed transactions, token
        // balances, address history)
        "parseTransactions"
        | "getTransactions"
        | "getTokenBalances" => HeliusBucket::Enhanced,
        // Default — vanilla Solana JSON-RPC
        _ => HeliusBucket::Rpc,
    }
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/// Errors emitted by [`HeliusClient`]. Spec 09 §"Error model" line
/// 296-311. The `PaymentRequired` variant carries the raw 402 envelope
/// so a future [`PaymentInterceptor`] (Phase 4, blocked on spec 10) can
/// inspect it.
#[derive(thiserror::Error, Debug)]
pub enum HeliusError {
    #[error("upstream http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("upstream returned {status}: {body}")]
    Upstream { status: u16, body: String },
    #[error("payment required: 402 envelope returned by upstream")]
    PaymentRequired(Value),
    #[error("payment required and no wallet/interceptor configured")]
    Unpaid,
    #[error("json decode: {0}")]
    Json(#[from] serde_json::Error),
    #[error("over concurrency budget")]
    Backpressure,
}

// `HeliusError` is shared between `Shared<Future>` clones in the
// single-flight code path, which means it must be `Clone` to satisfy
// the future bound. `reqwest::Error` and `serde_json::Error` are not
// `Clone`, so we map them to a clonable wire-friendly representation
// before publishing into the in-flight slot. See `cached_call`.
impl Clone for HeliusError {
    fn clone(&self) -> Self {
        match self {
            HeliusError::Http(e) => HeliusError::Upstream {
                status: 0,
                body: e.to_string(),
            },
            HeliusError::Upstream { status, body } => HeliusError::Upstream {
                status: *status,
                body: body.clone(),
            },
            HeliusError::PaymentRequired(v) => HeliusError::PaymentRequired(v.clone()),
            HeliusError::Unpaid => HeliusError::Unpaid,
            HeliusError::Json(e) => HeliusError::Upstream {
                status: 0,
                body: format!("json decode: {e}"),
            },
            HeliusError::Backpressure => HeliusError::Backpressure,
        }
    }
}

// ─── Payment interceptor trait stub ─────────────────────────────────────────

/// Future extension point for x402 payment retry. Phase 4 (blocked on
/// spec 10 — embedded wallet) will plug an `EmbeddedWallet` impl into
/// this slot. v2 Phase 0/1 ships an empty trait; clients that want
/// payment retry today get `HeliusError::Unpaid` instead.
///
/// Spec 09 line 121-125.
#[async_trait::async_trait]
pub trait PaymentInterceptor: Send + Sync {
    /// Called on a 402 response. Implementations should sign / submit a
    /// `pay_x402` instruction and return a serialized proof the client
    /// can replay against the original request. Returning an error
    /// surfaces the failure to the caller as `HeliusError::Unpaid`.
    async fn pay(&self, envelope: &Value) -> Result<Value, HeliusError>;
}

// ─── Configuration ──────────────────────────────────────────────────────────

/// Tuneables for [`HeliusClient`]. Spec 09 line 86-95.
#[derive(Clone, Debug)]
pub struct HeliusConfig {
    /// Bound concurrency to upstream. Default 16.
    pub max_concurrent_requests: usize,
    /// Memory cache capacity (entries, not bytes). Default 10_000.
    pub mem_cache_capacity: u64,
    /// Path to the redb-backed disk cache. Default
    /// `$XDG_CACHE_HOME/keyshield/helius.redb`. Phase 2 owns the disk
    /// tier; Phase 1 doesn't open this file, but the path is recorded
    /// here so Phase 2 doesn't need to break the config struct.
    pub disk_cache_path: PathBuf,
    /// Soft cap on disk cache total bytes. Default 500 MB.
    pub disk_cache_max_bytes: u64,
    /// Default TTL when [`Self::method_ttls`] doesn't override.
    /// Default 60s.
    pub default_ttl: Duration,
    /// Per-method TTL override. Methods not present fall through to
    /// [`Self::default_ttl`].
    pub method_ttls: HashMap<String, Duration>,
}

impl Default for HeliusConfig {
    fn default() -> Self {
        Self {
            max_concurrent_requests: 16,
            mem_cache_capacity: 10_000,
            disk_cache_path: default_disk_cache_path(),
            disk_cache_max_bytes: 500 * 1024 * 1024,
            default_ttl: Duration::from_secs(60),
            method_ttls: builtin_method_ttls(),
        }
    }
}

fn default_disk_cache_path() -> PathBuf {
    if let Ok(xdg) = std::env::var("XDG_CACHE_HOME") {
        let mut p = PathBuf::from(xdg);
        p.push("keyshield");
        p.push("helius.redb");
        return p;
    }
    if let Ok(home) = std::env::var("HOME") {
        let mut p = PathBuf::from(home);
        p.push(".cache");
        p.push("keyshield");
        p.push("helius.redb");
        return p;
    }
    PathBuf::from("./helius.redb")
}

/// Built-in TTL table mirroring spec 09 line 137-149's "Method coverage
/// matrix" defaults. Callers can override via
/// [`HeliusConfig::method_ttls`].
fn builtin_method_ttls() -> HashMap<String, Duration> {
    let mut m = HashMap::new();
    m.insert("getBalance".to_string(), Duration::from_secs(5));
    m.insert("getAccountInfo".to_string(), Duration::from_secs(5));
    m.insert("getMultipleAccounts".to_string(), Duration::from_secs(5));
    m.insert("getTokenAccountBalance".to_string(), Duration::from_secs(5));
    m.insert("getProgramAccounts".to_string(), Duration::from_secs(30));
    m.insert("getSignaturesForAddress".to_string(), Duration::from_secs(30));
    m.insert("getSignatureStatuses".to_string(), Duration::from_secs(5));
    m.insert("getTokenSupply".to_string(), Duration::from_secs(60));
    m.insert("getTransaction".to_string(), Duration::from_secs(60));
    m.insert("getBlock".to_string(), Duration::from_secs(600));
    m.insert("getBlockHeight".to_string(), Duration::from_secs(1));
    m.insert("getSlot".to_string(), Duration::from_secs(1));
    m.insert("getLatestBlockhash".to_string(), Duration::from_secs(1));
    m.insert("getRecentBlockhash".to_string(), Duration::from_secs(1));
    m.insert("getEpochInfo".to_string(), Duration::from_secs(60));
    // Helius-exclusive
    m.insert("getPriorityFeeEstimate".to_string(), Duration::from_secs(5));
    m.insert("parseTransactions".to_string(), Duration::from_secs(86400));
    m.insert("getTransactions".to_string(), Duration::from_secs(30));
    // DAS
    m.insert("getAsset".to_string(), Duration::from_secs(300));
    m.insert("getAssetBatch".to_string(), Duration::from_secs(300));
    m.insert("getAssetProof".to_string(), Duration::from_secs(86400));
    m.insert("getAssetProofBatch".to_string(), Duration::from_secs(86400));
    m.insert("getAssetsByOwner".to_string(), Duration::from_secs(30));
    m.insert("getAssetsByCreator".to_string(), Duration::from_secs(60));
    m.insert("getAssetsByAuthority".to_string(), Duration::from_secs(60));
    m.insert("getAssetsByGroup".to_string(), Duration::from_secs(60));
    m.insert("searchAssets".to_string(), Duration::from_secs(30));
    m.insert("getSignaturesForAsset".to_string(), Duration::from_secs(86400));
    m
}

// ─── Cache key wrapper ──────────────────────────────────────────────────────

/// `helius:{method}:{sha1_of_params}` — byte-identical to the value
/// Python's `_ck("helius", method, params)` produces (mirrors
/// `v2-mvp/src/api_router.py:131-133`). We never re-implement JSON
/// canonicalization here; we delegate to
/// [`ks_cache::pycompat::cache_key`].
#[derive(Clone, Debug, Hash, Eq, PartialEq)]
pub struct CacheKey(pub String);

impl CacheKey {
    pub fn derive(method: &str, params: &Value) -> Self {
        Self(pycompat::cache_key("helius", method, params))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

    /// Fork this client with a different API key. All other state
    /// (caches, semaphore, HTTP client, config) is shared via `Arc`,
    /// so this is a cheap clone — designed for multi-tenant proxies
    /// that resolve the caller's vault-stored Helius key per request
    /// while keeping a single warm cache across users.
    ///
    /// Cache safety: Helius RPC responses depend only on the JSON
    /// `method` + `params`, not on which API key called them. Sharing
    /// the cache across users is correct (and is the whole point of
    /// running a single proxy with a warm cache).
    pub fn with_api_key(&self, key: impl Into<Arc<str>>) -> Self {
        Self {
            http: self.http.clone(),
            api_key: key.into(),
            base_url: self.base_url.clone(),
            wallet: self.wallet.clone(),
            mem_cache: self.mem_cache.clone(),
            disk_cache: self.disk_cache.clone(),
            semaphore: self.semaphore.clone(),
            config: self.config.clone(),
        }
    }

    // ─── cached_call ────────────────────────────────────────────────────────

    /// Generic cached + x402-aware caller used by every typed wrapper.
    ///
    /// Algorithm (spec 09 §"The cached_call shape"):
    ///   1. Memory cache hit → return immediately
    ///   2. Disk cache hit → promote to memory, return
    ///   3. Cache miss → acquire semaphore, fire to upstream
    ///   4. If 402 → try x402 payment + retry (max 1)
    ///   5. Write to both cache tiers (unless TTL = 0)
    pub(crate) async fn cached_call<T>(
        &self,
        method: &'static str,
        params: Value,
        ttl: Option<Duration>,
    ) -> Result<T, HeliusError>
    where
        T: DeserializeOwned,
    {
        let key = CacheKey::derive(method, &params);
        // method_ttls in config always take priority over the wrapper's hint
        // (allows tests and operators to force TTL=0 to disable caching).
        let ttl = if let Some(&override_ttl) = self.config.method_ttls.get(method) {
            override_ttl
        } else {
            ttl.unwrap_or_else(|| self.ttl_for(method))
        };

        // 1. Memory cache hit.
        if let Some(bytes) = self.mem_cache.get(key.as_str()) {
            return serde_json::from_slice(&bytes).map_err(HeliusError::Json);
        }

        // 2. Disk cache hit → promote to memory.
        if let Some(bytes) = self.disk_cache.get(&key).await? {
            if !ttl.is_zero() {
                self.mem_cache.set(key.as_str().to_string(), bytes.clone(), ttl);
            }
            return serde_json::from_slice(&bytes).map_err(HeliusError::Json);
        }

/// Single asset row from `getAssetsByOwner`. Schema mirrors
/// `GetAssetResponse` for now — Phase 3b adds the rest of DAS's
/// per-asset fields.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct Asset {
    pub id: String,
    #[serde(default)]
    pub content: Value,
    #[serde(default)]
    pub ownership: Value,
}

/// Minimal parsed-transaction shape from Helius's Enhanced
/// `parseTransactions` endpoint. Phase 3b expands to the full schema.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct EnrichedTransaction {
    pub signature: String,
    #[serde(default)]
    pub slot: u64,
    #[serde(default)]
    pub timestamp: i64,
    #[serde(default, rename = "type")]
    pub kind: String,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// What the memory cache stores. Carries both the response bytes and
/// the per-entry TTL so moka's [`Expiry`] impl can apply a per-method
/// TTL — the Architect-mandated "Disk records carry expiry" invariant
/// (spec 09 line 261-264) extended to the memory tier so the two
/// behave identically. Phase 2 reuses this shape for the disk record.
#[derive(Clone)]
struct CachedRecord {
    bytes: Arc<Bytes>,
    ttl: Duration,
}

/// `Expiry` impl that pulls the TTL from the inserted value itself.
/// Lets each `cached_call` choose its own TTL via the per-method
/// table without needing a separate cache per TTL bucket.
struct PerEntryTtl;

impl Expiry<CacheKey, CachedRecord> for PerEntryTtl {
    fn expire_after_create(
        &self,
        _key: &CacheKey,
        value: &CachedRecord,
        _created_at: Instant,
    ) -> Option<Duration> {
        Some(value.ttl)
    }
    fn expire_after_update(
        &self,
        _key: &CacheKey,
        value: &CachedRecord,
        _updated_at: Instant,
        _duration_until_expiry: Option<Duration>,
    ) -> Option<Duration> {
        Some(value.ttl)
    }
}

/// What `cached_call` publishes into the in-flight slot. Both arms are
/// `Clone` so multiple parked callers can each consume their copy.
#[derive(Clone)]
struct InflightOk {
    bytes: Arc<Bytes>,
}

type InflightFuture = Shared<BoxFuture<'static, Result<InflightOk, HeliusError>>>;

// ─── Client ─────────────────────────────────────────────────────────────────

/// Typed Helius client. Owns the HTTP/2 keep-alive pool, the in-memory
/// cache, the in-flight dedup table, and the upstream concurrency
/// semaphore. Cheap to clone (everything is `Arc`).
#[derive(Clone)]
pub struct HeliusClient {
    inner: Arc<HeliusInner>,
}

struct HeliusInner {
    http: reqwest::Client,
    api_key: Arc<str>,
    rpc_base: String,
    das_base: String,
    enhanced_base: String,
    interceptor: Option<Arc<dyn PaymentInterceptor>>,
    mem_cache: Cache<CacheKey, CachedRecord>,
    inflight: DashMap<CacheKey, InflightFuture>,
    semaphore: Arc<tokio::sync::Semaphore>,
    config: HeliusConfig,
}

impl HeliusClient {
    /// Construct with the given API key and config. The HTTP client is
    /// built with HTTP/2 adaptive window + 30s timeout, mirroring
    /// `ks_upstream::UpstreamClients::build`.
    pub fn with_api_key(api_key: impl Into<String>, config: HeliusConfig) -> Self {
        let http = reqwest::Client::builder()
            .http2_adaptive_window(true)
            .pool_max_idle_per_host(20)
            .timeout(Duration::from_secs(30))
            .build()
            .expect("reqwest client builder cannot fail with rustls + adaptive window");
        Self::with_http_client(http, api_key, config)
    }

    /// Fork this client with a different upstream API key.
    ///
    /// Shares the HTTP/2 pool, in-memory cache, semaphore, and config
    /// with the original — only `api_key` is swapped. Designed for a
    /// multi-tenant proxy that resolves the caller's vault-stored
    /// Helius key per request while keeping ONE warm cache across all
    /// users.
    ///
    /// Cache correctness: Helius RPC responses depend only on the JSON
    /// `method` + `params`, never on which API key called them, so
    /// sharing the mem_cache across forks is sound. The per-fork
    /// `inflight` table is fresh — single-flight dedup happens only
    /// within a fork's request stream, not across the proxy. For our
    /// use case this is the right tradeoff (cache hits are shared and
    /// free; concurrent misses for the same key+params from different
    /// users still trigger one upstream each — same as today).
    pub fn fork_with_api_key(&self, api_key: impl Into<String>) -> Self {
        let inner = HeliusInner {
            http: self.inner.http.clone(),
            api_key: Arc::from(api_key.into()),
            rpc_base: self.inner.rpc_base.clone(),
            das_base: self.inner.das_base.clone(),
            enhanced_base: self.inner.enhanced_base.clone(),
            interceptor: self.inner.interceptor.clone(),
            mem_cache: self.inner.mem_cache.clone(),
            inflight: DashMap::new(),
            semaphore: self.inner.semaphore.clone(),
            config: self.inner.config.clone(),
        };
        Self { inner: Arc::new(inner) }
    }

    /// Test/override constructor — accepts a pre-built `reqwest::Client`
    /// (so tests can disable connection pooling / shorten timeouts) and
    /// uses production base URLs. Tests typically follow up with
    /// [`Self::with_bases`] to point everything at a `wiremock::MockServer`.
    pub fn with_http_client(
        http: reqwest::Client,
        api_key: impl Into<String>,
        config: HeliusConfig,
    ) -> Self {
        let mem_cache: Cache<CacheKey, CachedRecord> = Cache::builder()
            .max_capacity(config.mem_cache_capacity)
            .expire_after(PerEntryTtl)
            .build();
        let semaphore = Arc::new(tokio::sync::Semaphore::new(
            config.max_concurrent_requests.max(1),
        ));
        let inner = HeliusInner {
            http,
            api_key: Arc::from(api_key.into()),
            rpc_base: HELIUS_RPC_BASE.to_string(),
            das_base: HELIUS_DAS_BASE.to_string(),
            enhanced_base: HELIUS_ENHANCED_BASE.to_string(),
            interceptor: None,
            mem_cache,
            inflight: DashMap::new(),
            semaphore,
            config,
        };
        Self { inner: Arc::new(inner) }
    }

    /// Override all three Helius sub-bases (RPC / DAS / Enhanced). Tests
    /// typically pass a single `MockServer::uri()` to point everything
    /// at one mock — the Helius client treats the three as separate
    /// strings to keep production routing flexible.
    pub fn with_bases(
        mut self,
        rpc: impl Into<String>,
        das: impl Into<String>,
        enhanced: impl Into<String>,
    ) -> Self {
        // Cheap clone of the Arc; we mutate in place because no one else
        // holds a reference yet (the public constructor returns the
        // first owner).
        let inner = Arc::get_mut(&mut self.inner).expect(
            "with_bases must be called before any clone of HeliusClient — \
             tests build then override before sharing",
        );
        inner.rpc_base = rpc.into();
        inner.das_base = das.into();
        inner.enhanced_base = enhanced.into();
        self
    }

    /// Wire in a payment interceptor (Phase 4). Phase 0/1 ships with
    /// `None`; this setter is a forward-compatibility hook so spec 10's
    /// embedded-wallet impl can plug in without breaking the public API.
    #[allow(dead_code)]
    pub fn with_interceptor(mut self, interceptor: Arc<dyn PaymentInterceptor>) -> Self {
        let inner = Arc::get_mut(&mut self.inner).expect(
            "with_interceptor must be called before any clone of HeliusClient",
        );
        inner.interceptor = Some(interceptor);
        self
    }

    /// Look up the TTL for `method`, falling back to
    /// [`HeliusConfig::default_ttl`].
    fn ttl_for(&self, method: &str) -> Duration {
        self.inner
            .config
            .method_ttls
            .get(method)
            .copied()
            .unwrap_or(self.inner.config.default_ttl)
    }

    // ─── Public typed wrappers ──────────────────────────────────────────────

    /// `getBalance(address)` — returns lamports.
    ///
    /// Spec 09 line 137: TTL=5s, RPC bucket. JSON-RPC params are a
    /// single-element array `[address]`.
    pub async fn get_balance(&self, addr: &str) -> Result<u64, HeliusError> {
        #[derive(Deserialize)]
        struct Resp {
            value: u64,
        }
        let resp: Resp = self
            .cached_call("getBalance", json!([addr]), None)
            .await?;
        Ok(resp.value)
    }

    /// `getAsset(id)` — DAS NFT / asset lookup. Spec 09 line 144:
    /// TTL=300s, DAS bucket.
    pub async fn get_asset(&self, id: &str) -> Result<GetAssetResponse, HeliusError> {
        self.cached_call("getAsset", json!({"id": id}), None).await
    }

    /// `getAssetsByOwner(owner, limit)` — paginated, returns the first
    /// page's `items`. Spec 09 line 168: TTL=30s, DAS bucket.
    pub async fn get_assets_by_owner(
        &self,
        owner: &str,
        limit: u32,
    ) -> Result<Vec<Asset>, HeliusError> {
        #[derive(Deserialize)]
        struct Resp {
            items: Vec<Asset>,
        }
        let resp: Resp = self
            .cached_call(
                "getAssetsByOwner",
                json!({"ownerAddress": owner, "page": 1, "limit": limit}),
                None,
            )
            .await?;
        Ok(resp.items)
    }

    /// `getPriorityFeeEstimate(accounts)` — returns microLamports.
    ///
    /// Spec 09 line 161: TTL=5s, RPC bucket. The Helius-specific
    /// surface accepts `{ accountKeys: [...] }` and replies with a
    /// `priorityFeeEstimate` field in microLamports.
    pub async fn get_priority_fee_estimate(
        &self,
        accounts: &[String],
    ) -> Result<u64, HeliusError> {
        #[derive(Deserialize)]
        struct Resp {
            #[serde(rename = "priorityFeeEstimate")]
            priority_fee_estimate: f64,
        }
        let resp: Resp = self
            .cached_call(
                "getPriorityFeeEstimate",
                json!([{"accountKeys": accounts, "options": {}}]),
                None,
            )
            .await?;
        Ok(resp.priority_fee_estimate as u64)
    }

    /// Helius Enhanced `parseTransactions(sigs)` — REST endpoint at
    /// `/v0/transactions`. Spec 09 line 160: TTL=86400s (parsed
    /// transactions are deterministic), Enhanced bucket.
    pub async fn parse_transactions(
        &self,
        sigs: &[String],
    ) -> Result<Vec<EnrichedTransaction>, HeliusError> {
        self.cached_call(
            "parseTransactions",
            json!({"transactions": sigs}),
            None,
        )
        .await
    }

    // ─── cached_call core ───────────────────────────────────────────────────

    /// Generic cached caller used by every typed wrapper. Per spec 09
    /// line 196-224 + the three Architect-mandated invariants in §"Cache
    /// architecture details":
    ///
    /// 1. **Memory hit** — sub-µs return.
    /// 2. **Single-flight** — the `inflight` table ensures concurrent
    ///    callers for the same key share ONE upstream fire.
    /// 3. **Miss** — fire to upstream, decode, write back into memory
    ///    (and disk in Phase 2).
    ///
    /// The `T: DeserializeOwned + Serialize + Clone + 'static` bounds
    /// match the spec's signature exactly. We cache the *raw response
    /// bytes* (after pycompat re-serialization, when we land Phase 2
    /// disk parity) rather than the typed value, so different callers
    /// can decode into different shapes from the same cache slot.
    pub async fn cached_call<T>(
        &self,
        method: &'static str,
        params: Value,
        ttl: Option<Duration>,
    ) -> Result<T, HeliusError>
    where
        T: serde::de::DeserializeOwned,
    {
        self.cached_call_with_state(method, params, ttl)
            .await
            .map(|(v, _)| v)
    }

    /// Same as [`cached_call`] but also returns whether the result came
    /// from the memory cache (`Hit`) or required an upstream fetch
    /// (`Miss`). Used by the proxy hot-path to set the `x-ks-cache`
    /// response header and to decide MPP charging.
    pub async fn cached_call_with_state<T>(
        &self,
        method: &'static str,
        params: Value,
        ttl: Option<Duration>,
    ) -> Result<(T, CacheState), HeliusError>
    where
        T: serde::de::DeserializeOwned,
    {
        let key = CacheKey::derive(method, &params);

        // 1. Memory cache hit — fastest path.
        if let Some(rec) = self.inner.mem_cache.get(&key).await {
            let v = serde_json::from_slice(&rec.bytes)?;
            return Ok((v, CacheState::Hit));
        }

        // 2. Single-flight (cache miss) — fire upstream or join an in-flight share.
        let bytes_arc = self.join_or_start_inflight(&key, method, params, ttl).await?;
        let v = serde_json::from_slice(&bytes_arc)?;
        Ok((v, CacheState::Miss))
    }

    /// Returns the cached bytes for `key`, either by joining an
    /// existing in-flight share or by starting a new fire. The hot
    /// path inserts the share into [`HeliusInner::inflight`] BEFORE
    /// awaiting it, so a second caller arriving while the upstream
    /// future is pending finds the slot and joins.
    async fn join_or_start_inflight(
        &self,
        key: &CacheKey,
        method: &'static str,
        params: Value,
        ttl: Option<Duration>,
    ) -> Result<Arc<Bytes>, HeliusError> {
        // First, try to register this caller as the leader of the
        // in-flight slot. The `entry().or_insert_with(...)` form gives
        // us atomic test-and-set semantics: we clone the already-
        // running `Shared<Future>` if one exists, or insert ours.
        let shared: InflightFuture = {
            let entry = self.inner.inflight.entry(key.clone()).or_insert_with(|| {
                let client = self.clone();
                let key2 = key.clone();
                let fut: BoxFuture<'static, Result<InflightOk, HeliusError>> = async move {
                    // Bound concurrency to upstream regardless of how
                    // many in-flight slots exist. The semaphore + the
                    // single-flight table compose: stampede dedup is
                    // free (one fire per key), AND we still cap total
                    // upstream calls during a thundering herd.
                    let _permit = client
                        .inner
                        .semaphore
                        .acquire()
                        .await
                        .map_err(|_| HeliusError::Backpressure)?;

                    let raw = client.fire(method, &params).await?;

                    // Cache write — memory tier only in Phase 1. Phase
                    // 2 adds disk write here. The TTL is stored
                    // alongside the bytes so moka's `Expiry` impl can
                    // expire each entry independently (see
                    // `PerEntryTtl`).
                    let ttl = ttl.unwrap_or_else(|| client.ttl_for(method));
                    let arc = Arc::new(raw);
                    if !ttl.is_zero() {
                        client
                            .inner
                            .mem_cache
                            .insert(
                                key2.clone(),
                                CachedRecord { bytes: arc.clone(), ttl },
                            )
                            .await;
                    }
                    Ok(InflightOk { bytes: arc })
                }
                .boxed();
                fut.shared()
            });
            entry.value().clone()
        };

        // Await the shared result. Only the first caller actually
        // drives the future; everyone else parks on `Shared`'s wake
        // list. When the future resolves, every parked caller gets a
        // clone of the result.
        let result = shared.await;

        // Cleanup: remove the slot once complete. We do this AFTER the
        // await so all in-flight callers see the same slot (otherwise
        // a second caller arriving just as the first finishes would
        // miss the dedup and re-fire). On success-or-failure both, the
        // memory cache (on success) is already populated, so a third
        // caller after this point hits the mem cache and skips the
        // table entirely.
        //
        // Race note: a `remove` is fine even if a concurrent caller
        // already inserted a NEW entry for the same key (e.g. we
        // resolved at exactly the moment a third caller arrived after
        // mem cache eviction). DashMap's `remove_if` would let us
        // guard against that, but the cost of a rare double-fire is a
        // single duplicate request — harmless.
        self.inner.inflight.remove(key);

        result.map(|ok| ok.bytes)
    }

    /// Single upstream fire. Builds the URL + body for the bucket the
    /// method belongs to and POSTs / GETs accordingly. Returns the raw
    /// JSON response bytes (just the `result` payload for RPC, or the
    /// full body for Enhanced REST).
    ///
    /// On HTTP 402, if a `PaymentInterceptor` is wired we await its
    /// `pay(envelope)` callback and retry the request exactly once with
    /// the returned proof attached as `X-Payment-Proof`. This is the
    /// Phase 4 hook that spec 09 left as a stub — the trait was already
    /// in place, it just wasn't called. With spec 10's `EmbeddedWallet`
    /// pluggable here, an agent gets transparent x402 retry; owner-tools
    /// callers without a wallet still get `HeliusError::PaymentRequired`.
    async fn fire(&self, method: &str, params: &Value) -> Result<Bytes, HeliusError> {
        match self.fire_once(method, params, None).await {
            Err(HeliusError::PaymentRequired(env)) => {
                let Some(interceptor) = self.inner.interceptor.as_ref() else {
                    return Err(HeliusError::PaymentRequired(env));
                };
                let proof = interceptor.pay(&env).await?;
                self.fire_once(method, params, Some(&proof)).await
            }
            other => other,
        }
    }

    async fn fire_once(
        &self,
        method: &str,
        params: &Value,
        proof: Option<&Value>,
    ) -> Result<Bytes, HeliusError> {
        let bucket = helius_bucket(method);
        match bucket {
            HeliusBucket::Rpc | HeliusBucket::Das => self.fire_rpc(method, params, proof).await,
            HeliusBucket::Enhanced => self.fire_enhanced(method, params, proof).await,
        }
    }

    /// JSON-RPC fire. Wraps params in the standard `{jsonrpc, id,
    /// method, params}` envelope and unwraps `result` from the
    /// response. 402 surfaces as `HeliusError::PaymentRequired`; non-
    /// 200 surfaces as `HeliusError::Upstream`.
    async fn fire_rpc(
        &self,
        method: &str,
        params: &Value,
        proof: Option<&Value>,
    ) -> Result<Bytes, HeliusError> {
        let bucket = helius_bucket(method);
        let base = match bucket {
            HeliusBucket::Rpc => &self.inner.rpc_base,
            HeliusBucket::Das => &self.inner.das_base,
            HeliusBucket::Enhanced => unreachable!("Enhanced uses fire_enhanced"),
        };
        let url = format!("{}/?api-key={}", base, &*self.inner.api_key);

        let envelope = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });
        let body = serde_json::to_vec(&envelope)?;
        let mut req = self
            .inner
            .http
            .post(&url)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body);
        if let Some(p) = proof {
            for (k, v) in proof_to_headers(p) {
                req = req.header(k, v);
            }
        }
        let resp = req.send().await?;

        let status = resp.status();
        let bytes = resp.bytes().await?;

        if status.as_u16() == 402 {
            // Decode the envelope so the caller can inspect it. If the
            // body isn't JSON, surface the raw text so the caller can
            // still log it.
            let env: Value = serde_json::from_slice(&bytes).unwrap_or_else(|_| {
                json!({"raw": String::from_utf8_lossy(&bytes).to_string()})
            });
            return Err(HeliusError::PaymentRequired(env));
        }
        if !status.is_success() {
            return Err(HeliusError::Upstream {
                status: status.as_u16(),
                body: String::from_utf8_lossy(&bytes).to_string(),
            });
        }

        // Unwrap `result`. JSON-RPC errors (`{"error": {...}}` with no
        // `result`) surface as `HeliusError::Upstream` carrying the
        // serialized error object. This mirrors api_router.py:192's
        // "no `result` field → never cache, propagate" behavior.
        let parsed: Value = serde_json::from_slice(&bytes)?;
        if let Some(result) = parsed.get("result") {
            let s = serde_json::to_vec(result)?;
            return Ok(Bytes::from(s));
        }
        let err_blob = parsed.get("error").cloned().unwrap_or(parsed);
        Err(HeliusError::Upstream {
            status: status.as_u16(),
            body: serde_json::to_string(&err_blob)?,
        })
    }

    /// Enhanced REST fire — POST to `/v0/transactions` with
    /// `{transactions: [...]}`. Today only `parseTransactions` uses
    /// this path; Phase 3b adds the rest of the Enhanced surface.
    async fn fire_enhanced(
        &self,
        method: &str,
        params: &Value,
        proof: Option<&Value>,
    ) -> Result<Bytes, HeliusError> {
        let path = match method {
            "parseTransactions" => "/v0/transactions",
            "getTransactions" => "/v0/addresses/-/transactions",
            "getTokenBalances" => "/v0/addresses/-/balances",
            other => {
                return Err(HeliusError::Upstream {
                    status: 0,
                    body: format!("unsupported Enhanced method: {other}"),
                });
            }
        };
        let url = format!(
            "{}{}?api-key={}",
            self.inner.enhanced_base, path, &*self.inner.api_key,
        );
        let body = serde_json::to_vec(params)?;
        let mut req = self
            .inner
            .http
            .post(&url)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body);
        if let Some(p) = proof {
            for (k, v) in proof_to_headers(p) {
                req = req.header(k, v);
            }
        }
        let resp = req.send().await?;
        let status = resp.status();
        let bytes = resp.bytes().await?;

        if status.as_u16() == 402 {
            let env: Value = serde_json::from_slice(&bytes).unwrap_or_else(|_| {
                json!({"raw": String::from_utf8_lossy(&bytes).to_string()})
            });
            return Err(HeliusError::PaymentRequired(env));
        }
        if !status.is_success() {
            return Err(HeliusError::Upstream {
                status: status.as_u16(),
                body: String::from_utf8_lossy(&bytes).to_string(),
            });
        }
        Ok(bytes)
    }

    // ─── Test helpers ───────────────────────────────────────────────────────

    /// Test helper — current memory cache size. Calls moka's
    /// `run_pending_tasks()` first so the count reflects the latest
    /// inserts (moka's `entry_count()` is approximate without it).
    #[doc(hidden)]
    pub async fn mem_cache_len(&self) -> u64 {
        self.inner.mem_cache.run_pending_tasks().await;
        self.inner.mem_cache.entry_count()
    }
}

/// Translate the JSON proof returned by [`PaymentInterceptor::pay`] into
/// HTTP headers that the upstream verifier expects. Two shapes accepted:
///
/// - `{"signature": "...", "network": "..."}` — canonical Coinbase x402
///   proof. Maps to `X-Payment-Proof` + `X-Payment-Network`.
/// - `{"<header>": "<value>", ...}` — opaque object; every string entry
///   becomes an `X-Payment-<key>` header. Lets bespoke interceptors
///   pass non-standard fields through without changing the trait.
///
/// Non-string values are skipped silently — if a future proof type
/// needs structured fields, encode them as JSON strings on the
/// interceptor side.
fn proof_to_headers(proof: &Value) -> Vec<(String, String)> {
    let mut out = Vec::new();
    if let Some(obj) = proof.as_object() {
        if let (Some(sig), Some(net)) = (
            obj.get("signature").and_then(|v| v.as_str()),
            obj.get("network").and_then(|v| v.as_str()),
        ) {
            out.push(("X-Payment-Proof".to_string(), sig.to_string()));
            out.push(("X-Payment-Network".to_string(), net.to_string()));
            return out;
        }
        for (k, v) in obj {
            if let Some(s) = v.as_str() {
                out.push((format!("X-Payment-{k}"), s.to_string()));
            }
        }
    }
    out
}

// Compile-time check that the public types are `Send + Sync`. Required
// because `HeliusClient` is shared across tokio tasks and the
// single-flight `Shared<Future>` slot needs `HeliusError: Clone +
// Send + Sync`. Loud failure here beats a confusing trait-bound
// error from one of the wrappers.
const _ASSERT_SEND_SYNC: fn() = || {
    fn t<T: Send + Sync>() {}
    t::<HeliusClient>();
    t::<HeliusError>();
    t::<HeliusConfig>();
};

#[cfg(test)]
mod fork_tests {
    use super::*;

    #[test]
    fn fork_with_api_key_swaps_key_and_keeps_state() {
        let base = HeliusClient::with_api_key("base-key", HeliusConfig::default());
        let fork = base.fork_with_api_key("forked-key");

        // Different api_key.
        assert_eq!(&*base.inner.api_key, "base-key");
        assert_eq!(&*fork.inner.api_key, "forked-key");

        // Shared semaphore — same Arc pointer.
        assert!(Arc::ptr_eq(&base.inner.semaphore, &fork.inner.semaphore));

        // Bases match.
        assert_eq!(base.inner.rpc_base, fork.inner.rpc_base);
        assert_eq!(base.inner.das_base, fork.inner.das_base);
    }

    #[test]
    fn fork_inherits_default_bases() {
        let base = HeliusClient::with_api_key("k", HeliusConfig::default());
        let fork = base.fork_with_api_key("k2");
        assert!(fork.inner.rpc_base.contains("mainnet"));
    }
}
