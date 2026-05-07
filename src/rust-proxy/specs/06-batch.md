# 06 — /manage/batch

## Source of truth

`v2-mvp/src/server.py` lines 808-884.

## Endpoint

```
POST /manage/batch
Authorization: Bearer <token>
Content-Type: application/json

{
  "requests": [
    {"upstream": "helius", "body": {"jsonrpc": "2.0", "id": 1, "method": "...", "params": [...]}},
    {"upstream": "openai", "method": "POST", "path": "v1/chat/completions", "body": {...}},
    ...
  ]
}
```

Constraints:
- `requests` length ≤ **20**. 21+ → 400 `"batch limit is 20"`.
- Each item's body, when serialized, ≤ **1_000_000** bytes. Larger →
  per-item `{"error": "payload too large"}`.

## Per-item dispatch

```
if upstream not in UPSTREAMS:
    return {"error": "unknown upstream"}

resolve key (same as /proxy: vault then platform fallback)
   on PermissionError: return {"error": <detail>}

if upstream == "helius" and body is dict with "method":
    helius RPC path → {"status": 200, "cache": HIT|MISS, "data": result}
elif upstream in REST_PROVIDERS:
    REST path → {"status": <code>, "cache": HIT|MISS, "data": json|null}
else:
    generic Bearer forward → {"status": <code>, "cache": HIT|MISS, "data": json|null}

on any exception: return {"error": str(exc)}
```

## Output shape

```json
{"results": [<item-shape>, <item-shape>, ...]}
```

Order is preserved — same index as input `requests[]`.

## Concurrency

Python uses `asyncio.gather`. Rust uses `tokio::join_all` over a `Vec` of
futures — same semantic. **Each item runs on its own task; no global lock.**

Cache state IS shared: if items 0 and 1 both call `getBalance(X)`, the
second hits the in-flight or completed result of the first. This requires
either:
- a single-flight pattern (preferred — saves one upstream call), or
- letting both fire and dedupe via cache write-after-read.

Python doesn't single-flight today; both calls fire in parallel and both
write to cache. Rust matches Python's behavior in stage 1; single-flight is
a stage-2 win.

## x402 / billing

Batch does **not** charge per-item billing or run the platform-key 402
check (server.py:846 explicitly drops it). Rust mirrors this — billing for
batch is a known-deferred policy decision, not an oversight.

## Rust API

```rust
#[derive(serde::Deserialize)]
pub struct BatchItem {
    pub upstream: String,
    #[serde(default)]
    pub path: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub body: serde_json::Value,
}

#[derive(serde::Deserialize)]
pub struct BatchRequest {
    pub requests: Vec<BatchItem>,
}

#[derive(serde::Serialize)]
pub struct BatchResponse {
    pub results: Vec<serde_json::Value>,  // each is one of the per-item shapes above
}
```

## Test plan

1. 5 parallel Helius RPCs: total time ≈ slowest single call, not sum.
2. Mixed batch (helius + openai + groq): each item's response shape matches
   single-call shape on the same input.
3. 21 items → 400.
4. Item with malformed body → that one item gets `{"error": ...}`, others
   succeed.
5. Replay `test_batch_route.py` against both servers; diff JSON output.
