# 实现计划 - v2-MVP

## 第一阶段：Layer 2 - 代理转发（当前）

### 目标
10 行代码证明链路通了：`用户请求 → KeyShield 代理 → Helius API → 返回响应`

### 实现清单

- [x] 创建基础 FastAPI 应用
- [x] 实现 POST 转发端点 `/api/helius/{path:path}`
- [x] 读取环境变量中的 Helius API key
- [x] 添加健康检查端点
- [ ] 本地测试：转发一个真实的 Helius RPC 请求
  ```bash
  curl -X POST http://localhost:8000/api/helius/v0 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["11111111111111111111111111111111"]}'
  ```
- [ ] 验证响应完全来自 Helius API

### 文件
- `layer2-proxy/proxy.py` - 核心转发逻辑

### 完成标准
✅ 能转发真实的 Helius RPC 请求并收到正确的响应

---

## 第二阶段：Layer 1 - 密钥管理

### 目标
用户把自己的 key 存进来（AES-256 加密），需要时取出来

### 实现清单

- [x] 实现 AES-256 加密/解密（Fernet）
- [x] 为每个用户衍生独特密钥（PBKDF2）
- [x] SQLAlchemy 数据库模型
  - StoredKey：user_id, provider, encrypted_key, created_at, last_used
- [ ] API 端点：存储新的 key
  ```
  POST /api/keys
  {
    "provider": "helius",
    "api_key": "sk_xxx"
  }
  ```
- [ ] API 端点：获取已存的 key
  ```
  GET /api/keys/{provider}
  ```
- [ ] 认证：验证 user_id 的请求签名或 token
- [ ] 本地测试：加密/解密完整流程

### 文件
- `layer1-key-management/crypto.py` - 加密/解密
- `layer1-key-management/models.py` - 数据库模型
- `layer1-key-management/api.py` - 存/取 key API

### 完成标准
✅ 用户能存入自己的 key，加密存储，随时取出

---

## 第三阶段：合并 - 两种用户模式

### 目标
同一套系统支持：
- **用户 A**（Key 持有者）：存自己的 key，用自己的 key 调 Helius
- **用户 B**（无 Key 用户）：用系统 key 调 Helius，按量收费

### 实现清单

- [ ] 认证系统：区分用户 A 和用户 B
  - 用户 A：需要保存过 key，token 验证
  - 用户 B：无 key，用免费 token
- [ ] 代理逻辑优化
  ```python
  # 伪代码
  @app.post("/api/helius/{path:path}")
  async def proxy_helius(request, path, user_id):
    if user_has_saved_key(user_id, "helius"):
      # 用户 A：从 vault 取自己的 key
      key = get_stored_key(user_id, "helius")
    else:
      # 用户 B：用系统 key
      key = SYSTEM_KEY
      record_usage(user_id)  # 计量
    return forward_to_helius(key, path, request.json())
  ```
- [ ] 计量系统（用户 B 按量收费）
  - 记录每个请求的 token 消耗
  - 按月生成账单
- [ ] 统一的路由和中间件
- [ ] 端到端测试

### 完成标准
✅ 用户 A 和用户 B 都能正常调用，计量数据准确

---

## 技术选择

| 组件 | 技术栈 |
|------|--------|
| 框架 | FastAPI（异步）|
| 加密 | cryptography.Fernet（AES-128，内置 HMAC）|
| 数据库 | SQLite（MVP）→ PostgreSQL（生产）|
| 认证 | JWT token |
| 计量 | 本地日志 → Redis（生产）|

## 部署

### 本地开发
```bash
# 1. 生成主密钥
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key())"

# 2. 设置环境变量
export KEYSHIELD_MASTER_KEY="your-generated-key"
export HELIUS_API_KEY="your-helius-key"

# 3. 安装依赖
pip install -r requirements.txt

# 4. 运行
python -m layer2_proxy.proxy
```

### 生产部署
- Docker 容器化
- Kubernetes 或 Render/Fly.io
- PostgreSQL 数据库
- Redis 缓存和计量

---

## 测试计划

### 第一阶段测试
```python
# tests/test_layer2_proxy.py
def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200

def test_forward_helius_rpc():
    response = client.post("/api/helius/v0", json={
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getBalance",
        "params": ["11111111111111111111111111111111"]
    })
    assert response.status_code == 200
    assert "result" in response.json()
```

### 第二阶段测试
```python
# tests/test_layer1_crypto.py
def test_encrypt_decrypt():
    key = "test-api-key"
    encrypted = encrypt_key(key, "user_1")
    decrypted = decrypt_key(encrypted, "user_1")
    assert decrypted == key

def test_store_and_retrieve_key():
    store_key("user_1", "helius", "sk_xxx")
    retrieved = get_stored_key("user_1", "helius")
    assert retrieved.provider == "helius"
```

---

## 风险和缓解

| 风险 | 缓解 |
|------|------|
| 主密钥泄露 | 环境变量管理，限制访问 |
| API key 在日志中泄露 | 不记录敏感数据，加密存储 |
| Helius 配额超限 | 实现请求限流，用户计量 |
| 数据库故障 | 定期备份，重试机制 |

---

## 下一步
1. 完成第一阶段本地测试
2. 部署到测试环境
3. 集成第二阶段密钥管理
4. 实现第三阶段的两用户模式
