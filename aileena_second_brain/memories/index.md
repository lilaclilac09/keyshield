# Aileena Second Brain — Memory Index

Last updated: 2026-07-07

## Quick Navigation

| Directory | Purpose | Example |
|-----------|---------|---------|
| [personal/](personal/) | Preferences, style, long-term rules | coding style, workflow prefs |
| [procedural/skills/](procedural/skills/) | Reusable skills (prompts + tools) | Fable5 plan generation |
| [episodic/](episodic/) | Task trajectories | per-task run logs |
| [semantic/](semantic/) | Facts, knowledge, rules | Snowflake DT + Cortex Search |
| [archived/](archived/) | Decayed / superseded memories | old experiments |

## Retrieval Order

1. `personal/` + `semantic/` for constraints and facts
2. `procedural/skills/` for repeatable workflows
3. `episodic/` for recent task context
4. `archived/` only when explicitly needed

## Coordinator

Run consolidation (Dreaming):

```bash
python consolidate.py
```
