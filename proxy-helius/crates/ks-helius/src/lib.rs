//! `ks-helius` — typed Helius + Solana RPC client with two-tier cache and
//! x402 retry.
//!
//! Spec: `proxy-rs/specs/09-helius-client.md`
//! Scout pattern: `proxy-rs/ADR-005-helius-scout.md`
//!
//! # Quick start
//!
//! ```no_run
//! # async fn run() -> Result<(), ks_helius::HeliusError> {
//! let client = ks_helius::HeliusClient::from_env().await?;
//! let assets = client.get_assets_by_owner("9Wz...AWWM", 50).await?;
//! let bal    = client.get_balance("9Wz...AWWM").await?;
//! # Ok(())
//! # }
//! ```

pub mod cache;
pub mod error;
pub mod scout;
pub mod types;

pub use error::{HeliusError, HeliusResponse, X402Envelope};
pub use types::*;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tokio::sync::Semaphore;

use cache::{CacheKey, DiskCache};

// ─── In-memory cache: hand-rolled TtlCache<Bytes> (no moka dep) ─────────────
// Uses ks_cache::TtlCache which is already in the workspace.
use ks_cache::TtlCache;

// ─── Configuration ────────────────────────────────────────────────────────────

pub struct HeliusConfig {
    /// Max concurrent in-flight Helius requests.  Default 16.
    pub max_concurrent_requests: usize,
    /// Disk cache path. Default `$TMPDIR/keyshield/helius.redb`.
    pub disk_cache_path: PathBuf,
    /// Disk cache size budget in bytes. Default 500 MB.
    pub disk_cache_max_bytes: u64,
    /// Default TTL when a method has no specific entry.  Default 60 s.
    pub default_ttl: Duration,
    /// Per-method TTL overrides.
    pub method_ttls: HashMap<String, Duration>,
}

impl Default for HeliusConfig {
    fn default() -> Self {
        Self {
            max_concurrent_requests: 16,
            disk_cache_path: std::env::temp_dir()
                .join("keyshield")
                .join("helius.redb"),
            disk_cache_max_bytes: 500 * 1024 * 1024,
            default_ttl: Duration::from_secs(60),
            method_ttls: HashMap::new(),
        }
    }
}

// ─── EmbeddedWallet stub (spec 10 not written yet) ────────────────────────────

/// Stub wallet interface for x402 payment.
/// Real implementation will come in spec 10 (embedded wallet).
/// Set `wallet: None` to get `HeliusError::Unpaid` on 402.
pub trait EmbeddedWallet: Send + Sync {
    fn pay_x402(
        &self,
        env: &X402Envelope,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<String, String>> + Send + '_>,
    >;
}

// ─── HeliusClient ────────────────────────────────────────────────────────────

/// A Helius + Solana RPC client with:
/// - Two-tier cache (memory `TtlCache` + disk `redb`)
/// - Semaphore-bounded concurrency
/// - Optional x402 transparent retry
///
/// Clone is cheap — all fields are `Arc`-wrapped.
#[derive(Clone)]
pub struct HeliusClient {
    http:       Arc<reqwest::Client>,
    api_key:    Arc<str>,
    base_url:   Arc<str>,
    wallet:     Option<Arc<dyn EmbeddedWallet>>,
    mem_cache:  Arc<TtlCache<Bytes>>,
    disk_cache: Arc<DiskCache>,
    semaphore:  Arc<Semaphore>,
    config:     Arc<HeliusConfig>,
}

impl HeliusClient {
    /// Build from environment variable `HELIUS_API_KEY`.
    pub async fn from_env() -> Result<Self, HeliusError> {
        let api_key = std::env::var("HELIUS_API_KEY")
            .map_err(|_| HeliusError::Upstream {
                status: 0,
                body: "HELIUS_API_KEY not set".into(),
            })?;
        Self::new(api_key, HeliusConfig::default(), None).await
    }

    /// Build with explicit config and optional wallet.
    pub async fn new(
        api_key: impl Into<Arc<str>>,
        config: HeliusConfig,
        wallet: Option<Arc<dyn EmbeddedWallet>>,
    ) -> Result<Self, HeliusError> {
        let disk_cache = DiskCache::open(
            config.disk_cache_path.clone(),
            config.disk_cache_max_bytes,
        )?;
        let max_conc = config.max_concurrent_requests;
        Ok(Self {
            http: Arc::new(
                reqwest::Client::builder()
                    .http2_prior_knowledge()
                    .build()
                    .map_err(HeliusError::Http)?,
            ),
            api_key: api_key.into(),
            base_url: "https://mainnet.helius-rpc.com".into(),
            wallet,
            mem_cache: Arc::new(TtlCache::new()),
            disk_cache: Arc::new(disk_cache),
            semaphore: Arc::new(Semaphore::new(max_conc)),
            config: Arc::new(config),
        })
    }

    /// Build with a custom base URL (useful for tests / devnet).
    pub fn with_base_url(mut self, url: impl Into<Arc<str>>) -> Self {
        self.base_url = url.into();
        self
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

        // 3. Cache miss — acquire semaphore slot before hitting upstream.
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|_| HeliusError::Backpressure)?;

        let raw = match self.fire(method, &params).await? {
            HeliusResponse::Ok(b) => b,

            // 4. x402 retry (max 1 attempt).
            HeliusResponse::PaymentRequired(env) => {
                let wallet = self.wallet.as_ref().ok_or(HeliusError::Unpaid)?;
                let proof = wallet
                    .pay_x402(&env)
                    .await
                    .map_err(HeliusError::Payment)?;
                self.fire_with_proof(method, &params, &proof)
                    .await?
                    .into_ok()?
            }
        };

        // 5. Cache write — both tiers (skip for writes, TTL = 0).
        if !ttl.is_zero() {
            self.mem_cache
                .set(key.as_str().to_string(), raw.clone(), ttl);
            self.disk_cache.put(&key, raw.clone(), ttl).await?;
        }

        serde_json::from_slice(&raw).map_err(HeliusError::Json)
    }

    // ─── HTTP fire helpers ────────────────────────────────────────────────────

    pub(crate) async fn fire(
        &self,
        method: &str,
        params: &Value,
    ) -> Result<HeliusResponse, HeliusError> {
        self.fire_inner(method, params, None).await
    }

    pub(crate) async fn fire_with_proof(
        &self,
        method: &str,
        params: &Value,
        proof: &str,
    ) -> Result<HeliusResponse, HeliusError> {
        self.fire_inner(method, params, Some(proof)).await
    }

    async fn fire_inner(
        &self,
        method: &str,
        params: &Value,
        payment_proof: Option<&str>,
    ) -> Result<HeliusResponse, HeliusError> {
        let url = format!("{}/?api-key={}", self.base_url, self.api_key);
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });

        let mut req = self.http.post(&url).json(&body);
        if let Some(proof) = payment_proof {
            req = req.header("X-Payment-Proof", proof);
        }

        let resp = req.send().await?;
        let status = resp.status().as_u16();

        if status == 402 {
            // Parse x402 envelope from body if possible.
            let body_bytes = resp.bytes().await.unwrap_or_default();
            let envelope = parse_x402_envelope(&body_bytes);
            return Ok(HeliusResponse::PaymentRequired(envelope));
        }

        if !resp.status().is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            return Err(HeliusError::Upstream {
                status,
                body: body_text,
            });
        }

        // Unwrap `result` from the JSON-RPC envelope.
        let raw = resp.bytes().await?;
        let result_bytes = extract_rpc_result(&raw)?;
        Ok(HeliusResponse::Ok(result_bytes))
    }

    // ─── TTL resolution ─────────────────────────────────────────────────────

    fn ttl_for(&self, method: &str) -> Duration {
        if let Some(t) = self.config.method_ttls.get(method) {
            return *t;
        }
        // Fall back to ks_cache's policy table (spec 03 / spec 09).
        ks_cache::helius_method_ttl(method)
            .unwrap_or(self.config.default_ttl)
    }
}

// ─── JSON-RPC envelope unwrapper ────────────────────────────────────────────

/// Extract the `result` field from a JSON-RPC 2.0 response body.
/// Returns the bytes of just the result value (serialized back to JSON).
fn extract_rpc_result(raw: &Bytes) -> Result<Bytes, HeliusError> {
    let envelope: Value = serde_json::from_slice(raw)?;

    if let Some(err) = envelope.get("error") {
        return Err(HeliusError::Upstream {
            status: 200,
            body: err.to_string(),
        });
    }

    let result = envelope
        .get("result")
        .ok_or_else(|| HeliusError::Upstream {
            status: 200,
            body: "missing 'result' in JSON-RPC response".into(),
        })?;

    let serialized = serde_json::to_vec(result)?;
    Ok(Bytes::from(serialized))
}

fn parse_x402_envelope(body: &Bytes) -> X402Envelope {
    // Best-effort: parse known fields, fall back to defaults.
    let v: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    X402Envelope {
        required_amount_usdc: v
            .get("required_amount_usdc")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        payment_address: v
            .get("payment_address")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        memo: v
            .get("memo")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
    }
}

// ─── Typed wrappers — Phase 1 (5 methods) ────────────────────────────────────

impl HeliusClient {
    /// `getBalance(pubkey)` → lamports. TTL 5 s.
    pub async fn get_balance(&self, address: &str) -> Result<u64, HeliusError> {
        #[derive(serde::Deserialize)]
        struct Resp {
            value: u64,
        }
        let r: Resp = self
            .cached_call(
                "getBalance",
                json!([address, {"commitment": "confirmed"}]),
                Some(Duration::from_secs(5)),
            )
            .await?;
        Ok(r.value)
    }

    /// `getAsset(id)` → `Asset`. TTL 300 s.
    pub async fn get_asset(&self, asset_id: &str) -> Result<Asset, HeliusError> {
        self.cached_call(
            "getAsset",
            json!({"id": asset_id, "displayOptions": {"showFungible": true}}),
            None, // picks up 300 s from ks_cache::helius_method_ttl
        )
        .await
    }

    /// `getAssetsByOwner(owner, limit)` → `Vec<Asset>`. TTL 30 s.
    ///
    /// For whale wallets (>500 items) prefer `get_assets_by_owner_paged`
    /// which implements the Scout pattern (ADR-005).
    pub async fn get_assets_by_owner(
        &self,
        owner: &str,
        limit: u32,
    ) -> Result<Vec<Asset>, HeliusError> {
        let r: GetAssetsByOwnerResponse = self
            .cached_call(
                "getAssetsByOwner",
                json!({"ownerAddress": owner, "page": 1, "limit": limit}),
                None,
            )
            .await?;
        Ok(r.items)
    }

    /// `getPriorityFeeEstimate(accounts)` → `PriorityFeeEstimate`. TTL 5 s.
    pub async fn get_priority_fee_estimate(
        &self,
        account_keys: &[&str],
    ) -> Result<PriorityFeeEstimate, HeliusError> {
        self.cached_call(
            "getPriorityFeeEstimate",
            json!([{
                "accountKeys": account_keys,
                "options": {"recommended": true, "includeAllPriorityFeeLevels": true}
            }]),
            Some(Duration::from_secs(5)),
        )
        .await
    }

    /// `getTransactionsForAddress(address, opts)` → `Vec<EnrichedTransaction>`.
    /// TTL 30 s.
    ///
    /// Uses the Helius Enhanced Transactions API, not raw RPC.
    /// URL path differs: `{base}/v0/addresses/{address}/transactions`.
    pub async fn get_transactions_for_address(
        &self,
        address: &str,
        limit: u32,
    ) -> Result<Vec<EnrichedTransaction>, HeliusError> {
        // gTFA uses a REST endpoint, not JSON-RPC — fire directly.
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|_| HeliusError::Backpressure)?;

        let key = CacheKey::derive(
            "getTransactionsForAddress",
            &json!({"address": address, "limit": limit}),
        );
        let ttl = Duration::from_secs(30);

        if let Some(bytes) = self.mem_cache.get(key.as_str()) {
            return serde_json::from_slice(&bytes).map_err(HeliusError::Json);
        }
        if let Some(bytes) = self.disk_cache.get(&key).await? {
            self.mem_cache.set(key.as_str().to_string(), bytes.clone(), ttl);
            return serde_json::from_slice(&bytes).map_err(HeliusError::Json);
        }

        // Enhanced API base differs from RPC base.
        let enhanced_base = self
            .base_url
            .replace("mainnet.helius-rpc.com", "api.helius.xyz");
        let url = format!(
            "{}/v0/addresses/{}/transactions?api-key={}&limit={}",
            enhanced_base, address, self.api_key, limit
        );

        let resp = self.http.get(&url).send().await?;
        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(HeliusError::Upstream { status, body });
        }
        let raw = resp.bytes().await?;

        self.mem_cache.set(key.as_str().to_string(), raw.clone(), ttl);
        self.disk_cache.put(&key, raw.clone(), ttl).await?;

        serde_json::from_slice(&raw).map_err(HeliusError::Json)
    }

    /// `getSignaturesForAddress(address, limit)` → `Vec<ConfirmedSignatureInfo>`.
    /// TTL 30 s. Used as the "scout" phase for gTFA.
    pub async fn get_signatures_for_address(
        &self,
        address: &str,
        limit: u32,
    ) -> Result<Vec<ConfirmedSignatureInfo>, HeliusError> {
        self.cached_call(
            "getSignaturesForAddress",
            json!([address, {"limit": limit, "commitment": "confirmed"}]),
            Some(Duration::from_secs(30)),
        )
        .await
    }

    /// `getLatestBlockhash()` → `Blockhash`. TTL 2 s (fast-changing).
    pub async fn get_latest_blockhash(&self) -> Result<Blockhash, HeliusError> {
        #[derive(serde::Deserialize)]
        struct Resp {
            value: Blockhash,
        }
        let r: Resp = self
            .cached_call(
                "getLatestBlockhash",
                json!([{"commitment": "confirmed"}]),
                Some(Duration::from_secs(2)),
            )
            .await?;
        Ok(r.value)
    }

    /// `getTokenAccountBalance(pubkey)` → `TokenAmount`. TTL 5 s.
    pub async fn get_token_account_balance(
        &self,
        pubkey: &str,
    ) -> Result<TokenAmount, HeliusError> {
        #[derive(serde::Deserialize)]
        struct Resp {
            value: TokenAmount,
        }
        let r: Resp = self
            .cached_call(
                "getTokenAccountBalance",
                json!([pubkey]),
                Some(Duration::from_secs(5)),
            )
            .await?;
        Ok(r.value)
    }
}
