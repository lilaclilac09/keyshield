---
date: 2026-07-07
type: article
title: Fable 5 混合工作流实践
tags: [workflow, cursor, opus, aileena]
confidence: high
decay_speed: slow
source: article_seed
---

# Fable 5 混合工作流实践

在复杂工程任务里，单一模型往往难以同时兼顾规划质量与执行速度。  
我的默认策略是：Cursor 负责 Plan 与整合，Opus 负责重执行。

## 为什么先 Plan

- 降低返工成本
- 明确模块边界与验证方式
- 便于多 Agent 协作分工

## 执行建议

1. 先输出 Implementation Plan（含 Owner）
2. 重逻辑模块交给 Opus
3. 回流 Cursor 做验证、优化、合并

## 结论

Plan 质量决定最终交付质量。外部记忆 + 规则文件 + 账户记忆三层叠加，可以显著降低“想不起来流程”的成本。
