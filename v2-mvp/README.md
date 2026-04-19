# KeyShield v2-MVP

两层架构，支持两种完全不同的商业模式：

## 核心概念

### 用户 A：Key 持有者（Self-Custody）
- 拥有自己的 Helius/OpenAI key
- 把 key 存进 KeyShield（AES-256 加密）
- 随时取出，用于自己的调用
- KeyShield = 保险箱（密钥管理层）

### 用户 B：无 Key 用户（代理模式）
- 只有一个 KeyShield token
- 调用 `keyshield.xyz/api/helius/rpc`
- KeyShield 用系统 key 帮他转发请求
- 按用量收费（商业化）

## 实现计划

### 第一阶段：Layer 2 - 代理转发通路
**目标**：10 行代码证明链路通了

```
用户请求 → KeyShield 代理 → Helius API → 返回响应
```

- [ ] 简单代理服务器（Express/FastAPI）
- [ ] 单个 RPC 端点转发
- [ ] 传递 HTTP headers 和 body
- [ ] 返回原始响应

### 第二阶段：Layer 1 - 密钥管理
**目标**：加密存储和检索用户的 key

```
用户 key → AES-256 加密 → 数据库
需要调用 → 从数据库取出 → 解密 → 使用
```

- [ ] 数据库模型（User, StoredKey）
- [ ] AES-256 加密/解密函数
- [ ] 认证接口（存 key、取 key）
- [ ] 使用权限管理

### 第三阶段：合并
**目标**：同一套系统支持两种用户

```
┌─────────────────────┐
│  KeyShield API      │
├─────────────────────┤
│ Layer 1: 密钥管理    │ ← 用户 A
│ Layer 2: 代理转发    │ ← 用户 B
└─────────────────────┘
```

- [ ] 区分用户类型的路由逻辑
- [ ] 用户 A：从 vault 取自己的 key，用于调用
- [ ] 用户 B：用系统 key 转发，计量计费
- [ ] 统一的 token 认证

## 文件结构

```
v2-mvp/
├── layer1-key-management/    # 密钥管理模块
│   ├── models.py            # DB 模型
│   ├── crypto.py            # AES-256 加密
│   └── api.py              # 存/取 key 接口
├── layer2-proxy/             # 代理转发模块
│   ├── proxy.py             # 核心转发逻辑
│   ├── router.py            # 路由和 RPC 方法
│   └── middleware.py        # 认证、计量
├── docs/                     # 文档
│   ├── API.md               # API 文档
│   ├── DEPLOYMENT.md        # 部署指南
│   └── ARCHITECTURE.md      # 详细架构设计
└── README.md
```

## 快速开始

1. 从 layer2-proxy 开始，证明基础链路通了
2. 加入 layer1-key-management，支持用户 A
3. 合并逻辑，支持用户 B 的计量转发
