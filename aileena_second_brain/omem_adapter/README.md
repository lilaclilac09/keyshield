# O-Mem Adapter (L4)

Optional layer on top of ReMeLight markdown memory. **Markdown stays source of truth.**

## Modes

| Mode | Deps | When |
|------|------|------|
| **Lightweight** (default) | `KS_TOKEN` + KeyShield | LLM extracts persona from chat → syncs to `memories/personal/persona-auto.md` |
| **Full bridge** | + `requirements-optional.txt` + vendored `memory_chain/` | O-Mem embeddings + hierarchical retrieval |

## Quick start (lightweight)

```bash
export KS_TOKEN="ksv2_..."

# Ingest one conversation turn
./scripts/aileena-omem.sh ingest "她也喜欢 Surgeon" --answer "Noted — harder techno."

# Manual fact
./scripts/aileena-omem.sh add-fact "She tracks BBC Front Row Hockney specials"

# Bootstrap snapshot from existing markdown
./scripts/aileena-omem.sh bootstrap

# Status
./scripts/aileena-omem.sh status
```

## Full O-Mem install (optional)

```bash
cd aileena_second_brain
pip install -r omem_adapter/requirements-optional.txt

# Vendor upstream (one-time)
git submodule add https://github.com/OPPO-PersonalAI/O-Mem.git vendor/O-Mem
export PYTHONPATH="${PYTHONPATH}:$(pwd)/vendor/O-Mem"
```

Then `ingest` automatically uses `OMemBridge` when `memory_chain` imports cleanly.

## Sync flow

```
chat turn → extract (LLM or O-Mem) → persona_sync → memories/personal/persona-auto.md
                                                      → memory_store.invalidate()
```

Agent `evolve.py` also calls `sync_learned_fact()` when it detects `记住：` / `she also likes` patterns.

## Multi-agent (Centaur)

- Set `AILEENA_USER_NAME=Aileen` and per-agent `AILEENA_AGENT_NAME=trading-bot`
- Each agent can run lightweight ingest; shared persona file uses `agent_id` in frontmatter
