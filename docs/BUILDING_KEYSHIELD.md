# Building KeyShield, Spec-First

> *How I designed an agent-grade API-key vault by writing the protocol before the code.*

KeyShield is *"iCloud Keychain for your API keys."* You store a key once, and from then on you plug into a vault instead of copy-pasting `.env` files — calls get encrypted, delegated, and accelerated on the way out. This is the story of how it was built **spec-driven**: the contract came first, the code followed.

---

## Why spec-first

KeyShield is not one app — it's six surfaces that all have to agree on the same security model:

- a **browser vault UI** (TypeScript),
- a **control-plane router** (Python / FastAPI),
- a **hot-path Rust proxy**,
- a **browser extension**,
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

The spec reduces the whole system to three objects:

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

The server receives and stores only the ciphertext. Decryption requires the user's device, which gives KeyShield its zero-knowledge property: a server compromise leaks ciphertext, not keys.

### 2. Session tokens — short-lived bearer credentials
Tokens look like:

```
ksv2_<base58(random_32_bytes)>
```

Server-side, each token carries a payload: user ID, vault-key reference, provider, **scopes**, **spending cap**, and **expiry**. Tokens are verified on *every* proxy request — there is no "trusted once" path.

### 3. Proxy — decrypt-in-memory reverse proxy (Rust)
The Rust proxy is the only place a key is ever in plaintext, and only for the duration of a single upstream request. On top of the security role it does the performance work: a **two-tier cache (memory + disk)** with **single-flight dedup** so identical calls collapse into one, landing Solana RPCs in a **50–80 ms** band.

---

## Delegation & revocation

This is the part built specifically for agents. A human issues a delegated token to an agent with a **strict subset** of their own permissions — narrower scopes, a spending cap, an expiry. The agent operates entirely through that token and never touches a raw key.

Revocation was designed to be boring and instant: because tokens are checked on every request, killing one takes effect on the *next* call — `401`, no stale-cache lag, and the parent credential is untouched.

---

## How the spec drove the build

The methodology, in order:

1. **Write `SPEC.md` first.** Protocol version, primitives, token format, invariants — all before implementation.
2. **Derive the architecture from the spec**, not the other way around. The six components exist because the spec needed a place to enforce each guarantee (encryption → browser, verification + caps → proxy, issuance → backend, ergonomics → SDK/extension/MCP).
3. **Implement each component against the spec.** Every surface — TS vault, Rust proxy, Python SDK, MCP server, on-chain program — traces a line back to a clause in `SPEC.md`.
4. **Verify on-chain.** The payment-streaming mechanism runs as a Solana devnet program with documented instructions and *verified transactions*, so the economic layer is auditable, not asserted.
5. **Keep the docs as living artifacts.** `SPEC.md`, `AGENTS.md`, `DEVELOPMENT.md`, `DEPLOY.md`, `docs/architecture/`, `docs/API.md`, and `CHANGELOG.md` evolve with the code rather than rotting behind it.

---

## The journey — balancing three languages

The honest version of this project: the hardest design decision wasn't the crypto, it was **deciding which language gets which job**. KeyShield ended up roughly a third TypeScript, a quarter Rust, a quarter Python — and that split wasn't an accident, it was the whole point.

My rule was simple: **put each language where it is strongest, and let the spec be the contract between them** so the seams don't leak.

- **TypeScript — the surfaces humans touch.** The vault UI and the browser extension live in TS. This is where iteration speed and the web ecosystem matter most: WebAuthn, wallet signatures, and the DOM all have first-class TS stories, and I wanted the front door to feel instant to build and change.
- **Rust — the one path that cannot be wrong.** The proxy is the only place a decrypted key exists in plaintext, and it's on the hot path for every single call. That is exactly where I wanted *no* garbage-collector pauses, *no* "it compiled but the type was wrong," and *no* surprise allocations. Rust's ownership model also means a decrypted key has a precise, visible lifetime — it's dropped the moment the upstream request ends, by construction.
- **Python — the control plane and the user-facing SDK.** The control-plane router (auth, session minting, policy) is **FastAPI**, the SDK/CLI is Python (`pip install keyshield`), and there's an MCP server for agents. Almost everyone wiring an AI agent or a script is in Python, and the control plane is a cold path where ergonomics beat raw speed — so adoption wins: the easiest thing in the world should be `from keyshield import ...`.

The thing I had to keep reminding myself: **the spec is what lets three languages cooperate.** As long as the token format, the encryption envelope, and the invariants are pinned in `SPEC.md`, it doesn't matter that the proxy is Rust and the SDK is Python — they're both implementing the *same* document.

---

## Rust vs Python: compilation & correctness

Working across both daily made the difference between them very concrete. They don't even "compile" in the same sense of the word.

| Dimension | **Rust** | **Python** |
|---|---|---|
| Build model | Ahead-of-time → **native machine code** (via LLVM) | Source → **bytecode** (`.pyc`) → run on the CPython VM (interpreted) |
| What "compile" checks | Types, ownership, lifetimes, exhaustiveness — the program **won't build** if they're wrong | Mostly **syntax**; bytecode generation doesn't verify types |
| Type checking | Static, compile-time, mandatory | Dynamic, run-time; type hints are optional and only checked by external tools (`mypy`) |
| Memory | Ownership + borrow checker, **no GC** | Reference counting + cycle collector (GC) |
| When bugs surface | **At compile time** — before it ships | **At run time** — when that exact line executes |
| Iteration speed | Slower builds, more upfront ceremony | Edit-and-run, great for prototyping |
| Runtime | Fast, predictable, no GC pauses | Slower, possible GC pauses |

### The accuracy comparison

When people say Rust is "more accurate," what they usually mean is **where the errors get caught**, and that's the part that actually changed how I worked:

- **Rust shifts correctness left.** A wrong type, a missing case, a use-after-free, an unhandled `None` — none of them compile. By the time the proxy *runs*, an entire class of bugs has already been ruled out. For code that handles plaintext keys and enforces spending caps, that compile-time guarantee is worth the slower build.
- **Python defers correctness to runtime.** The flexibility that makes the SDK pleasant to write is the same flexibility that lets a type mismatch sit quietly until the line executes in production. You buy that safety back with discipline — type hints, `mypy`, tests — but it's opt-in, not enforced by the compiler.

There's a nuance worth being honest about, because it cuts the other way on raw numeric accuracy:

- **Python has arbitrary-precision integers by default** — a big integer just keeps growing, exactly, with no overflow. For ad-hoc big-number math that's genuinely *more* forgiving than Rust.
- **Rust uses fixed-width integers** (`u64`, `i128`, …) and forces me to pick the width and decide what happens on overflow (checked in debug builds, explicit `checked_add` / `saturating_add` in release). That feels like more work — but on a financial hot path enforcing spending caps, *being forced to think about overflow* is the feature, not the friction.

So the trade I settled on: **Python where being wrong is cheap and iteration is king (the SDK); Rust where being wrong is expensive and the machine should refuse to let me be wrong (the proxy).** Spec-first development is what made that division safe — both sides answer to the same `SPEC.md`.

---

## Product & engineering decisions

### Why FastAPI for the control-plane router

The control plane — auth, session minting, policy — is the **cold path**: you mint a token now and then, you set a policy occasionally. The *hot* path (every API call) is the Rust proxy. Once I drew that line, FastAPI was the obvious router:

- **It's async-native.** Starlette + uvicorn handle concurrent token mints and policy checks without blocking — exactly the I/O-bound shape of a control plane.
- **Pydantic makes the spec into types.** The token payload from `SPEC.md` (scopes, spending cap, expiry, provider) becomes a Pydantic model, so request/response validation is free and the code mirrors the spec literally.
- **Self-documenting.** Automatic OpenAPI/Swagger keeps `docs/API.md` honest — the API can't drift from its docs.
- **One Python mental model.** The router, the SDK, and the MCP server are all Python, so everything agent-facing speaks the same language.
- **Clean auth + limits.** Dependency injection and middleware make auth and rate-limiting first-class instead of bolted on.

The summary: the control plane can *afford* Python because it isn't the hot path — and Python buys ergonomics there. The hot path doesn't get that luxury, which is why it's Rust.

### Rate considerations — two performance regimes

KeyShield deliberately runs **two different performance budgets**, split by path:

- **Control plane (FastAPI):** low QPS, latency relaxed. Minting a token is rare, so Python overhead is unmeasurable here.
- **Data plane (Rust proxy):** every single call, 50–80 ms target. This is where the rate work lives:
  - **per-token rate + spending caps** enforced at the proxy,
  - **single-flight dedup** collapses identical concurrent calls into one upstream hit,
  - a **two-tier cache (memory + disk)** shields the upstream RPC,
  - the token is verified on *every* request, but it's an in-memory payload check, so it's cheap.

Because minting is occasional and calling is constant, the design spends its latency budget only where it's actually paid back.

### Frontend considerations

- The **vault UI must feel instant and visibly safe**: all encryption happens client-side, the server only ever sees ciphertext.
- **The trust UX *is* the product.** The passkey / wallet prompt is the visible proof that the key is being sealed locally — that moment is what earns the user's trust.
- The **extension intercepts at the moment of friction** — when you copy a key off a provider dashboard — instead of asking you to go somewhere else and paste it.
- **Minimal new surface:** meet developers in the browser they're already in; don't make them learn another app.

### Why an extension — and why I didn't build "an agent"

The honest product call. The pain was never *"I need another agent."* The pain is the `.env` copy-paste loop and keys leaking into code, logs, and chat history — and that happens in the **browser and the editor**, not inside some agent.

So the wedge is a **browser extension** that captures a key the instant it appears (OpenAI, Anthropic, Helius, …) in one tap. From there:

- I deliberately chose **not** to ship a standalone agent product. The agent space is crowded, and an agent doesn't *solve* the credential problem — it's just another thing that needs keys.
- Instead, KeyShield is the **credential layer that any agent plugs into.** The MCP server stays as an integration so agents *can* use the vault — but the product is the **vault + extension + proxy**, not an agent.
- **Be the infrastructure, not the app on top of it.**

### How passkeys actually work here

Passkeys are what make the zero-knowledge model usable instead of a chore. KeyShield uses **WebAuthn, specifically the PRF extension**:

1. Register a passkey (platform authenticator / device).
2. To unlock, call WebAuthn `get()` with the `prf` extension and a fixed per-vault salt. The authenticator returns a **deterministic, per-credential 32-byte secret** that never leaves the device and is never sent to the server.
3. That PRF output → **HKDF-SHA256** → 32-byte symmetric key → **AES-256-GCM** encrypts/decrypts the vault entry, entirely in the browser.

Why this is the unlock: the key material is derived **on-device from the passkey**, there's no password to phish, and the server still only ever stores ciphertext. For crypto users there's an alternative path — sign a deterministic message with the **wallet**, run it through HKDF, and feed the same AES-256-GCM envelope.

Pragmatics: PRF needs a supporting authenticator/browser, so the **wallet signature is the fallback**; salts are per-context, so different entries derive different keys.

### How I designed the product

The method, start to finish:

1. **Start from the pain**, and design backward from one sentence: *"store a key once, plug in anywhere."*
2. **Pin the trust model first** (spec-first): zero-knowledge + tokens-not-keys. The security model *is* the product promise.
3. **Map three "10x"s to three components:** smoother → extension one-tap capture; more secure → client-side passkey/wallet encryption; faster → Rust proxy.
4. **Pick a wedge, then build outward:** capture (extension) → store (vault) → use (proxy + tokens) → ecosystem (SDK + MCP).
5. **Decide what *not* to build:** not an agent, not another password manager — a **credential layer for the AI-agent era**.

---

## The payment layer — x402 *(in design)*

The piece I'm actively working out: turning `spend_cap_usd` from a *usage* limit into a *real-money* one. Today the spec's spending cap (`"spend_cap_usd": 10.00`) is enforced by the proxy against accumulated usage. The natural next step is to settle those costs as actual stablecoin payments per call — and **x402** is the protocol that makes that clean.

### What x402 is

x402 revives the long-dormant HTTP **`402 Payment Required`** status code and turns it into an internet-native payment handshake: a server can demand payment for a request inline, the client pays, and the request completes — no accounts, no checkout page. It's stablecoin-native (USDC), charges zero protocol fees, and already settles on **Base and Solana**.

### The negotiation

The handshake is exactly the part KeyShield needs:

1. The proxy makes a normal request to a paid upstream.
2. The upstream replies **`402`** with an `accepts[]` array — the payment terms it will take (scheme, amount, network, asset, recipient).
3. The proxy **picks terms within the token's `spend_cap_usd`**, signs a transfer authorization (on Solana), and retries the request with an **`X-PAYMENT`** header (base64-encoded payload).
4. A **facilitator** verifies the signature and **settles on-chain**.
5. The upstream returns **`200`** plus an **`X-PAYMENT-RESPONSE`** header carrying the settlement tx hash.

That `accepts[]` ↔ `X-PAYMENT` exchange *is* the negotiation: the server advertises what it'll take, and the proxy chooses what it's allowed to pay.

### Why it fits KeyShield exactly

- **The cap becomes a budget.** Every settled x402 payment decrements `spend_cap_usd`. When it's exhausted, the proxy simply stops negotiating — the agent has a hard, autonomous spending ceiling, enforced at the one chokepoint that already verifies every request.
- **The proxy is already the right place.** KeyShield's Rust proxy is the single point every call passes through. Speaking x402 there means agents pay per call without ever holding a wallet or a raw key — they hold a scoped token, and the proxy does the settlement.
- **Two directions.** KeyShield can be an x402 **client** (paying upstreams on the agent's behalf) and, later, an x402 **resource server** (metering and charging for its own proxy).
- **It lines up with the on-chain work.** The verified Solana payment-streaming mechanism is the settlement substrate; x402 is the request-time protocol that drives it.

### Status

This is **design, not shipped**: the spec today defines `spend_cap_usd` as a usage limit, and the x402 settlement path is what I'm specifying next — spec-first, same as everything else. The invariants don't change: raw keys never move, agents hold tokens not wallets, and revocation stays immediate.

---

## What spec-first bought me

- **A trust boundary I can point at.** Security claims live in one reviewable document, not scattered across commits.
- **Six components that actually agree.** Each was implemented against the same contract, so the proxy, SDK, and extension share one mental model.
- **Cheap change.** When something needs to move, I edit the invariant or the primitive first and let the diff propagate — instead of discovering the disagreement in production.

---

## Try it / read more

- **Live:** <https://app.ks.aileena.xyz>
- **Code:** <https://github.com/lilaclilac09/keyshield>
- **Spec:** [`SPEC.md`](https://github.com/lilaclilac09/keyshield/blob/main/SPEC.md)
- **Python SDK:** `pip install keyshield`

*Spec first. Code second. Keys never.*

---

## E2E test journey and goal

The spec-driven script is [`scripts/live_e2e_run.ts`](https://github.com/lilaclilac09/keyshield/blob/main/scripts/live_e2e_run.ts). Default is dry-run (`npm run live:e2e:dry`). Live spend is opt-in (`LIVE_E2E=1`).

**Goal.** Prove the spec on **Solana Devnet USDC**, not a second chain: a session token (never a raw key) reaches the proxy, fulfillment produces a **32-byte** artifact, then `MppSettle` (ix 26) debits `tokens × price`. A 502, empty 200, or truncated SSE must not settle.

**On-chain order.** `CreateUniversalVault` (ix 10) → Session Grant `GrantAgentAccess` (ix 20) → `OpenStream` (ix 24) → meter → `MppSettle` (ix 26) → close / withdraw.

The proxy can forward across environments (`/proxy`, `/vproxy`). That is proxying, not a second settlement chain. Tempo TIP-1034 wallet vouchers are **not** this journey.

**Journey.**

| Stage | Command | What it proves |
|---|---|---|
| **1** | `npm run test:bankrun` | Slot warp, clawback window 6115, tombstone, no double-claim |
| **2** | `cargo test -p keyshield --test fuzz_invariants` | Escrow = deposit − spent; spent ≤ cap; bad settles do not mutate |
| **3** | `npm run test:fault` | 502 / empty / garbage → no `mpp_settle` |
| **4 dry** | `npm run live:e2e:dry` | Path + TS/Python sha256 + HMAC + binding parity. Merge gate. |
| **4 live** | `LIVE_E2E=1 npm run live:e2e` | One real inference through the proxy, then confirmed OpenStream / MppSettle |

Stage 4 steps inside the script:

0. Fixtures + crypto parity (TypeScript ↔ Python).
1. Universal Vault + `PAYMENT_ENABLED` + GrantAgentAccess; open a 5 USDC stream (off-chain row + ix 24).
2. Wallet-login → `POST /proxy/<provider>/...` with `Bearer ksv2_…`.
3. SSE; read `x-ks-mpp-meter` / tokens.
4. `sha256(artifact)` + session HMAC → capture → `mpp_settle`.
5. Assert `spent_total == tokens_used * price_per_token`.
6. Close; remaining USDC returns to the client ATA (or stays conserved in the stream ATA).

`npm run test:harness` is Stages 1 + 3 + 4 dry-run. Reviewer checklist: [`keyshield.md`](https://github.com/lilaclilac09/keyshield/blob/main/keyshield.md).

---

## Lessons learnt

1. **The spec is the contract between languages.** Token format, encryption envelope, and the five invariants live in one document. If a feature cannot keep them, the feature changes.
2. **Put the language where a bug is expensive.** Rust on the inject-once path. Python on the SDK and the cold control plane. TypeScript where humans click.
3. **Do not publish unmeasured latency.** Cache and single-flight are real. “50–80ms” as a product claim is not, until a named environment is measured.
4. **Discriminators over Explorer copy.** A confirmed tx can still be OpenStream (24) when someone labeled it MppSettle (26).
5. **No fulfillment, no settle.** 502 / empty / truncated SSE must not `mpp_settle`. Hold, then hash, then debit.
6. **Solana USDC MPP is the settlement core.** Universal Vault + Session Grant + OpenStream / MppSettle. Tempo vouchers are an archive, not a chain to put on the front of the product.
7. **The front page is the install path.** If Chrome load-unpacked lives only in Docs, people never see it. Login + Home, Chrome preferred. No Web Store listing yet.
8. **Two meters.** Seats are monthly. Agent calls are PAYG. Mixing them into one flat invoice is how a runaway bot becomes an unlimited month.
9. **Dry-run is the gate; live is a spend.** `npm run live:e2e:dry` must stay green without operator USDC. `LIVE_E2E=1` is explicit.
10. **Inspect before patch.** Read the live path, name the root cause, ship the smallest diff. A code read is not acceptance. Missing a check is reported, not implied.
11. **Stacked agent PRs look like clones.** GitHub `MERGEABLE` is vs the stacked base, not vs `main`. Close the stack; land the unique bit once.
12. **OpenRouter “free” still needs the user’s key.** Nemotron `:free` is not a public unauthenticated proxy. Session first, then `sk-or-…`.
13. **Don't mix the personal site into the product.** `aileena.xyz` is not KeyShield. App is `app.ks.aileena.xyz`.
14. **Be the infrastructure, not another agent.** Extension + vault + proxy. Agents plug in.
