# ADR 001 — Divergence decisions for stage-1 Rust port

**Status:** Accepted
**Date:** 2026-04-29
**Authors:** Architect review (Plan agent), PM (main session)

## Context

The Architect's pass over `BOUNDARY.md` and `specs/00..07.md` against the
Python source surfaced 11 divergence points where Python's behavior is
either internally inconsistent, latently buggy, or under-specified by the
spec. Each one needs a binary call: **match Python bug-for-bug** (preserve
oracle parity) or **fix during port** (ADR-blessed deviation).

## Decisions

| # | Issue | Python source | Decision | Rationale |
|---|---|---|---|---|
| 1 | Helius response re-serialization (`api_router.py:185` parses, `server.py:721` re-dumps) | `api_router.py:185`, `server.py:721` | **Match** | Oracle-parity is the entire point of stage 1. Implement `python_compat::to_canonical_json`. See spec 08. |
| 2 | Cache key uses `json.dumps(sort_keys=True)` — has ASCII escape + `, ` / `: ` separators | `api_router.py:117` | **Match** | Same canonicalizer (spec 08). Without it, replay-fixture tests are impossible. |
| 3 | Groq base URL inconsistent: `server.py:83` uses `/openai`, `api_router.py:53` doesn't | `server.py:83` vs `api_router.py:53` | **Fix** | Hot path goes through api_router → `https://api.groq.com` wins. Land the same fix in Python in this PR. |
| 4 | Alchemy 500s today — listed in `server.py:751 provider_map` but missing from `api_router.PROVIDERS` | `server.py:751`, `api_router.py:21-60` | **Fix** | Add Alchemy to api_router on Python (bearer auth) and to Rust. Otherwise byte-diff tests on `/proxy/alchemy/*` are meaningless. |
| 5 | `server.py._CACHE` and `api_router._CACHE` are two separate caches with different keying | `server.py:107-147`, `api_router.py:113-130` | **Consolidate (fix)** | Rust ships one cache. `server.py._CACHE` only engages on non-RPC Helius requests anyway; consolidating preserves observable behavior. |
| 6 | Anthropic `anthropic-version` header — client-supplied wins because `headers.update(extra)` runs after defaults | `api_router.py:217-219` | **Match** | Document explicitly in spec 04. Don't change server-default precedence. |
| 7 | Fire-and-forget log task drops on event-loop shutdown | `server.py:797`, `_log_usage_bg` | **Improve** | Rust's bridge buffer flushes on SIGTERM/SIGINT (spec 07 already calls this out). Net win, no observable parity break. |
| 8 | `_forward` caches by RPC method-name for ANY upstream that POSTs JSON with a `method` field | `server.py:411` | **Fix** | Latent bug — a `/proxy/0x` POST whose body happens to contain `"method": "getBalance"` gets cached. Gate cache-by-method to Helius only in Rust. ADR: Python latent bug not exercised today; not worth carrying forward. |
| 9 | Body-too-large in batch returns string `"payload too large"` | `server.py:849` | **Match verbatim** | Test fixtures may assert on this string. |
| 10 | Unknown upstream in batch returns `"unknown upstream"` | `server.py:840` | **Match verbatim** | Same. |
| 11 | Header drop list is asymmetric — AI provider path also drops `content-type`, others don't | `server.py:753-754` vs `725-726`, `732-733`, `740-741` | **Match** | Spec 04 needs a per-upstream matrix; spec to be amended. |

## Consequences

### Acceptance criteria for byte-parity tests

1. **Cache HIT responses** must be byte-identical in both servers.
2. **Cache MISS responses for cacheable methods** must be byte-identical
   once `python_compat::to_canonical_json` lands.
3. **Non-cached responses** are JSON-structural-equal in stage 1 (because
   upstream returns timestamps and other non-deterministic fields).

Stage-1 done = #1 and #2 hold at byte level; #3 holds at structural level.

### Python-side changes required in this PR

- `api_router.py`: add `"alchemy"` provider entry (bearer auth, base
  `https://eth-mainnet.g.alchemy.com`).
- `server.py:83`: change Groq base from `https://api.groq.com/openai` to
  `https://api.groq.com` (or document why fallback path differs from
  api_router intentionally — but consolidating is cleaner).
- `server.py:411`: gate `_rpc_ttl(body)` to `upstream == "helius"` only.

These three Python edits land in the same PR as the Rust port. Without
them, Python and Rust will diverge on Alchemy, Groq, and synthetic
RPC-shaped requests to non-Helius upstreams.

### What stays as observable parity

All response bodies on existing supported upstreams (Helius RPC + DAS +
Enhanced, OpenAI, Anthropic, Mistral, Cohere, Groq, 0x, Titan, Pyth,
Alchemy after fix) match Python at the byte or structural level per the
acceptance criteria.

### Engineering action items not visible in specs

- `ks-session` skeleton uses `Mutex<Connection>`. Spec 02 calls for a 4-8
  connection read-only pool; the engineer who lands spec 02 must implement
  the pool. Not a divergence — a spec the skeleton under-implemented.
- SQLite open URI must include `?mode=ro&immutable=1` flags so readers
  don't need WAL/SHM write access. Spec 02 to be amended.
