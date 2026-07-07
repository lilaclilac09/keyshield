# New Project Checklist (Fable 5 Hybrid)

在新仓库初始化时使用本清单，避免依赖记忆。

## 1) 一键安装规则文件

在本仓库执行（把 `<target-repo-path>` 替换成你的新仓库目录）：

```bash
./scripts/init-fable5-workflow.sh "<target-repo-path>"
```

## 2) 检查文件是否存在

- [ ] `<target-repo-path>/.cursorrules`
- [ ] `<target-repo-path>/claude.md`
- [ ] `<target-repo-path>/docs/IMPLEMENTATION_PLAN_TEMPLATE.md`

## 3) 每次任务开场固定提示词

复制以下句子作为第一条任务消息：

```text
严格按照项目中的 Fable 5 Workflow Rules 和 Plan 输出模板生成 Implementation Plan。
```

建议把这句保存为快捷短语（例如 `/fable5`）。

## 4) 一次性配置 Cursor 记忆（推荐）

只需做一次，之后跨项目也能自动提醒工作流：

1. 打开 `docs/CURSOR_MEMORY_BOOTSTRAP.md`
2. 按文档把 5 条 Memory 添加到 Cursor（Settings → Rules & Memories → Memories）
3. 完成后勾选：

- [ ] Memory 1: Fable 5 Hybrid 默认流程
- [ ] Memory 2: 任务开场先生成 Implementation Plan
- [ ] Memory 3: 新仓库运行 init 脚本
- [ ] Memory 4: 硬性约束（无 placeholder / 类型 / Snowflake）
- [ ] Memory 5: Opus 交接与 Cursor 回流验证

> 说明：Cursor Memory 是账户级配置，无法通过 git 自动写入；仓库内已提供可复制文本。
