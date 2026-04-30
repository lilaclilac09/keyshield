# 09 — HeliusClient: full-coverage Solana RPC + DAS + Helius extensions

> Status: spec only. Not implemented. Promotes ks-upstream's existing
> Helius support into a standalone, typed, two-tier-cached, x402-paying
> client.

## What user does (anchor on use cases)

### Use case A — Owner-Tools developer

A developer building their own KeyShield-backed agent wants:

```rust
let helius = HeliusClient::from_env().await?;
let assets = helius.get_assets_by_owner("9Wz...AWWM", 50).await?;  // typed Vec<Asset>
let txs    = helius.get_full_transactions(addr, opts).await?;       // typed Vec<EnrichedTransaction>
let fee    = helius.get_priority_fee_estimate(&accounts).await?;    // typed PriorityFeeEstimate
```

Today they get raw `bytes::Bytes` from `ks-upstream::call_helius_rpc` and
parse JSON themselves. The differential: ergonomics + correctness (typed
returns) + offline fallback (disk cache).

### Use case B — Agent in the field paying-as-it-goes

An agent issues `helius.get_assets_by_owner(...)` and the call returns
402 Payment Required. The client transparently:

1. Decodes the x402 envelope
2. Calls Solana program's `pay_x402` instruction signed by the agent's
   `EphemeralSigner` (per ROADMAP §6a) to debit USDC from the
   `PaymentStream` PDA
3. Retries with `X-Payment-Proof: <tx_sig>`
4. Returns the upstream result

The agent code looks identical whether the call is paid or free.

### Use case C — Long-running indexer

A bot that scrapes wallet history every minute. Hot data (recent txs)
should hit memory cache. Cold data (year-old txs) should hit disk cache
without a re-fetch. Fully offline rebuild possible if Helius is down.

## Where it lives

| Layer | What runs here |
|---|---|
| Frontend (`frontend/`) | none — server-side or agent-side only |
| Rust (`proxy-rs/crates/ks-helius`) | new crate. Owns typed wrappers + cache + x402 retry |
| Rust (`proxy-rs/crates/ks-upstream`) | existing `call_helius_rpc` becomes one consumer of `ks-helius`; keeps current bytes-level interface for fallthrough |
| Rust (`proxy-rs/crates/ks-cache`) | gains `DiskCache` trait wrapping redb; existing `TtlCache` keeps its in-memory semantics |
| Python (`v2-mvp/`) | `/agents/{id}/wallet/*` endpoints needed for x402-with-EphemeralSigner (per spec 10 — embedded wallet) |
| On-chain (`programs/keyshield/`) | `pay_x402` instruction (depends on ROADMAP §6a embedded-wallet work) |

**Dependency:** spec 10 (embedded wallet, not yet written) is a
prerequisite for use case B. Use cases A and C work without it; spec
delivers them first.

## Wire shape — public Rust API

```rust
// proxy-rs/crates/ks-helius/src/lib.rs
#[derive(Clone)]
pub struct HeliusClient {
    inner:      Arc<reqwest::Client>,        // HTTP/2 prebuilt, like ks-upstream
    api_key:    Arc<str>,                    // fetched from vault at construction
    wallet:     Option<Arc<EmbeddedWallet>>, // None = no x402 retry; Some = retry
    mem_cache:  Arc<moka::future::Cache<CacheKey, Arc<Bytes>>>,
    disk_cache: Arc<DiskCache>,              // redb-backed
    semaphore:  Arc<tokio::sync::Semaphore>, // bound concurrency to upstream
    config:     HeliusConfig,
}

pub struct HeliusConfig {
    pub max_concurrent_requests: usize,       // default 16
    pub mem_cache_capacity:      u64,         // default 10_000 entries
    pub disk_cache_path:         PathBuf,     // default $XDG_CACHE_HOME/keyshield/helius.redb
    pub disk_cache_max_bytes:    u64,         // default 500 MB
    pub default_ttl:             Duration,    // default 60s
    pub method_ttls:              HashMap<String, Duration>, // override per method
}
```

### Method coverage matrix

| Bucket | Method | Return type | Default TTL | Notes |
|---|---|---|---|---|
| **Solana RPC core (~30 methods)** | | | | |
| | `getAccountInfo` | `Account` | 5s | |
| | `getBalance` | `u64` (lamports) | 5s | |
| | `getTokenAccountBalance` | `TokenAmount` | 5s | |
| | `getMultipleAccounts` | `Vec<Option<Account>>` | 5s | |
| | `getProgramAccounts` | `Vec<KeyedAccount>` | 30s | filterable |
| | `getBlock` | `Block` | 600s | finalized, immutable |
| | `getBlockHeight` / `getSlot` | `u64` | 1s | |
| | `getTransaction` | `EncodedTransaction` | 60s | finalized, immutable |
| | `getSignaturesForAddress` | `Vec<ConfirmedSignatureInfo>` | 30s | |
| | `getSignatureStatuses` | `Vec<Option<TransactionStatus>>` | 5s | |
| | `getTokenSupply` | `TokenAmount` | 60s | |
| | `getEpochInfo` / `getInflation` / `getVoteAccounts` | typed | 60s | |
| | `getRecentBlockhash` / `getLatestBlockhash` | `Blockhash` | 1s | |
| **Helius exclusive** | | | | |
| | `getTransactionsForAddress` (gTFA) | `Vec<EnrichedTransaction>` | 30s | filter by time/slot/status; cursor pagination |
| | Enhanced `parseTransactions(sigs)` | `Vec<EnrichedTransaction>` | 86400s | parsed, deterministic |
| | `getPriorityFeeEstimate(accounts)` | `PriorityFeeEstimate` | 5s | |
| | Sender: `sendSmartTransaction(tx, opts)` | `Signature` | **never cache** | |
| | Wallet API: `getWalletPortfolio(addr)` | `WalletPortfolio` | 30s | beta |
| **DAS** | | | | |
| | `getAsset` | `GetAssetResponse` | 300s | |
| | `getAssetBatch(ids)` | `Vec<GetAssetResponse>` | 300s | |
| | `getAssetProof` / `getAssetProofBatch` | `MerkleProof` | 86400s | merkle, immutable |
| | `getAssetsByOwner(owner)` | paginated `Vec<Asset>` | 30s | |
| | `getAssetsByCreator` / `getAssetsByAuthority` / `getAssetsByGroup` | paginated `Vec<Asset>` | 60s | |
| | `searchAssets(query)` | paginated `Vec<Asset>` | 30s | |
| | `getSignaturesForAsset(id)` | paginated `Vec<Signature>` | 86400s | history, immutable |
| | `getNativeBalance(addr)` | `u64` | 5s | |
| | `getPriceInfoForFungibleAssets(ids)` | `Vec<PriceInfo>` | 60s | |
| **Streaming / advanced** (later phases) | | | | |
| | LaserStream gRPC | `Stream<Update>` | n/a | live, no caching |
| | Webhooks CRUD | typed | n/a | management only |
| | ZK Compression methods | typed | varies | per Helius docs |

**Writes (never cache):** any `send*Transaction`, `simulate*Transaction`,
all webhook mutations.

### The `cached_call` shape

```rust
impl HeliusClient {
    /// Generic cached + x402-aware caller used by every typed wrapper.
    pub(crate) async fn cached_call<T>(
        &self,
        method: &'static str,
        params: serde_json::Value,
        ttl: Option<Duration>,                    // None = use config default
    ) -> Result<T, HeliusError>
    where
        T: DeserializeOwned + Serialize + Clone + Send + Sync + 'static,
    {
        let key = CacheKey::derive(method, &params);

        // 1. Memory cache hit — fastest path.
        if let Some(bytes) = self.mem_cache.get(&key).await {
            return serde_json::from_slice(&bytes).map_err(Into::into);
        }
        // 2. Disk cache hit — promote to memory.
        if let Some(bytes) = self.disk_cache.get(&key).await? {
            let arc = Arc::new(bytes.clone());
            self.mem_cache.insert(key.clone(), arc).await;
            return serde_json::from_slice(&bytes).map_err(Into::into);
        }
        // 3. Cache miss — fire to upstream with semaphore bound.
        let _permit = self.semaphore.acquire().await?;
        let raw = self.fire(method, &params).await?;

        // 4. x402 retry loop (max 1 retry).
        let raw = match raw {
            HeliusResponse::Ok(b) => b,
            HeliusResponse::PaymentRequired(env) => {
                let wallet = self.wallet.as_ref().ok_or(HeliusError::Unpaid)?;
                let proof  = wallet.pay_x402(&env).await?;
                self.fire_with_proof(method, &params, &proof).await?.into_ok()?
            }
        };

        // 5. Cache write — both tiers.
        let ttl = ttl.unwrap_or_else(|| self.ttl_for(method));
        if !ttl.is_zero() {
            let arc = Arc::new(raw.clone());
            self.mem_cache.insert(key.clone(), arc).await;
            self.disk_cache.put(key, raw.clone(), ttl).await?;
        }

        serde_json::from_slice(&raw).map_err(Into::into)
    }
}
```

### Typed wrapper example

```rust
impl HeliusClient {
    pub async fn get_assets_by_owner(
        &self,
        owner: &str,
        limit: u32,
    ) -> Result<Vec<Asset>, HeliusError> {
        #[derive(Deserialize)]
        struct Resp { items: Vec<Asset> }
        let resp: Resp = self.cached_call(
            "getAssetsByOwner",
            json!({"ownerAddress": owner, "page": 1, "limit": limit}),
            None,
        ).await?;
        Ok(resp.items)
    }
}
```

## Cache architecture details

### Two tiers, tagged

- **memory** = `moka::future::Cache<CacheKey, Arc<Bytes>>`. Bounded by
  entry count (10k default). LRU eviction. Sub-µs lookups.
- **disk** = `redb` (single-file embedded KV). Bounded by total bytes.
  Eviction policy: write a `last_accessed: Instant` alongside the value;
  on `put`, if total > `disk_cache_max_bytes`, evict in LRU order until
  under budget.

### Key derivation

```rust
struct CacheKey(String);  // "helius:{method}:{sha1_of_params}"

impl CacheKey {
    fn derive(method: &str, params: &serde_json::Value) -> Self {
        // Reuse ks_cache::pycompat::cache_key for byte parity with Python
        // — same upstream JSON canonicalization.
        Self(ks_cache::pycompat::cache_key("helius", method, params))
    }
}
```

This **explicitly reuses the existing `pycompat` helper** (spec 08).
Don't re-invent JSON canonicalization.

### TTL policy

Three categories:

1. **Immutable** (finalized blocks, finalized txs, asset proofs, signature
   history) — TTL 24h–7d. Cache aggressively to disk; memory eviction
   doesn't lose them.
2. **Slow-changing** (NFT metadata `getAsset`, holdings `getAssetsByOwner`,
   priority fee) — TTL 30s–5min. Memory + disk both meaningful.
3. **Fast-changing** (balance, slot, latestBlockhash) — TTL 1–5s. Memory
   cache only; disk cache turns off via `ttl=0` for these.

Per-method overrides via `HeliusConfig.method_ttls`.

## x402 integration

Depends on **spec 10 (embedded wallet)** which is not yet written. Brief
shape:

```rust
pub struct EmbeddedWallet {
    /// EphemeralSigner pubkey owned by the agent (per ROADMAP §6a).
    signer_pubkey: Pubkey,
    /// Solana RPC (recursively, this might be a HeliusClient too — careful with cycles).
    rpc: Arc<dyn SolanaRpc>,
    /// Signer for the EphemeralSigner. Lives in agent's secure storage.
    signer_kp: Arc<dyn EphemeralSignerProvider>,
}

impl EmbeddedWallet {
    pub async fn pay_x402(&self, env: &X402Envelope) -> Result<PaymentProof, WalletError> {
        // Build pay_x402 instruction targeting program. Sign with EphemeralSigner.
        // Submit. Return the tx signature as proof.
    }
}
```

The HeliusClient takes `Option<Arc<EmbeddedWallet>>` so it works with
or without x402 capability. Owner-tools mode = `None` (any 402 surfaces
as `HeliusError::Unpaid`); agent mode = `Some(wallet)` (transparent
retry).

## Error model

```rust
#[derive(thiserror::Error, Debug)]
pub enum HeliusError {
    #[error("upstream http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("upstream returned {status}: {body}")]
    Upstream { status: u16, body: String },
    #[error("payment required and no wallet configured")]
    Unpaid,
    #[error("x402 payment failed: {0}")]
    Payment(#[source] WalletError),
    #[error("json decode: {0}")]
    Json(#[from] serde_json::Error),
    #[error("disk cache: {0}")]
    Disk(#[from] redb::Error),
    #[error("over concurrency budget")]
    Backpressure,
}
```

## Test plan

### Unit (no network)

- `cached_call` mem hit returns without firing
- `cached_call` disk hit promotes to mem
- `cached_call` miss → fire → cache both
- 402 + no wallet → `HeliusError::Unpaid`
- 402 + wallet → wallet called once, retry → cache result
- TTL=0 method (write) skips cache write
- Concurrent `getBalance(same_addr)` requests → single in-flight to upstream

### Integration (wiremock)

- Mock 7 representative methods; verify outgoing URL/method/headers/body
- Re-call same method twice → 1 mock hit (not 2)
- After TTL expires → 2 mock hits

### Oracle parity (if Python adds equivalent)

- For overlapping methods that Python's api_router already serves,
  both must produce byte-identical bodies (use existing `pycompat`).

## Implementation phases

Decoupled so engineers can land slices independently:

| Phase | Slice | Engineer-days | Depends on |
|---|---|---|---|
| 0 | New crate scaffolding (`ks-helius` deps, `HeliusConfig`, error enum) | 0.5 | none |
| 1 | `cached_call` with mem-only cache + 5 methods (gTFA, getAsset, getAssetsByOwner, getBalance, getPriorityFeeEstimate) typed | 2 | 0 |
| 2 | `DiskCache` trait + redb backend + TTL eviction + tier promotion | 1.5 | 0 |
| 3 | Remaining ~45 methods via codegen or hand-rolled wrappers | 3 | 1 |
| 4 | x402 integration | 1 | spec 10 (not written) |
| 5 | Streaming methods (LaserStream gRPC) | 2 | 0 |
| 6 | PyO3 bindings | 2 | 1, 3 |
| 7 | CLI commands | 1 | 6 |

**Total:** ~13 engineer-days. Realistic 2-3 weeks calendar with
review/iteration.

## Out of scope for this spec

- The on-chain `pay_x402` instruction implementation (Solana program work)
- The Python-side `/agents/{id}/wallet/*` endpoints (control-plane work)
- Both belong in spec 10 (embedded wallet)

## Acceptance criteria

For phase 1 (smallest shippable):

1. `cargo check -p ks-helius` clean
2. `cargo test -p ks-helius` green with ≥10 unit tests covering the 5
   typed wrappers
3. wiremock integration test confirms outgoing URL/headers match
   Helius's documented contract for each of the 5 methods
4. README example compiles + runs against live Helius given a valid
   `HELIUS_API_KEY` env (manual verification, not in CI)

## Open questions

- **Is `ks-helius` a separate crate or grows inside `ks-upstream`?**
  Recommendation: separate crate. ks-upstream stays focused on byte-level
  HTTP/2 forwarding (no typed parsing). ks-helius takes types + caching
  + x402 as its responsibility. They compose: ks-upstream can call
  ks-helius for typed analysis if needed.

- **moka vs hand-rolled `Mutex<HashMap>`?** moka brings 1 extra dep but
  gives us TTL + size-based eviction + async-safe. Hand-rolled gets us
  fewer deps but reimplements LRU. **Recommend moka.**

- **redb vs sled vs sqlite for disk cache?** All three would work.
  redb: pure-Rust, single file, good concurrency. sled: feature-rich,
  larger. sqlite: maxes ecosystem. **Recommend redb** (smallest dep,
  no FFI, atomic single-file backups).
