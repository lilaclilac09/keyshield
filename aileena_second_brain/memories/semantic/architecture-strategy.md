---
date: 2026-07-07
type: fact
tags: [architecture, strategy, memory, training]
confidence: high
decay_speed: slow
source: architecture_decision
---

# 方案选择：哪套最合适？

## 结论（推荐组合）

**最合适的是三层组合，而不是单选：**

| 层 | 方案 | 用途 | 适用场景 |
|---|---|---|---|
| L1 运行时 | `dj-set/` carousel + `setlist.json` | 展示、切歌、封面、链接 | 日常 DJ set 管理 |
| L2 长期记忆 | `aileena_second_brain/memories/**` | 品味、规则、曲库事实 | Agent 长期记住偏好 |
| L3 训练蒸馏 | `prepare_training_data.py` + LoRA | 把记忆/文章切片后训练 | 样本量足够后再做 |

## 为什么不只选一个？

- 只做页面：Agent 下次会忘品味与搜索规则。
- 只做记忆：没有可视化 carousel，不符合你的使用方式。
- 只做 LoRA：当前样本太少，且音乐偏好变化快，维护成本高。

## 推荐执行顺序

1. 先保证 L1 + L2（carousel 与记忆同步）
2. 每次新增曲目都写 `semantic` + `personal`
3. 样本累计到 30+ 再启动 LoRA（文本）
4. 封面图训练单独走 image pipeline，不与文本混切片

## 与 Fable5 的关系

- 音乐策展任务：走 L1+L2，不必先写 Implementation Plan。
- 工程开发任务：继续 Fable5（Plan -> 执行 -> 验证）。
