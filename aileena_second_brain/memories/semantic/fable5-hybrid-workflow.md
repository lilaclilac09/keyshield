---
date: 2026-07-07
type: preference
tags: [workflow, fable5, cursor, opus]
confidence: high
decay_speed: slow
source: workflow_setup
agent_id: coordinator
team_task_id: fable5_hybrid_001
---

# Fable 5 Hybrid Workflow (Default)

## Rule

- Cursor: plan, architecture, review, reintegration
- Opus: heavy implementation, refactor, complex logic
- Always Plan-first; no skip; no placeholders

## Kickoff Prompt

```text
严格按照项目中的 Fable 5 Workflow Rules 和 Plan 输出模板生成 Implementation Plan。
```

## Snowflake Constraint

When Snowflake is involved, use **Dynamic Tables + Cortex Search** only.

## Bootstrap

New repos:

```bash
./scripts/init-fable5-workflow.sh "<target-repo-path>"
```

Cursor account memories: see `docs/CURSOR_MEMORY_BOOTSTRAP.md`.
