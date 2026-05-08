# 03 — Cache policy

## Source of truth

- `v2-mvp/src/api_router.py` lines 75-130 (Helius RPC TTLs, REST TTLs)
- `v2-mvp/src/server.py` lines 107-147 (a smaller superset Helius TTL table
  used by the generic `_forward` path)

The Python codebase has **two** TTL tables today (one in `server.py`, one in
`api_router.py`). The Rust port consolidates them — see "Divergence from
Python" below.

## Helius JSON-RPC TTLs (consolidated)

```
getBalance                 5
getAccountInfo             5
getMultipleAccounts        5
getTokenAccountBalance     5
getTokenAccountsByOwner    10
getTokenAccounts           10
getAsset                   300
getAssetBatch              300
getAssetsByOwner           30
getAssetsByGroup           60
searchAssets               30
getSignaturesForAddress    30
getTransactions            30
getTransaction             60
getTokenBalances           10
getSlot                    2
getBlockTime               600
getEpochInfo               10
getRecentBlockhash         2
getLatestBlockhash         2
```

Never cached:
```
sendTransaction
sendRawTransaction
simulateTransaction
```

Anything not in either set: do **not** cache; pass through.

## REST route TTLs

OpenAI:
```
GET  /v1/models           3600
GET  /v1/models/<id>      3600
POST /v1/embeddings       86400
```

Anthropic:
```
GET  /v1/models           3600
```

Other providers (Mistral, Cohere, Groq, Alchemy, 0x, Titan, Pyth): **no
caching**. Always pass through. Pyth in particular returns time-varying
prices.

## Cache key

```
helius:  sha1("helius:" + method + ":" + python_compat::to_canonical_json(params))
rest:    sha1(provider + ":" + method + " " + path + ":" + body_utf8)
```

Canonicalization is mandatory and **non-negotiable**: Python uses
`json.dumps(payload, sort_keys=True)` whose default separators are `, ` and
`: ` and which escapes non-ASCII. Plain `serde_json::to_string` does NOT
match. See **spec 08** for `python_compat::to_canonical_json`. That helper
must land before this spec is implemented.

## Cache hit semantics

- HIT returns the original `200 OK` body verbatim.
- HIT response headers always include `x-ks-cache: HIT` and
  `content-type: application/json`. Other upstream headers are dropped — this
  matches Python's `_forward` behavior on cache hit.
- MISS sets `x-ks-cache: MISS`.
- Errors and non-200 responses are NEVER cached, regardless of TTL.

## Divergence from Python

Python has TWO cache tables with DIFFERENT keys:
- `server.py._CACHE` keyed by `(upstream, path, sha1(body))` — engages
  only via `_forward()`, which runs for **GET** `/proxy/helius/*` and for
  **POSTs whose body fails to parse as JSON-RPC**. For RPC POSTs to Helius,
  dispatch goes via `_proxy_route → api_router.call_helius` and bypasses
  `_CACHE` entirely.
- `api_router._CACHE` keyed by `(provider, method_or_route, json.dumps(params, sort_keys=True))`
  — engages on every Helius RPC POST and on cacheable REST routes.

Rust consolidates: **one** cache, keyed per the rules above. The
observable behavior preserved is `api_router._CACHE`'s; `server.py._CACHE`
is rarely exercised on hot paths and its consolidation is ADR-blessed (see
ADR 001 #5 + #8).

QA must verify by sending the same Helius RPC POST 1k times to both
servers and comparing the response-time distribution after warmup — both
serve from cache. Also verify `/proxy/0x` POST with a body containing a
`"method"` key does NOT get cached on Rust (Python latent bug, ADR 001
#8).

## Rust API

```rust
pub struct TtlCache<V: Clone + Send + Sync + 'static> {
    inner: dashmap::DashMap<String, (V, std::time::Instant)>,
}

impl<V: Clone + Send + Sync + 'static> TtlCache<V> {
    pub fn new() -> Self;
    pub fn get(&self, key: &str) -> Option<V>;
    pub fn set(&self, key: String, value: V, ttl: std::time::Duration);
    pub fn len(&self) -> usize;
}

pub fn helius_method_ttl(method: &str) -> Option<std::time::Duration>;
pub fn helius_is_write(method: &str) -> bool;
pub fn rest_route_ttl(provider: &str, method: &str, path: &str)
    -> Option<std::time::Duration>;
```

(`dashmap` is fine here — single global cache, no value sharing semantics.
Replace with `tokio::sync::RwLock<HashMap>` if we want to avoid the dep.)

## Test plan

1. Cold cache: GET → MISS, second GET (within TTL) → HIT, both same body.
2. After TTL expiry: HIT becomes MISS again.
3. Write methods (`sendTransaction`) never cached even when sent twice.
4. Non-200 response not cached: simulate upstream 429, verify next call
   reaches upstream again.
5. Diff against Python: replay a 100-request session from `tests/`, compare
   the resulting `x-ks-cache` header sequence — must match exactly.
