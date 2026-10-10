# KeyShield — Cursor live storyboard (English)

Screen Studio / OBS shot list for the Solana Colosseum / Paradigm Frontiers
take. **Record what this repo actually does.** Do not invent a shop, a
disk cache, or a headed Touch ID on Linux.

Two cameras, one take (~2:30):

| Pane | What |
|---|---|
| Left | Terminal: `bash scripts/record_demo.sh --split` **or** the live buy curls below |
| Right | Chrome at `http://127.0.0.1:5173` (passkey) **and** `https://openrouter.ai` (extension) |

Default wallet (gitignored, already funded on Devnet):
`.keyshield-devnet/user-devnet.json` → `GHpmxvrXbAfc5XWG7mPrJFqchWEQC6mc2hyStP5P4bhq`.

Tool: Screen Studio (auto zoom on the log line). Not a mocked 502 storefront.

---

## Honest names (say these, not the marketing aliases)

| You may say | Do not say |
|---|---|
| Chrome extension scans `openrouter.ai` for `sk-or-…` | “We mint you a free OpenRouter account” |
| Local Device Vault / keychain stores **ciphertext** | “The server saved your plaintext key” |
| One-click **permit** = passkey unlock + `/vproxy/openrouter` | “The agent holds the OpenRouter secret” |
| Agent runtime = **OpenClaw skill + MCP + OpenAI-compatible `/vproxy`** | “Hermes agent framework” as if it were wired. **Hermes in this repo is Pyth price SSE** (`PythFeed`) |
| Free model id `nvidia/nemotron-3-ultra-550b-a55b:free` | “Nemotron is free without an OpenRouter key” |
| Status-strip handshake = one Python `getMultipleAccounts` | “ks-helius disk cache” — **redb is Phase 2, not open** |
| `ks-helius` stampede = moka + single-flight + HTTP/2 (`cargo test`) | “two-tier LRU + redb”, “1.2 ms” unless **this** take printed it |
| Live buy = 1 micro-USDC `mpp_settle` (ix 26), `settle_mode=submitted` | “cost_usd > 0 means paid” |
| Harness `fault_502` = **labeled local mock** | “We just 502’d a live shop” |
| CU = `computeUnitsConsumed` from `getTransaction` | Canned `4,120 CU` |

`POST /auth/login` is **403**. Login is `GET /auth/wallet-challenge` then
`POST /auth/wallet-login`. Public `requestAirdrop` is often 429 — this
wallet is already funded; do not airdrop on camera.

---

## Scene 0 — Wallet first (0:00 – 0:12)

**Visual:** Right pane: dashboard top bar **or** terminal `GET /mpp/status`.
Left: owner pubkey only (no JSON secret).

**Action:** Wallet-login as the owner. First `/mpp/status` is the
**handshake** (browser must not call `api.devnet.solana.com`). Read
`sol_lamports`, `usdc_micro`, `rpc_ms`, `cached=false`. Immediate second
GET must show `cached=true` and `rpc_ms` in the 0.00x ms range.

**Voiceover:**

> Before we touch a model or an agent, the strip is a server handshake:
> one `getMultipleAccounts` for SOL and Circle Devnet USDC. The browser
> never talks to public Devnet RPC. Repeat polls are memory. This wallet
> is already funded — we are not going to a faucet.

**Cut if:** dashes for SOL/USDC. That is a dead backend, not an empty wallet.

---

## Scene 1 — Human in Chrome, OpenRouter scan (0:12 – 0:40)

**Visual:** Right: Chrome on `https://openrouter.ai/keys` **or** the free
Nemotron card
`https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free`.
KeyShield extension loaded. Left: DevTools → Content script log
`[KeyShield] detected OpenRouter key`.

**Action (real human):**

1. Open the keys page so a `sk-or-…` string is in the DOM (or a test
   input). `src/extension/content.js` already matches
   `/sk-or-[A-Za-z0-9_-]{12,}/` on `openrouter.ai`.
2. Extension toast: **API key detected** / badge `OR`.
3. One click **Save**. Ciphertext is sealed on-device (WebAuthn-PRF →
   HKDF → AES-GCM when Path A unlock is available; otherwise the
   keychain row). Server sees ciphertext or a vault id — **never** echo
   the key.
4. `GET /demo/openrouter` (session on) shows the **model id**,
   `key_configured: true`, no secret. If this build 404s that route,
   use the dashboard OpenRouter card / `POST /keychain/call` instead —
   do not fake a JSON body.

**Voiceover:**

> A person, a browser, OpenRouter. The extension scans the live DOM for
> the `sk-or-` prefix — including the page for the free Nemotron route.
> One click stores an encrypted vault id locally. We do not copy, we do
> not paste, we do not put the key in the agent.

**Fallback (Linux Cloud / no extension):** show
`src/extension/content.js` PROVIDERS.openrouter + a fixture `sk-or-`
scan in the record-demo Scene 2 stand-in. Say out loud: “this host has
no headed passkey; the Mac take is the real Save click.”

---

## Scene 2 — One-click permit, then the agent may call (0:40 – 1:00)

**Visual:** Dashboard Home / `/demo` step “Pay”. Passkey prompt on
`http://127.0.0.1:5173` (not `localhost`). Then a single permitted call.

**Action:**

```bash
# session already unlocked
curl -sS -X POST "$KS_BASE/vproxy/openrouter/api/v1/chat/completions" \
  -H "Authorization: Bearer $KS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"nvidia/nemotron-3-ultra-550b-a55b:free","messages":[{"role":"user","content":"ping"}],"max_tokens":8}'
```

or `POST /keychain/call` `{ "upstream": "openrouter" }`.

Read `live`, `status`, `latency_ms`, `key_prefix` (`sk-or-…` masked).
If no OpenRouter key is stored, the harness Component D stays on the
**mock** — say “mock” and do not pretend Nemotron answered.

**Voiceover:**

> Second time we need compute, it is one permit — Face ID or the session
> we already unlocked — and the proxy injects the upstream key for that
> request only. The agent holds `KS_TOKEN`. Consumption is the proxy
> hop plus, when we settle, Hold-Verify-Capture — not an unlimited key
> in `.env`.

---

## Scene 3 — Drop into an OpenClaw / MCP agent (1:00 – 1:22)

**Visual:** Left terminal: `scripts/record_demo_openclaw_runtime.mjs`.
Print `PROC openclaw pid=… KS_TOKEN=ksv2_sess_…` and session spec
`blanks=0`. Clipboard still `0 bytes` (`pbpaste` / `xclip`).

**Action:** This is the “Hermes-like framework” beat. **Say OpenClaw +
MCP.** The skill is `src/sdk/packages/openclaw-skill`. The token is
injected over a Unix socket (HMAC). No markdown template, no `.env`.

**Voiceover:**

> Same vault, a real agent loop. We inject an ephemeral session into
> OpenClaw — the same shape any OpenAI-compatible runner uses against
> `/vproxy/openrouter`. No clipboard. If you hear “Hermes” in this
> repo, that is Pyth’s price SSE, not this skill. The agent consumes
> budgeted calls, not the root secret.

---

## Scene 4 — How the agent consumes (1:22 – 1:42)

**Visual:** Three lines on screen, nothing else.

```
unlock  →  session token
call    →  POST /vproxy/openrouter/api/v1/chat/completions
settle  →  HOLD (ix 24 already open) → record artifact → CAPTURE HMAC → mpp_settle (ix 26)
```

**Action:** Point at `settle_mode`. `stub` = no settler. `held` = hashed,
not paid. `submitted` = chain signature. `failed` = honest fail.
Never paint `cost_usd > 0` green.

**Voiceover:**

> Consumption is metered. Hold locks micro-USDC. Verify hashes the
> upstream body. Capture is HMAC-SHA256 of that hash under the session
> token. Only then does the settler sign ix 26. A 502 or a truncated
> body never captures.

---

## Scene 5 — Buy one real micro, show the wallet (1:42 – 2:08)

**Visual:** Left: capture JSON. Right: Explorer + status strip.

**Action (live Devnet, this wallet is funded — 1 token is enough):**

1. Reuse an open stream (do not open a new 1 USDC stream unless remaining is 0).
2. `POST /mpp/streams/{id}/record` with a unique chat body (1 token).
3. `POST /mpp/streams/{id}/capture` with
   `HMAC-SHA256(session_token_utf8, artifact_hash_bytes)`.
4. Require `settle_mode=submitted` and a signature that
   `getTransaction` confirms (`err=null`).
5. Read `/mpp/status`: receipt `hash8` + mode, SOL, USDC, stream remaining.
6. Owner USDC stays ~19 — the micro leaves the **stream ATA**, not the
   owner wallet. Say that.

**Voiceover:**

> This is a real Devnet settle. One micro-USDC. Explorer on the right.
> The strip is the same handshake you saw in scene 0. We are not buying
> a mocked SKU. We are debiting a live stream under Hold-Verify-Capture.

**CU line (only if `getTransaction` printed it):**
`computeUnitsConsumed` on program `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j`.
The Pinocchio budget is **≤ 4,500 CU** for the honest ix. Last confirmed
settle on this wallet consumed **1,906 CU**. If this take differs, read
**this** take.

---

## Scene 6 — Security, including the labeled 502 (2:08 – 2:22)

**Visual:** Split. Left: naive `.env` + HTTP 502 from
`scripts/record_demo_mock_upstream.mjs` `fault_502` (banner: **MOCK**).
Right: KeyShield path — hash FAILED, clawback, `settled` does not move,
`settle_mode` is not `submitted`.

**Action:** `npm run test:fault` or harness Scene 5. Clipboard `0 bytes`.
Do not open a fake shop UI.

**Voiceover:**

> Traditional agents dump a key on 502 and still lose the prepaid debit.
> We show that failure as a labeled mock so a judge can see the desync.
> KeyShield does not capture. Capital lost is 0.00 on the live analog.

---

## Scene 7 — RPC-class speed (2:22 – 2:38)

**Visual:** Two blocks, not one slogan.

**A — Wallet strip (Python, this is what the dashboard uses):**

```
GET /mpp/status  cached=false  rpc_ms=≈200–250   # handshake
GET /mpp/status  cached=true   rpc_ms=0.00x      # memory, 20s TTL
```

**B — Agent Helius hot path (Rust `ks-helius`, not the strip):**

```bash
cargo test -p ks-helius hotpath_prints_miss_single_flight_then_moka_hit -- --nocapture
```

Read MISS / JOIN / HIT and `upstream_fires=1`. **redb is not open.**
LaserStream is not this binary.

**Voiceover:**

> Agents spam balance and slot checks. The strip handshakes once, then
> serves memory. The Rust Helius client coalesces a stampede into one
> HTTP/2 fire, then moka hits. Quote the numbers on screen. We will not
> narrate a disk tier we have not shipped.

---

## Scene 8 — Cursor draft → review → accept (2:38 – 2:50)

**Visual:** `/talk` or `/review` (pay-stack build) **or** Cursor’s own
diff pane: prompt on the left, diff on the right, accept only after
review.

**Action:** Method A open; expand/fold. Do not drive the 10-item nav.

**Voiceover:**

> Same discipline as the vault. Draft, inspect, then permit. We do not
> auto-accept a spend or a patch.

---

## What this take is not

- Not a physical OpenRouter checkout.
- Not Pyth Hermes as an LLM runtime.
- Not `helius.redb`.
- Not `localhost` for passkeys (use `127.0.0.1`).
- Not CU or RTT from an old voiceover.

## Runners already in the repo

```bash
bash scripts/record_demo.sh --split --pace 28000   # scenes 1–5 harness
bash src/scripts/rpc-hotpath-demo.sh               # if present on this branch
# live buy: wallet-login → /mpp/status ×2 → record + capture 1 micro
```

Do not add a second `demo_adversarial_flow.sh` that restages the 502 as
a live merchant. The mock upstream is enough and it is labeled.
