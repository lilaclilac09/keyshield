# ADR 002 — Why fallthrough, not full port

**Status:** Accepted
**Date:** 2026-04-30
**Authors:** PM (this session, after Stage 1 retrospective with user)

## Context

After Stage 1 shipped, the user pointed out that BOUNDARY.md's "out-of-scope"
list reads as if vault CRUD / agents / usage / billing / passkey / wallet
auth aren't part of the product. They are — `frontend/` (React + Vite,
4800 lines, 8 sections) calls every one of those endpoints. The right framing
is: those features ARE in the product, they're just implemented in Python and
reached via Rust's reverse-proxy fallthrough.

This ADR makes the architecture decision explicit so future readers (and
agents) don't repeat my framing error.

## Decision

**ks-proxy on `:8000` is the only public interface. v2-mvp Python on `:8001`
is internal-only.**

Path routing:
- `/proxy/*` → ks-proxy hot path (auth + key inject + upstream forward + cache)
- `/manage/batch` → ks-proxy (parallel fan-out of hot-path calls)
- `/health` → ks-proxy
- `/_internal/balance/{user_id}`, `/_internal/log` → Python (Rust calls these)
- **everything else → ks-proxy fallthrough → reverse-proxy to Python `:8001`**

The frontend sends every request to `:8000`. It doesn't know which route
hits Rust vs falls through. Switching backends or moving features between
Rust and Python is invisible to the client.

## Why not a full Rust port

Three reasons, in order of weight:

1. **Library availability.** WebAuthn (passkeys), Solana RPC + ed25519
   verification + Pyth oracle integration (billing), x402 micropayment
   verification, base58 / SPL token decoding — all of these have mature
   Python implementations in `v2-mvp/`. Equivalent Rust crates exist but
   reimplementing the same business logic in Rust takes ~2 weeks per
   subsystem with non-trivial bug surface. The product doesn't get faster
   because these are not on the hot path.

2. **Iteration cost.** The control plane changes weekly (new auth flows,
   new billing rules, new agent delegation policies). Hot path changes
   monthly (new upstream, new cache rule). Putting iteration-heavy code in
   the slower-to-iterate language (Rust) is a tax on every change.

3. **Hot path is what's worth porting.** Per maxlv's "when to use Rust"
   essay (referenced in spec 00 + the original task framing): long-lived,
   latency-sensitive, concurrent, security-critical. The proxy hot path
   matches all four. Most control-plane handlers run once per session, hit
   one SQLite row, return — Rust's compile-time checks don't pay back the
   port cost there.

## What this means for the spec

- BOUNDARY.md "out-of-scope (stays in Python)" was a misleading framing. It
  has been replaced with "Reached via fallthrough (implementation stays in
  Python)" with a column showing which frontend section uses each endpoint.
- "Out of scope" in spec 00 still applies — it's about Stage 2 work (TLS,
  real x402 verification, stealth deploy, productionization), not about
  control-plane features.

## What's NOT this decision

This ADR doesn't say control plane will live in Python forever. If a
specific endpoint becomes hot enough to justify porting (e.g., `/auth/login`
under heavy load), it can be promoted to ks-proxy without changing the
client contract — the client still talks to `:8000`. The decision is
"don't pre-port stuff that isn't hot", not "Rust never gets these endpoints".

## Failure modes this prevents

- Engineer agents reading BOUNDARY.md and concluding "we shouldn't worry
  about /agents/* because it's out of scope" — wrong, those work and the
  frontend depends on them; they just don't run in Rust.
- A future Stage-2 effort accidentally re-implementing `/billing/topup-solana`
  in Rust without realizing the Python implementation already verifies SPL
  transfers + Pyth pricing + memo binding correctly.
- CI/CD missing the frontend (the actual product UI) because someone read
  the boundary as "frontend isn't part of the proxy-rs project". CI now
  builds + typechecks `frontend/` per `node-tests.yml`.

## Consequences

- **Product correctness gates on Python AND Rust.** The frontend is a
  cross-cutting consumer; both backends must work for the product to work.
  CI runs both test suites (`test.yml` for Rust, `node-tests.yml` for the
  TS workspaces + frontend, `sync-worker-deploy.yml` for the Cloudflare
  worker).
- **The fallthrough handler in `ks-proxy::handlers::fallthrough` is now
  load-bearing for the entire control plane.** Any bug there (header
  forwarding, body preservation, status code, query string) silently
  breaks 22 of the frontend's endpoints. Test it against every method and
  every kind of body.
- **Stage 2 work.** TLS termination on `:8000` covers both hot path AND
  control plane (because both go through `:8000`). x402 real verification
  is in Python's billing flow — Rust doesn't need to touch it. Stealth
  mode applies to all unauthed traffic regardless of which backend
  ultimately answers.
