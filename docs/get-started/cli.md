# KeyShield CLI

> Inject your API keys into agent processes from the terminal —
> like `op run`, but it speaks both the V1.1 popup's `.env` export
> and the v2-mvp FastAPI server.

## What you'll have at the end

- `keyshield` in your PATH.
- `keyshield run -- python my-agent.py` injects vault keys into the
  child process's env, no copy-pasting.
- `keyshield list` / `get` / `store` / `delete` / `agent ...` for
  day-to-day vault management.

---

## Prerequisites

- **Node.js 20+** — `node --version` should print 20 or higher.
- **A repo checkout with deps installed**:
  ```bash
  git clone https://github.com/lilaclilac09/keyshield.git
  cd keyshield
  npm install
  ```
- **One source of keys**, either:
  - The V1.1 popup running locally (V1.1 cross-device sync vault), OR
  - A v2-mvp server you have credentials for.

---

## Step 1 — Make `keyshield` available

From the repo root:

```bash
npm link --workspace=@keyshield/cli
```

This symlinks the `keyshield` binary into your global `npm` bin
directory.

**Verify:**

```bash
keyshield --version
# 0.2.0
```

If `keyshield: command not found`, your global npm bin isn't in
`$PATH`. Either:

- Run it through npx instead: `npx --workspace=@keyshield/cli keyshield <cmd>`
- Or add npm's bin to PATH: `export PATH="$(npm prefix -g)/bin:$PATH"`

---

## Step 2 — Pick your source

The CLI works with two backends and picks the right one
automatically. **Choose one** for this walkthrough:

### Option A: Local `.env` from the popup (V1.1 path)

1. Start the popup:
   ```bash
   npm run dev:popup
   ```
2. Open `http://localhost:5173`, create a vault, add a few keys.
3. Click **Export .env** in the popup header.
4. Save the downloaded `.env` into your agent's project directory.

**Verify:**

```bash
cd your-agent-project/
ls -la .env
keyshield doctor
# [✓] env file: /home/you/your-agent-project/.env
# [✓] parses cleanly: 3 keys
# [!] .gitignore: missing in this directory   ← run `keyshield doctor --fix`
```

### Option B: v2-mvp server (matches what your `frontend/` uses)

1. Start the v2-mvp backend:
   ```bash
   cd v2-mvp
   .venv/bin/uvicorn src.server:app --port 8000 --reload
   ```
2. Log the CLI in:
   ```bash
   keyshield login --server http://localhost:8000 --user your-user
   # Password: ••••••••
   # logged in as your-user @ http://localhost:8000
   # session saved to ~/.config/keyshield/session.json
   ```

**Verify:**

```bash
keyshield status
# mode:    v2-mvp server (logged in)
# server:  http://localhost:8000
# user:    your-user
# since:   0m ago
# session: ~/.config/keyshield/session.json
```

---

## Step 3 — List your keys

```bash
keyshield list
# OPENAI
# ANTHROPIC
# STRIPE
```

For machine consumption:

```bash
keyshield list --json
# ["ANTHROPIC","OPENAI","STRIPE"]
```

---

## Step 4 — Run your agent with keys injected

```bash
keyshield run -- python my-agent.py
# [keyshield] injecting 3 keys from <source>
# ... agent stdout ...
```

**What that does:**

- Resolves your source (server or `.env`).
- Pulls all keys (in server mode, fans out to 8 concurrent decrypts).
- For each key, ensures it's env-shaped (`openai-prod` → `OPENAI_PROD`).
- Spawns `python my-agent.py` with those vars in its environment.
- Forwards exit code + Ctrl-C to the child.

**Verify:** in your agent code, `os.getenv("OPENAI")` (or whatever)
returns the right value.

---

## Step 5 — One-off lookups

```bash
# Print a single value (great for shell substitution).
keyshield get openai
# sk-...

# Pipe to clipboard (macOS):
keyshield get openai | pbcopy

# Pipe into curl:
curl -H "Authorization: Bearer $(keyshield get openai)" https://api.openai.com/v1/models
```

The lookup is forgiving — `openai`, `OPENAI`, `openai-prod`, and
`OPENAI_PROD` all hit the same key if any matches.

---

## Step 6 — Server-side write operations (v2-mvp only)

Available when logged into a v2-mvp server:

```bash
# Store a key (value from stdin — never appears in shell history)
echo -n "sk-real" | keyshield store openai
# stored openai (7 chars) on http://localhost:8000

# Delete a key
keyshield delete stripe
# Delete key "stripe" from http://localhost:8000? [y/N] y
# deleted stripe from http://localhost:8000

# List registered AI agents (for /auth/agent-login)
keyshield agent list
# ID   NAME                 PUBKEY        SCOPES   LAST USED
# 1    TradingBot           ABC123…wxyz   *        2026-04-28 12:30:00

# Register a new agent
keyshield agent register <ed25519-pubkey-b58> --name TradingBot --scopes "*"

# Revoke an agent
keyshield agent revoke 1
```

---

## Common patterns

### Drop-in replacement for `dotenv`

```bash
# Before:
python -c "from dotenv import load_dotenv; load_dotenv(); import my_agent"

# After:
keyshield run -- python -c "import my_agent"
```

### CI / non-TTY runs

```bash
# In GitHub Actions (no TTY for password prompt):
- run: |
    KEYSHIELD_PASSWORD="${{ secrets.KS_PASSWORD }}" \
      keyshield login --server "$KS_URL" --user "$KS_USER"
    keyshield run -- pytest
```

### Switching modes ad-hoc

```bash
# You're logged into the server but want to use a one-off .env:
keyshield run --mode local -- python script.py

# You have a .env but want to test against the server:
keyshield list --mode v2
```

---

## Troubleshooting

- **`No env file found...`** — you're in local mode but no `.env`
  exists. Either export one from the popup, or `keyshield login`
  to switch to server mode.
- **`login failed: HTTP 401`** — wrong password, or the user
  doesn't exist on the server. v2-mvp creates users on first
  login; check `v2-mvp/data/users.db` if you're unsure.
- **`key "X" not found`** — exact-match failed and case-insensitive
  fallback didn't help. Run `keyshield list` to see what's actually
  there.
- **`refusing to delete X non-interactively without --force`** — by
  default `delete` requires confirmation; pipe through with
  `--force` for scripts.

## What's next

- `docs/get-started/local-development.md` — run the V1.1 popup
  locally (Cloudflare-Worker-backed sync) for cross-device vaults.
- `docs/get-started/self-host.md` — operate the V1.1 sync stack
  on your own Cloudflare account.
- The v2-mvp server's own README (in `v2-mvp/`) for the proxy +
  Helius skill side.
