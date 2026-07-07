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
