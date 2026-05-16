# KeyShield — Demo Video Scripts

Two cuts, one product. Cut A is the silent autoplay loop for the hackathon judging page. Cut B is the voiced deep cut for README + Twitter.

Core trust message (lead with this in both cuts): **the agent never holds the API key**.

---

## Cut A — 60 seconds (silent, captions only)

Optimized for hackathon judging page. Autoplay-friendly. Works muted.

| time | screen | voiceover | on-screen text |
|---|---|---|---|
| 0:00–0:05 | Terminal close-up: `ps aux \| grep python` showing `OPENAI_KEY=sk-proj-xxx...` highlighted with a red strike-through animation | (none — silent) | "Your agent's key is in process memory. And in env files. And in Docker layers." |
| 0:05–0:10 | Same terminal, now scrolling past `.env`, `docker history`, `git log` — each flashing red | (none) | "$40k bills happen overnight." |
| 0:10–0:15 | Hard cut to black. KeyShield logo (shield icon, accent `#5b8cff` on `#05060d`) fades in | (none) | "KeyShield — your agent never holds the key." |
| 0:15–0:23 | Browser at `localhost:5173/agents`. Cursor clicks the "Give wallet" button on an agent card | (none) | "Step 1 — give your agent its own wallet." |
| 0:23–0:30 | Phantom wallet popup → approve → toast "Ephemeral signer created · ix #23" + "Payment stream opened · ix #24" | (none) | "One Solana tx. Two on-chain primitives." |
| 0:30–0:36 | Same dashboard. Top up modal: "+$10 USDC" → balance ticks `$0.00 → $10.00` | (none) | "Step 2 — top up $10 USDC." |
| 0:36–0:44 | Split screen: left = terminal running `python bot.py` showing `200 OK` from `/proxy/openai/v1/chat/completions`; right = dashboard balance ticking down `$10.00 → $9.997` | (none) | "Step 3 — agent calls OpenAI. Pays per token. ed25519-signed." |
| 0:44–0:50 | Activity log at `localhost:5173/activity` — new row: `openai · 412 tokens · $0.003 · tx 3vN8...kQ`. Cursor hovers the tx hash | (none) | "Every call. Logged. On-chain receipts." |
| 0:50–0:55 | Solana Explorer tab opens to a real `MppSettle` (ix #26) tx. Highlight on settled amount | (none) | "Step 5 — owner sees the debit live." |
| 0:55–1:00 | Cut back to KeyShield logo. URLs underneath: `keyshield.dev` and `github.com/lilaclilac09/keyshield` | (none) | "See it live → keyshield.dev" |

---

## Cut B — 90 seconds (voiced, README + Twitter)

The trust story. Slower pace. Voiceover carries it.

| time | screen | voiceover | on-screen text |
|---|---|---|---|
| 0:00–0:08 | News headline collage: "AI startup leaks $40k OpenAI key", "Public Docker image with creds", terminal showing `git log` with a key in plaintext | "Last month, a friend's $40k OpenAI bill burned overnight. A leaked key, in a public Docker image." | (sparse — let the headlines breathe) |
| 0:08–0:15 | Cut to a developer's laptop screen. Three quick frames: `.env` file with `OPENAI_KEY=`; an OAuth login page; a dashboard with "per-user billing not supported" | "And here's why this keeps happening. Keys live in env vars. OAuth doesn't work for autonomous agents. And per-call billing for an LLM agent is basically impossible." | "Three failed paradigms" |
| 0:15–0:30 | Title card: "KeyShield — three primitives". Then three quick illustrations: (1) shield + Solana logo "Ephemeral Signer", (2) HTTP 402 receipt "x402", (3) streaming graph "MPP" | "KeyShield gives every agent its own Solana wallet — an ephemeral signer. Each call is a 402-paid HTTP request, settled in USDC. And for high-volume workloads, MPP streams payments instead of paying per call." | "Ephemeral Signer · x402 · MPP" |
| 0:30–0:38 | Browser at `localhost:5173/agents`. Cursor clicks "Give wallet" on agent card "research-bot-7" | "Watch. I open the dashboard, click 'Give wallet' on my agent." | "localhost:5173/agents" |
| 0:38–0:46 | Phantom approval → on-chain confirmation toast → balance card appears with `$0.00` and a public key | "One Solana tx fires two instructions — `CreateEphemeralSigner` and `OpenPaymentStream`. The agent now has an address. Not a key. An address." | "ix #23 + ix #24 · on-chain" |
| 0:46–0:54 | Top up modal "+$10 USDC" → confirmation → balance ticks to `$10.00`. Brief flash of `Argon2id + AES-256-GCM` overlay on the wallet card | "I top up ten dollars. The agent's seed is encrypted with Argon2id and AES-256-GCM — even our server can't read it." | "Encrypted at rest" |
| 0:54–1:02 | Terminal running `python bot.py` — agent does ed25519 handshake then `POST /proxy/openai/v1/chat/completions` returns `200`. Response prints | "I run the agent locally. It signs an ed25519 challenge, hits our proxy, gets a 402, pays in USDC, and the proxy forwards the call to OpenAI." | "ed25519 → 402 → USDC → OpenAI" |
| 1:02–1:10 | Activity log at `localhost:5173/activity` — three rows landing: openai, helius, anthropic. Cursor clicks a tx hash; Solana Explorer opens with `MppSettle` ix #26 visible | "Every single call shows up here, with an on-chain receipt. Ten upstreams supported — OpenAI, Anthropic, Helius, Pyth, and more." | "10 upstreams · on-chain audit" |
| 1:10–1:20 | Dashboard balance card: shows `$9.997` ticking down. Cursor hovers "Withdraw" → toast about ix #27 | "And the owner can withdraw any time — `WithdrawAgentWallet`, instruction twenty-seven." | "Owner-controlled" |
| 1:20–1:30 | Closing card: KeyShield logo, then text rolls: "14 specs. 78 Rust tests. Spec-first." Repo URL at bottom: `github.com/lilaclilac09/keyshield` | "Built spec-first. Fourteen specs. Seventy-eight Rust tests on the hot path. Code's open. Go look." | "github.com/lilaclilac09/keyshield" |

---

## Recording notes

Screens to record (have all of these open in a clean Chrome profile, dark mode):
- `http://localhost:5173/agents` — the agent management UI (the "Give wallet" + top-up flow)
- `http://localhost:5173/activity` — the audit log with per-call rows and tx hashes
- `https://explorer.solana.com/tx/<sample-tx>?cluster=devnet` — a real `MppSettle` (ix #26) tx for the explorer cutaway
- A clean iTerm2 window running `python bot.py` (font: SF Mono 14pt, dark theme matching `#05060d`)
- A second iTerm2 window for the `ps aux` opening shot

Tools:
- **Cut A (silent)**: QuickTime screen recording → Screenflick for cuts/captions → export 1080p H.264. Captions burned in (no SRT — must work on autoplay/muted).
- **Cut B (voiced)**: QuickTime for screen capture → DaVinci Resolve for VO sync, b-roll, and color grading → export 1080p H.264. Record VO in a treated room with a Shure MV7 or similar; aim for -16 LUFS.
- **Both**: keep cursor visible (Screenflick "highlight cursor" or Resolve cursor overlay). Match accent color `#5b8cff` for any motion graphics overlays.
