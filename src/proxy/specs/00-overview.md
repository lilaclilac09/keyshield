# 00 — Overview

## Goal

Port the **hot path** of `v2-mvp/src/server.py` to a single-binary Rust
sidecar, leaving the control plane in Python. The hot path is the
authenticated API-key-injecting proxy — every agent request hits it. See
`BOUNDARY.md` for the exact split.

## Why Rust here

Per maxlv's "when to use Rust" essay: long-lived service, latency-sensitive,
concurrent, and key handling = catastrophic blast radius if buggy. The hot
path is exactly that profile. The control plane is not — it's request-scoped
business logic with rich library needs (WebAuthn, Solana RPC, Pyth oracle),
and stays in Python.

## Method

Spec-driven port à la maxlv's mihomo essay:
1. Each spec below defines an interface (Rust types + Python source refs +
   error enums + test plan).
2. The Python `v2-mvp/src/server.py` running on `:8001` is the **oracle**.
3. Engineer agent implements one crate at a time; QA validates by byte-diff
   against the Python oracle on the same input.
4. Specs are the contract — when behavior is ambiguous, fix the spec first,
   not the code.

## Crate layout

| Crate         | Owns                                              | Spec |
|---------------|---------------------------------------------------|------|
| `ks-vault`    | reading + decrypting `.enc` vault files (R/O)     | 01   |
| `ks-session`  | reading `sessions.db` (R/O)                       | 02   |
| `ks-cache`    | TTL cache (Helius methods + REST routes)          | 03   |
| `ks-upstream` | per-upstream HTTP/2 client + auth injection       | 04, 05 |
| `ks-agent`    | claude harness: spawn, NDJSON↔stream-json normalise | 19   |
| `ks-proxy`    | binary: axum routes, fall-through, bridge to py   | 06, 07, 19 |

## Out of scope for stage 1

- Vault writes (Rust only reads). All `vault.store()` calls stay in Python.
- Session creation. Only `session.get(token)` is needed in Rust.
- Usage analytics — Rust ships log entries to Python; analytics SQL stays
  there.
- Anything billing/x402/Solana related except the read-only balance check.
- TLS termination. Run Rust behind your existing reverse proxy or terminate
  TLS in Python for now. (Adding TLS is stage 2 if needed.)

## Definition of done for stage 1

A request that hits Python today and a request that hits Rust (which falls
through to Python for non-hot-path) produce **byte-identical responses** for:

- Every `/proxy/{upstream}/{path}` endpoint
- `/manage/batch`
- `/health`

…with `x-ks-cache: HIT` appearing on the same call indices given the same
warmup sequence.
