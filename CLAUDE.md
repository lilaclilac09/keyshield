<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **keyshield** (7528 symbols, 14751 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/keyshield/context` | Codebase overview, check index freshness |
| `gitnexus://repo/keyshield/clusters` | All functional areas |
| `gitnexus://repo/keyshield/processes` | All execution flows |
| `gitnexus://repo/keyshield/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Tests area (378 symbols) | `.claude/skills/generated/tests/SKILL.md` |
| Work in the Sections area (108 symbols) | `.claude/skills/generated/sections/SKILL.md` |
| Work in the Scripts area (108 symbols) | `.claude/skills/generated/scripts/SKILL.md` |
| Work in the Backend area (108 symbols) | `.claude/skills/generated/backend/SKILL.md` |
| Work in the Routes area (97 symbols) | `.claude/skills/generated/routes/SKILL.md` |
| Work in the Auth area (94 symbols) | `.claude/skills/generated/auth/SKILL.md` |
| Work in the Mpp area (86 symbols) | `.claude/skills/generated/mpp/SKILL.md` |
| Work in the Components area (83 symbols) | `.claude/skills/generated/components/SKILL.md` |
| Work in the Api area (77 symbols) | `.claude/skills/generated/api/SKILL.md` |
| Work in the Keyshield area (76 symbols) | `.claude/skills/generated/keyshield/SKILL.md` |
| Work in the Instructions area (65 symbols) | `.claude/skills/generated/instructions/SKILL.md` |
| Work in the Extension area (58 symbols) | `.claude/skills/generated/extension/SKILL.md` |
| Work in the Commands area (43 symbols) | `.claude/skills/generated/commands/SKILL.md` |
| Work in the Proxy area (39 symbols) | `.claude/skills/generated/proxy/SKILL.md` |
| Work in the Billing area (38 symbols) | `.claude/skills/generated/billing/SKILL.md` |
| Work in the Skills area (33 symbols) | `.claude/skills/generated/skills/SKILL.md` |
| Work in the Hooks area (31 symbols) | `.claude/skills/generated/hooks/SKILL.md` |
| Work in the Agents area (22 symbols) | `.claude/skills/generated/agents/SKILL.md` |
| Work in the Integration area (18 symbols) | `.claude/skills/generated/integration/SKILL.md` |
| Work in the Oracle_diff area (18 symbols) | `.claude/skills/generated/oracle-diff/SKILL.md` |

<!-- gitnexus:end -->
