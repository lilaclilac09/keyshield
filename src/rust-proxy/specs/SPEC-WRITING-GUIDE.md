# Spec writing guide for keyshield

## What broke

Stage 1 specs (00–08) all anchor on **technical layers** (vault format,
cache policy, upstream auth, Helius routing, etc.). They're correct as
implementation contracts, but they don't tell the reader what **user
feature** they enable. So when an agent reads `BOUNDARY.md` and sees
"`/agents/register` — out of scope (stays in Python)", they conclude
"agents aren't a project feature" — when actually agents ARE a product
feature; they're just implemented in Python.

This is fixed by ADR-002. The guide below is so future specs don't make
the same mistake.

## Anchor on user features, not layers

Every new spec should open with:

```markdown
# Spec NN — <user-visible feature name>

## What user does

1. <Action 1, naming the UI element if applicable>
2. <Action 2>
3. <Observable outcome>

## Where it lives

| Layer | What runs here |
|---|---|
| Frontend (`frontend/`) | <component>.tsx — calls X |
| Rust (`proxy-rs/`) | none / passes through / handles in Y crate |
| Python (`v2-mvp/`) | <handler in server.py> |
| On-chain (`programs/keyshield/`) | none / writes Z PDA |

## Wire shape

Method, path, query, body, response, error states.
```

Then the technical sections (cache key, AES details, etc.) follow.
**Reverse the order from how Stage 1 specs were written** — user
behavior at the top, byte layout at the bottom.

## Rust / Python / Frontend / On-chain decision tree

For a NEW feature, decide where it lives by walking these gates in order:

1. **Does it require Solana on-chain state?**
   → `programs/keyshield/` (Rust + pinocchio, mandatory for Solana).
   Examples: PDA-based agent grants, on-chain payment streams, ZK proof
   anchors.

2. **Is it a UI surface (something the user sees and clicks)?**
   → `frontend/` (React + Vite + Tailwind, doubles as Chrome extension).
   Examples: vault list, add-key modal, billing dashboard, agent
   registration form.

3. **Is it a hot-path key-injecting proxy call?**
   ("Hot path" = fires on every agent API call, latency-sensitive,
   security-critical because keys touch it.)
   → `proxy-rs/` (Rust + axum + reqwest). The bar to qualify: this code
   runs ≥ 100× per session AND a bug here leaks user keys or adds > 10ms.
   Examples: bearer → session lookup, vault decrypt, upstream forward,
   cache HIT/MISS, Helius RPC dispatch.

4. **Anything else** (which is most things) → `v2-mvp/src/` (FastAPI Python).
   Examples: passkey register/login, wallet auth, Solana topup
   verification, x402 payment verification, agent delegation, usage
   analytics, vault writes, all CRUD.

The Python rule has two strong reasons:
- **Library availability**: WebAuthn (`fido2`), Solana RPC (`solana-py`),
  Pyth oracle (`hermes-client`), x402 verification (`x402-py`), base58 +
  ed25519 — all mature in Python. Reimplementing in Rust adds days of bug
  surface for code that runs once per session.
- **Iteration cost**: control-plane code changes weekly; hot-path code
  changes monthly. Slower-to-iterate language (Rust) is the wrong place
  for fast-moving code.

## "Out of scope" doesn't mean "not in the product"

If a spec says "out of scope" it must say WHICH ONE:

- **Out of scope for THIS spec** (covered by another spec) — link the
  other spec.
- **Out of scope for stage N** (deliberate timeline cut) — link the
  Stage-N+1 plan.
- **Not part of the product** — actually delete the feature; don't leave
  zombie references in README.

Mixing these up is what got Stage 1 BOUNDARY.md in trouble.

## Test like a user

Per `DEVELOPMENT.md`'s "Test posture" table, today's CI catches:
- Unit tests (Rust, TS workspaces, Python)
- Integration tests (Rust, sync-worker)
- Byte parity (oracle_diff harness)
- Build success (frontend tsc + vite build)

It does **not** catch:
- "I open the dashboard and clicking the Add Key button does nothing"
- "Login with passkey shows a 500 because the server changed an error
  shape"
- "The agent SDK chokes on a header rename"

These need **end-to-end tests**. Recommended next step:
- `proxy-rs/tests/e2e/passphrase_login.spec.ts` (Playwright) that runs
  `bash scripts/dev.sh` in CI, opens http://localhost:5173, types a
  user/passphrase, asserts the dashboard renders the vault list.
- One e2e spec per top-level user action: register passkey, store API
  key, list keys, call `/proxy/openai`, top up via Solana.
- Run on PR via a new `e2e.yml` workflow with a 5-minute job timeout.

A spec for a new feature is **not done** until it has at least one e2e
test that exercises the user flow end-to-end through the running stack.

## Template

When you write the next spec, copy this:

```markdown
# Spec NN — <user-visible feature, e.g. "Add API key to vault">

## What the user does

1. User clicks "Add key" in `frontend/components/AddKeyModal.tsx`.
2. Modal asks for upstream + key value.
3. Frontend POSTs to `/manage/store` with the bearer.
4. On success, vault list refreshes and the new entry shows up.

## Where it lives

| Layer | Code | What it does |
|---|---|---|
| Frontend | `components/AddKeyModal.tsx` + `hooks/useVaults.ts` | UI + fetch |
| Rust | none — fallthrough | reverse-proxies POST to Python |
| Python | `v2-mvp/src/server.py:679` `/manage/store` | validates + encrypts + writes |
| Storage | `v2-mvp/vault/{user}/{upstream}.enc` | AES-256-GCM file |
| On-chain | none |

## Wire shape

`POST /manage/store` (Bearer auth)
Body: `{"upstream": str, "apiKey": str}`
200: `{"ok": true}`
400: upstream not in allowlist
401: missing/expired bearer

## Storage format

(...AES-256-GCM byte layout, salt/nonce sizes — same as spec 01...)

## E2E test

`tests/e2e/add_key.spec.ts` — opens dashboard, signs in with test
passphrase, clicks Add Key, fills `openai` + `sk-test`, asserts the
new card appears in the vault list with name "openai".

## Test plan (unit-level)

(...AES decrypt round-trip, error cases, etc...)
```

## Stage 1 specs that should be rewritten in this style

If a future agent has slack time, refactor:
- Spec 01 (vault format) → "User stores an API key" anchored
- Spec 02 (session) → "User logs in" anchored
- Spec 06 (batch) → "Agent fires 5 RPC calls in parallel" anchored

Don't delete the technical content — wrap it in user context.
