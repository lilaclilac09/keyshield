# 10 — Embedded wallet (STUB — not a full spec)

> **Status: 1-page stub, NOT yet a full spec.** Exists to prevent spec 09
> Phase 3 from baking in API assumptions that break when this gets
> promoted. **Must be expanded into a full spec before any code on the
> `PaymentInterceptor` impl is written** (i.e., before spec 09's
> Phase 4 starts).
>
> Created 2026-04-30 in response to Architect review of spec 09 which
> identified that "deferring x402 to spec 10 (which doesn't exist)" was
> the same antipattern as the dead `frontend/components/sections/ActivitySection.tsx:166-167`
> calls to `/mpp/streams/*` (frontend UI for a backend that doesn't
> exist).

## What user does

A user opens AgentsSection, clicks "Give this agent a wallet", optionally
tops up with USDC. The agent then makes API calls; when an upstream
returns HTTP 402, the agent's wallet pays from its on-chain escrow
without owner involvement.

## Where it lives

| Layer | Status | Code |
|---|---|---|
| On-chain `EphemeralSigner` PDA struct | ✅ shipped | `programs/keyshield/src/state.rs:309` |
| On-chain `CreateEphemeralSigner` ix #23 | ✅ shipped | `programs/keyshield/src/lib.rs:120` |
| On-chain `pay_x402` ix | 🔴 **not yet written** | future ix #24 (?) in `programs/keyshield/src/instructions/` |
| On-chain `TopUpEphemeralSigner` ix | 🔴 **not yet written** | future ix #25 (?) |
| `PaymentStream` PDA wiring | 📋 designed only | state.rs:324; `open_stream` / `settle_stream` ixs missing |
| Python `POST /agents/{id}/wallet/create` | 🔴 not yet built | new endpoint in `v2-mvp/src/server.py` |
| Python `POST /agents/{id}/wallet/topup` | 🔴 not yet built | same |
| Python `GET /agents/{id}/wallet/balance` | 🔴 not yet built | same |
| Python `/billing/topup` x402 verify | ⚠️ stubbed | `v2-mvp/src/server.py:1067 # TODO` |
| Python `/mpp/streams/{open|record|settle|close}` | 🔴 frontend already calls these, backend doesn't exist | `v2-mvp/src/server.py` (would-be new) |
| Frontend "Give wallet" button + balance + topup UI | 🔴 not yet built | `frontend/components/sections/AgentsSection.tsx` |
| Frontend MPP stream UI | ⚠️ shipped, hits dead endpoints | `frontend/components/sections/ActivitySection.tsx:166-167` |
| Rust `EmbeddedWallet` struct + `PaymentInterceptor` impl | 🔴 not yet built | future `proxy-rs/crates/ks-wallet/` |

## Open questions for the full spec

These need answers before promoting to full spec status:

1. **`pay_x402` instruction shape.** Inputs: agent's EphemeralSigner +
   PaymentStream PDA + amount + recipient. Outputs: signature usable as
   `X-Payment-Proof`. CPI to SPL Token Program for the USDC transfer?
2. **`X402Envelope` wire format.** Adopt Coinbase's x402 spec verbatim
   or extend with KeyShield-specific fields (e.g., `accepted_via_pda`)?
3. **MPP vs x402 — separate code paths or merged?** The current
   `frontend/components/sections/ActivitySection.tsx:166-167` calls
   `/mpp/streams/{open|record|settle|close}` — these are streaming
   metered payment endpoints, distinct from per-call x402 retry. Do
   they share the same `PaymentStream` PDA backing them, or different?
4. **`EphemeralSignerProvider` trait shape.** What does it sign — a
   raw ed25519 signature over the x402 envelope bytes? A full Solana
   transaction including the `pay_x402` ix? Different trait shape =
   different `EmbeddedWallet` constructor.
5. **Top-up flow.** Owner signs USDC transfer to PaymentStream PDA?
   Or owner pre-funds an escrow that the agent draws from? What's the
   refund-to-owner path on agent revocation?
6. **Recovery on agent revocation.** When owner revokes agent (calls
   `/agents/{id}` DELETE), what happens to the agent's wallet balance?
   Auto-refund? Burn? Kept for owner to manually claim?
7. **Rate caps.** PaymentStream has a `max_rate_usd_per_min`. Is this
   enforced on-chain (more secure, more complex) or off-chain by the
   server (simpler, trustful of the server)?

## Phases (when this gets promoted)

| Phase | Slice | Eng-days | Depends on |
|---|---|---|---|
| 10.0 | This stub becomes a real spec (answer the 7 questions above) | 0.5 | none — PM work |
| 10.1 | `pay_x402` + `TopUpEphemeralSigner` Solana ixs | 1.5 | 10.0 |
| 10.2 | Python `/agents/{id}/wallet/*` endpoints | 1.5 | 10.1 |
| 10.3 | Frontend AgentsSection wallet UI | 1.5 | 10.2 |
| 10.4 | Rust `EmbeddedWallet` + `PaymentInterceptor` impl | 1 | 10.2 |
| 10.5 | Wire ks-helius's `PaymentInterceptor` slot to `EmbeddedWallet` (= spec 09 Phase 4) | 0.5 | 10.4, spec 09 Phase 1 |
| 10.6 | Python `/mpp/streams/*` (kills the P0 frontend dead-endpoint bug) | 2 | 10.1 |

**Total:** ~8.5 engineer-days plus a meaningful PM pass to write the
full spec answering Q1-Q7.

## Why this stub matters

The Architect explicitly called out: "Without this stub, the
HeliusClient v2 will hard-code its `PaymentInterceptor` constructor
in a way that doesn't match the eventual EmbeddedWallet API, and we'll
spend Phase 3 + Phase 4 unwinding that decision."

Treat this stub as a **commitment device**: by the time spec 09 Phase 3
is half done, the user (PM) must have promoted this stub to a full
spec. Otherwise either (a) Phase 4 silently slips Stage-2 forever, or
(b) the typed-wrapper API gets changes after engineers have written
~45 method wrappers.

## Promotion checklist

- [ ] Q1-Q7 answered with concrete byte/instruction-level designs
- [ ] On-chain ix ABI documented (account list, data layout)
- [ ] HTTP wire shape for `/agents/{id}/wallet/{create,topup,balance}`
- [ ] Phase ordering with engineer-days (refines the table above)
- [ ] Acceptance criteria per phase
- [ ] Test plan: unit + integration + on-chain (Mollusk + Surfpool)
