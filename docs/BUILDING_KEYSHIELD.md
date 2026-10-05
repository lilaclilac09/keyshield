# Building KeyShield, Spec-First

> *How I designed an agent-grade API-key vault by writing the protocol before the code.*

KeyShield is *"iCloud Keychain for your API keys."* You store a key once, and from then on you plug into a vault instead of copy-pasting `.env` files — calls get encrypted, delegated, and settled on the way out. This is the story of how it was built **spec-driven**: the contract came first, the code followed.

**Live:** [app.ks.aileena.xyz](https://app.ks.aileena.xyz) · **Code:** [lilaclilac09/keyshield](https://github.com/lilaclilac09/keyshield) · **Spec:** [`SPEC.md`](../SPEC.md)

This essay is the source I keep in sync with [the profile page](https://github.com/lilaclilac09/lilaclilac09/blob/main/keyshield.md). The reviewer checklist (Devnet slots, four-stage commands) lives in [`keyshield.md`](../keyshield.md). The Stage 4 script that *is* the spec on the wire is [`scripts/live_e2e_run.ts`](../scripts/live_e2e_run.ts).

---

## Why spec-first

KeyShield is not one app — it's six surfaces that all have to agree on the same security model:

- a **browser vault UI** (TypeScript),
- a **control-plane router** (Python / FastAPI),
- a **hot-path Rust proxy**,
- a **browser extension** (Chrome preferred; load unpacked from `src/extension`),
- a **Python SDK / CLI**, and
- an **MCP server** so AI agents can use it.

When six components share one trust boundary, "we'll figure out the interface as we go" is how you end up with a vault that leaks. So before writing a feature, I wrote **`SPEC.md` (v0.1)** — a protocol for *agent credential delegation* — and locked down a short list of invariants. Everything else is downstream of that document.

---

## The invariants (the part that can never regress)

These were written into the spec on day one and treated as non-negotiable:

1. **Raw keys never leave the vault.** The server stores *ciphertext only* and cannot decrypt at rest.
2. **Agents get tokens, not keys.** Agents receive scoped, short-lived session tokens — never the underlying API key.
3. **Raw keys never persist in logs or agent processes.**
4. **Per-agent spending caps are enforced at the proxy**, not on the honor system.
5. **Revocation is immediate** — no TTL window. The next request after revocation returns `401`.

Every later design decision had to be checkable against this list. If a feature couldn't preserve all five, the feature changed — not the invariant.

---

## The protocol, in three primitives

### 1. Vault — encrypted client-side storage

Encryption happens **in the browser**, never on the server:

```
device credential (WebAuthn PRF / wallet signature)
        │
        ▼
   HKDF-SHA256  ──►  32-byte key
        │
        ▼
   AES-256-GCM.encrypt(api_key, nonce)  ──►  ciphertext
```

The server receives and stores only the ciphertext. Decryption requires the user's device.

### 2. Session tokens — short-lived bearer credentials

Tokens look like `ksv2_<base58(random_32_bytes)>`. Server-side, each token carries user ID, vault-key reference, provider, **scopes**, **spending cap**, and **expiry**. Tokens are verified on *every* proxy request — there is no "trusted once" path.

### 3. Proxy — inject-once reverse proxy (Rust + Python)

The proxy is the only place a key is used in plaintext, and only for one upstream call (`X-Upstream-API-Key`). It is never written to disk. On the performance side it has a **two-tier cache (memory + disk)** and **single-flight dedup** so identical read-only RPCs collapse into one upstream hit.

Latency is an **engineering target**, not a published SLA. Do not quote “instant”, “under 50ms”, or “50–80ms” until that path is measured in a named environment. A 2026-10-05 loopback mock of Python `/proxy` (fake 0 ms upstream) was ~13 ms p50 including usage logging — not production WAN, not a real model, not the Rust Helius cache.

---

## Delegation & revocation

A human issues a delegated token to an agent with a **strict subset** of their own permissions — narrower scopes, a spending cap, an expiry. The agent operates entirely through that token and never touches a raw key. Killing a token takes effect on the *next* call — `401`, parent credential untouched.

---

## Goal of the spec-driven e2e

**Prove the spec on Solana Devnet USDC, not a second chain.**

A session token (never a raw key) must reach the proxy, fulfillment must produce a **32-byte** artifact, and `MppSettle` (ix 26) must debit `tokens × price`. A 502, empty 200, or truncated SSE **cannot** settle. Dry-run is the merge gate. Live spend is opt-in (`LIVE_E2E=1`).

Core settlement layer:

`CreateUniversalVault` (ix 10) → Session Grant `GrantAgentAccess` (ix 20) → `OpenStream` (ix 24) → meter → `MppSettle` (ix 26).

The proxy can forward across environments (`/proxy`, `/vproxy`). That is proxying, not a second settlement chain. Tempo TIP-1034 wallet vouchers are **not** this journey.

---

## The e2e journey

The implementation, not a wishlist. Commands from the repo root. Script: [`scripts/live_e2e_run.ts`](../scripts/live_e2e_run.ts).

| Stage | Command | What it proves |
|---|---|---|
| **1** | `npm run test:bankrun` | Slot warp, clawback window 6115, tombstone, no double-claim |
| **2** | `cargo test -p keyshield --test fuzz_invariants` | Escrow = deposit − spent; spent ≤ cap; bad settles do not mutate |
| **3** | `npm run test:fault` | 502 / empty / garbage → no `mpp_settle` |
| **4 dry** | `npm run live:e2e:dry` | Path + TS/Python sha256 + HMAC + binding parity. Default. |
| **4 live** | `LIVE_E2E=1 npm run live:e2e` | One real inference through the proxy, then confirmed OpenStream / MppSettle. Needs operator USDC + an upstream key. |

Stage 4 steps inside the script:

0. Fixtures + crypto parity (TypeScript ↔ Python).
1. Universal Vault + `PAYMENT_ENABLED` + GrantAgentAccess; open a 5 USDC stream (off-chain row + ix 24).
2. Wallet-login → `POST /proxy/<provider>/...` with `Bearer ksv2_…`.
3. SSE; read `x-ks-mpp-meter` / tokens.
4. `sha256(artifact)` + session HMAC → capture → `mpp_settle`.
5. Assert `spent_total == tokens_used * price_per_token`.
6. Close; remaining USDC returns to the client ATA (or stays conserved in the stream ATA).

`npm run test:harness` is Stages 1 + 3 + 4 dry-run.

---

## How the spec drove the build

1. **Write `SPEC.md` first.** Protocol version, primitives, token format, invariants — all before implementation.
2. **Derive the architecture from the spec**, not the other way around.
3. **Implement each component against the spec.**
4. **Verify on-chain** with instruction **discriminators**, not Explorer captions. Confirmed OpenStream / MppSettle slots are in [`keyshield.md`](../keyshield.md).
5. **Keep the docs as living artifacts.** `SPEC.md`, `AGENTS.md`, `keyshield.md`, `docs/PAYMENT-FLOWS.md`, `docs/API.md`.

---

## The journey — balancing three languages

The hardest design decision wasn't the crypto, it was **which language gets which job**. Roughly a third TypeScript, a quarter Rust, a quarter Python — that split was the point.

**Put each language where it is strongest, and let the spec be the contract** so the seams don't leak.

- **TypeScript — surfaces humans touch.** Vault UI, Chrome extension, wallet / WebAuthn.
- **Rust — the path that cannot be wrong.** Hot-path proxy: no GC pause on a decrypted key, ownership as a visible lifetime.
- **Python — control plane and SDK.** FastAPI for auth / sessions / MPP ledger; `pip install keyshield` for agents.

### Rust vs Python: where errors get caught

Rust shifts correctness left (types, ownership, exhaustiveness). Python defers it to runtime unless you buy it back with tests and type-checkers. On a financial hot path, being forced to pick integer width and overflow behavior is the feature. Python's arbitrary-precision ints are nicer for ad-hoc math; they are not how `micro_usdc` is settled on-chain.

**Python where being wrong is cheap (SDK). Rust where being wrong is expensive (proxy).** Both answer to the same `SPEC.md`.

---

## Product & engineering decisions

### Why FastAPI for the control-plane router

Auth, session minting, and MPP hold/capture are the **cold path**. The *hot* path is the Rust proxy. FastAPI is async, Pydantic maps the spec into types, OpenAPI keeps `docs/API.md` honest, and the SDK/MCP stay in one Python mental model.

### Two performance regimes

- **Control plane:** low QPS. Python overhead is not the bill.
- **Data plane:** every call. Per-token caps, single-flight, two-tier cache. Token verify is in-memory and cheap. Publish a number only after a named measurement.

### Frontend

The vault UI must feel safe: encryption is client-side. The passkey prompt *is* the product. The **Chrome extension** (preferred) captures a key on OpenAI / Anthropic / OpenRouter / Groq / Helius pages. There is no Chrome Web Store listing yet — load unpacked from `src/extension`. Those steps belong on the **login screen and Home**, not only in Docs. Firefox is a temporary add-on (`manifest.firefox.json`), not preferred.

### Why an extension — and why I didn't build "an agent"

The pain is the `.env` copy-paste loop. An agent doesn't solve credentials; it is another consumer of keys. KeyShield is the **credential layer any agent plugs into**. MCP exists so agents *can* use the vault. The product is vault + extension + proxy, not another agent.

### How passkeys work here

WebAuthn **PRF** → HKDF-SHA256 → AES-256-GCM, on-device. Wallet signature is the fallback when PRF isn't available. The server still only stores ciphertext.

### Two meters, not one invoice

**Subscription** pays for devices and the control plane (humans have calendars). **Pay-as-you-go** (ledger / MPP / x402) pays for agent calls (bots are bursty). Plans: Free / Plugin / Accelerate. Device levels: personal / companion / runtime.

---

## The payment layer — shipped, Solana-core

Three paying paths exist today. Byte-level walkthrough: [`docs/PAYMENT-FLOWS.md`](PAYMENT-FLOWS.md).

| Path | When | Chain |
|---|---|---|
| Prepaid SOL / USDC top-up | Humans buying credit | Solana |
| **MPP streaming / escrow** | Long agent jobs | **Solana USDC** — Universal Vault, Session Grant, OpenStream, MppSettle |
| x402 | Zero-setup per-call | HTTP 402 + USDC; not a replacement for MPP escrow |

x402 is **not** "in design only". It is the pay-as-you-go handshake when there is no open stream and no prepaid balance. MPP is the streaming settlement substrate. An open MPP stream skips the extra 402 round trip (`X-Mpp-Stream-Id`).

**Not a product surface:** Tempo wallet session vouchers (TIP-1034, chain 4217, pathUSD). They were prototyped on the proxy and left out of the live binary. If a form asks about Tempo or “which chain”: Solana is the core settlement layer; the proxy also does cross-environment forwarding and can host payment-flow *extensions*. Those extensions are not the live settlement chain.

Settlement vs delivery: `hold_estimate` → `verify_fulfillment` (32-byte hash of a complete non-error body) → capture MAC → `mpp_settle`. Empty or 5xx bodies release the hold. Stage 3 asserts `settled = 0`.

---

## Lessons learnt

1. **The spec is the contract between languages.** Token format, encryption envelope, and the five invariants live in one document. If a feature cannot keep them, the feature changes.
2. **Put the language where a bug is expensive.** Rust on the inject-once path. Python on the SDK and the cold control plane. TypeScript where humans click.
3. **Do not publish unmeasured latency.** Cache and single-flight are real. “50–80ms” as a product claim is not, until a named environment is measured.
4. **Discriminators over Explorer copy.** A confirmed tx can still be OpenStream (24) when someone labeled it MppSettle (26). Read the compiled instruction.
5. **No fulfillment, no settle.** 502 / empty / truncated SSE must not `mpp_settle`. Hold, then hash, then debit.
6. **Solana USDC MPP is the settlement core.** Universal Vault + Session Grant + OpenStream / MppSettle. Tempo vouchers are an archive, not a chain to put on the front of the product.
7. **The front page is the install path.** If Chrome load-unpacked lives only in Docs, people never see it. Login + Home, Chrome preferred.
8. **Two meters.** Seats are monthly. Agent calls are PAYG. Mixing them into one flat invoice is how a runaway bot becomes an unlimited month.
9. **Dry-run is the gate; live is a spend.** `npm run live:e2e:dry` must stay green without operator USDC. `LIVE_E2E=1` is explicit.
10. **Inspect before patch.** Read the live path, name the root cause, ship the smallest diff. A code read is not acceptance. Missing a check is reported, not implied.
11. **Stacked agent PRs look like clones.** GitHub `MERGEABLE` is vs the stacked base, not vs `main`. Close the stack; land the unique bit once.
12. **OpenRouter “free” still needs the user’s key.** Nemotron `:free` is not a public unauthenticated proxy. Session first, then `sk-or-…`.
13. **Don't mix the personal site into the product.** `aileena.xyz` is not KeyShield. App is `app.ks.aileena.xyz`.
14. **Be the infrastructure, not another agent.** Extension + vault + proxy. Agents plug in.

---

## What spec-first bought me

- **A trust boundary I can point at.** Security claims live in one reviewable document.
- **Six components that actually agree.** Proxy, SDK, and extension share one mental model.
- **Cheap change.** Edit the invariant first and let the diff propagate.
- **An e2e that can fail the spec.** The Stage 4 script is not a demo of “it compiled”; it is the journey above, or it is a dry-run that still checks the hashes.

---

## Try it / read more

- **Live:** [https://app.ks.aileena.xyz](https://app.ks.aileena.xyz)
- **Code:** [https://github.com/lilaclilac09/keyshield](https://github.com/lilaclilac09/keyshield)
- **Spec:** [`SPEC.md`](../SPEC.md)
- **E2E script:** [`scripts/live_e2e_run.ts`](../scripts/live_e2e_run.ts)
- **Reviewer checklist:** [`keyshield.md`](../keyshield.md)
- **Python SDK:** `pip install keyshield`

*Spec first. Code second. Keys never. Settle on Solana after fulfillment proves out.*
