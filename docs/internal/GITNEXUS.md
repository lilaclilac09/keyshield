# GitNexus on KeyShield — attach, fallback, do not stall

中文：Cursor Cloud Agent **不会**自动挂上桌面的 GitNexus MCP。缺的不是“这次只改文档所以可以跳过”，而是 **MCP 注入路径和 CLI 索引路径要分开处理**。本文件是可执行步骤；不要再只写一句 disclaimer。

English: Cursor Cloud Agents **do not** inherit the desktop GitNexus stdio MCP. The fix is to attach MCP on desktop (and optionally HTTP MCP for Cloud), and to use the **CLI** on Cloud Agents. Do not stop a task because `gitnexus_impact` is missing from the MCP catalog.

Canonical follow-up register: [RECURRING_ISSUES.md](RECURRING_ISSUES.md) (issue **R1**).

---

## 1. Why this Cloud Agent has no GitNexus MCP

Checked on run `bc-2211e706-baa8-48cc-99f1-bb3eabe22a7a` (2026-10-02):

| Layer | What exists | What does not |
|---|---|---|
| Cloud Agent MCP catalog | Circle, Phantom, X, cursor-cloud, cursor-subscriptions; Github `error`; Slack/Stripe/Vercel `needsAuth` | **No `gitnexus` namespace** (`GetDynamicTools` pattern `gitnexus` → 0 matches) |
| Desktop Cursor MCP | Written by `npx gitnexus setup` to **`~/.cursor/mcp.json`** (stdio: `npx -y gitnexus@latest mcp`) | That file is **on the operator's laptop**, not injected into the Cloud VM |
| This VM `~/.cursor/` | `agent-hooks`, `skills-cursor`, `plugins` | **No `mcp.json`** |
| Repo `.gitnexus/` | `.gitignore` lists `.gitnexus/`, but **`meta.json` was still tracked** (commit `04e0d7d60`, WSL path) | Graph DB is **not** meant to be in git. Tracked leftover `meta.json` is **foreign storage** and blocks `analyze`. This PR untracks it. |
| `.claude/skills/gitnexus/*` | Referenced by the old `AGENTS.md` GitNexus block | **Never committed.** `gitnexus setup` installs skills under `~/.cursor/skills/` and `~/.claude/skills/` on the machine that ran setup |

GitNexus is a **local stdio** MCP server. Cursor Cloud Agents receive MCP from the **Cursor dashboard / control plane** (hosted servers such as Slack, GitHub, Phantom). They do **not** spawn `~/.cursor/mcp.json` stdio servers from the operator's desktop, and they do **not** read `AGENTS.md` “MUST use `gitnexus_impact`” as a reason to magically attach a server.

The stale index leftover in this snapshot (before `gitnexus clean`):

```json
{
  "repoPath": "/mnt/c/Users/justi/Desktop/keyshield",
  "lastCommit": "955000413e1aa3a6722e8b18d29d431a152a90c6",
  "indexedAt": "2026-05-07T09:08:12.234Z"
}
```

That commit is PR #6 on `main` (2026-05). The path is WSL. `gitnexus analyze` then fails with:

`Storage path is in state "foreign" but requires one of: missing, empty, owned.`

**Fix that actually worked on this VM (2026-10-02):** `gitnexus clean -f` printed `No indexed repository found` and left the leftover `meta.json`. Analyze still failed with `foreign`. The working sequence is:

```bash
rm -rf .gitnexus    # required; clean does not delete an unregistered leftover
GITNEXUS_LBUG_EXTENSION_INSTALL=auto npx -y gitnexus@latest analyze --index-only --skip-fts --name keyshield
```

Result here: `8,907 nodes | 19,266 edges | 347 clusters | 585 flows` at `/workspace`. Wrapper: `./scripts/gitnexus-cloud.sh analyze`.

---

## 2. Attach GitNexus MCP (desktop Cursor) — this is the real MCP fix

Public replica (same steps, shorter): [README.md § GitNexus](../../README.md#gitnexus-cursor).

**Once per machine.** Node `^22.18.0 || >=24.11.0` (`node -v`). `v22.14.0` can hang extracting the native Ladybug addon (`EBADENGINE`). Pin verified here: **`gitnexus@1.6.12`**.

### 2.1 MCP config

`npx gitnexus setup` after `Ok to proceed? (y)` shows a spinner. That is **npm installing the tarball**, not another `y`. Wait ~2 minutes. If still stuck: `Ctrl+C`.

```bash
npx -y gitnexus@1.6.12 setup --coding-agent cursor
```

Writes `~/.cursor/mcp.json` and skills under `~/.cursor/skills/`.

**Skip setup** — edit `~/.cursor/mcp.json` (create `~/.cursor` first). Empty file:

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@1.6.12", "mcp"]
    }
  }
}
```

Already has other servers: add the `"gitnexus"` key inside `mcpServers` (JSON comma rules). Do not delete existing servers.

Windows: `"command": "cmd"`, `"args": ["/c", "npx", "-y", "gitnexus@1.6.12", "mcp"]`. File: `%USERPROFILE%\.cursor\mcp.json`.

Quit Cursor fully (`Cmd+Q` / Alt+F4) and reopen. **Settings → MCP** → `gitnexus` connected.

### 2.2 Index this repo

```bash
cd /path/to/keyshield
rm -rf .gitnexus               # required if analyze says storage is "foreign"
npx -y gitnexus@1.6.12 analyze --index-only --skip-fts --name keyshield
```

`.gitnexus/` is gitignored. Never commit `meta.json`.

### 2.3 Validate (anyone)

```bash
npx -y gitnexus@1.6.12 --version     # 1.6.12
npx -y gitnexus@1.6.12 status        # this checkout indexed
npx -y gitnexus@1.6.12 list          # includes keyshield
./scripts/gitnexus-cloud.sh doctor
./scripts/gitnexus-cloud.sh impact --direction upstream get_stats
```

Desktop MCP file:

```bash
python3 -c "import json,pathlib; p=pathlib.Path.home()/'.cursor'/'mcp.json'; g=json.loads(p.read_text())['mcpServers']['gitnexus']; assert 'mcp' in g.get('args',[]) or g.get('args')==['mcp']; print(g)"
```

In Cursor, ask the agent to `list_repos`.

Official docs: [Cursor setup](https://abhigyanpatwari-gitnexus.mintlify.app/mcp/cursor).

### Cloud Agents still will not see that stdio server

Enabling GitNexus on the desktop does **not** add it to a Cloud Agent catalog. For Cloud:

1. **Required, works today:** CLI fallback (§3). Put `analyze` in the Cloud environment **install** script so new agents boot with a local index.
2. **Optional, if you want MCP tools in Cloud later:** run `npx gitnexus mcp --http --port 7745 --auth-token <secret>` in the environment `start` script, then add that HTTP MCP URL in [Cursor Cloud MCP / dashboard](https://cursor.com/dashboard) if custom HTTP MCP is enabled for the account. Do not bind `--host 0.0.0.0` without `--auth-token`.

This environment is **personal / SETUP_FLOW**, `environmentJsonPath: null` (db-backed, owner-restricted). Paste the install snippet in:

https://cursor.com/dashboard/cloud-agents/environments/e/b2a562b5-bd9a-11f1-977f-f6b8f2fcf9b2

Suggested `install` addition (idempotent enough for a snapshot):

```bash
npx -y gitnexus@latest clean -f || true
GITNEXUS_LBUG_EXTENSION_INSTALL=auto npx -y gitnexus@latest analyze --index-only --skip-fts --name keyshield
```

`--index-only` keeps `analyze` from rewriting the `<!-- gitnexus:start -->` block in `AGENTS.md`.

---

## 3. Cloud Agent procedure (do this instead of a disclaimer)

Wrapper: [`scripts/gitnexus-cloud.sh`](../../scripts/gitnexus-cloud.sh).

### 3.1 Probe MCP once

```
GetDynamicTools pattern: gitnexus
```

- Match → use MCP tools (`impact`, `detect_changes`, `query`, `context`, `rename`).
- **No match → do not stop.** Use the CLI. Mention the fallback in the PR/commit notes, not as the only outcome.

### 3.2 Ensure a local index

```bash
./scripts/gitnexus-cloud.sh analyze
# equivalent:
npx gitnexus clean -f   # if analyze says storage is "foreign"
GITNEXUS_LBUG_EXTENSION_INSTALL=auto npx -y gitnexus@latest analyze --index-only --skip-fts --name keyshield
```

`.gitnexus/` is in `.gitignore`, but **`.gitnexus/meta.json` was still tracked** (WSL index from `04e0d7d60`). Tracked files ignore `.gitignore`, so Cloud snapshots kept shipping a foreign leftover. This PR runs `git rm --cached .gitnexus/meta.json`. Do not add it back. Every VM must build its own index. Copying `meta.json` from another host is worse than having no index.

### 3.3 Symbol edits — impact

```bash
./scripts/gitnexus-cloud.sh impact --direction upstream '<SymbolName>'
# equivalent:
npx gitnexus impact --direction upstream '<SymbolName>'
```

If the CLI is HIGH/CRITICAL, warn in the PR body before continuing.

### 3.4 Before commit — detect-changes

```bash
./scripts/gitnexus-cloud.sh detect-changes --scope all
# vs main:
./scripts/gitnexus-cloud.sh detect-changes --scope compare --base-ref origin/main
```

### 3.5 If CLI also fails (native addon, Node too old, analyze crash)

Fall back to `rg` / call-graph by hand. **Write the failure into** [RECURRING_ISSUES.md](RECURRING_ISSUES.md) (command, exit code, Node version). Do not invent a GitNexus report. Docs-only edits may skip impact; they still must not skip this register when the tooling is broken.

---

## 4. MCP tool → CLI map

| AGENTS.md / MCP name | CLI (this VM) |
|---|---|
| `gitnexus_impact` / `impact` | `npx gitnexus impact --direction upstream <symbol>` |
| `gitnexus_detect_changes` / `detect_changes` | `npx gitnexus detect-changes --scope all` |
| `gitnexus_query` / `query` | `npx gitnexus query "<concept>"` |
| `gitnexus_context` / `context` | `npx gitnexus context <symbol>` |
| `gitnexus_rename` / `rename` | no CLI twin that is safe as a default; use MCP on desktop or a graph-aware edit |
| `list_repos` | `npx gitnexus list` |
| index freshness | `npx gitnexus status` |
| `gitnexus://repo/keyshield/context` | `npx gitnexus status` + `npx gitnexus list` |

Skills listed in older `AGENTS.md` (`.claude/skills/gitnexus/*.md`) are **not in this repo**. Official skill text: [GitNexus skills](https://abhigyanpatwari-gitnexus.mintlify.app/skills/overview). Do not block on those paths.

---

## 5. What agents must stop doing

Wrong:

> GitNexus MCP was not connected. Docs-only change; no symbol edits.

Right:

1. Probe MCP.
2. If absent, run `./scripts/gitnexus-cloud.sh analyze` (clean if foreign).
3. For symbol edits: CLI `impact` / `detect-changes`.
4. Point at this file + R1 in [RECURRING_ISSUES.md](RECURRING_ISSUES.md).
5. Only if CLI failed, say **why** (paste `gitnexus doctor` + the error) and use `rg`.

`gitnexus analyze` without `--index-only` rewrites `<!-- gitnexus:start -->…<!-- gitnexus:end -->` in `AGENTS.md`. Cloud Agents must pass `--index-only` (the wrapper does). Desktop operators who want the injected block may omit it.
