---
date: 2026-07-07
type: fact
tags: [training, slicing, data-pipeline]
confidence: high
decay_speed: slow
source: data_engineering
---

# 数据切片与处理规范

## 1) 数据源分层

- **结构化曲库**：`dj-set/setlist.json`（一条 track = 一条样本）
- **记忆库**：`memories/**`（按 frontmatter.type 决定 instruction）
- **文章**：`articles/**`（按标题/章节切片）
- **反思**：`reflection_logs/**`（一篇一条，不拆）
- **图片**：`training_data/images/raw/*` + captions（一张一条）

## 2) 文本切片规则

### A. 结构化 JSON（DJ set）
- 粒度：1 track / sample
- `input`：曲名、艺人、专辑、链接、source_type
- `output`：策展说明（为什么入选、封面来源、链接策略）

### B. Markdown 记忆/文章
- 先按 `##` 章节切
- 单段超过 1200 字符再按段落二次切
- 每个切片保留原文件 frontmatter + `chunk_id`

### C. Reflection
- 不切片（保持完整轨迹）

## 3) 图片数据处理

- 不切片
- 每张图一个 caption 文件（或 manifest 行）
- 输出到 `training_data/images/images.jsonl`

## 4) 训练集输出

- `text_all.jsonl`：总集
- `memories.jsonl` / `articles.jsonl` / `reflections.jsonl`：分集
- `music.jsonl`：DJ set + 音乐偏好样本
- `skills.jsonl`：兼容旧配置（默认 reflections，否则 all）

## 5) 质量门槛（建议）

- 少于 30 条文本样本：只做记忆，不训练
- 30-100 条：可小规模 LoRA trial
- 100+ 条：再考虑加大 epoch 与混合数据源

## 6) 同步命令

```bash
cd aileena_second_brain
./train_prepare.sh
```
