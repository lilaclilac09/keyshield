# KeyShield v2-MVP API 文档

## 概览

KeyShield 提供两个核心服务：

1. **密钥管理 API**（Layer 1）：安全存储和检索用户的 API key
2. **代理 API**（Layer 2）：转发用户请求到 Helius，支持用户自己的 key 或系统 key

---

## 认证

### 用户 Token
所有请求都需要在 Header 中提供 token：
```
Authorization: Bearer {token}
```

Token 可以通过两种方式获得：
- **用户 A**（Key 持有者）：在 KeyShield 后台生成
- **用户 B**（无 Key 用户）：邮件注册后自动生成

---

## Layer 1：密钥管理 API

### 1. 存储 API Key

```
POST /api/keys
Authorization: Bearer {token}
Content-Type: application/json

{
  "provider": "helius",        // 服务提供商：helius / openai / ...
  "api_key": "sk_xxx..."       // 原始 API key
}
```

**响应**（成功）
```json
{
  "id": "key-user_123-helius",
  "provider": "helius",
  "created_at": "2026-04-19T10:30:00Z",
  "message": "Key stored securely"
}
```

**响应**（失败）
```json
{
  "error": "Invalid API key format",
  "code": 400
}
```

---

### 2. 获取已存的 Key

```
GET /api/keys/{provider}
Authorization: Bearer {token}
```

**响应**
```json
{
  "provider": "helius",
  "stored_at": "2026-04-19T10:30:00Z",
  "last_used": "2026-04-19T15:45:23Z",
  "is_active": true
}
```

注：不返回明文 key，只返回元数据。实际调用时会自动用已存的 key。

---

### 3. 删除 Key

```
DELETE /api/keys/{provider}
Authorization: Bearer {token}
```

**响应**
```json
{
  "message": "Key deleted successfully"
}
```

---

## Layer 2：代理 API

### 代理 Helius RPC

```
POST /api/helius/{path}
Authorization: Bearer {token}
Content-Type: application/json

// 标准 JSON-RPC 请求
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getBalance",
  "params": ["11111111111111111111111111111111"]
}
```

**工作流程**
1. KeyShield 接收请求
2. 识别用户类型：
   - 如果用户存过 Helius key → 用用户的 key
   - 如果用户没存 key → 用系统 key（用户 B）
3. 转发到 Helius
4. 返回原始响应

**响应**
```json
{
  "jsonrpc": "2.0",
  "result": 5000000,
  "id": 1
}
```

---

### 使用示例

#### 示例 1：用户 A（有自己的 key）

```bash
# 第一步：存储自己的 Helius key
curl -X POST http://localhost:8000/api/keys \
  -H "Authorization: Bearer user_a_token" \
  -H "Content-Type: application/json" \
  -d '{"provider": "helius", "api_key": "sk_mykey123"}'

# 第二步：调用 RPC（会自动用自己的 key）
curl -X POST http://localhost:8000/api/helius/v0 \
  -H "Authorization: Bearer user_a_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["11111111111111111111111111111111"]}'
```

#### 示例 2：用户 B（无 key，用系统 key）

```bash
# 直接调用 RPC，系统自动用自己的 key 并计量
curl -X POST http://localhost:8000/api/helius/v0 \
  -H "Authorization: Bearer user_b_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["11111111111111111111111111111111"]}'

# 账单会自动计算（按 RPC 调用次数或 tokens）
```

---

## 其他端点

### 健康检查
```
GET /health

响应：
{
  "status": "ok",
  "service": "keyshield-layer2-proxy",
  "timestamp": "2026-04-19T16:20:00Z"
}
```

### 获取用户使用统计

```
GET /api/usage
Authorization: Bearer {token}

响应（用户 B）：
{
  "user_id": "user_b_456",
  "this_month": {
    "rpc_calls": 12340,
    "estimated_cost": "$4.32"
  },
  "subscription": "pay-as-you-go"
}

响应（用户 A）：
{
  "user_id": "user_a_123",
  "this_month": {
    "api_calls": 50000
  },
  "subscription": "self-custody"
}
```

---

## 错误处理

### 常见错误

| 代码 | 含义 | 解决方案 |
|------|------|---------|
| 401 | Unauthorized | 检查 token 是否正确和过期 |
| 400 | Bad Request | 检查请求格式（JSON RPC 需要 `jsonrpc`, `id`, `method`, `params`）|
| 429 | Rate Limit | 请求过于频繁，请稍候重试 |
| 503 | Service Unavailable | Helius API 暂时不可用 |

### 错误响应格式
```json
{
  "error": "Invalid token",
  "code": 401,
  "details": "Token expired at 2026-04-19T10:00:00Z"
}
```

---

## 速率限制

- **用户 A**（自己的 key）：无限制（受 Helius API 限制）
- **用户 B**（系统 key）：
  - 免费额度：1000 calls/month
  - 按量付费：$0.0002 per call

---

## SDK 示例（Python）

```python
import requests

class KeyShieldClient:
    def __init__(self, token: str, base_url: str = "http://localhost:8000"):
        self.token = token
        self.base_url = base_url
        self.headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def store_key(self, provider: str, api_key: str):
        """存储 API key"""
        response = requests.post(
            f"{self.base_url}/api/keys",
            headers=self.headers,
            json={"provider": provider, "api_key": api_key}
        )
        return response.json()

    def call_helius_rpc(self, method: str, params: list):
        """调用 Helius RPC（自动处理 key）"""
        response = requests.post(
            f"{self.base_url}/api/helius/v0",
            headers=self.headers,
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        )
        return response.json()

# 使用
client = KeyShieldClient("user_token_xxx")
client.store_key("helius", "sk_mykey")
result = client.call_helius_rpc("getBalance", ["11111111111111111111111111111111"])
print(result)
```

---

## 部署和配置

见 `DEPLOYMENT.md`
