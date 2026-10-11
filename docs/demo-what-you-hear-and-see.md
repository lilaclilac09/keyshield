# Colosseum 2-minute — What you hear and see

**Which take is the 2-minute battle?** This one. The product UI at
`http://127.0.0.1:5173/?local=1&colosseum=1`. English caption + VO + zoom
are built in (`src/web/components/ColosseumOverlay.tsx`).

The terminal harness in `DEMO_RECORDING_SCRIPT.md` is a different 5-scene
mock. Do not substitute it for Colosseum.

| # | Caption (English, on screen) | 白话 | Code | How you click |
|---|---|---|---|---|
| 1 | Wallet after settle — zoom SOL / USDC / Credit. Live wallet after settle, not a mock. | 结算后的真钱包，不是演示数字 | `HomeSection` wallet grid · `GET /keychain/home` | Home. Zoom the three tiles. |
| 2 | Open free key page — `sk-or-` on the OpenRouter Nemotron page. | 打开免费 Nemotron 的 key 页 | `openrouter.ai/keys` · Home Nemotron card | Open that page, copy `sk-or-`. |
| 3 | Detect and store — zoom Detected openrouter + Save. Detect the shape, store ciphertext only. | 认出形状，只存密文 | `detectUpstream` `src/web/lib/keychain.ts` · `src/backend/proxy/keychain.py` | Paste on Home. Zoom Detected + Save. |
| 4 | Vercel + GitHub universal keys — same detector. Universal keys, one vault. | 同一套检测器 | `vercel_` / `github_pat_` in DETECTORS | Paste those shapes. Same Save. |
| 5 | New page autofill — zoom the Cursor / Devin API Key field. | 新页面要填 key | Home “Cursor / Devin API Key” | Zoom the field. |
| 6 | Fill button — the agent holds `KS_TOKEN`, never the raw key. | 只填会话 token | `getToken()` → field | Click **Fill**. |
| 7 | Devnet buy — Hold / Verify / Capture, `mpp_settle` ix 26. | Devnet 真买 | Payments → **2-min demo** | Zoom that button. Confirm the tx sig. |
| 8 | RPC flash handshake — zoom the RPC pill. First hop is slower, then near zero. Not redb. | 第一次慢，缓存后接近 0 | Home RPC pill · `rpc_cache_catalog` | Zoom RPC. Read the ms on screen. |
| 9 | Failed pay — `.env` + 502 can debit empty. A wrong hash does not Capture. | 错 hash 不 Capture | Payments failed-pay card · `test:fault` | Zoom the rose card. |
| 10 | vs 1Password CLI — detect, fill, x402, on-chain settle. Jobs 1Password does not do. | 1P 不做检测/x402/链上结算 | Home comparison card | Zoom that card. |
| 11 | All wired — OpenClaw, x402, Pyth Hermes SSE prices, Cursor / Devin. | Hermes 是行情 SSE | `Agents` · `src/backend/trading/feeds` | Agents. Do not film a chat bot. |
| 12 | Top Up — a payable rail credits the ledger. | 可支付通道充账本 | Payments → Top Up | Zoom Ledger / Phantom SOL. |
| 13 | Stream Meter — open Devnet stream. Agent column is Cursor. | 开着的 Devnet 流 | Payments → Meter | Agent = Cursor. Click Meter. |
| 14 | x402 auto-pay — trusted domain hits 402, it pays. | 可信域名遇到 402 就付 | **X402 Trust** | Zoom Trusted Domains. |
| 15 | Agent registry — Cursor / Devin / OpenClaw already registered. | 已注册的三个 agent | **Agents** list | Zoom Registered Agents. |

Wallet before / after: film Home tiles, run beat 7, come back to Home.
The Credit / USDC change is the settle. The chain confirm is the
signature next to `mpp_settle` ix 26. A wrong hash must not Capture.

Record: `node dev.cjs`, demo login if `KS_DEMO_MODE=1`, then
`http://127.0.0.1:5173/?local=1&colosseum=1`. Home **Colosseum 2-min**.
