# 04 — Upstream catalog and auth injection

> **Amendments (2026-04-29):** see ADR-001. Three corrections to the
> original spec:
>
> 1. **Groq base URL is `https://api.groq.com`** (NOT `/openai`). The
>    skeleton's `UpstreamId::base_url` has `/openai` and is wrong.
>    Python `server.py:83` also has `/openai` and is wrong; fix both
>    in this PR (ADR-001 #3).
> 2. **Alchemy is broken in Python today** — listed in
>    `server.py:751 provider_map` but missing from
>    `api_router.PROVIDERS`. Add it on Python side (bearer auth) AND
>    Rust side (ADR-001 #4).
> 3. **Header drop list is per-upstream**, not global. AI providers
>    (openai/anthropic/mistral/cohere/groq/alchemy) ALSO drop
>    `content-type` because `api_router.call_rest` re-injects it
>    (api_router.py:219). Other paths (0x/Titan/Pyth/fallback) don't.
>    See "Header forwarding rules" below for the matrix.

## Source of truth

- `v2-mvp/src/server.py` lines 77-91 (UPSTREAMS), 700-765 (`_proxy_route`)
- `v2-mvp/src/api_router.py` lines 21-60 (PROVIDERS, auth schemes)

## Upstream catalog

```rust
pub enum UpstreamId {
    Helius,    // routes to RPC / DAS / Enhanced — see spec 05
    Openai,
    Anthropic,
    Mistral,
    Cohere,
    Groq,
    ZeroX,     // "0x" in Python
    Titan,
    Pyth,
    Alchemy,
}
```

Mapping Python string → Rust:

```
"openai"    → Openai      base: https://api.openai.com
"anthropic" → Anthropic   base: https://api.anthropic.com
"mistral"   → Mistral     base: https://api.mistral.ai
"cohere"    → Cohere      base: https://api.cohere.ai
"groq"      → Groq        base: https://api.groq.com/openai
"helius"    → Helius      base: see spec 05 (3 sub-bases)
"0x"        → ZeroX       base: https://api.0x.org
"titan"     → Titan       base: https://rpc.titanbuilder.xyz
"pyth"      → Pyth        base: https://hermes.pyth.network
"alchemy"   → Alchemy     base: https://eth-mainnet.g.alchemy.com
```

## Auth injection rules

| Upstream  | Mode             | Detail                                              |
|-----------|------------------|-----------------------------------------------------|
| Openai    | Bearer header    | `Authorization: Bearer <key>`                       |
| Groq      | Bearer header    | `Authorization: Bearer <key>`                       |
| Mistral   | Bearer header    | `Authorization: Bearer <key>`                       |
| Cohere    | Bearer header    | `Authorization: Bearer <key>`                       |
| Anthropic | Custom header    | `x-api-key: <key>`, plus `anthropic-version: 2023-06-01` |
| Helius    | Query param      | `?api-key=<key>` appended to URL                    |
| ZeroX     | Custom header    | `0x-api-key: <key>`                                 |
| Titan     | Bearer header    | `Authorization: Bearer <key>` (only if key non-empty) |
| Pyth      | Query param OR none | `?api_key=<key>` if key non-empty; else pass-through |
| Alchemy   | Bearer header    | `Authorization: Bearer <key>`                       |

## Header forwarding rules

Per-upstream drop matrix:

| Upstream | Drop on outbound request |
|---|---|
| OpenAI / Anthropic / Mistral / Cohere / Groq / Alchemy | host, content-length, authorization, **content-type** |
| 0x | host, content-length, authorization |
| Titan | host, content-length, authorization |
| Pyth | host, content-length, authorization |
| Helius (RPC dispatch) | builds fresh; no client headers forwarded |
| Helius (fallback `_forward`) | host, content-length, authorization |

AI providers also drop `content-type` because `api_router.call_rest`
re-injects `application/json` (api_router.py:219). Other paths don't.

On the response: drop `content-encoding` (matches server.py:802).

Anthropic: client-supplied `anthropic-version` wins (`headers.update(extra)`
runs after the default — see ADR 001 #6). If client didn't supply, inject
default `2023-06-01`.

## Response headers Rust adds

Every successful proxy response gets:
- `x-ks-cache: HIT` or `MISS` (see spec 03)
- `x-ks-key-type: self_custodian` or `platform`

402 responses get:
- `X-Payment-Required: x402`

## Body size limit

`MAX_BODY = 1_000_000` (1 MB). Reject larger requests with 413 before any
upstream call.

## Rust API

```rust
pub struct UpstreamClients {
    inner: HashMap<UpstreamId, reqwest::Client>,
}

impl UpstreamClients {
    pub fn new() -> Self;

    /// Route a request, applying the right auth + URL transform.
    pub async fn forward(
        &self,
        upstream: UpstreamId,
        method: &http::Method,
        path: &str,                 // path WITHOUT leading "/proxy/{upstream}"
        query: Option<&str>,
        headers: &http::HeaderMap,
        body: bytes::Bytes,
        api_key: &str,
    ) -> Result<UpstreamResponse, UpstreamError>;
}

pub struct UpstreamResponse {
    pub status: http::StatusCode,
    pub headers: http::HeaderMap,
    pub body: bytes::Bytes,
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
```

## Test plan

For each upstream, hit Python with a request that requires auth and capture
the outgoing wire bytes (e.g. with `mitmproxy` configured as the upstream).
Then hit Rust with the same input and compare the outgoing wire bytes —
URL, method, headers, body must all match (modulo `User-Agent` and TLS
ALPN-negotiated framing).
