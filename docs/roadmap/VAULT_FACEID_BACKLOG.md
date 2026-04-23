# Face ID + 本地金库 —— P0/P1/P2 改动清单

> 配套架构文档:`docs/technical/LOCAL_VAULT_ARCHITECTURE.md`
> 所有行号基于审计当时的代码状态;动手前请重新确认。

## P0 —— 阻塞项(不修无法上生产)

| # | 文件 | 行号 | 动作 |
|---|---|---|---|
| P0-1 | `programs/keyshield/src/instructions/agent_access.rs` | 122, 177, 183, 191, 279, 362 | 所有 `let timestamp = 0u64;` 换成 `let timestamp = Clock::get()?.unix_timestamp as u64;` |
| P0-2 | `programs/keyshield/src/instructions/agent_access.rs` | 353-365 | 修好后,给过期检查加单元测试:构造 `created_at + session_timeout < now` 的 grant,断言 `process_access_with_agent` 返回 `AgentGrantExpired` |
| P0-3 | `packages/goat-wallet/src/index.ts` | 198-210 | `sendRawTransaction` 前 `unshift` 一条 `ComputeBudgetProgram.setComputeUnitPrice`,值从 `getRecentPrioritizationFees` 取中位数。不加这个,grant/revoke 交易在主网拥堵时可能一直不落块 |

### P0-1 的后果为什么这么严重

链上现在所有时间戳都写 0,`created_at + session_timeout` 永远 = `session_timeout`,而 `now(=0) > session_timeout` 永为假。等价于**链上 session 永不过期**。客户端的 2 小时只是 UI 假象,拿到 ephemeral 私钥的任何人可以永久调用。

---

## P1 —— 做本次 Face ID + 多 session 架构需要

| # | 位置 | 动作 |
|---|---|---|
| P1-1 | `programs/keyshield/src/instructions/agent_access.rs`(新函数) | `process_revoke_all_agents` —— 迭代 `agent_grants[0..32]`,全部 `is_active = 0`,更新 `updated_at` |
| P1-2 | `programs/keyshield/src/lib.rs` | 新 ix 注册到 dispatcher |
| P1-3 | `extension/`(新文件) | 从 `disabled_extension/src/lib/auth.ts` 迁 WebAuthn 骨架,**去掉 PBKDF2 fallback 分支**,对接新金库 schema |
| P1-4 | `extension/src/lib/vault.ts`(新) | AES-GCM 金库读写:`encryptVault`、`decryptVault`、`getVault`、`putVault` |
| P1-5 | `extension/src/lib/session.ts`(新) | Session 生命周期:`createSession(7200)`、`renewSession`、`revokeSession(pubkey)`、`revokeAll`、`onNearExpiry(cb)` |
| P1-6 | `packages/agent-sdk/src/index.ts:77` `createEphemeralSigner` | 加 `expiresAt` 参数,默认 `now + 7200` |
| P1-7 | `packages/agent-sdk/src/index.ts`(新方法) | `listActiveSessions(ownerPubkey)` —— 一次 `getAccountInfo` 读 vault,客户端解析 `agent_grants`,过滤 `is_active == 1 && !expired` |
| P1-8 | `packages/agent-sdk/src/index.ts` | 行 193-198 Lit decrypt 循环改 `Promise.all`,5+ keys 能省 500ms-2s |

---

## P2 —— 能做但不阻塞

| # | 位置 | 动作 |
|---|---|---|
| P2-1 | `packages/goat-wallet/src/index.ts:208` | `confirmTransaction(sig)` 显式加 `'confirmed'`,省 1-2 秒 |
| P2-2 | `packages/goat-wallet/src/index.ts:151-158` | `signAllTransactions` 并行化 |
| P2-3 | `README.md` | 加 "RPC 提供商要求" 段,写明需要 Helius / Triton / QuickNode,公共 mainnet-beta 不够用 |
| P2-4 | `packages/agent-sdk/src/index.ts` + `scripts/demo-streaming-payment.ts` | SDK 接受传入 Connection 实例,避免重复 `new Connection` |
| P2-5 | `programs/keyshield/src/instructions/agent_access.rs:173-175` | 正式实现 `allowed_endpoints` / `allowed_models` 的写入(当前 hardcode 为 0) |
| P2-6 | `packages/keyshield` 全局 | 决定 Bonsol / Arcium 的去留 —— 要就接真 verifier,不要就从 ix 里删掉,别留 TODO 半成品 |

---

## 建议的施工顺序

1. **P0-1 → P0-2**:链上 timestamp 先修,跑通单元测试,证明 session 真的会过期
2. **P1-1 → P1-2**:加 `revoke_all` 指令,部署
3. **P1-6 → P1-7**:SDK 侧加 `expiresAt` + `listActiveSessions`,为 UI 提供数据
4. **P1-3 → P1-4 → P1-5**:扩展里把 WebAuthn 骨架迁过来,加上金库读写和 session 生命周期
5. **P0-3**:在任何实际要上主网之前必须做
6. 上线前的清理:P2 里想做哪条做哪条,不想做就先欠着

每做完一项在本文件里打勾或挪到 DONE 区。
