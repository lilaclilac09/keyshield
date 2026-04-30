# 05 — Helius routing

> **Amendments (2026-04-29):** see ADR-001. Critical correction:
>
> Python's response body is NOT upstream's JSON verbatim. `api_router.py:185`
> parses with `resp.json()` (dict), then `server.py:721` does
> `json.dumps(result).encode()` — bytes that ship out are Python's
> re-serialized form with `, ` and `: ` separators, alphabetical keys,
> ASCII-escaped non-BMP. Rust must use **`pycompat::to_canonical_json`**
> (spec 08) for both the cache key derivation AND the response body
> re-serialization. Plain `serde_json::to_string` will fail byte-parity
> on every cache HIT. (ADR-001 #1, #2.)

## Source of truth

`v2-mvp/src/api_router.py` lines 21-60 (provider configs), 151-188 (router).
`v2-mvp/src/helius_router.py` (parallel implementation; same routing logic,
narrower surface).

## Three Helius sub-bases

| Bucket   | Base URL                              | Used for                |
|----------|---------------------------------------|-------------------------|
| RPC      | `https://mainnet.helius-rpc.com/`     | Vanilla Solana JSON-RPC |
| DAS      | `https://mainnet.helius-rpc.com/das`  | NFT / asset queries     |
| Enhanced | `https://api.helius.xyz/v0`           | Helius-specific routes  |

Auth is `?api-key=<key>` for all three.

## Method → bucket

```
DAS:
  getAsset, getAssetBatch, getAssetProof, getAssetProofBatch,
  getAssetsByOwner, getAssetsByGroup, getAssetsByCreator,
  getAssetsByAuthority, searchAssets, getTokenAccounts, getNftEditions

Enhanced:
  getTransactions, getTokenBalances

RPC: everything else
```

The bucket sets are **closed enums** today. New methods default to RPC.
Document this assumption in code as the routing default.

## Request shape

Inbound POST to `/proxy/helius/<anything>` with body:

```json
{"jsonrpc": "2.0", "id": <any>, "method": "<methodName>", "params": [...]}
```

The `<anything>` after `/proxy/helius/` is **ignored by the router** —
Helius routing is decided purely by the JSON `method` field. Verify Python
does the same; if a path component is meaningful (e.g. `/v0/transactions`
for Enhanced), document it here.

(Reading server.py:712-721: the `path` is dropped; routing is by RPC
method. helius_router.py:84 has a special case `/v0/transactions?api-key=...`
for the Enhanced base — that's a code quirk, not a contract; the dispatch is
still by method. Rust unifies on method-based dispatch.)

## Output shape

Cache HIT:
```
status:  200
headers: content-type: application/json, x-ks-cache: HIT
body:    {"jsonrpc": "2.0", "id": <echoed>, "result": ...}
```

Cache MISS or write method: status mirrors upstream; body is upstream's
JSON verbatim; `x-ks-cache: MISS`.

## Non-JSON-RPC requests to /proxy/helius/

If the body doesn't parse as a JSON object with `"method"`: fall back to
the generic forward path (spec 04). This matches server.py:712-721 (the
JSON parse is wrapped in try/except).

## Rust API

```rust
impl UpstreamClients {
    pub async fn call_helius_rpc(
        &self,
        method: &str,
        params: &serde_json::Value,
        rpc_id: &serde_json::Value,
        api_key: &str,
        cache: &TtlCache<bytes::Bytes>,
    ) -> Result<(bytes::Bytes, CacheStatus), UpstreamError>;
}

pub enum CacheStatus { Hit, Miss }
```

## Test plan

1. Cold-cache `getBalance(addr)` → MISS, second call → HIT, body equal.
2. `getAsset(mint)` routes to DAS base; verify by inspecting outgoing URL.
3. `getTransactions(...)` routes to Enhanced base.
4. `sendTransaction(...)` never cached, even repeated.
5. Replay the `test_router_scenarios.py` test sequence against both Python
   and Rust; assert the (status, body, cache_status) tuple matches per call.
