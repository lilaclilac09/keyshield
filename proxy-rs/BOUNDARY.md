# BOUNDARY: hot path vs control plane

The Rust proxy (`ks-proxy`) handles the **hot path** — every API call from an
agent. Everything else stays in `v2-mvp/src/server.py` ("control plane") and is
reached by Rust falling through to it.

The Rust binary owns: decode session → resolve key → forward to upstream →
cache → return. It owns no business logic, no DB writes, no auth flows beyond
bearer-token lookup.

## In-scope (Rust)

| Feature                                    | v2-mvp source            | Rust crate    |
|--------------------------------------------|--------------------------|---------------|
| Bearer → session lookup                    | server.py:322-335, session.py:62-70 | ks-session  |
| Vault file decrypt (AES-256-GCM, PBKDF2)   | server.py:338-352, vault.py:44-59   | ks-vault    |
| Method/route TTL cache                     | server.py:107-147, api_router.py:75-130 | ks-cache |
| Per-upstream HTTP/2 client pool            | server.py:94-102, api_router.py:62-71   | ks-upstream |
| Per-upstream auth injection                | server.py:700-765, api_router.py:132-149 | ks-upstream |
| Helius DAS / Enhanced / RPC routing        | api_router.py:151-188   | ks-upstream  |
| `POST/GET /proxy/{upstream}/{path}`        | server.py:768-805       | ks-proxy     |
| `POST /manage/batch`                       | server.py:821-884       | ks-proxy     |
| `GET /health`                              | server.py:1335-1342     | ks-proxy     |
| `x-ks-cache`, `x-ks-key-type` headers      | server.py:803-805       | ks-proxy     |
| 402 bypass on platform-key zero balance    | server.py:780-788       | ks-proxy     |
| Background usage logging (buffered)        | server.py:378-399, 797-800 | ks-proxy  |

## Out-of-scope (stays in Python)

| Feature                                              | v2-mvp source         |
|------------------------------------------------------|-----------------------|
| `/auth/login`, `/auth/logout`                        | server.py:435-444     |
| `/auth/wallet-challenge`, `/auth/wallet-login`       | server.py:449-501     |
| `/auth/agent-challenge`, `/auth/agent-login`         | server.py:523-586     |
| `/agents/register|list|{id}`                         | server.py:597-629     |
| `/auth/passkey/*` (WebAuthn)                         | server.py:929-991     |
| `/manage/store|delete|list|decrypt` (vault writes)   | server.py:639-696     |
| `/usage/stats|history`                               | server.py:996-1008    |
| `/billing/*` (x402, Solana topup, memos)             | server.py:1011-1330   |
| `/skill/helius/*` (high-level skill tools)           | server.py:894-915     |
| Static asset serving                                 | server.py:275-305     |

## Bridge (Rust → Python internal HTTP)

Two endpoints to add on the Python side. Rust calls them; nothing else does.

- `GET /_internal/balance/:user_id` → `{"balance_usd": float}`
  Called only when `key_type == "platform"`. Used to decide 402.
- `POST /_internal/log` → ingests a buffered batch of usage entries
  ```json
  {"entries": [{"user_id": "...", "upstream": "...", "key_type": "...",
                "method": "...", "path": "...", "tok_in": 0, "tok_out": 0,
                "cost": 0.0, "latency_ms": 0.0, "status": 200}, ...]}
  ```
  Rust buffers up to 100 entries or 100ms, whichever first.

These don't exist yet — adding them is part of the Python-side contribution.

## Fall-through

Rust binds `:8000`. It handles `/proxy/*`, `/manage/batch`, `/health` directly.
Everything else reverse-proxies to `PYTHON_BACKEND_URL` (default
`http://127.0.0.1:8001`).

```
agent ──► Rust :8000 ──┬─► hot path        ──► upstream
                       └─► everything else ──► Python :8001
```

## Oracle for the port

The running Python server **is** the oracle. Engineer agents validate by:

1. Bringing up Python on `:8001` and Rust on `:8000`
2. Sending identical requests to both
3. Byte-diffing response bodies, comparing latency profiles, confirming
   `x-ks-cache` HIT/MISS sequencing matches

`v2-mvp/tests/` (especially `test_proxy.py`, `test_router_scenarios.py`,
`test_helius_skill_route.py`, `test_batch_route.py`) defines the request-level
contract. Treat any byte-level divergence in a non-streaming response as a
defect unless explicitly waived in a spec.
