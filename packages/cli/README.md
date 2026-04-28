# @keyshield/cli

> Inject API keys into agent processes from either a v2-mvp server
> session or a popup-exported `.env` file. Same UX as `op run`.

## Two modes, picked automatically

```
                   ┌────────────────────────────────────┐
                   │  keyshield <cmd>                    │
                   └────────────┬───────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │ logged in? (session.json exists)  │
              └────┬─────────────────────┬────────┘
                   │ yes                 │ no
                   ▼                     ▼
        ┌────────────────────┐  ┌──────────────────────┐
        │ v2-mvp HTTP API    │  │ local .env (popup    │
        │ /manage/list,      │  │ exported, V1.1 path) │
        │ /manage/decrypt    │  │                      │
        └────────────────────┘  └──────────────────────┘
```

Force one with `--mode v2` or `--mode local`.

## Install

```bash
# From the workspace root:
npm install
npm link --workspace=@keyshield/cli
# Now `keyshield` is in your PATH.

# Or run directly without linking:
npx --workspace=@keyshield/cli keyshield <cmd>
```

## Local mode (popup `.env`)

For when you have the V1.1 popup running and just want to consume
the `.env` it exports.

```bash
# 1. In the popup, click "Export .env" → saves .env to your project.
# 2. In the terminal, in that project directory:

$ keyshield list
ANTHROPIC
OPENAI_PROD
STRIPE

$ keyshield get openai-prod
sk-...

$ keyshield run -- python my-agent.py
[keyshield] injecting 3 keys from local .env
... agent runs with $ANTHROPIC, $OPENAI_PROD, $STRIPE ...

$ keyshield doctor
[✓] env file: /home/me/proj/.env
[✓] parses cleanly: 3 keys
[!] .gitignore: missing in this directory
    create one and add `.env` so it never gets committed.
```

## Server mode (v2-mvp)

For when keys live on a v2-mvp FastAPI server (the same one the
`/frontend/` Next.js app talks to).

```bash
# 1. Log in once.
$ keyshield login --server http://localhost:8000 --user demo-user
Password: ••••••••
logged in as demo-user @ http://localhost:8000
session saved to ~/.config/keyshield/session.json

# 2. Same commands, now sourced from the server.
$ keyshield list
anthropic
openai

$ keyshield get openai
sk-real-server-decrypted

$ keyshield run -- node bot.js

# 3. CRUD-side commands work too.
$ openssl rand -hex 32 | keyshield store openai
stored openai (64 chars) on http://localhost:8000

$ keyshield delete stripe
Delete key "stripe" from http://localhost:8000? [y/N] y
deleted stripe from http://localhost:8000

# 4. Agent management.
$ keyshield agent list
ID   NAME                 PUBKEY        SCOPES   LAST USED
1    TradingBot           ABC123…wxyz   *        2026-04-28 12:30:00
2    Indexer              DEF456…uvwx   helius   never

$ keyshield agent revoke 2
Revoke agent #2? [y/N] y
revoked agent #2

# 5. Done.
$ keyshield logout
logged out from http://localhost:8000
```

## Command reference

```
keyshield login                         POST /auth/login → save token
keyshield logout                        POST /auth/logout + clear local session
keyshield status                        show current mode + paths
keyshield list [--json] [--mode m]      list key names
keyshield get <name> [--mode m]         print one value
keyshield run <cmd...> [--clean]        spawn cmd with env vars injected
keyshield store <upstream>              POST /manage/store; reads value from
                                        stdin or --env-var or --value
keyshield delete <upstream> [-f]        DELETE /manage/secret/<u>
keyshield agent list [--json]           GET /agents/list
keyshield agent register <pubkey-b58>   POST /agents/register
keyshield agent revoke <id> [-f]        DELETE /agents/<id>
keyshield doctor [--fix]                local-mode sanity checks
keyshield --version
```

## Env vars

| Variable | Effect |
|---|---|
| `KEYSHIELD_SERVER` | default `--server` for `login` |
| `KEYSHIELD_USER` | default `--user` for `login` |
| `KEYSHIELD_PASSWORD` | use this instead of TTY prompt |
| `KEYSHIELD_ENV_FILE` | default local-mode `.env` path |
| `XDG_CONFIG_HOME` | session-file location root |

## Security notes

- **Server mode** stores an opaque bearer token at
  `~/.config/keyshield/session.json` (mode 0600). Anyone with read
  access to that file can use the API as you, until the token
  expires. **Don't** commit it.
- **Local mode** reads plaintext keys from `.env`. Same caveat:
  `keyshield doctor` warns if it's not gitignored.
- Threat model **differs** between modes:
  - V1.1 popup → local `.env`: server never had the plaintext.
  - v2-mvp server: server **does** hold encrypted keys it can decrypt
    server-side (proxy use case). Acceptable for an agent vault that
    needs to make API calls on the user's behalf, but not equivalent
    to E2EE.

See `docs/get-started/cli.md` for a longer walkthrough.

## Testing

```bash
npm test --workspace=@keyshield/cli
npm run typecheck --workspace=@keyshield/cli
```

68 unit + integration tests covering parser, gitignore, session
store, V2Client, source switching, and CLI plumbing.
