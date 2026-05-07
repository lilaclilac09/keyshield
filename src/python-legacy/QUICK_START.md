# 快速开始 - v2-MVP

## 5 分钟内启动第一阶段（Layer 2 代理）

### 前置条件
- Python 3.9+
- 一个有效的 Helius API key（从 [https://dev.helius.xyz](https://dev.helius.xyz) 获取）

### 步骤 1：克隆和安装

```bash
cd /Users/aileen/Downloads/privacy_hack/keyshield/v2-mvp

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 步骤 2：设置环境变量

```bash
# 生成或获取你的 Helius API key，然后：
export HELIUS_API_KEY="your-helius-api-key-here"
export KEYSHIELD_MASTER_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
```

### 步骤 3：运行代理服务

```bash
python -m layer2_proxy.proxy
```

你应该看到：
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### 步骤 4：测试健康检查

在另一个终端：
```bash
curl http://localhost:8000/health
```

预期响应：
```json
{
  "status": "ok",
  "service": "keyshield-layer2-proxy"
}
```

### 步骤 5：测试转发一个真实请求

```bash
curl -X POST http://localhost:8000/api/helius/v0 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getBalance",
    "params": ["11111111111111111111111111111111"]
  }'
```

预期响应（来自 Helius）：
```json
{
  "jsonrpc": "2.0",
  "result": 5000000,
  "id": 1
}
```

**✅ 恭喜！链路通了！** 你已经成功：
- 启动了 KeyShield 代理服务
- 转发了一个真实的 Helius 请求
- 收到了正确的响应

---

## 下一步（第二阶段）

### 目标：加入密钥管理（Layer 1）

1. 在 `layer1-key-management/` 中实现 API 端点
2. 让用户能存储自己的 Helius key（加密）
3. 修改代理逻辑，使用存储的 key 而不是系统 key

详见 `docs/IMPLEMENTATION_PLAN.md` 的"第二阶段"部分。

---

## 文件结构参考

```
v2-mvp/
├── layer2-proxy/
│   └── proxy.py              # ← 现在运行的代码
├── layer1-key-management/
│   ├── crypto.py             # AES-256 加密
│   └── models.py             # 数据库模型（未创建）
├── docs/
│   ├── IMPLEMENTATION_PLAN.md # 详细计划
│   ├── API.md               # API 文档
│   └── DEPLOYMENT.md        # 部署指南（未创建）
├── requirements.txt          # Python 依赖
└── README.md                # 项目概览
```

---

## 常见问题

### Q: 我没有 Helius API key 怎么办？
A: 去 [https://dev.helius.xyz](https://dev.helius.xyz) 注册，选择免费层（Free Tier），就能获得一个 API key。

### Q: 代理不转发请求怎么办？
A: 
1. 检查 `HELIUS_API_KEY` 是否正确设置：`echo $HELIUS_API_KEY`
2. 检查网络连接：`curl https://api.helius.xyz` 应该能返回响应
3. 查看错误日志（Uvicorn 会打印详细错误）

### Q: 可以改端口吗？
A: 可以。编辑 `layer2-proxy/proxy.py` 最后一行：
```python
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9000)  # 改这里
```

### Q: 第二阶段什么时候能开始？
A: 等第一阶段稳定运行（即你能成功转发请求）后，就可以开始集成 Layer 1 的密钥管理。

---

## 调试技巧

### 看请求日志
```bash
# 以调试模式运行
export LOG_LEVEL=DEBUG
python -m layer2_proxy.proxy
```

### 测试不同的 RPC 方法
```bash
# 获取 Solana 链的块时间
curl -X POST http://localhost:8000/api/helius/v0 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBlockCommitment","params":[123]}'

# 获取账户信息
curl -X POST http://localhost:8000/api/helius/v0 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["TokenkegQfeZyiNwAJsyFbPVwwQQfharxiV7kGKcOQV"]}'
```

### 查看完整请求/响应
```python
# 在 proxy.py 中添加日志
import logging
logging.basicConfig(level=logging.DEBUG)
```

---

更多帮助见 `docs/` 目录。
