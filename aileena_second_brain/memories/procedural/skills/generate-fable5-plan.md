---
date: 2026-07-07
type: skill
tags: [planning, fable5, implementation-plan]
confidence: high
decay_speed: slow
source: workflow_setup
agent_id: coordinator
team_task_id: fable5_hybrid_001
---

# Skill: Generate Fable5 Implementation Plan

## Trigger

User starts a non-trivial coding task in a repo with `.cursorrules` and `docs/IMPLEMENTATION_PLAN_TEMPLATE.md`.

## Prompt Template

```text
严格按照项目中的 Fable 5 Workflow Rules 和 Plan 输出模板生成 Implementation Plan。

任务：[具体需求]

要求：
1. 每个步骤标注执行主体（Cursor / Opus / 混合）
2. 每步包含验证方式与依赖项
3. 标注哪些步骤建议 Opus 执行
4. Snowflake 部分使用 Dynamic Tables + Cortex Search
5. 禁止 placeholder
```

## Tools Needed

- Read: `.cursorrules`, `claude.md`, `docs/IMPLEMENTATION_PLAN_TEMPLATE.md`
- Write: plan output in chat or `docs/plans/<task-id>.md` when requested

## Success Criteria

- Plan has ordered steps with owner, validation, dependencies
- Opus-handoff steps are clearly marked
- No coding before plan gate passes
