# Aileena Second Brain (ReMeLight + Centaur)

External-memory system for Aileena: file-based recall, skill distillation, and multi-agent sharing.

## Structure

```text
aileena_second_brain/
├── SYSTEM_PROMPT.md
├── articles/                     # 你的文章（训练源）
├── memories/                       # 记忆库（训练源）
├── reflection_logs/                # 任务反思（训练源）
├── training_data/
│   ├── text_all.jsonl
│   ├── memories.jsonl
│   ├── articles.jsonl
│   └── images/
│       ├── raw/                  # 训练图片
│       └── captions/               # 图片标注
├── prepare_training_data.py        # 文本训练集（文章+记忆）
├── prepare_image_training_data.py  # 图片训练集
├── train_prepare.sh                # 一键生成全部训练数据
├── lora_config.yaml                # 文本 LoRA
└── image_lora_config.yaml          # 图片 LoRA
```

## Quick Start

### 1) 放入你的内容

- 文章 -> `articles/*.md`
- 记忆 -> `memories/**`
- 反思 -> `reflection_logs/*.md`
- 图片 -> `training_data/images/raw/*`
- 图片标注 -> `training_data/images/captions/*.md`

### 2) 一键生成训练数据

```bash
cd aileena_second_brain
pip3 install -r requirements.txt
./train_prepare.sh
```

会生成：
- `training_data/text_all.jsonl`（文章 + 记忆 + 反思）
- `training_data/images/images.jsonl`（图片 + caption）

### 3) 文本 LoRA 训练

```bash
accelerate launch -m axolotl.cli.train lora_config.yaml
```

### 4) 图片 LoRA 训练

```bash
./export_kohya_images.sh   # 可选：导出 Kohya 目录
accelerate launch -m axolotl.cli.train image_lora_config.yaml
```

## Data Sources

| Source | Path | Output |
|---|---|---|
| 文章 | `articles/` | `training_data/articles.jsonl` |
| 记忆库 | `memories/**` | `training_data/memories.jsonl` |
| 反思日志 | `reflection_logs/` | `training_data/reflections.jsonl` |
| 合并文本集 | all above | `training_data/text_all.jsonl` |
| 图片 | `training_data/images/raw/` | `training_data/images/images.jsonl` |

## Agent inference

```bash
# local memory inference (no API)
./scripts/aileena-agent.sh --local-only "her fav techno"

# memory + optional LLM inference when KS_TOKEN is set
export KS_TOKEN="ksv2_..."
./scripts/aileena-agent.sh "recommend a warm-up track for her taste"
```

Inference order:
1. retrieve memory chunks (section-level)
2. infer from bullets/artists/DJ set facts
3. optional LLM synthesis via KeyShield when `KS_TOKEN` is available


- Shared long-term memory: `memories/semantic/` + `memories/procedural/skills/`
- Per-agent private memory: `memories/episodic/` + `reflection_logs/`
- Include `agent_id` and `team_task_id` in frontmatter for shared writes
- Coordinator runs `consolidate.py` to resolve decay and promotion

## Integration with Fable 5

- Semantic memory: `memories/semantic/fable5-hybrid-workflow.md`
- Skill: `memories/procedural/skills/generate-fable5-plan.md`
- Repo bootstrap (Fable5 + Second Brain): `../scripts/init-fable5-workflow.sh`
