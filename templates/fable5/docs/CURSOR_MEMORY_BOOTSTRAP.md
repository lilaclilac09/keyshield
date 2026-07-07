# Cursor Memory Bootstrap (Fable 5 Hybrid)

Use this file once to create **account-level Cursor Memories**.  
After that, you do not need to remember the workflow manually.

## How to add memories in Cursor

1. Open **Cursor Settings → Rules & Memories → Memories**
2. Click **Add Memory** (or tell the agent: `Remember the following:`)
3. Paste each entry below as a separate memory
4. Keep memories short (one fact per memory works best)

## Recommended memories (copy one by one)

### Memory 1 — Default workflow
```text
My default dev workflow is Fable 5 Hybrid: Cursor plans first (Implementation Plan), Opus executes heavy coding, then Cursor reintegrates and validates. Never skip Plan or validation.
```

### Memory 2 — Kickoff prompt
```text
When I start a coding task, first output an Implementation Plan using docs/IMPLEMENTATION_PLAN_TEMPLATE.md and follow .cursorrules + claude.md.
```

### Memory 3 — New repo bootstrap
```text
For new repositories, run scripts/init-fable5-workflow.sh to install .cursorrules, claude.md, docs/IMPLEMENTATION_PLAN_TEMPLATE.md, and aileena_second_brain/.
```

### Memory 4 — Hard constraints
```text
Hard rules: no placeholders, full type annotations + comments, validate each module before next step, Snowflake must use Dynamic Tables + Cortex Search.
```

### Memory 5 — Opus handoff
```text
Mark each plan step with owner (Cursor / Opus / Hybrid). Send Opus-heavy steps to Opus with the full plan, then return results to Cursor for verification and merge.
```

### Memory 6 — Second brain (optional)
```text
Use aileena_second_brain/ external memory: write reflections to reflection_logs/, run consolidate.py for dreaming, and follow SYSTEM_PROMPT.md pre/post hooks.
```

## One-shot command (optional)

If your Cursor agent supports memory creation in chat, send:

```text
Remember my workflow:
1) Fable 5 Hybrid (Cursor plan -> Opus heavy execution -> Cursor reintegration)
2) Always use .cursorrules + claude.md + docs/IMPLEMENTATION_PLAN_TEMPLATE.md
3) New repos use scripts/init-fable5-workflow.sh (includes aileena_second_brain/)
4) No placeholders; full typing/comments; module validation required
5) Snowflake: Dynamic Tables + Cortex Search
6) External memory: aileena_second_brain/SYSTEM_PROMPT.md + consolidate.py
```

## 3-layer memory model (recommended)

| Layer | What | Scope | You forget? |
|---|---|---|---|
| Account Memory | Cursor Memories | All projects | Agent recalls preferences |
| Repo Rules | `.cursorrules`, `claude.md`, plan template | One repo | Auto-loaded in that repo |
| External Brain | `aileena_second_brain/memories/**` | One repo | File-based recall + Git history |
| Human fallback | `new-project-checklist.md` + `/fable5` snippet | Anytime | 10-second checklist |

Use all four for maximum reliability.
