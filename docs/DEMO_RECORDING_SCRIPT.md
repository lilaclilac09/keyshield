# KeyShield — 2-minute record-demo script

This is the voiceover script for `npm run demo:record`. It is **not**
proof that a take exists. Recordings live outside Git (see
[EVIDENCE_INDEX.md](EVIDENCE_INDEX.md)). Scene table:
[DEMO_STORYBOARD.md](DEMO_STORYBOARD.md).

The harness talks to a **local mock upstream** for SSE and the 502
clawback, and to **Solana Devnet RPC** for wallet balances and the
latest confirmed program transaction. Do not present the printed
`ksv2_sess_…` token as a live WebAuthn ceremony. Do not quote canned
figures (`240.50 USDC`, `68ms`, `4,120 CU`, the 84-character
`678bq…XTQc` paste). Read the numbers this take prints.

Run the harness (no prompts):

```bash
bash scripts/record_demo.sh                 # default 2500ms step gap
bash scripts/record_demo.sh --fast          # CI / verify
bash scripts/record_demo.sh --split         # also tail mock + ks-proxy in tmux
bash scripts/record_demo.sh --split --pace 28000   # ~2 minute server take
```

Default wallet is `.keyshield-devnet/user-devnet.json` (override with
`KS_RECORD_WALLET` / `KS_RECORD_WALLET_KEYPAIR`).

Components:

| Pane | Process |
|---|---|
| A | `scripts/record_demo_mock_upstream.mjs` — `X-Test-Scenario: stream_success` / `fault_502` |
| B | `ks-proxy` (`RUST_LOG=info`, `KS_UPSTREAM_OVERRIDE_BASE` → mock) |
| C | `scripts/record_demo_client.ts` (steps 1–5) + `npm run test:fault` |
| D | OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free` when a saved vault/env key is present; otherwise the local plug-in |

Do not paste live secrets into the recording.

---

## STEP 1 — Session wallet (0:00 – 0:25)

**Visual:** Local pubkey, Devnet SOL + USDC from RPC, ephemeral `ksv2_sess_…` scoped to NVIDIA / OpenRouter / DeepSeek.

**Action:** Point at the pubkey and the two balances. Those must match Explorer and `/keychain/home`.

**Voiceover:**

> Agents should never hold root API keys. This session wallet is the local Devnet owner KeyShield already uses for MPP. Balances come from RPC, not a slide.

---

## STEP 2 — PRF stand-in and zero clipboard (0:25 – 0:50)

**Visual:** Ciphertext seal. `pbpaste` / xclip reports `0 bytes`.

**Action:** Stay on the 0-byte clipboard line. Say it is a SHA-256 stand-in when no Secure Enclave is in the take.

**Voiceover:**

> The production path is WebAuthn PRF to HKDF to AES-GCM on the device. This recording seals a fixture key the same way and proves the clipboard never held it.

---

## STEP 3 — SSE through ks-proxy (0:50 – 1:20)

**Visual:** `X-Test-Scenario: stream_success` through `/proxy/openai/v1/chat/completions`. TTFT and total are measured.

**Action:** Read the printed milliseconds. Do not say “under 80ms” unless this take measured it. `ks-proxy` does not depend on the Rust `zeroize` crate — do not claim crate-level memory zeroization.

**Voiceover:**

> The Rust proxy injects the upstream key for one hop, streams the mock SSE body, and never persists plaintext. The number on screen is the clock for this call.

---

## STEP 4 — Devnet tx + dashboard (1:20 – 1:50)

**Visual:** Program `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j`. Latest confirmed signature, slot, instruction discriminator, compute units. Dashboard SOL/USDC matching RPC.

**Action:** Open the printed Explorer URL. The 84-character `678bq…` paste is WrongSize — ignore it.

**Voiceover:**

> This is the Pinocchio program on Devnet. Compute units are whatever `getTransaction` returned, not a marketing cap. The dashboard snapshot must match the same wallet.

---

## STEP 5 — 502 under HOLD, clawback (1:50 – 2:20)

**Visual:** HOLD 0.05 USDC → `fault_502` → Stream hash FAILED (Truncated EOF) → UNILATERAL CLAWBACK EXECUTED → capital lost 0.00 USDC.

**Action:** Stay on `capital lost: 0.00 USDC`. Say the clawback in this take is the local ledger; the live analog is the Withdraw in STEP 4.

**Voiceover:**

> Pay-before-fulfillment settles even when the upstream returns 502. KeyShield holds first, hashes the stream, and claws back on truncated EOF so unverified work cannot debit the wallet.

---

## OpenRouter plug-in (Component D)

Scene D looks for a previously saved OpenRouter key in `OPENROUTER_API_KEY`, `KS_OPENROUTER_API_KEY`, `KS_OPENROUTER_API_KEY_FILE`, or `src/backend/data/vault_shim.db`. A live key (40+ chars) calls `nvidia/nemotron-3-ultra-550b-a55b:free` and prints only a masked prefix plus the model output. Otherwise the same model id is served from the local mock so the take still completes.
