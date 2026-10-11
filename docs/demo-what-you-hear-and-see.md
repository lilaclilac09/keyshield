# What you hear and see — 白话 · 代码 · 如何交互

English captions for a **≤ 2 minute** recording. A film cannot hold every
beat — this page is the overflow. Hermes in this repo is **Pyth SSE**, not
an LLM runner. Path A is **WebAuthn-PRF → HKDF → AES-GCM**. Do not rewrite
the dashboard to stage the walk.

Sign-in for the unpacked extension: reload `src/extension`, then
**→ Sign in to KeyShield**. Default dashboard is
`https://app.ks.aileena.xyz`. `https://keyshield.dev` has no DNS. Local
stack: Settings → **Use local dev** → `http://127.0.0.1:5173`.

---

## English captions (say these on screen)

1. **Wallet after settle** — zoom SOL 1.7134 / USDC 19 / Credit $0.10. Live wallet after settle, not a mock.
2. **Open free key page** — `sk-or-` on the OpenRouter Nemotron page.
3. **Detect and store** — zoom Detected openrouter + Save. Detect the shape, store ciphertext only.
4. **Vercel + GitHub universal keys** — same detector. Universal keys, one vault.
5. **New page autofill** — zoom the Cursor / Devin API Key field.
6. **Fill button** — the agent holds `KS_TOKEN`, never the raw key.
7. **Devnet buy** — Hold / Verify / Capture, `mpp_settle` ix 26.
8. **RPC flash handshake** — zoom 0.01 ms / 0.002 ms. First hop ~445 ms, then near zero. Not redb.
9. **Failed pay** — `.env` + 502 can debit empty; a wrong hash does not Capture.
10. **vs 1Password CLI** — detect, fill, x402, on-chain settle. Jobs 1Password does not do.
11. **All wired** — OpenClaw, x402, Pyth Hermes (SSE prices in this repo), Cursor / Devin.
12. **Top Up** — a payable rail credits the ledger.
13. **Stream Meter** — open Devnet stream. Agent column is Cursor.
14. **x402 auto-pay** — trusted domain hits 402, it pays.
15. **Agent registry** — Cursor / Devin / OpenClaw already registered.

---

## 1. Wallet after settle

**What you hear and see.** Zoom SOL 1.7134 / USDC 19 / Credit $0.10. Live wallet after settle, not a mock.

**白话.** Home 上的三个大数字是这条 session 钱包的 Devnet 余额。SOL / USDC 来自 Helius（或公钥 RPC）的 `getBalance` / token 账户；Credit 是账本里的美元额度。买完东西再回 Home：owner USDC 还是 19，因为微支付从 **stream escrow** 扣，不是再刷一次 owner 钱包。

**代码.**
- UI: `src/web/components/sections/HomeSection.tsx` — `wallet.sol` / `wallet.usdc` / ledger Credit
- Snapshot: `GET /keychain/home` in `src/backend/routes/keychain.py` → `src/backend/proxy/keychain.py` `fetch_wallet_balances`
- Client: `fetchKeychainHome` in `src/web/lib/keychain.ts`

**如何交互.** 钱包登录后打开 **Home**。先拍一帧「买前」。Payments 里 Meter / Capture 之后再回 Home，放大同一组数字。不要用静态图替换这个页。

---

## 2. Open free key page

**What you hear and see.** `sk-or-` on the OpenRouter Nemotron page.

**白话.** 先打开一张 **已经有免费 key** 的页，再复制。不要自己画一个商店。本地可用 OpenRouter keys 页，或仓库里的 fixture（若你的分支有 `src/web/public/journey/openrouter.html`）。

**代码.**
- Live: `https://openrouter.ai/keys` — content script `src/extension/content.js` `PROVIDERS.openrouter` `/sk-or-[A-Za-z0-9_-]{12,}/`
- Fixture (some branches): `src/web/public/journey/openrouter.html`

**如何交互.** 新标签打开 key 页。三击 `<code>` / 输入框里的 `sk-or-…`，Ctrl+C。插件若已登录，页上会出现 Save to vault toast。

---

## 3. Detect and store

**What you hear and see.** Zoom Detected openrouter + Save. Detect the shape, store ciphertext only.

**白话.** 粘贴框用前缀正则认供应商。界面只显示 `Detected openrouter` 和截断前缀。`POST /keychain/store` 入库后响应里禁止回显整段明文。Path A 解锁时，客户端 AES-GCM 密文才是 vault 本体。

**代码.**
- 客户端识别: `detectUpstream` / `extractDetectedKey` / `storeDetectedKey` in `src/web/lib/keychain.ts`
- 粘贴 UI: `HomeSection.tsx` `data-testid=key-paste` / `key-save`
- 服务端: `detect_upstream` / `extract_key` in `src/backend/proxy/keychain.py`；`POST /keychain/detect` + `/keychain/store` in `src/backend/routes/keychain.py`（`_refuse_echo`）

**如何交互.** 回 **Home** → 粘贴 → 等绿色 **Detected openrouter** → **Save**。Developer / 网络面板里不应再看到完整 `sk-or-`。

---

## 4. Vercel + GitHub universal keys

**What you hear and see.** Same detector. Universal keys, one vault.

**白话.** 同一个粘贴框，换一种前缀。`vercel_` / `vcp_` → Vercel；`ghp_` / `github_pat_` → GitHub。不是第二个产品。

**代码.** 与上一节同一份 `_DETECTORS` / `DETECTORS`。插件: `src/extension/content.js` `PROVIDERS` vercel / github。OCR/表单: `src/web/lib/key-detector.ts`。Fill 域名: `src/extension/background.js` `DOMAIN_TO_UPSTREAM` `vercel.com` / `github.com`。Vault 弹窗: `AddKeyModal.tsx` PROVIDERS。

**如何交互.** Home 再贴一条 `vercel_…` 或 `github_pat_…`，应显示 **Detected vercel** / **Detected github**，再 Save。或打开 vercel.com / github.com token 页，等插件 toast。

---

## 5–6. New page autofill + Fill button

**What you hear and see.** Zoom the Cursor / Devin API Key field. Fill button — the agent holds `KS_TOKEN`, never the raw key.

**白话.** Cursor / Devin 设置页上的 API Key 输入框由插件填。Agent 运行时只带 `KS_TOKEN`，走 `/vproxy/…`；明文只在本机解密一次，放进 `X-Upstream-API-Key`，代理不落盘。

**代码.**
- Fill 按钮: `ksAttachFillButton` / `ksInitFillUI` in `src/extension/content.js`（🔑，title `Fill saved key from KeyShield`）
- 按域名取钥: `GET_KEYS_FOR_DOMAIN` in `src/extension/background.js`
- Agent 会话: `POST /agents/register` + `/auth/agent-login`；代理 `src/backend/routes/proxy.py`
- Fixture (some branches): `src/web/public/journey/cursor.html` `input[name=api_key]`

**如何交互.** 打开 Cursor Settings → API Keys（或 fixture）。输入框右侧点 🔑 Fill。侧栏 **Agents** 里看的是身份，不是 `sk-`。

---

## 7 + 13. Devnet buy + Stream Meter

**What you hear and see.** Hold / Verify / Capture, `mpp_settle` ix 26. Open Devnet stream. Agent column is Cursor.

**白话.** 先开一条 stream（Agent 选 Cursor）。**Meter** = hold 一笔估计 → 上游返回后 record 32-byte artifact。**Capture** = 用 session HMAC 签这个 hash，过了才 `mpp_settle` ix 26。微 USDC 离开 stream，不第二次扣 owner。

**代码.**
- 按钮: `handleMeter` / `handleTwoMinDemo` / `handleCapturePrep` in `src/web/components/sections/ActivitySection.tsx`
- HMAC: `signCaptureMac` in `src/web/lib/mpp-capture.ts`
- API: `demoMeterStream` / `fetchCapturePrep` / `captureMppStream` in `src/web/lib/api.ts`
- 服务端: `POST /mpp/streams/{id}/hold` · `/record` · `/capture` in `src/backend/routes/mpp.py`
- 校验: `src/backend/mpp/fulfillment.py` `assert_settlement_artifact`
- 链上: pinocchio `mpp_settle` ix 26（见 `src/scripts/mpp-settle-test.py`）

**如何交互.** **Payments → MPP Streams**（不要停在 Usage）。Agent 选 Cursor → **2-min demo**，或对已打开的 stream 点 **Meter** 再 **Capture**。看 Step / `2-min demo done`。

---

## 8. RPC flash handshake

**What you hear and see.** Zoom 0.01 ms / 0.002 ms. First hop ~445 ms, then near zero. Not redb.

**白话.** 第一次 `getBalance` 走 Helius，常见几百毫秒（Home 的 `latency.wallet_ms`）。同一 key 在 TTL 内第二次是进程内字典命中，`x-ks-cache: HIT`，接近 0。这不是 redb、也不是 WAN 9000×。redb 磁盘层只在 `src/proxy/specs/09-helius-client.md`，不是这条握手。

**代码.**
- TTL 表: `src/backend/proxy/api_router.py` `_HELIUS_TTL` / `_CACHE`（`getBalance` 5s）
- 目录: `rpc_cache_catalog` in `src/backend/proxy/keychain.py`；`GET /keychain/rpc-cache`
- Home RPC pill: `HomeSection.tsx` `home.latency.wallet_ms` · `conn.rpc`
- Rust 镜像: `src/proxy` `TtlCache`（与 Python 同 key）

**如何交互.** Home 看 RPC 行的 ms。再刷新一次 Home：第二次 wallet 拉取应带 cache HIT。Developer 里 Helius 调用看响应头 `x-ks-cache`。

---

## 9. Failed pay

**What you hear and see.** `.env` + 502 can debit empty; a wrong hash does not Capture.

**白话.** 把 key 丢进 `.env` 再对 502 结算，可能钱扣了货没到。KeyShield 没有 32-byte artifact 或 HMAC 对不上：400 `unverified_fulfillment` / 409 `capture_rejected` / `hold_expired`。settled 不动，ATA 不动。

**代码.** `mpp_record_usage` / `mpp_capture` in `src/backend/routes/mpp.py`；`FulfillmentRejected` in `src/backend/mpp/fulfillment.py`。

**如何交互.** Payments 里 Meter 出 Capture 表单后，不要用对的 HMAC；或对 `/mpp/streams/{id}/capture` 送错 `artifactHash`。应对 400/409，Home USDC 仍为 19。

---

## 10. vs 1Password CLI

**What you hear and see.** Detect, fill, x402, on-chain settle. Jobs 1Password does not do.

**白话.** 1Password CLI 擅长人类密码和 `op run`。它不在页面上认 `sk-or-`，不给 Cursor 一键 Fill，不拦 HTTP 402，也不在履约哈希后再 `mpp_settle`。

**代码.** README Architectural Contrast（若该分支有）。本页第 3、5、7、14 节就是对比的四件事。

**如何交互.** 口播即可。不要打开 1Password 去改 UI。

---

## 11. All wired — OpenClaw, x402, Pyth Hermes, Cursor / Devin

**What you hear and see.** OpenClaw, x402, Pyth Hermes (SSE prices in this repo), Cursor / Devin.

**白话.** 一个 vault，多种 runner。Hermes **在本仓库是 Pyth 行情 SSE**（`hermes.pyth.network`），不是另一个 LLM。OpenClaw / Cursor / Devin 拿同一条 `KS_TOKEN`。

**代码.**
- Pyth Hermes: `src/backend/proxy/api_router.py` `hermes.pyth.network`；`src/backend/billing/billing_solana.py`；`src/backend/trading/market_data.py` `PriceFeed`
- OpenClaw skill: `src/sdk/packages/openclaw-skill/SKILL.md`
- x402 + Agents: 下面两节

**如何交互.** **Agents** 里应能看到名为 Cursor / Devin / OpenClaw 的行（没有就 Generate & Register 三个名字）。**X402 Trust** 打开可信域名列表。不要把 Hermes 录成聊天机器人。

---

## 12. Top Up

**What you hear and see.** A payable rail credits the ledger.

**白话.** Top Up 把 Devnet SOL/USDC 打到账本 Credit，Meter 才有额度。这不是假商店。

**代码.** `handleUsdcCredit` / `topupSolWithWallet` in `ActivitySection.tsx`；`creditUsdcTopup` → `POST /billing/topup-solana-usdc` in `src/web/lib/api.ts`。

**如何交互.** **Payments → Top Up**。接 Phantom 打 SOL，或粘贴已确认的 USDC 转账签名再 Credit。回 Home 看 Credit。

---

## 14. x402 auto-pay

**What you hear and see.** Trusted domain hits 402, it pays.

**白话.** 插件包一层 `fetch`。只有 `402` 且 `X-Payment-Required: x402` 才拦截。域名在信任列表且低于阈值就自动付；否则弹出 Pay now。

**代码.**
- 拦截: `src/extension/content.js` x402 interceptor（约 784 行起）
- 信任列表 UI: `src/web/components/X402TrustManager.tsx`
- API: `GET/POST /x402/trust`

**如何交互.** 侧栏 **X402 Trust** → 加域名和美元阈值。再访问会返回 x402 的站点（如配置过的 openrouter.ai / scvd.store）。

---

## 15. Agent registry

**What you hear and see.** Cursor / Devin / OpenClaw already registered.

**白话.** Agent 是 ed25519 公钥。Generate & Register 在浏览器造密钥，只把 pubkey 交给 `POST /agents/register`。种子只显示一次。服务端永不存私钥。

**代码.** `handleGenerateAndRegister` in `src/web/components/sections/AgentsSection.tsx`；`POST /agents/register`；卡标题 **Registered Agents**。

**如何交互.** 侧栏 **Agents**。名字填 `Cursor` / `Devin` / `OpenClaw` → **Generate & Register**。复制种子。回到 Payments，Agent 下拉应能选 Cursor。

---

## On-chain card (will not fit in 120s)

| Case | What must happen | Proof |
|---|---|---|
| Owner fund (once) | Owner USDC 20 → 19 | Devnet TX `5ovL2vFsDeQdncMvP8yCKfoYQhBwKdjdydh7X4AFqLyUFiqrfvFeB9g2yBi5GbC2zEbBEd6rfL8pMLARqVWcyb6F` (slot 509405947, Ok) |
| Honest capture | Stream escrow drops; owner USDC stays 19 | `mpp_settle` ix 26 from the stream |
| Wrong hash | HTTP 400 `unverified_fulfillment` | settled unchanged |
| Wrong HMAC | HTTP 409 `capture_rejected` / `hold_expired` | ATA unchanged |
