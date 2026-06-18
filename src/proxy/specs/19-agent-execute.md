# 19 — Agent execution: run a Claude Code turn under a vaulted key

> **Status: spec v1 (shipped).** Written 2026-06-18.
> Companion to spec 13 (Agent Access — how an agent authenticates) and
> spec 17 (Agent permissions — owner/collaborator/viewer roles). Where
> spec 13 ends at "agent has a session token and calls `/proxy/*`", this
> spec covers a **new** capability: the agent runs a full multi-turn
> Claude Code coding session, paid by its owner's vaulted Anthropic key,
> with the key never crossing the wire.

---

## What user does

1. Owner stores an Anthropic key once (`POST /manage/store`, upstream
   `anthropic`) and registers a bot with an exec scope
   (`POST /agents/register`, `scopes` includes `agent:exec` or `*`).
2. The bot authenticates (spec 13 Pattern B/C) → session token.
3. The bot `POST /agent/execute { "prompt": "..." }`. KeyShield spawns
   `claude` on the host, feeds it the prompt, and streams its work back
   as a normalised event list.
4. To continue the conversation, the bot calls again with the
   `session_id` from the previous response — the same coding context
   resumes (`claude --resume`).

The observable outcome: an autonomous agent does real coding work
(reads files, edits, runs commands) without ever holding the Anthropic
key, and the owner can revoke it instantly via the existing CRL.

## Where it lives

| Layer | What runs here |
|---|---|
| Frontend (`src/web/`) | none (programmatic / SDK surface) |
| Rust (`src/proxy/`) | `crates/ks-proxy/src/agent.rs` — auth, scope gate, cwd lockdown, vault key lookup. `crates/ks-agent/` — the harness: spawn `claude`, NDJSON stdin, stream-json stdout, normalise to events |
| Python (`src/backend/`) | `auth/session.py` embeds agent scopes in the token `scp` claim; `routes/auth.py` agent-login passes the agent's registered scopes |
| On-chain (`src/programs/`) | none (reuses spec 13 Pattern C grant for auth only) |

## Wire shape

```http
POST /agent/execute
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "prompt":     "explain this repo and add a README",
  "cwd":        "project-a",          // optional; relative-to-root or absolute, MUST resolve inside KS_AGENT_WORKSPACE_ROOT
  "model":      "claude-opus-4-8",    // optional; omit for the harness default
  "session_id": "abc123..."           // optional; resume a prior turn (sends claude --resume)
}
```

```json
200 OK
{
  "session_id": "abc123...",          // claude-native id; pass back to resume
  "events": [
    { "type": "session_started",        "session_id": "abc123..." },
    { "type": "agent_message_started",  "item_id": "msg_1", "stop_reason": "end_turn" },
    { "type": "agent_text_delta",       "item_id": "msg_1", "delta": "I read 4 files…" },
    { "type": "tool_results",           "results": [ { "tool_use_id": "...", "content": "...", "is_error": false, "exit_code": 0 } ] },
    { "type": "result",                 "error": null }
  ]
}
```

### Error states

| Status | When |
|---|---|
| `401 unauthorized` | missing/invalid bearer token |
| `403` | token lacks `agent:exec` (or `*`) scope |
| `403` | `cwd` escapes `KS_AGENT_WORKSPACE_ROOT`, or caller passed `cwd` with no root configured |
| `400 cwd does not exist` | requested `cwd` not found on disk |
| `422` | no Anthropic key in the user's vault and no `ANTHROPIC_API_KEY` fallback |
| `500` | session-store / vault read / harness failure |

## Scope gating

The `scopes` column on `agent_keys` (spec 17) was previously stored but
never enforced. This endpoint enforces it:

1. `POST /auth/agent-login` mints the session token carrying the agent's
   scopes in a `scp` claim (`session.py::_make_token_payload`). Owner
   logins default to `scp="*"` — backward compatible, owners are
   unaffected.
2. `agent.rs::token_scopes()` parses `scp` from the token payload (the
   base64url JSON before the `.`). It does **not** re-verify the HMAC:
   the token string is the `sessions` table primary key, and the caller
   already resolved it against the DB, so the payload is exactly what the
   backend wrote. A malformed/absent claim yields no scopes → denied.
3. `/agent/execute` requires `*` or `agent:exec`. A `scopes="proxy"` bot
   is confined to the pass-through proxy and **cannot run code**.

No `sessions` schema migration was needed — the claim rides in the
existing token blob.

## cwd lockdown

`claude` runs with `--dangerously-skip-permissions` (non-interactive
agents can't answer permission prompts), so it can read files and run
shell commands. Left unbounded with a caller-supplied `cwd`, a delegated
key would get arbitrary host file-read + bash. So:

- `KS_AGENT_WORKSPACE_ROOT` (env) is the jail. A caller `cwd` is
  canonicalised (resolving `..` and symlinks) and must `starts_with` the
  canonical root, else `403`.
- Root set + no `cwd` → the root itself.
- Root **unset** + caller `cwd` → refused (can't validate containment).
- Root unset + no `cwd` → the proxy's own working directory (no
  caller-controlled path).

## The harness loop (`ks-agent`)

`claude` speaks a streaming JSON protocol; `ks-agent` is the adapter
between that raw I/O and a stable event model (the same pattern as
centaur's `harness-server`).

```
run_turn(api_key, state, content):
  1. spawn `claude --print --input-format stream-json
           --output-format stream-json --dangerously-skip-permissions
           [--model M] [--session-id ID | --resume ID]`
     with ANTHROPIC_API_KEY=<vaulted key> in env   ← key only in child env
  2. write the user turn as one NDJSON line to stdin, close it (EOF)
  3. read stdout line by line; ClaudeNormalizer maps each stream-json
     event → NormalizedEvent; stderr is drained to /dev/null
  4. stop on the terminal `result` event; return events + session_id
```

`NormalizedEvent` variants: `session_started`, `agent_message_started`,
`assistant_message`, `agent_text_delta`, `reasoning_text_delta`,
`tool_results`, `result`, `error`, `ignored`. The caller never sees
claude's raw wire format.

`KS_CLAUDE_BIN` overrides the `claude` binary path (for non-PATH installs
and for substituting a fake harness in tests).

## Why these choices

### Why reuse the session token (not a new auth path)

Spec 13 already mints an owner-bound token from an agent's ed25519
identity. `/agent/execute` reads `session.user_id` exactly like
`/proxy/*` does, so the vault key lookup, revocation CRL, and (future)
collaborator roles all apply for free. A second auth path would
duplicate that surface and drift.

### Why scopes in the token, not a DB column

The Rust proxy reads sessions from a SQLite DB the Python backend owns.
Adding a `scopes` column means a schema migration + fixture churn +
touching `ks-session`'s SELECT and spec 02. Embedding the claim in the
token blob avoids all of that and is safe because DB-existence already
authenticates the token string.

### Why the sqlite plaintext fast-path for the key

`/agent/execute` resolves the Anthropic key via
`ks_vault::sqlite::lookup_upstream_key` (the same Path-A plaintext
fast-path the Helius route uses), not the Argon2id+AES vault decrypt,
because the agent token's password is `"default"` (spec 13), not the
owner's vault passphrase. Encrypted-vault support for this endpoint
tracks the same open question as spec 13 Pattern C ("passphrase-less
decrypt").

## Permission model (spec 17)

`/agent/execute` is the most side-effecting action in the product (it
runs arbitrary code). Under the spec-17 role matrix it is
**Owner + Collaborator, never Viewer**. Roles aren't shipped yet
(single-owner today), so the live gate is the `agent:exec` scope; when
roles land, the route guard adds a `role >= collaborator` check
alongside the scope check.

## Configuration

| Env | Default | Purpose |
|---|---|---|
| `KS_AGENT_WORKSPACE_ROOT` | unset → caller `cwd` refused | jail root for the claude subprocess |
| `KS_CLAUDE_BIN` | `claude` (PATH) | claude binary path / test override |
| `ANTHROPIC_API_KEY` | unset | platform fallback when the user has no vaulted key |

## Test plan

| Test | Asserts |
|---|---|
| `ks-agent/tests/harness_e2e.rs` | full `run_turn` against a fake `claude`: session_id extraction, text normalization, terminal result; turn 1 sends `--session-id`, turn 2 sends `--resume` |
| `agent::tests::parses_scopes_from_token` | `scp` claim → scope list; malformed token → empty |
| `agent::tests::exec_scope_gate` | `*`/`agent:exec` allow; `proxy`/empty deny |
| `agent::tests::cwd_*` | inside-root allowed; `..`/absolute-outside → 403; missing → 400; no-root+cwd → 403 |
