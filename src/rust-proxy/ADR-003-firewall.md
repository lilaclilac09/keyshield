# ADR 003 — Firewall between Rust :8000 and Python :8001

**Status:** Accepted
**Date:** 2026-04-30

## Context

ADR-002 made `:8000` (Rust) the only public interface and `:8001` (Python)
internal-only. But "internal" was just convention — Python was bound to
all interfaces and trusted whoever could reach it. On a multi-tenant
host, a co-located process or anyone reachable on the network could
bypass `:8000` and hit `:8001` directly, leaking everything.

## Decision

Two layers of defense:

1. **Bind Python to `127.0.0.1`.** Already done in `scripts/dev.sh`:
   `uvicorn --host 127.0.0.1`. External hosts can't reach it. This
   covers the simple deployment case (single host, ks-proxy + Python
   colocated).

2. **Shared-secret header check.** Every request to Python must carry
   `X-Internal-Secret: <KS_INTERNAL_SECRET>`. Rust auto-injects this on
   every fallthrough; clients of `:8000` never see or set it. Python
   middleware in `v2-mvp/src/server.py` (`_require_internal_secret`)
   rejects 403 on missing/wrong header. Covers the multi-host case
   (Docker compose, Kubernetes, separate VMs) where loopback isn't
   meaningful.

`KS_INTERNAL_SECRET` is generated fresh per `scripts/dev.sh` run
(32-byte hex via `openssl rand`). In production it must be set by the
operator and shared between the two processes via env. Rotation is a
restart of both.

## Carve-outs

- **`OPTIONS` (CORS preflight)** is allowed without the secret. Browsers
  fire preflight before any real request and won't include custom
  headers; if we 403'd preflight, every CORS request from the frontend
  would fail before the secret-bearing actual request fired. The actual
  POST/GET/PUT/DELETE still requires the secret.
- **Empty `KS_INTERNAL_SECRET`** = dev mode = fail open. Python prints a
  warning at startup so you notice. Production deployments must set this
  or the firewall is off.

## What this prevents

- A co-located process on the host doing
  `curl http://127.0.0.1:8001/manage/decrypt/openai` with a stolen bearer
  → 403 (no secret).
- A misconfigured deploy where `:8001` accidentally got public IP →
  external attackers still need the secret.
- A future engineer adding a new endpoint on Python and forgetting to
  add auth — the firewall is global, every endpoint is protected.

## What this does NOT prevent

- A compromised Rust process leaking the secret (Rust has it in env and
  uses it on every fallthrough). If the Rust process is rooted, the
  attacker is already inside the firewall.
- A man-in-the-middle on the loopback interface (very unusual) reading
  the secret off the wire. Use TLS between Rust and Python in
  high-trust environments — Stage 2 work.

## Defaults

- Dev (`bash scripts/dev.sh`): secret generated, both processes get it,
  firewall on. Direct curl to `:8001` requires
  `-H "X-Internal-Secret: $KS_INTERNAL_SECRET"`.
- Production: operator sets `KS_INTERNAL_SECRET` to a long random
  string in both processes' env. Never commit it to git.

## Developer access to `:8001` directly

Sometimes you want to debug Python directly without going through the
Rust proxy. Two ways:

```bash
# 1. With the secret (firewall enforced):
curl -H "X-Internal-Secret: $KS_INTERNAL_SECRET" http://127.0.0.1:8001/health

# 2. Open Python (firewall off, dev only — also makes /_internal/* publicly
#    callable, so don't do this on a shared host):
KS_INTERNAL_SECRET= bash scripts/dev.sh
```

The dev launcher prints the active secret at startup so you can copy it.
