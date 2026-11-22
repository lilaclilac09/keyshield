# Acceptance standard

Every agent (Devin, Claude, Cursor, Codex, any child session) accepts work in this repo **only** against the items below. Each item is quoted from Aileen's own rule files; nothing here is an agent's own judgment. To change a standard, change it in her source file first, then here.

Sources:

- [aileen_machina_01/AGENTS.md](https://github.com/lilaclilac09/aileen_machina_01/blob/main/AGENTS.md) (constitution, 施工队安全条例, blocker table)
- [aileen_machina_01/CURSOR_RULES.md](https://github.com/lilaclilac09/aileen_machina_01/blob/main/CURSOR_RULES.md) and [.cursor/rules/](https://github.com/lilaclilac09/aileen_machina_01/tree/main/.cursor/rules): `verification.mdc`, `senior-engineer-loop.mdc`, `debug-repro-loop.mdc`, `ui-step-screenshot.mdc`
- [aileen_machina_01/QA.md](https://github.com/lilaclilac09/aileen_machina_01/blob/main/QA.md) and [.github/pull_request_template.md](https://github.com/lilaclilac09/aileen_machina_01/blob/main/.github/pull_request_template.md)
- [polar-lab/.cursor/rules/ship-visible-mvp.mdc](https://github.com/lilaclilac09/polar-lab/blob/main/.cursor/rules/ship-visible-mvp.mdc)

Machine check: `python scripts/check_acceptance.py` runs on every PR (`.github/workflows/acceptance.yml`) and fails when the PR body misses the evidence closer or a closer field uses a forbidden claim ("should work", "should be fixed", "looks good", "应该好了", "差不多好了").

## 1. Workflow — `AGENTS.md`, `senior-engineer-loop.mdc`

- [ ] `inspect → plan → patch → verify`. "Do not jump to patch."
- [ ] "inspect existing implementation first"; "identify root cause"; "propose smallest safe diff".
- [ ] "Do not redesign, refactor, or create parallel systems unless explicitly asked." "do not delete working flows."
- [ ] "Multi-system or visual-direction changes: inspect → plan, **wait for confirmation**, then patch."
- [ ] "Minimal necessary diff only; no unrelated refactors." "No new dependencies unless necessity is stated."

## 2. Verification — `verification.mdc`, `AGENTS.md`

- [ ] "never mark a task complete based only on code inspection."
- [ ] "Reading the diff is not verification."
- [ ] "If a check did not run, say so. Do not claim verified if you did not observe it."
- [ ] "test the specific user flow that changed".
- [ ] "Never … skip QA because a previous session 'already looked fine'".
- [ ] "Point to artifacts: screenshots, `verify-report.json`, CI output, command output."

## 3. Bugs — `debug-repro-loop.mdc`

- [ ] "**No repro + no root cause → do not start coding a fix.**"
- [ ] Order: "Repro → Hypotheses (1–3) → Evidence → Root cause → Fix (minimal) → Why safe".
- [ ] "No 'should be fixed' without evidence"; "No shotgun diffs while guessing".

## 4. UI — `ui-step-screenshot.mdc`, design OS

- [ ] "no screenshots = not done."
- [ ] "截图和交互都要给用户看。口头 'done' 不算。" Screenshot at 390×844 **and** interaction proof (walkthrough or 录屏).
- [ ] "UI merge/验收 reply with only text, or only stills and no interaction proof = incomplete."

## 5. Ship / done — `AGENTS.md` 施工队安全条例, `ship-visible-mvp.mdc`

- [ ] "**if you cannot prove it on production, do not claim it is fixed.** 不能在线上证明 就不准说修好了"
- [ ] "不准把 **draft PR** 当任务终点"; "不准只跑 **localhost** 就结束 ship/merge 任务".
- [ ] After merge: PR state `MERGED`, merge SHA exists, `git merge-base --is-ancestor <merge_sha> origin/main` is true. "GitHub 显示 merged 但 commit 不在 `origin/main` → **not done**".
- [ ] "不准在已有实现存在时 **重写同功能**" — existing implementation → only rebase / resolve / merge.
- [ ] "Demo ≠ product"; end with product status "`LIVE` / `BLOCKED` / `LOCAL ONLY` + next human action in one line."

## 6. Repo-specific rules

This repo's own `AGENTS.md`, `CLAUDE.md`, `.cursor` rules, and README instructions also apply.

## 7. Blockers — `AGENTS.md` blocker table

- [ ] "when stuck — stop, do not invent a bypass." Report every blocker with:

| field | meaning |
|-------|---------|
| `blocked_on` | what is missing (secret / permission / red check / SHA mismatch) |
| `evidence` | command or API output, not "should" |
| `impact` | `blocked` (stop) or `degraded` (continue only with the limitation written down) |
| `human_action` | the one step only a human can do |
| `not_doing` | the bypass you refuse (no second implementation, no localhost-as-prod, no force-merge) |

## 8. Evidence closer — required at the end of every task and PR

Required format (owner decision): use one closed `txt` fenced block, as shown below. The opening line is exactly three backticks followed by `txt` (up to three leading spaces and trailing whitespace are allowed); the closing line is exactly three backticks (with the same whitespace allowance). Everything outside these blocks is ignored by the machine check.

The last such block containing a line starting with `root cause:` is checked. All eight labels must appear exactly once, at line start, in the order shown, and each must have a nonempty value. A value includes its same-line text and continuation lines until the next label. Unchecked `- [ ]` lines are ignored; checked `- [x]` / `- [X]` and leading `- ` markers are removed from values. The `safe to merge` value must be exactly `yes`, `no`, or `yes after manual env/config step` (case-insensitive, trimmed). Forbidden claims still fail inside values, including quoted text and literal HTML comments.

```txt
root cause:
files changed:
checks run:
manual QA:
verification:
remaining risks:
manual steps:
safe to merge:
```

The following excerpts are verbatim from Aileen's source files.

Source: `aileen_machina_01/AGENTS.md`, "Evidence" section:

````md
## Evidence (required closer — no mood, no “should work”)

Every task ends with:

```txt
root cause:
files changed:
checks run:
manual QA:
verification:
remaining risks:
manual steps:
safe to merge:
```
````

Source: `aileen_machina_01/.cursor/rules/senior-engineer-loop.mdc`, "Evidence closer" section:

````md
## Evidence closer (non-negotiable)

Every task ends with this block — not a summary of intent, not “should work”:

```txt
root cause:
files changed:
checks run:
manual QA:
verification:
remaining risks:
manual steps:
safe to merge:
```
````

Source: `aileen_machina_01/.cursor/rules/verification.mdc`, "Every final reply" section:

````md
## Every final reply

```txt
root cause:
files changed:
checks run:
manual QA:
verification:
remaining risks:
manual steps:
safe to merge:
```
````

Merge: "no owner approval = no merge." Aileen has approved Devin merging its own PRs on her repos; every other agent needs her approval.
