# KeyShield — Demo 话术（中英对照）

三个版本：

- **30 秒 elevator** — 走廊 / 电梯里被问 "what's your project?"
- **3 分钟 judging** — Colosseum / 评委面前演 + 答
- **5-7 分钟 deep dive** — 直接坐下来看现场 demo

核心一句话（开场永远先念这句）：

> **你的 AI agent 永远拿不到你的 API key。你的钱包决定上限。Solana 自动结算每一次调用。**
>
> Your agent never holds the key. Your wallet sets the budget. Solana settles the bill.

---

## 30 秒版本（elevator）

> KeyShield 是一个为 AI agent 设计的 zero-trust API key proxy。问题是：现在 agents 直接把 OpenAI / Helius key 写在 `.env` 里，key 一泄就是几万美金账单。我们把 key 在用户设备上用 passkey 派生的 AES-256 加密，server 永远只看到密文。每次 agent 调用 OpenAI，proxy 注入 key 一次、用完丢弃，同时在 Solana 链上扣一笔 USDC 微支付。你只为实际用量付钱，agent 越权了你一个链上指令就吊销。已经在 devnet 跑通，Solana 程序 7 个指令、35k 行代码，Privacy Hack 2026 作品。

**英文版**：

> KeyShield is a zero-trust API key proxy for AI agents. Problem: agents today have raw OpenAI and Helius keys in their `.env` files — one leak is a $40k bill overnight. We encrypt every key client-side with a passkey-derived AES-256 master key. The server only ever sees ciphertext. When an agent calls OpenAI, the proxy injects the key once, discards it immediately, and writes a USDC micropayment to a Solana stream. You pay per actual call, and you revoke any rogue agent with one on-chain instruction. Live on devnet, ~35k lines, Solana program ships seven instructions. Built in 14 days for Privacy Hack 2026.

---

## 3 分钟 judging 版本（Colosseum 评委）

**结构**：痛点 → 解法 → demo 3 个 highlight → why now → 邀请试用

### 0:00 – 0:30 — 痛点 + 一句话

打开 slide 1（KeyShield 标题页）。

> "Agents 是 2026 年最火的方向，但 agentic AI 的 key 安全是个空白。今天 OpenAI key 还是按人类工程师的方式管理——`.env` 文件、Docker 镜像、CI 环境变量。Agent 拿到 key 之后，它可能记在 context window 里、可能 dump 在 log 里，账单一爆就是几万美金，事后你也不知道是哪个 agent 哪次调用。
>
> KeyShield 三句话：**Your agent never holds the key. Your wallet sets the budget. Solana settles the bill.**"

切 slide 3（KeyShield in one line）。

### 0:30 – 1:00 — 怎么做到的（架构）

切 slide 4（架构图）。**手指点 4 层**讲：

> "1. **用户设备**：passkey 通过 WebAuthn PRF 派生主密钥，每个 API key 在浏览器里就被 AES-256-GCM 加密。
>
> 2. **Cloudflare Worker**：只存密文，物理上不持有解密钥。
>
> 3. **Rust proxy**：每次调用时，前端发明文 key 到 proxy，proxy 用一次、立刻丢弃，永不写盘。
>
> 4. **Solana 程序**：每次调用同时记账到链上 MPP stream，按 token 计费扣 USDC。"

**强调一句**："服务器从开机到关机，从来没有任何一行明文 key 经过 disk 或 cold storage。这是物理保证不是承诺。"

### 1:00 – 2:30 — 现场跑 demo（3 个 highlight）

切到浏览器 `https://app.ks.aileena.xyz`（或 localhost demo）。

**Highlight 1（30 秒）— Passkey 注册 + vault 加密**

- 点 "Connect Wallet" → Phantom 弹窗 → 签名
- 进入 Device Vault → "Enroll passkey" → Touch ID
- 加一个 OpenAI key → **打开 DevTools Network tab**，指着 PUT 请求：
  > "看，发出去的是 base64 加密块，不是明文 key。这是浏览器里 AES-GCM 加密之后的结果。"

**Highlight 2（30 秒）— 代理调用 + 链上结算**

- 切到 Activity tab
- 在终端跑：`python examples/bot.py "tell me a joke"`
  ```python
  from keyshield_sdk import KeyShield
  ks = KeyShield(token=os.environ["KS_TOKEN"])
  print(ks.openai_client().chat.completions.create(...))
  ```
- 一行结果在 Activity 表里出现：upstream=openai, tokens=42, cost=$0.0008
- 点 tx hash → 跳到 Solana Explorer：
  > "这是一笔真实的 `MppSettle` 指令，链上你看得到 USDC 从我的 stream PDA 转出去 0.8 milli-USDC。一次调用、一次链上记账。"

**Highlight 3（30 秒）— Agent 越权 / 撤销**

- 切到 Agents tab
- 点某个 agent 的 "Revoke" 按钮 → Phantom 弹窗签名
- 再在终端用同一个 agent token 跑 bot：
  > "看，立刻 403。撤销是一个 Solana 指令，不是三个数据库更新加缓存失效。"

### 2:30 – 3:00 — Why now + close

切回 slide 11（Why we win 对比表）：

> "为什么是现在？三件事同时发生：
> 1. AI agents 大规模上线，需要拿 OpenAI / Anthropic / RPC key 才能干活。
> 2. Solana 上 x402 标准成熟了，HTTP 协议级别原生支持 per-request 微支付。
> 3. 浏览器 WebAuthn PRF 普及，passkey 派生的客户端加密不再需要密码学博士才能用。
>
> 这三个交汇点就是 KeyShield 的窗口。**MIT 开源、devnet 已跑通、SDK 三种语言** — 欢迎现场扫码试。"

切到最后一页（QR / 链接）。

---

## 5-7 分钟 deep dive

跟 3 分钟版本一样的开头，但 **demo 那段加 3 个细节深挖**：

### 加深挖 A — 让评委亲手扫 Phantom 签名

打开你的手机 Phantom，让评委的同事扫一下你 dashboard 的连接二维码。**他们的钱包能直接登录你的 dashboard 看 demo。** 这一招特别让人记得住，因为评委一天看 30 个项目，能动手摸的不超过 3 个。

### 加深挖 B — 打开 Wireshark / DevTools 证明 key 不出现

DevTools → Network → 找一次 `/proxy/openai/v1/chat/completions` POST 请求 → 看 Request Headers → 指着 `X-Upstream-API-Key` 那行：

> "这是 proxy 接收到的 key。但请看 server 的 log（提前 ssh 进去开着 tail）—— 没有这个 key 的痕迹。proxy 把 key 当函数参数用一次，函数返回 key 就被 garbage collect。"

打开 backend ssh 终端，跑 `grep "sk-proj" /var/log/*` → 0 行。

### 加深挖 C — 展示 Solana 程序源码

> "这不是 stub，是真的 on-chain 程序。"

打开 `src/programs/keyshield/src/instructions/mpp_settle.rs`，指着 `transfer_checked` 这行：

> "USDC 从 stream PDA 转到 settler 的 ATA，每一行可以在链上看到。"

打开 Solana Explorer 一笔历史 `MppSettle` 交易 → 展示 inner instructions。

---

## 评委 FAQ 答题模板

**Q: 跟 Vault.dev / 1Password 区别？**
A: 它们的 server 能解密；我们的不行。物理保证 vs 承诺保证。再加上我们 agent-native（ed25519 签名内建）+ 链上结算。

**Q: Cloudflare Worker 万一被入侵呢？**
A: 它存的全是密文，物理上没有解密钥。被入侵也只是 ciphertext blob 泄露，攻击者还得拿到 passkey 才能解。

**Q: x402 谁在用？**
A: Helius 在做，Coinbase 标准化的，OpenAI 也在跟。HTTP 标准协议级别，不绑定特定厂商。

**Q: 不在 Solana 上行不行？**
A: 当前架构 Solana-first（USDC 微支付 + 低 gas）。可以扩展到 Base + USDC，protocol 部分链无关。

**Q: 真 agent demo？**
A: SDK 已经支持 OpenAI / Anthropic / Helius RPC。可以一行替换：`from keyshield_sdk import KeyShield`。

**Q: 商业模式？**
A: 自托管开源免费；托管版收 2% 微支付手续费（行业标准）+ 企业版 SaaS 月费。

**Q: 团队？**
A: 14 天，单人，35k 行。先证可行性，再扩团队。

---

## 现场必备物料清单

- [ ] 笔记本 + 充电器
- [ ] 备用网络（手机 hotspot）
- [ ] Phantom 钱包预装 + devnet USDC ≥ $20
- [ ] Demo 视频 backup（如果 live demo 网炸）— `landing/DEMO-SCRIPT.md` 里两个版本
- [ ] PDF pitch deck（这个文件 marp build 出来）
- [ ] 名片 + 二维码（GitHub + landing page）
- [ ] 笔 + 便签（评委记联系方式用）
- [ ] 提前 30 分钟到现场试投影 + 网络

---

## Build the PDF

```bash
npm run docs:pitch-pdf
# 输出：docs/pitch/PITCH_DECK.pdf
```

或者 marp 直接装 VS Code 插件 live preview。
