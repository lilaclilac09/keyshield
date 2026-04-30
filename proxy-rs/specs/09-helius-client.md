# 09 — HeliusClient: full-coverage Solana RPC + DAS + Helius extensions

> **Status: spec v2** — amended after Architect review (2026-04-30).
> Use case B (transparent x402 retry) and Phase 4 (x402 integration)
> have been **removed from this spec** because they depend on a
> non-existent spec 10 and on-chain `pay_x402` instruction that hasn't
> been written. They are tracked in `proxy-rs/specs/10-embedded-wallet-stub.md`
> and become a Stage-2 deliverable. v1 spec lives in git history.

> Promotes ks-upstream's existing Helius support into a standalone,
> typed, two-tier-cached client. Payment integration is a future
> extension via the `PaymentInterceptor` trait (see "Future extension
> point" below).

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

### Use case B — REMOVED in v2

Was: "transparent x402 retry via EphemeralSigner". Architect veto: the
on-chain `pay_x402` instruction, the `EmbeddedWallet` API, the
`EphemeralSigner` provider trait, the `X402Envelope` wire format, and
the Python `/agents/{id}/wallet/*` endpoints are ALL not yet
implemented. ROADMAP §6a marks embedded wallet as P3. Shipping this
spec with Use case B in it would repeat the `/mpp/streams/*` antipattern
(frontend UI for a backend that doesn't exist).

**Tracked instead in:** `proxy-rs/specs/10-embedded-wallet-stub.md`
(stub) — must be promoted to a full spec before Phase 4 starts.

The HeliusClient v2 ships **without** payment retry. If a 402 hits,
caller gets `HeliusError::PaymentRequired(envelope)` and decides what
to do. Phase 4 future work will add a `PaymentInterceptor` trait that
wraps that error → retry path.

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
    inner:        Arc<reqwest::Client>,        // HTTP/2 prebuilt, like ks-upstream
    api_key:      Arc<str>,                    // passed in by caller, NOT vault-fetched
    interceptor:  Option<Arc<dyn PaymentInterceptor>>, // future Phase 4 extension; None today
    mem_cache:    Arc<moka::future::Cache<CacheKey, Arc<Bytes>>>,
    disk_cache:   Arc<DiskCache>,              // redb-backed
    inflight:     Arc<dashmap::DashMap<CacheKey, Shared<...>>>, // single-flight dedup
    semaphore:    Arc<tokio::sync::Semaphore>, // bound concurrency to upstream
    config:       HeliusConfig,
}

/// Future extension: lets a caller intercept HTTP 402 and retry with a
/// payment proof. v2 ships with `interceptor: None`; Phase 4 (Stage 2)
/// implements the `EmbeddedWallet` against this trait when spec 10 is
/// promoted to full status.
pub trait PaymentInterceptor: Send + Sync {
    /// Called on 402. Return Ok(proof) to retry, Err to surface to caller.
    async fn pay(&self, envelope: &serde_json::Value) -> Result<PaymentProof, PaymentError>;
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

> **Architect-flagged corrections (must verify before Phase 3):**
>
> 1. `getTransactionsForAddress` (gTFA) is likely the wrong name —
>    Helius's address-history Enhanced endpoint is REST-style
>    `GET /v0/addresses/{addr}/transactions`, not JSON-RPC. Spec must
>    be specific about which surface (RPC method vs REST path).
> 2. `getWalletPortfolio` may not exist as a single method; verify
>    against current Helius docs.
> 3. `getPriceInfoForFungibleAssets` may be a sub-field of
>    `getAsset.token_info`, not a top-level method.
>
> **Methods spec missed but ks-upstream/api_router already routes:**
> `getTokenAccounts` (DAS), `getNftEditions` (DAS), `getTokenBalances`
> (Enhanced), `getTokenAccountsByOwner`, `getBlockTime`. Add to matrix.
>
> **Core Solana RPC the spec missed:** `requestAirdrop`,
> `getMinimumBalanceForRentExemption`, `getFeeForMessage`,
> `getRecentPrioritizationFees`, `isBlockhashValid`,
> `getTokenLargestAccounts`, `getTokenAccountsByDelegate`,
> `getStakeActivation`, `getValidatorList`, `getInflationReward`.
>
> **WS subscriptions ENTIRELY MISSING from v2:** `accountSubscribe`,
> `signatureSubscribe`, `programSubscribe`, `slotSubscribe`,
> `logsSubscribe`. Spec 09 v2 explicitly leaves WebSocket subscriptions
> out of scope; tracked as Phase 5b separate effort.
>
> **Real method count once verified is 70-90**, not 50. Phase 3
> precondition: produce an enumerated list audited against
> https://docs.helius.dev (commit it as `proxy-rs/specs/09-method-list.md`).

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

### Three invariants (Architect-mandated)

1. **Single-flight on misses.** Concurrent callers for the same
   `CacheKey` → ONE upstream fire, all callers await the same
   `Shared<Future>`. Implementation: `moka::try_get_with` OR
   `DashMap<CacheKey, Shared<...>>` keyed lookup with cleanup on
   future completion. Phase 1 acceptance includes a 50-concurrent
   stampede test with assert(upstream_calls == 1).

2. **Disk records carry expiry, not just LRU `last_accessed`.** Every
   `DiskCache::put(key, bytes, ttl)` stores `(bytes, inserted_at,
   expires_at)`. `DiskCache::get(key)` filters by
   `now() < expires_at` BEFORE returning. Tier promotion on disk hit
   ALSO checks expiry — a stale-on-disk entry must NOT resurrect into
   memory. Mirrors Python `api_router.py:135-141` semantics.

3. **redb corruption recovery.** On startup, if `redb::Database::open`
   fails with `Corrupted` or `IoError`, rotate to
   `helius.redb.corrupt-{ts}`, log warn, start fresh. Add a
   `cache_corrupted_recoveries_total` counter for ops visibility. Add
   CI test that injects bad bytes and asserts startup succeeds.

### Two tiers, tagged

- **memory** = `moka::future::Cache<CacheKey, Arc<Bytes>>`. Bounded by
  entry count (10k default). LRU eviction. Sub-µs lookups.
- **disk** = `redb` (single-file embedded KV). Bounded by total bytes.
  Per invariant 2: every record stores `(bytes, expires_at_unix_secs)`
  in a CBOR or bincode-encoded value. Eviction: on `put`, if total >
  `disk_cache_max_bytes`, evict in LRU order using `last_accessed:
  Instant` (separate field, separate index).

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

## Implementation phases (v2 — Architect-corrected dependencies)

| Phase | Slice | Engineer-days | True depends-on |
|---|---|---|---|
| 0 | Scaffolding: `ks-helius` crate, deps, `HeliusConfig`, error enum, `PaymentInterceptor` trait stub | 0.5 | none |
| 1 | `cached_call` with mem cache + **single-flight** + 5 typed wrappers (`getAsset`, `getAssetsByOwner`, `getBalance`, `getPriorityFeeEstimate`, `parseTransactions`) | 2.5 | 0 |
| 2 | `DiskCache` trait + redb backend + **expiry-on-record** + corruption recovery | 1.5 | **1** (the trait shape comes from cached_call's needs) |
| 3a | **Method audit**: produce enumerated list against Helius docs, commit as `proxy-rs/specs/09-method-list.md` | 0.5 | 0 |
| 3b | Remaining typed wrappers per audit (~45–85 methods) | 3–5 | 1, 3a |
| 4 | x402 integration via `PaymentInterceptor` impl | 1 | **spec 10 promoted to full status** (currently stub) — Stage-2 blocker |
| 5a | LaserStream gRPC client (independent track, no HTTP infra reuse) | 2 | 0 |
| 5b | WebSocket subscriptions (`*Subscribe` family) | 1.5 | 0 |
| 6 | PyO3 bindings | 2 | 1, 3b |
| 7 | CLI commands | 1 | 6 |

**v2 total (without x402):** ~13.5 engineer-days, realistic 2–3 weeks.
**Phase 4 (x402)** is **blocked indefinitely** until spec 10 is
promoted from stub to full spec. Do not budget for it in the v2 plan.

### Real parallelism (Architect's correction)

- Engineer A: 0 → 1 → 3a → 3b (the typed-wrapper pipeline; serial)
- Engineer B: 5a (LaserStream) — fully independent, parallel with A
  after 0
- Engineer C: 5b (WebSocket subs) — fully independent, parallel with A
  after 0
- **Phase 2 cannot run in parallel with 1** — its trait shape depends
  on what 1 needs. Wait for 1 to land, then 2 follows.

## Out of scope for this spec

- The on-chain `pay_x402` instruction implementation (Solana program work)
- The Python-side `/agents/{id}/wallet/*` endpoints (control-plane work)
- Both belong in spec 10 (embedded wallet)

## Acceptance criteria for Phase 0+1 (Architect-required gates)

1. `cargo check -p ks-helius` clean
2. `cargo test -p ks-helius` green with ≥12 unit tests covering:
   - 5 typed wrappers (happy path each)
   - **Single-flight test**: 50 concurrent `getBalance(same_addr)` →
     mock receives exactly 1 request
   - **TTL expiry test**: insert with TTL=10ms, sleep 50ms, get →
     miss (re-fires upstream)
   - **CacheKey byte-parity**: `helius:getBalance:["addr"]` → SHA-1
     matches the value Python `_ck("helius","getBalance",["addr"])`
     produces (reuse fixture from `ks-cache::tests::pycompat`)
3. wiremock integration confirms outgoing URL/headers match Helius's
   documented contract for each of the 5 methods
4. **`proxy-rs/specs/10-embedded-wallet-stub.md` exists** (even if
   only a 1-page stub) so Phase 3+ doesn't bake assumptions that
   break when spec 10 is promoted
5. README example compiles + runs against live Helius given a valid
   `HELIUS_API_KEY` env (manual verification, not in CI)

## Trust boundary

`ks-helius` is a **leaf agent-side library** — it has NO dependency on
ks-proxy, ks-vault, or the KS_INTERNAL_SECRET. Callers (agent processes
or, separately, ks-proxy itself) pass the API key into the constructor:

```rust
// agent-side use
let helius = HeliusClient::with_api_key(my_helius_key, HeliusConfig::default())?;

// proxy-side use (if ks-proxy ever wants typed access — not today)
let key = ks_vault::load(&vault, user_id, "helius", &password)?;
let helius = HeliusClient::with_api_key(&key, HeliusConfig::default())?;
```

This means agent-side consumers of `ks-helius` never need to talk to
Python `:8001`, never see KS_INTERNAL_SECRET, and don't depend on
ADR-003's firewall. The crate is publishable as a standalone artifact
on crates.io if desired.

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
