# Aileena Second Brain (ReMeLight + Centaur)

External-memory system for Aileena: file-based recall, skill distillation, and multi-agent sharing.

## Structure

```text
aileena_second_brain/
├── SYSTEM_PROMPT.md          # Full system prompt (copy into agent)
├── memories/
│   ├── index.md
│   ├── personal/
│   ├── procedural/skills/
│   ├── episodic/
│   ├── semantic/
│   └── archived/
├── reflection_logs/
├── training_data/
├── consolidate.py            # Coordinator Dreaming
├── prepare_lora_data.py      # LoRA dataset builder
├── lora_config.yaml          # Axolotl QLoRA config
└── requirements.txt
```

## Quick Start

### 1) Use the system prompt

Copy `SYSTEM_PROMPT.md` into your agent system instructions.

### 2) Write memories after each task

- Preferences/rules -> `memories/personal/` or `memories/semantic/`
- Reusable workflows -> `memories/procedural/skills/`
- Task traces -> `memories/episodic/`
- Reflections -> `reflection_logs/`

Every memory file should include YAML frontmatter (`date`, `type`, `tags`, `confidence`, `decay_speed`, `source`).

### 3) Run Coordinator Dreaming

```bash
cd aileena_second_brain
pip install -r requirements.txt
python consolidate.py
```

This promotes high-confidence episodic facts to `semantic/` and archives decayed memories.

### 4) Distill skills with LoRA (optional)

```bash
python prepare_lora_data.py
accelerate launch -m axolotl.cli.train lora_config.yaml
```

## Centaur Multi-Agent Rules

- Shared long-term memory: `memories/semantic/` + `memories/procedural/skills/`
- Per-agent private memory: `memories/episodic/` + `reflection_logs/`
- Include `agent_id` and `team_task_id` in frontmatter for shared writes
- Coordinator runs `consolidate.py` to resolve decay and promotion

## Integration with Fable 5

- Semantic memory: `memories/semantic/fable5-hybrid-workflow.md`
- Skill: `memories/procedural/skills/generate-fable5-plan.md`
- Repo bootstrap: `../scripts/init-fable5-workflow.sh`
