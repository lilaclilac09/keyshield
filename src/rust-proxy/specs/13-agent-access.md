# 12 — Agent Access: How an autonomous agent calls the proxy

> **Status: spec v1.** Written 2026-05-06.
>
> This spec covers the agent's perspective end-to-end — from cold start
> to a live `/proxy/` call — across the three access patterns the
> product supports. It is the companion to spec 10 (EphemeralSigner /
> embedded wallet), which covers the on-chain payment side.

---

## What the agent does

An autonomous agent (trading bot, AI pipeline, indexer) needs to call
an upstream API (OpenAI, Helius, Anthropic, etc.) without holding the
raw key. It authenticates against KeyShield, gets a session token, and
routes all API calls through the Rust proxy.

---

## Access patterns

### Pattern A — CLI / local script (human, no server)

The simplest path. No HTTP, no token. The CLI reads the vault directly
and injects keys as environment variables into the child process.

```bash
# Store once
keyshield store openai "sk-proj-xxx"

# Every run — keys appear as OPENAI_API_KEY etc. in child env
keyshield run -- python bot.py
```

**What runs:** `packages/cli/src/commands/run.ts` → reads vault file
locally → `execSync` with env overlay. No proxy involved.

**Limitation:** requires vault file on disk + CLI installed. Not usable
from a remote containerised agent.

---

### Pattern B — HTTP agent self-auth (current, working)

The agent holds its own ed25519 keypair. Owner registers the pubkey
once. Agent self-auths on every session restart.

#### Step 1 — Owner registers the agent (one-time)

```http
POST /agents/register
Authorization: Bearer <owner_token>
{ "pubkeyB58": "<agent_ed25519_pubkey_base58>", "name": "trading-bot" }

→ 200 { "ok": true, "agentId": 3 }
```

Stored in `v2-mvp/agents/{owner_wallet}/agents.json`.

#### Step 2 — Agent fetches a session token (every restart)

```http
GET /auth/agent-challenge
→ { "challenge": "KeyShield Agent Login\nNonce: ...\nTimestamp: ...", "nonce": "..." }
```

Agent signs `challenge` bytes with its ed25519 private key:

```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import base64

sig = private_key.sign(challenge.encode())
sig_b64 = base64.b64encode(sig).decode()
```

```http
POST /auth/agent-login
{
  "ownerWallet":  "<owner_base58_pubkey>",
  "agentPubkey":  "<agent_base58_pubkey>",
  "signature":    "<base64_sig>",
  "challenge":    "<exact_challenge_string>",
  "passphrase":   "<owner_vault_passphrase>"    ← ⚠️ security gap (see below)
}

→ 200 { "token": "ksv2_...", "userId": "...", "agentName": "trading-bot" }
```

#### Step 3 — Agent calls the proxy

```http
POST /proxy/openai/v1/chat/completions
Authorization: Bearer ksv2_...
Content-Type: application/json
{ "model": "gpt-4o-mini", "messages": [...] }

→ Rust proxy: verify token → decrypt openai key from vault → inject
  Authorization: Bearer sk-proj-xxx → forward to api.openai.com
```

**Where it lives:**

| Layer | Code | What it does |
|---|---|---|
| Python | `server.py:585` `/auth/agent-challenge` | issues one-time challenge |
| Python | `server.py:599` `/auth/agent-login` | verifies sig + delegation → session |
| Rust | `ks-session` | validates bearer token on every request |
| Rust | `ks-vault` | decrypts raw API key (PBKDF2 + AES-256-GCM) |
| Rust | `ks-upstream` | injects key into upstream Authorization header |

**⚠️ Security gap:** `agent-login` requires `passphrase` in the
request body. The agent must hold the vault decryption password. If the
agent process is compromised, the attacker gets the passphrase and can
decrypt the vault directly. Pattern C below fixes this.

---

### Pattern C — On-chain grant, no passphrase (spec 10, not yet wired)

Owner grants the agent's ephemeral pubkey on-chain via
`GrantAgentAccess` (ix #20). The server reads the on-chain grant to
authorise the agent — no passphrase needed.

**This is the target state.** `session.ts:SessionManager` already
builds the instruction. What is not yet built:

```
Missing: server.py /auth/agent-login should accept an on-chain grant
         as authorisation instead of requiring passphrase.
```

#### What the flow looks like once built

```
① Owner broadcasts GrantAgentAccess tx (one-time, signed by owner wallet)
   encodeGrantAgentAccessData({ agentPubkey, durationSecs: 7200, keyGroup: 255 })
   → ix written to UniversalVault PDA on-chain

② Agent self-auths (no passphrase)
   GET  /auth/agent-challenge → { challenge }
   POST /auth/agent-login-v2  { ownerWallet, agentPubkey, signature, challenge }
                              (no passphrase field)
   Server: verify sig → read UniversalVault PDA via Helius getAccountInfo
         → confirm grant slot is active + not expired → create session
   → 200 { token }

③ Same as Pattern B step 3 — proxy call unchanged
```

#### Wire shape for the new endpoint

```
POST /auth/agent-login-v2
Body:
  ownerWallet  str   base58 Solana pubkey of vault owner
  agentPubkey  str   base58 ed25519 pubkey of agent
  signature    str   base64 ed25519 sig over challenge
  challenge    str   exact challenge string from /auth/agent-challenge

200: { token, userId, agentName, expiresAt }
401: invalid signature
403: agent pubkey not in on-chain grant
403: grant expired — owner must re-broadcast GrantAgentAccess
404: UniversalVault PDA not found for this owner
```

#### What the server.py change looks like

```python
@app.post("/auth/agent-login-v2")
async def agent_login_v2(body: AgentLoginV2Body):
    # 1. Verify ed25519 sig (same as existing agent-login)
    nonce = _validate_challenge(body.challenge)
    pub_bytes = _decode_b58_pubkey(body.agentPubkey)
    sig_bytes = _decode_b64_signature(body.signature)
    Ed25519PublicKey.from_public_bytes(pub_bytes).verify(
        sig_bytes, body.challenge.encode()
    )

    # 2. Read UniversalVault PDA on-chain (via Helius getAccountInfo)
    vault_pda = derive_universal_vault_pda(body.ownerWallet)
    vault_data = await helius.get_account_info(vault_pda)
    if not vault_data:
        raise HTTPException(404, "vault PDA not found")

    # 3. Parse grant slots — check agent pubkey is active + not expired
    grant = find_active_grant(vault_data, body.agentPubkey)
    if not grant:
        raise HTTPException(403, "agent pubkey not in on-chain grant")
    if grant.expires_at and time.time() > grant.expires_at:
        raise HTTPException(403, "grant expired")

    _consume_nonce(nonce)

    # 4. Create session WITHOUT passphrase
    #    The vault passphrase must be stored server-side, bound to the
    #    owner wallet — this is the remaining open question (see below).
    token = session.create_for_agent(body.ownerWallet, grant)
    return {"token": token, "userId": body.ownerWallet, "expiresAt": grant.expires_at}
```

**Open question:** `session.create` currently needs the vault passphrase
to decrypt keys at proxy time. For Pattern C to work without passphrase
in the agent request, the server must either:

- (a) Store the passphrase server-side encrypted under the owner's
  wallet signature (key wrapping) — see spec 01 + spec 10 Q5.
- (b) Use passkey PRF as the KDF source (already in `infra/sync-worker/`)
  — only works for human sessions.
- (c) Require the owner to provide a server-stored key-encryption-key
  when registering the vault (separate from the vault passphrase).

This is the last unresolved design question before Pattern C can ship.
Resolve before starting spec 10 Phase 10.3.

---

### Pattern D — Permissionless x402 (future, not built)

Agent pays per call with Solana USDC. No registration, no token.
Blocked on spec 10 Phases 10.1–10.5.

```
Agent → POST /proxy/openai/v1/... (no token)
      ← 402 { payment_required: { recipient, amount_usdc, memo } }
Agent → signs + broadcasts on-chain payment (EphemeralSigner)
Agent → POST /proxy/openai/v1/... X-Payment-Proof: <tx_sig>
      ← 200 (key injected, request forwarded)
```

See spec 10 for full design. Server-side verify at `server.py:1067` is
the TODO that unblocks this.

---

## Status summary

| Pattern | What agent needs | Status |
|---|---|---|
| A — CLI run | vault on disk + CLI installed | ✅ works today |
| B — HTTP self-auth | ed25519 keypair + owner passphrase | ✅ works today (⚠️ passphrase in request) |
| C — On-chain grant | ed25519 keypair, no passphrase | 📋 server.py change needed (see above) |
| D — x402 permissionless | USDC balance, no registration | 📋 blocked on spec 10 phases 10.1–10.5 |

## What `agent-sdk` actually works today

`packages/agent-sdk/src/index.ts:KeyShieldAgent.getApiKey()` calls
`bonsol.ts` + `lit.ts` — **both are empty placeholders.** Do not use.

Working SDK path: use `packages/agent-sdk/src/session.ts:SessionManager`
for on-chain grant instructions, then call the HTTP endpoints directly
(Pattern B or C above). The `SessionManager` builds
`GrantAgentAccess` (ix #20) and `RevokeAgentAccess` (ix #21)
instructions correctly today.

## E2E test plan

One test per pattern once the pattern ships:

| Test file | Pattern | What it asserts |
|---|---|---|
| `tests/e2e/agent-cli-run.spec.ts` | A | `keyshield run -- node -e "console.log(process.env.OPENAI_API_KEY)"` prints a non-empty string |
| `tests/e2e/agent-http-auth.spec.ts` | B | challenge → login → `/proxy/openai` returns 200 |
| `tests/e2e/agent-onchain-grant.spec.ts` | C | broadcast grant tx → login-v2 (no passphrase) → proxy 200 |
| `tests/e2e/agent-x402.spec.ts` | D | no token → 402 → pay → retry → 200 |
