# Claude Spec (Fable 5 Hybrid Workflow)

本规范用于统一 Cursor 与强模型（如 Opus）的协作流程，确保先规划、后执行、再整合验证。

## Workflow Spec

1. Cursor 负责需求分析、架构设计、Implementation Plan 输出。
2. Plan 必须标注每个步骤的执行主体（Cursor / Opus / 混合）。
3. Opus 等强模型负责复杂实现、大规模重构、重执行任务。
4. 每个子模块必须先验证通过，再进入下一个模块。
5. 最终必须回流到 Cursor 做一致性检查、优化、整合与验收。

## Hard Rules

- 禁止跳过 Plan 阶段直接编码。
- 禁止跳过验证或测试。
- 禁止 placeholder 代码。
- 所有新代码必须具备完整类型注解与必要注释。
- 涉及 Snowflake 的部分必须采用 Dynamic Tables + Cortex Search。

## Plan Output Requirement

Plan 需按顺序拆解步骤，并在每个步骤中包含：
- 目标
- 执行主体
- 具体任务
- 验证方式
- 依赖项
- 风险与注意事项

模板见：`docs/IMPLEMENTATION_PLAN_TEMPLATE.md`
