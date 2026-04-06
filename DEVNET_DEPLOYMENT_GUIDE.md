# 🚀 KeyShield Devnet 部署完整指南

**状态**: ✅ 准备就绪 | **日期**: 2026-04-06 | **网络**: Solana Devnet

---

## 📊 部署前检查清单

| 项 | 状态 | 信息 |
|----|------|------|
| 🔨 **程序构建** | ✅ 成功 | 73 KB SBPF 文件 |
| 🌐 **网络配置** | ✅ 完成 | devnet (api.devnet.solana.com) |
| 👛 **钱包** | ✅ 就绪 | 74Xuc5...69tWLwDY |
| 💰 **SOL 余额** | ✅ 充足 | 3.789944317 SOL |
| 📝 **Vault 存储** | ✅ 已准备 | 867af138e4a858fe68368e123ff56733 |

---

## 🎯 快速部署 (3 步)

### Step 1️⃣: 执行部署脚本
```bash
cd /Users/aileen/Downloads/privacy_hack/keyshield
node scripts/deploy-devnet-now.mjs
```

⏳ **预计耗时**: 30-60 秒

### Step 2️⃣: 获取程序 ID
输出会显示:
```
Program Id: XXXxxxXXXxxxXXXxxxXXXxxxXXXxxxXXXxxxXXXxxx
```
📌 **保存这个值** - 将来需要用到

### Step 3️⃣: 在 Explorer 上验证
打开浏览器访问:
```
https://explorer.solana.com/?cluster=devnet
搜索: <你的 Program ID>
```

---

## 🔄 如果部署失败

### 问题 1: Connection reset by peer
```bash
# 等待并重试
sleep 30
node scripts/deploy-devnet-now.mjs
```

### 问题 2: 账户不存在
```bash
# 验证网络连接
solana cluster-version --url devnet

# 检查钱包
solana address
solana balance
```

### 问题 3: 余额不足
```bash
# 获取更多 devnet SOL
# 访问: https://faucet.solana.com/
# 粘贴钱包地址: 74Xuc5BC5uttSiHj598sJJj3rgEUsfYF7xVs69tWLwDY

# 等待 15-30 秒后验证
solana balance
```

---

## 📋 完整部署流程详解

### 程序构建状态
```
✅ cargo build-sbf 成功
   └─ 输出: target/sbpf-solana-solana/release/keyshield.so (73 KB)
   └─ 警告: Stack overflow (可以忽略，不影响部署)
```

### 网络配置
```bash
# 当前配置:
$ solana config get

Config File: /Users/aileen/.config/solana/cli/config.yml
RPC URL: https://api.devnet.solana.com ✅
WebSocket URL: wss://api.devnet.solana.com/ ✅
Keypair Path: /Users/aileen/.config/solana/id.json
Commitment: confirmed
```

### 钱包信息
```bash
$ solana address
74Xuc5BC5uttSiHj598sJJj3rgEUsfYF7xVs69tWLwDY

$ solana balance
3.789944317 SOL ✅ (足以支付 ~0.001 SOL 的部署费用)
```

---

## 💾 部署后期望看到什么

### 部署成功输出示例
```
✅ Deploying program...
✅ Program deployed to XxxXxxXxxXxxXxxXxxXxxXxxXxxXxxXxxXxxXxxX
```

### 在 Solana Explorer 上看到的
1. 程序账户 (Executable = Yes)
2. 程序大小 (~73 KB)
3. 所有者 (System Program)
4. 部署/更新历史

---

## 🔗 部署后的下一步

### 1️⃣ 获取程序 ID
```bash
solana address -k target/deploy/keyshield-keypair.json
# 或从部署输出复制
```

### 2️⃣ 在本地存储的 Vault 中存储程序 ID
编辑: `scripts/demo-on-chain-storage.mjs`
```javascript
// 改为你的程序 ID
const PROGRAM_ID = new PublicKey('XXXxxxXXXxxxXXXxxxXXXxxxXXXxxxXXXxxxXXXxxx');
```

### 3️⃣ 在链上存储你的 API Key
```bash
node scripts/demo-on-chain-storage.mjs --network devnet
```

### 4️⃣ 在 Explorer 上查看存储的 Vault
```
https://explorer.solana.com/?cluster=devnet
搜索: 9VRxrF2w7NSMsxVW3xP1LiV6pkksZ5kavRaxBuKqH5fs
```

---

## 📚 参考资源

| 资源 | 链接 |
|------|------|
| Solana Explorer (Devnet) | https://explorer.solana.com/?cluster=devnet |
| SOL Faucet | https://faucet.solana.com/ |
| Solana CLI 文档 | https://docs.solana.com/cli |
| Web3.js 文档 | https://solana-labs.github.io/solana-web3.js/ |
| Solana Cookbook | https://solanacookbook.com/ |

---

## 🚨 重要提示

### 仅用于开发/测试
- Devnet 是公开的测试网络
- 不要在 devnet 上部署生产 API Keys
- Devnet 可能随时重置

### 安全建议
- 保管好你的私钥
- 不要分享钱包的私钥文件
- 生产环境使用专门的密钥管理服务

### 迁移到 Mainnet
准备好后:
```bash
# 改为 mainnet
solana config set --url mainnet-beta

# 获取正式 SOL
# 从交易所购买或获得真实 SOL

# 部署
solana program deploy target/sbpf-solana-solana/release/keyshield.so --url mainnet-beta
```

---

## 📞 故障排除表

| 错误 | 原因 | 解决方案 |
|------|------|--------|
| Connection reset | 网络问题 | 等待并重试 |
| Insufficient funds | 余额不足 | 从 faucet 获取 SOL |
| Account not found | 尚未同步 | 等待 1-2 分钟后查询 |
| Stack overflow | 内存问题 | 编译时的警告，可忽略 |
| Program input size exceeded | 交易过大 | 减少数据大小 |

---

## ✅ 验证检查表

完成部署后，检查以下内容：

- [ ] 程序在 Explorer 上可见
- [ ] Program ID 格式正确 (58 个字符)
- [ ] Executable = Yes
- [ ] 账户大小 > 73 KB
- [ ] 所有者是 System Program 或 BPF Loader
- [ ] 可以通过 RPC 查询 (getAccountInfo)

---

## 💡 提示

1. **部署很慢?** - Devnet 可能很拥挤，耐心等待
2. **想更快?** - 尝试 localnet 或自己的测试网
3. **想真实测试?** - Testnet 也可用 (cluster=testnet)
4. **需要持久化?** - Mainnet 是永久的区块链

---

**🎉 准备好了吗? 运行:**
```bash
node scripts/deploy-devnet-now.mjs
```

**祝你部署顺利！** 🚀
