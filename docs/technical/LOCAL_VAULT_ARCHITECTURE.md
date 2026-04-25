# KeyShield 本地金库 + 生物识别解锁 —— 架构设计(v1.0 定稿)

> 适用范围:V1 Face ID / passkey 解锁 + 每设备独立 session 的工程落地。
> 状态:所有开放问题已定论,可以据此实施。

## 一、核心理念

把 API 密钥从链上移到本地,像 iCloud Keychain 那样。密钥存在设备上,Face ID / 指纹解锁,换设备就重置。链上只承担"这个临时签名者能不能代表我调合约"的授权逻辑。

三条铁律:

1. **存储不签名** —— 往金库里塞一个 API key,纯本地加密,不上链,不花 gas
2. **普通调用不签名** —— session key 有效期内,任何 API 调用都不用再弹 Face ID
3. **解锁 + 第一次调用才要生物识别** —— 关键动作才打扰用户

---

## 二、三层架构

```
┌─────────────────────────────────────────────────────┐
│  设备层(Device)                                     │
│  • 加密后的金库数据(chrome.storage.local / iOS file)│
│  • 主密钥(OS Keychain,Face ID 门控)                │
│  • Passkey 凭证(由 iCloud / Google 跨设备同步登录)  │
└─────────────────────────────────────────────────────┘
                        ↓ 解锁后才创建
┌─────────────────────────────────────────────────────┐
│  Session 层(链上授权,2 小时,每设备一个)            │
│  • Ephemeral signer(一设备一密钥对)                 │
│  • grant_agent_access 写 agent_pubkey + session_timeout│
│  • 2 小时内所有调用都用这个 signer,不再弹 Face ID    │
└─────────────────────────────────────────────────────┘
                        ↓ 由它驱动
┌─────────────────────────────────────────────────────┐
│  Program 层(链上合约)                               │
│  • agent_grants[32] 一个设备占一槽                   │
│  • Clock sysvar 校验 created_at + session_timeout    │
└─────────────────────────────────────────────────────┘
```

**关键:三层各管各的加密**。本地层加密 API key 明文;Session 层管链上授权的有效期;Program 层是最终裁判。

---

## 三、端到端 5 个流程

### 流程 1:首次注册(一生一次)

```
点击"创建金库"
  → 浏览器 / iOS 弹 Face ID 注册 passkey
    (residentKey: required, authenticatorAttachment: platform)
  → 随机生成 32 字节主密钥 → 存 OS Keychain
  → 初始化空金库 AES-GCM(初始 plain, masterKey)
  → 写入 chrome.storage.local
  → iCloud / Google 后台同步 passkey 到用户其他设备
```

换设备 → passkey 可以跨设备用来登录,但**主密钥不跨设备**,新设备上必须重新创建金库。

### 流程 2:打开 App / 插件(session 不存在)

```
点"打开金库"
  → 检查本地 session → 没有
  → navigator.credentials.get(challenge=random)
  → 系统弹 Face ID,通过 → 取主密钥
  → 解密金库到内存
  → UI 展示 API key 列表(还没创建链上 session)
```

这一步只解锁 UI。增删查 API key 都是纯本地操作。

### 流程 3:第一次调用 API(session 从无到有)

```
首次调用
  → 检测没有 session
  → 生成 ephemeral 密钥对(这台设备本次的 session 身份)
  → 用户主密钥签一笔 grant_agent_access:
    {agent_pubkey=ephemeral_pub, session_timeout=7200, scope}
  → 交易上链 → session 激活
  → 本地记 {ephemeralPubkey, expiresAt} 到 chrome.storage.session
  → 执行原调用
```

### 流程 4:Session 内后续调用(用户无感)

```
调用进来
  → 读 chrome.storage.session 里的 session
  → now < expiresAt ? 是
  → 用 session key 签(若需链上操作)
  → 从内存金库取 API key 返给 agent(V1,见决策 #6)
  → 返回
```

零用户交互。

### 流程 5:Session 快到期 / 已过期

```
expiresAt - now < 5 分钟
  → UI 非阻塞提示"还剩 5 分钟,续期?"
  → 用户点续 → 流程 3 重跑(弹一次 Face ID)
  → 不点 → 到点自动过期

已过期调用进来
  → 自动触发 Face ID → 创建新 session → 执行原调用
```

---

## 四、本地存储数据结构

### `chrome.storage.local`(持久)

```json
{
  "vault": {
    "version": 1,
    "iv": "<base64>",
    "ciphertext": "<base64 AES-GCM({plain vault}, masterKey)>",
    "createdAt": 1714000000
  },
  "passkeyCredentialId": "<base64>",
  "masterKeyRef": "<OS Keychain 引用>",
  "devices": [
    {"ephemeralPubkey": "...", "label": "MacBook Pro", "lastUsed": 1714001000}
  ]
}
```

### Vault 明文(解密后,仅内存)

```json
{
  "apiKeys": {
    "openai-prod": {"value": "sk-...", "createdAt": 1714000000, "tags": []},
    "anthropic":   {"value": "sk-ant-...", "createdAt": 1714000000, "tags": []}
  },
  "settings": {"sessionDurationHours": 2, "promptBeforeExpiryMinutes": 5}
}
```

### `chrome.storage.session`(仅存非秘密状态)

```json
{
  "unlocked": true,
  "ephemeralPubkey": "...",
  "expiresAt": 1714007200
}
```

**`ephemeralPrivateKey` 和 `vaultPlain` 只留在内存**,符合决策 #7:service worker 被 kill 时自动清空,重新激活需要再过 Face ID。

---

## 五、决策清单(7 条已全部定)

| # | 决策 | 选择 | 落地位置 |
|---|---|---|---|
| 1 | 加密密钥策略 | 方案 2 —— 主密钥随机生成存 OS Keychain,Face ID 只做门控 | 流程 1 |
| 2 | 多设备 | Passkey 跨设备同步登录方式,**金库本身不同步**;换设备 = 重置金库 | 流程 1 注脚 |
| 3 | Session 时长 | 2 小时,到期前 5 分钟 UI 提示续期 | 流程 5 |
| 4 | 多 session | 每台设备一个独立 session,最多 32 并发 | 链上 `agent_grants[32]` |
| 5 | 链上 session 状态 | 复用现有 `AgentGrant` 结构 + 修 timestamp bug + 加 `revoke_all` | P0 / P1 补丁 |
| 6 | API key 使用方式(V1) | SDK 直接返回明文;Agent 代码视作与用户同信任级;V2 引入代理模式 | `agent-sdk.getUniversalKeys()` |
| 7 | Service worker kill | 方案 X —— 允许被 kill,重新激活重弹 Face ID(安全优先) | `chrome.storage.session` 不存秘密 |

平台优先级:iOS 原生是目标,当前 `extension/` 先跑通。

---

## 六、链上对齐

链上的 `AgentGrant`(`programs/keyshield/src/state.rs:203-221`)已经能支撑 session 模型,只需一处关键修复 + 一个新指令。

### 字段映射

| 架构文档用语 | 链上已有 | 映射关系 |
|---|---|---|
| `expiresAt`(绝对时间) | `created_at + session_timeout`(state.rs:210, 219) | 过期 = `clock > created_at + session_timeout` |
| 多 session 存储 | `agent_grants: [AgentGrant; 32]`(state.rs:358) | 一设备 = 一 pubkey = 一槽位 ✅ |
| 单 session revoke | `process_revoke_agent_access(agent_pubkey)`(agent_access.rs:206) | 复用 ✅ |
| 全 session revoke | 无 | **要加新指令(P1)** |
| 设备元数据(名字、位置) | 无 | **不上链**,存本地 `devices[]` |

### 阻塞项:timestamp bug

`programs/keyshield/src/instructions/agent_access.rs` 多处硬编码 `let timestamp = 0u64;`(行 122, 177, 183, 191, 279, 362)。Clock sysvar 已导入但从未调用。

**后果:链上 session 永远不过期**,"2 小时自动失效"只在客户端生效,任何人拿到 ephemeral 私钥可以永久调用。**必须先修**:

```rust
let timestamp = Clock::get()?.unix_timestamp as u64;
```

---

## 七、演进路径

### V1(本次做完)

- Face ID 注册 + 解锁 + 金库 CRUD(迁移 `disabled_extension/` 到 `extension/`)
- 链上 timestamp bug 修复 + `revoke_all` 指令
- 2 小时 session,到期提示续期,每设备独立
- API key 明文返回,文档诚实说明信任模型

### V1.1(下一轮)

- **恢复短语备份** —— 可选功能,用户生成 24 词短语 AES 加密整金库,让用户自己存(解决 passkey 依赖 iCloud / Google 登录的问题)
- Session 管理 UI —— 列出所有设备、上次活跃时间、一键踢除
- iOS 原生 app skeleton —— React Native(复用 TS SDK)或 SwiftUI(学 Swift)

### V2(触发条件驱动,不赶时间)

- **代理模式** —— Agent 不再看到明文 key,KeyShield 提供 HTTP 代理注入凭证
- **触发条件:** 用户反馈不敢跑第三方 MCP / agent marketplace 上线 / 安全审计要求
- **实现形态:** 浏览器内 agent → fetch 拦截;本机 agent → native messaging host → localhost proxy

### 不在路线图上(明确)

旧 pitch 里的 **Lit Protocol 阈值加密 / Bonsol ZK 证明 / Arcium MPC ephemeral signer / x402 streaming payments** 都**不在 V1、V1.1、V2 任何一个里面**。

这些方向的代码留有占位:
- `packages/agent-sdk/src/{lit,bonsol,arcium}.ts` 是抛错的 stub,只为不让老 import 链断
- Rust 程序里 `payment_streams[8]` 表和 `process_settle_payment` / `process_pay_for_service` / `process_close_payment_stream` 还在,但**没有任何活跃客户端代码调用它们**
- `process_grant_agent_access` 里 `zk_proof_length > 0` 的分支只检查非空,Bonsol verifier 接口还是 TODO

如果将来要重启这条路线,得**专门起一个新阶段**(可能叫 V3),不是从 V1.1 / V2 余量里挤。理由:本地金库 + passkey 模式已经覆盖了 99% 的 vibe coder 用户场景,加 Lit / Bonsol / Arcium 是给"不可信 agent 也能拿到 key"这个截然不同的威胁模型用的,该跟 V2 代理模式合并设计,不是平行加层。

---

## 相关文档

- 具体改动清单:`docs/roadmap/VAULT_FACEID_BACKLOG.md`
- 现有链上合约:`programs/keyshield/src/instructions/agent_access.rs`、`state.rs`
- 现有 WebAuthn 骨架(待迁移):`disabled_extension/src/lib/auth.ts`
