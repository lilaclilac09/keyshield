# KeyShield — 2-minute record-demo script

Run the harness (no prompts):

```bash
bash scripts/record_demo.sh          # paced for a ~2 minute take
bash scripts/record_demo.sh --fast   # CI / verify
bash scripts/record_demo.sh --split  # also tail mock + ks-proxy in tmux
```

Components:

| Pane | Process |
|---|---|
| A | `scripts/record_demo_mock_upstream.mjs` — fast SSE, 502, truncated stream |
| B | `ks-proxy` (`RUST_LOG=info`, `KS_UPSTREAM_OVERRIDE_BASE` → mock) |
| C | `scripts/record_demo_client.ts` + `npm run test:fault` |
| D | OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free` when a saved vault/env key is present; otherwise the local plug-in on the mock |

Do not paste live secrets into the recording. The left-pane `.env` is a fixture under the workdir.

---

## Scene 1 — The core problem (0:00 – 0:35)

**Visual:** Left: `exposed.env` with `OPENAI_API_KEY`, `HELIUS_API_KEY`, `SOLANA_PRIVATE_KEY`. Right: agent hits the mock, HTTP 502, simulated on-chain debit already posted.

**Action:** Highlight the leaked `.env` lines, then the `LOSS` line (funds settled, body empty).

**Voiceover:**

> Every autonomous agent and developer workflow today shares two fatal flaws: root API keys exposed in plaintext `.env` files, and pay-before-delivery protocols where upstreams fail, but your capital is already gone. This is KeyShield: the hardware-anchored iCloud Keychain for AI and on-chain API keys.

---

## Scene 2 — Hardware enclave and zero-clipboard ingestion (0:35 – 1:10)

**Visual:** Terminal shows `PRF` / `SEAL` / `TOKEN ksv2_…`. Clipboard check prints empty.

**Action:** Point at `ciphertext … (server never sees plaintext)` and `clipboard empty`.

**Voiceover:**

> KeyShield turns device biometrics into a zero-latency credential vault. When a key is created, our browser extension captures it directly from the DOM before it ever touches the system clipboard. The secret is sealed client-side using AES-256-GCM, derived from your hardware enclave via WebAuthn PRF. Plaintext credentials never hit disk, remote servers, or clipboard memory.

---

## Scene 3 — Fast-path streaming under 80ms (1:10 – 1:45)

**Visual:** Client `POST /proxy/openai/v1/chat/completions` through `ks-proxy`. Logs show TTFT, total RTT, and `Memory zeroized` / socket close. Optional cut to `RUST_LOG=info` in the proxy pane.

**Action:** Highlight `overhead Nms < 80ms` (or the WARN if the box is slow).

**Voiceover:**

> For agents and high-frequency bots, latency is everything. KeyShield's Rust proxy acts as a localized data plane. It resolves credentials from lock-free memory in microseconds, streams tokens with zero-copy chunk piping, and zeroizes memory buffers immediately after socket transmission. Full security with less than 80 milliseconds of total overhead.

---

## Scene 4 — scvd.store fault and Solana clawback (1:45 – 2:30)

**Visual:** `HOLD` → `FAULT DETECTED` (502 + truncated SSE) → `UNILATERAL CLAWBACK EXECUTED`. Then `npm run test:fault` / `tests/proxy_fault_injection.test.ts` passing.

**Action:** Stay on `settled=0 · escrow restored`.

**Voiceover:**

> When agents interact with real-world pay-per-call endpoints like scvd.store, upstreams crash, connections drop, and data gets truncated. Instead of naive upfront payment, KeyShield deploys an on-chain Hold-Verify-Capture state machine built with Pinocchio on Solana. Funds are held in a slot-bounded escrow, response hashes are verified in flight, and if the upstream fails, the escrow unilaterally claws back the funds. Zero lost capital, zero unverified settlements. That is KeyShield.

---

## OpenRouter plug-in (Component D)

Scene D looks for a previously saved OpenRouter key in `OPENROUTER_API_KEY`, `KS_OPENROUTER_API_KEY`, `KS_OPENROUTER_API_KEY_FILE`, or `src/backend/data/vault_shim.db`. A live key (40+ chars) calls `nvidia/nemotron-3-ultra-550b-a55b:free` and prints only a masked prefix plus the model output. Otherwise the same model id is served from the local mock so the take still completes.
