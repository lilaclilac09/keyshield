# KeyShield — 2-minute record-demo script

This is the voiceover script for `npm run demo:record`. It is **not**
proof that a take exists. Recordings live outside Git (see
[EVIDENCE_INDEX.md](EVIDENCE_INDEX.md)). Scene table:
[DEMO_STORYBOARD.md](DEMO_STORYBOARD.md).

The harness talks to a **local mock upstream** for SSE and the 502
clawback, a **Unix-socket OpenClaw stand-in** for zero-copy inject, and
**Solana Devnet RPC** for wallet balances and the latest confirmed
program transaction. Do not present the printed `ksv2_sess_…` token as
a live WebAuthn ceremony. Do not quote canned figures (`240.50 USDC`,
`1.2ms`, `68.4ms`, `4,120 CU`). Read the numbers this take prints.

There is no `contracts/` tree in this repo. The Pinocchio program lives
at `src/programs/keyshield/`. Session spec fields match
`SkillConfig` in `src/sdk/packages/openclaw-skill` and the MCP `KS_TOKEN`
shape in `packages/mcp-server`.

Run the harness (no prompts):

```bash
bash scripts/record_demo.sh                 # default 2500ms scene gap
bash scripts/record_demo.sh --fast          # CI / verify
bash scripts/record_demo.sh --split         # also tail mock + ks-proxy in tmux
bash scripts/record_demo.sh --split --pace 28000   # ~2 minute server take
```

Default wallet is `.keyshield-devnet/user-devnet.json`.

| Pane | Process |
|---|---|
| A | `scripts/record_demo_mock_upstream.mjs` — `stream_success` / `fault_502` |
| B | `ks-proxy` (`RUST_LOG=info`) |
| C | `scripts/record_demo_client.ts` (scenes 1–5) + `npm run test:fault` |
| D | OpenRouter Nemotron when a saved key exists; otherwise the mock plug-in |
| E | `scripts/record_demo_openclaw_runtime.mjs` — Unix socket IPC |

Do not paste live secrets into the recording.

---

## Scene 1 — The core problem (0:00 – 0:25)

**Visual:** Left: fixture `exposed.env` and a blank `KS_TOKEN=________________` template. Right: naive agent hits HTTP 502 with prepaid credits already gone. Then the local Devnet wallet balances.

**Voiceover:**

> Building autonomous agents today still requires broken developer ergonomics: copying raw API keys, pasting into plaintext files, and manually filling out boilerplate markdown templates. Worse, agents trade on pay-before-delivery protocols where upstreams fail, but your credits are already gone. This is KeyShield: the hardware-anchored vault and zero-copy runtime plane for autonomous agents.

---

## Scene 2 — DOM interception and WebAuthn PRF (0:25 – 0:50)

**Visual:** In-process intercept of a fixture provider key. Ciphertext seal. `pbpaste` / xclip reports `0 bytes`.

**Action:** This take is a SHA-256 PRF stand-in. There is no headed extension modal and no Touch ID on this Linux host.

**Voiceover:**

> KeyShield completely eliminates manual key handling. When an API key is generated, our browser extension intercepts it directly from the DOM before it ever touches your clipboard. The secret is sealed client-side using AES-256-GCM derived from your hardware enclave via WebAuthn PRF. Zero plaintext on disk, zero clipboard leakage.

---

## Scene 3 — Zero-paste auto-injection into OpenClaw (0:50 – 1:20)

**Visual:** Unix-socket OpenClaw stand-in. HMAC-authenticated IPC injects `ksv2_sess_…` into the runtime process environment. Auto-generated session spec (`SkillConfig` + MCP env) prints with `blanks=0`. Second clipboard check still `0 bytes`. Must finish under 15 seconds.

**Action:** Point at `PROC openclaw pid=… KS_TOKEN=ksv2_sess_…` and `blanks=0`. The developer never typed the token, never wrote `.env`, never filled a markdown template. Do not say “under 80ms” unless this take measured it.

**Voiceover:**

> No copying, no pasting, no filling in blanks. KeyShield dynamically derives and auto-populates the entire runtime configuration. Whether you are running OpenClaw, Cursor, or headless agent fleets, credentials and route policies are injected directly into process memory as ephemeral session tokens. The agent gets instant access to compute without ever seeing the root secret.

---

## Scene 4 — Streaming proxy execution (1:20 – 1:50)

**Visual:** `X-Test-Scenario: stream_success` through `/proxy/openai/v1/chat/completions`. TTFT and total are measured.

**Action:** Read the printed milliseconds. Do not say 1.2ms / 68.4ms / “under 80ms” unless this take measured it. `ks-proxy` does not depend on the Rust `zeroize` crate.

**Voiceover:**

> Production agent loops require raw speed. KeyShield's localized Rust proxy resolves credentials in microseconds, streams tokens with zero-copy chunk piping, and zeroizes memory buffers immediately on socket close. Quote the clock on screen for this call.

---

## Scene 5 — Solana Devnet settlement and 502 clawback (1:50 – 2:30)

**Visual:** Latest confirmed program tx (CU from `getTransaction`) plus HOLD 0.05 USDC → `fault_502` → hash FAILED → unilateral clawback, capital lost 0.00 USDC.

**Action:** Open the printed Explorer URL. The 84-character `678bq…` paste is WrongSize. The clawback in this take is the local ledger; the live analog is the Withdraw on-chain.

**Voiceover:**

> When agents pay for compute, they need settlement guarantees. KeyShield implements an on-chain Hold-Verify-Capture state machine built with Pinocchio on Solana. Funds sit in slot-bounded micro-escrow while response hashes verify in flight. If the upstream drops connection or returns a 502, the protocol triggers an immediate unilateral clawback. Zero lost funds, zero unverified settlements.

---

## OpenRouter plug-in (Component D)

Looks for a previously saved OpenRouter key in env / file / `vault_shim.db`. A live key (40+ chars) calls `nvidia/nemotron-3-ultra-550b-a55b:free`. Otherwise the local mock still completes the take.
