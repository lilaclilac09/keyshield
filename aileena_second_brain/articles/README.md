# Articles Directory

把你的文章放在这里（Markdown + YAML frontmatter）。

## Frontmatter 模板

```yaml
---
date: 2026-07-07
type: article
title: 文章标题
tags: [tag1, tag2]
confidence: high
decay_speed: slow
source: manual
---
```

## 训练时会生成

- `training_data/articles.jsonl`
- 并合并进 `training_data/text_all.jsonl`

## 生成命令

```bash
python3 prepare_training_data.py
```
