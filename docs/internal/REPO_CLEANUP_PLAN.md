# Repo Editorial Pass — Keyshield

**目标不是重构系统，是做一次 repo editorial pass。**

## 三个目标（就盯这三个，别贪）

1. 陌生人 30 秒看懂主线
2. 根目录像产品，不是像脑内备忘录
3. 主产品 / 配套 / 历史残留 三者分开

---

## 当前根目录问题地图

根目录现有 46 个条目，其中裸露 `.md` 文件 13 个。问题分类：

| 类型 | 条目 |
|---|---|
| 必须留门口 | README.md, DEVELOPMENT.md, DEPLOY.md, CHANGELOG.md, AGENTS.md, package.json, Cargo.toml, Makefile |
| 工具配置（dotfile，不算视觉噪音） | .claude, .gstack, .gitnexus, .github, .gitignore, .gitattributes, .vercelignore, .env.example |
| 不该留门口——项目管理 | ROADMAP.md, STATUS.md, TODOS.md |
| 不该留门口——历史迁移 | MIGRATION_AUDIT.md, MIGRATION_CHECKLIST.md, V2-DOCS.md |
| 不该留门口——演示/使用 | DEMO_SCRIPT.md, USAGE.md |
| 历史化石目录 | v2-mvp/ |
| 命名维度混乱 | proxy-rs/（按语言），python-sdk/（按语言+产物），landing/（孤儿营销站） |

---

## 根目录目标状态（轻改版，先做这个）

```
README.md
DEVELOPMENT.md
DEPLOY.md
CHANGELOG.md
AGENTS.md
LICENSE
package.json
Cargo.toml
Cargo.lock
Makefile
dev.cjs
conftest.py
playwright.config.ts
tsconfig.base.json
railway.json
.env.example
docs/
src/
packages/
proxy-rs/       ← 暂时保留，Phase 3 再改名
python-sdk/     ← 暂时保留，Phase 4 再改名
landing/        ← 暂时保留，Phase 3 再改名
tooling/
scripts/
tests/
archive/
```

---

## 执行计划

### Phase 1 — 根目录文档降级（零风险，纯 git mv）

**移进 `docs/internal/`：**

```bash
# 项目管理类
mv ROADMAP.md        docs/internal/roadmap.md
mv STATUS.md         docs/internal/status.md
mv TODOS.md          docs/internal/todos.md

# 迁移历史类
mv MIGRATION_AUDIT.md     docs/internal/migration-audit.md
mv MIGRATION_CHECKLIST.md docs/internal/migration-checklist.md
mv V2-DOCS.md             docs/internal/v2-docs.md

# 演示/使用类
mv DEMO_SCRIPT.md    docs/internal/demo-script.md
mv USAGE.md          docs/internal/usage.md
```

**Commit message：**
```
chore: move project status and migration docs out of root into docs/internal
```

---

### Phase 2 — 历史目录归档（零风险）

`v2-mvp/` 里只有两个测试文件（`test_account_deletion.py`，`test_sharing.py`），是历史测试遗留：

```bash
mkdir -p archive/v2-mvp
mv v2-mvp/tests archive/v2-mvp/tests
rmdir v2-mvp
```

`.keyshield-demo/` 是演示钱包状态 JSON，不是产品资产：

```bash
mv .keyshield-demo archive/keyshield-demo
```

`landing/DEMO-SCRIPT.md` 移走：

```bash
mv landing/DEMO-SCRIPT.md docs/internal/demo-script-landing.md
```

**Commit message：**
```
chore: archive legacy v2 tests and demo artifacts
```

---

### Phase 3 — 目录改名（需要更新引用，单独 PR）

**问题：** 当前命名维度不统一——`proxy-rs` 按语言，`src/backend` 按职责，`landing` 按营销角色，混杂在同一层级。

**轻改版（推荐先做）：**

```bash
mv proxy-rs   proxy
mv python-sdk sdk-python
mv landing    marketing-landing
```

⚠️ 改 `proxy-rs` 前检查：
- `proxy-rs/` 里的 `crates/ks-helius` 是独立 Rust crate，有自己的 Cargo.toml
- 根目录 `Cargo.toml` 的 `exclude` 列表不包含它，确认改名后路径正确
- CI workflows 里有没有 hardcode `proxy-rs` 路径

**稍正式版（有余力再做）：**

```bash
mkdir -p services packages/sdk-py sites
mv proxy-rs   services/proxy-helius
mv python-sdk packages/sdk-py
mv landing    sites/landing
```

注意：`python-sdk/` 有自己的 `pyproject.toml`，移动后需要更新包路径；如果有 PyPI 发布流，CI 也要同步。

**Commit messages（分开提交更稳）：**
```
refactor: rename proxy-rs to proxy
refactor: rename python-sdk to sdk-python
refactor: move landing into marketing-landing
```

---

### Phase 4 — docs/ 补完分层

当前 `docs/` 已有 `architecture/`、`get-started/`、`pitch/`、`technical/`、`zh/`，格局不错。

补上分层后完整结构：

```
docs/
  architecture/       ← 系统架构（已有）
  get-started/        ← 快速上手（已有）
  technical/          ← 技术深度（已有）
  pitch/              ← Pitch deck（已有）
  zh/                 ← 中文文档（已有）
  internal/           ← 新建：项目管理、迁移记录（Phase 1 已建）
  API.md              ← 已有
  DEVNET.md           ← 已有
  EXTENSION.md        ← 已有
  OPERATOR.md         ← 已有
  OPERATOR-RUNBOOK.md ← 已有
  PAYMENT-FLOWS.md    ← 已有
  USAGE.md            ← 从根目录移入（Phase 1 已做）
```

**Commit message：**
```
docs: organize documentation with internal section
```

---

### Phase 5 — 每个主目录加短 README

成本低，质感上来很快。以下文案直接用：

**`src/web/README.md`**
```
web ui for users to store provider secrets, inspect sessions, mint scoped sessions, and manage delegated access.
```

**`src/backend/README.md`**
```
control plane api for secret storage, session minting, delegation, policy checks, and management flows.
```

**`src/proxy/README.md`**
```
hot-path proxy for calling upstream providers with scoped session tokens instead of raw provider secrets.
```

**`proxy-rs/README.md`（或改名后的目录）**
```
helius-specific hot-path proxy crate for calling helius rpc with scoped session tokens.
```

**`packages/shared/README.md`**
```
shared types, constants, schemas, and utilities used across web, backend, proxy, and sdk packages.
```

**`python-sdk/README.md`（或改名后）**
```
python sdk for working with keyshield sessions, delegated access, and provider calls from scripts, services, and agents.
```

**`landing/README.md`（或改名后）**
```
marketing and product site content for explaining keyshield, its security model, and main use cases.
```

**`docs/README.md`**
```
architecture, developer setup, deployment notes, product concepts, and internal project documentation.
```

**Commit message：**
```
docs: add short readmes for core directories
```

---

### Phase 6 — README 重写

新 README 只做 4 件事，然后停。

**骨架：**

```markdown
# KeyShield

Zero-trust API credential gateway for humans, agents, and delegated bots.

KeyShield lets users store upstream provider secrets securely while agents
and bots use short-lived scoped session tokens instead of raw API keys.

**Why it matters:** most agent systems pass raw secrets directly into tools
or runtimes. KeyShield separates secret custody from capability usage —
humans keep control, agents get limited, revocable access.

## Quickstart

1. Start the backend
2. Start the web app
3. Store a provider key in the vault
4. Mint a scoped session token
5. Call upstream APIs through the proxy

→ Full setup: [DEVELOPMENT.md](DEVELOPMENT.md)

## Repo Map

| Directory | Role |
|---|---|
| `src/web` | vault UI, session management, delegation |
| `src/backend` | control plane API |
| `src/proxy` | hot-path upstream proxy |
| `packages/shared` | shared types and utilities |
| `python-sdk` | Python SDK |
| `docs` | architecture, setup, deployment |

## Read More

- Developer setup — [DEVELOPMENT.md](DEVELOPMENT.md)
- Deployment — [DEPLOY.md](DEPLOY.md)
- Architecture — [docs/architecture/](docs/architecture/)
- API reference — [docs/API.md](docs/API.md)
```

**Commit message：**
```
docs: rewrite root readme around core security model and quickstart
```

---

## Git 执行顺序（完整）

```
branch: cleanup/repo-clarity

commit 1  chore: move project status and migration docs out of root into docs/internal
commit 2  chore: archive legacy v2 tests and demo artifacts
commit 3  docs: add short readmes for core directories
commit 4  docs: rewrite root readme around core security model and quickstart
commit 5  docs: organize documentation with internal section

--- 单独 PR ---
commit 6  refactor: rename proxy-rs to proxy
commit 7  refactor: rename python-sdk to sdk-python
commit 8  refactor: move landing into marketing-landing
commit 9  chore: update build paths and ci references after directory rename
```

Phase 1-5 一个 PR（纯搬家，零逻辑改动）。
Phase 6-9 单独 PR（涉及构建路径，需要跑 CI 验证）。

---

## 每次提交后的回归检查（8 项）

```
[ ] 根目录变清楚了
[ ] npm run dev:web 还能起
[ ] npm run dev:api 还能起
[ ] .env.example 还在根目录
[ ] packages/shared 路径没断
[ ] src/backend 的 python import 路径没炸
[ ] README 里写的路径命令还是对的
[ ] package.json workspaces 配置还有效
```

---

## 绝对不碰的东西

这轮只做结构编辑，以下一律不动：

- auth 逻辑、session token 行为
- proxy 路由和 provider adapter
- 数据库 schema 和 migration 文件
- SDK API surface
- deployment 配置（railway.json, vercel.json）
- Cargo workspace 成员（除非是 Phase 3 rename 时）
- `.github/workflows/` 内容（除非 Phase 3 rename 后路径对不上）

---

## 判断标准（每次犹豫时用这个）

> 第一次来的开发者，真的需要第一眼看到它吗？

不是特别坚定的"要"，就移走。
