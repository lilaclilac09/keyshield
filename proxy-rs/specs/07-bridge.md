# 07 — Rust ↔ Python bridge

> **Amendments (2026-04-29):** see ADR-001. Token extraction lives on the
> Rust side (per the buffered log batch design), which means Rust must
> port the cost table at **`v2-mvp/src/usage.py` lines 23-43** (per-provider
> `COST_PER_1K`, `FLAT_COST_PER_CALL`, `FREE_CREDIT_USD`) AND the parser
> at `usage.py:99-129` (`extract_token_usage`) verbatim. Drift between
> Python and Rust here = under/over-charging users. Lock with golden
> fixture tests (20 real provider responses dumped from staging).

## Goal

Rust owns the hot path. Python owns control plane state (balance, usage
log). The bridge is two HTTP endpoints Python adds for Rust to call.

These endpoints are **internal only** — Python should not expose them on
the public address; bind them on a private interface or guard with a shared
secret.

## Auth between Rust and Python

`KS_INTERNAL_SECRET` env var, shared by both sides. Rust sends
`X-Internal-Secret: <value>` on every internal call; Python rejects 401 on
mismatch. If the env is empty on either side, fail closed at startup.

## Endpoint A: balance check

```
GET /_internal/balance/<user_id>
X-Internal-Secret: <shared>
→ 200 {"balance_usd": 0.0}
→ 401 if secret missing/wrong
→ 404 if user unknown (treat as 0 balance for 402 logic)
```

Called only when `key_type == "platform"` AND about to forward. Sub-ms cost
(SQLite read in Python). Rust may cache the result for a short window
(suggest 1s) to avoid a per-request bridge call burst on the same user.

## Endpoint B: usage log batch ingest

```
POST /_internal/log
X-Internal-Secret: <shared>
Content-Type: application/json

{
  "entries": [
    {
      "user_id":    "<wallet or user>",
      "upstream":   "helius",
      "key_type":   "self_custodian" | "platform",
      "method":     "POST",
      "path":       "<request path>",
      "tok_in":     0,
      "tok_out":    0,
      "cost":       0.0,
      "latency_ms": 0.0,
      "status":     200
    },
    ...
  ]
}
→ 200 {"ingested": <count>}
```

Python writes through `usage.log_call(...)` which is the same path
`server.py:_log_usage_bg` uses today. Token extraction (`tok_in`,
`tok_out`, `cost`) happens on the Rust side — see `usage.extract_token_usage`
for the per-upstream parser.

## Buffering on the Rust side

```
buffer:  Vec<Entry>
flush trigger:  buffer.len() >= 100 OR oldest entry > 100ms old
flush mechanism: tokio interval task, flush serializes the buffer and POSTs
                 to /_internal/log
on failure:  log warn!, drop the batch (do NOT retry — usage is non-critical
             and retries can stampede on a slow Python)
on shutdown: flush once on SIGTERM/SIGINT before exit
```

## Token extraction

`usage.extract_token_usage(upstream, content)` (Python) parses provider
response bodies:
- OpenAI / Groq / Mistral / Cohere: top-level `usage.{prompt_tokens,
  completion_tokens}`
- Anthropic: top-level `usage.{input_tokens, output_tokens}`
- Anything else: returns `(0, 0, 0.0)`

Cost is computed per provider with a hardcoded price table — read it from
Python source as the canonical reference, port to Rust verbatim. Drift
between the two = under-/over-charging users. Lock in test parity.

## Failure modes

| Bridge call fails | Behavior in Rust                                  |
|-------------------|---------------------------------------------------|
| balance check     | Treat as balance=0 → return 402. Log warn.        |
| log ingest        | Drop the batch. Log warn. Keep serving requests.  |
| Python down       | Hot path keeps serving self-custodian users; all  |
|                   | platform-key users get 402 (correct conservative  |
|                   | failure). Non-hot-path requests fall through to   |
|                   | Python and 502.                                   |

## Test plan

1. Python with `_internal/*` endpoints stubbed; Rust hot path serves a
   self-custodian user → response identical to Python-only setup.
2. Platform key + balance > 0 → 200 forwarded; bridge called exactly once
   per request (or once per cache window).
3. Platform key + balance = 0 → 402 with correct body (see server.py:_x402_body).
4. Kill Python mid-traffic; Rust still serves self-custodian requests; new
   platform-key requests 402; log buffer drops gracefully.
5. Hammer with 1000 RPS for 10s; verify Python receives ~100 batched log
   POSTs (not 1000), and no entries lost when the load eases.
