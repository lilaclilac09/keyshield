<p align="center">
  <img src="src/web/public/keyshield.svg" alt="KeyShield" width="64" height="64" style="filter: brightness(0) invert(1);" />
</p>

<h1 align="center">KeyShield</h1>

<p align="center">
  <strong>A non-custodial session-key sandbox for agent commerce.</strong><br/>
  Store keys once. Agents hold a session token, never the raw secret. Calls settle on Solana after fulfillment proves out.
</p>

<p align="center">
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://solana.com"><img src="https://img.shields.io/badge/Solana-devnet-9945ff?logo=solana&logoColor=white" alt="Solana" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white" alt="Python" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

<p align="center">
  <a href="https://github.com/lilaclilac09/keyshield/actions/workflows/test.yml"><img src="https://github.com/lilaclilac09/keyshield/actions/workflows/test.yml/badge.svg?branch=main" alt="CI: Rust" /></a>
  <a href="https://github.com/lilaclilac09/keyshield/actions/workflows/python.yml"><img src="https://github.com/lilaclilac09/keyshield/actions/workflows/python.yml/badge.svg?branch=main" alt="CI: Python" /></a>
  <a href="https://github.com/lilaclilac09/keyshield/actions/workflows/node-tests.yml"><img src="https://github.com/lilaclilac09/keyshield/actions/workflows/node-tests.yml/badge.svg?branch=main" alt="CI: Node" /></a>
  <a href="https://github.com/lilaclilac09/keyshield/tree/main/docs"><img src="https://img.shields.io/badge/docs-/docs-blue" alt="Docs" /></a>
  <a href="SPEC.md"><img src="https://img.shields.io/badge/spec-v0.1-informational" alt="Spec v0.1" /></a>
  <a href="packages/mcp-server/"><img src="https://img.shields.io/badge/MCP-server-6f42c1?logo=anthropic&logoColor=white" alt="MCP Server" /></a>
  <a href="#"><img src="https://img.shields.io/badge/tests-95%2B-brightgreen" alt="95+ tests" /></a>
</p>

<p align="center">
  <code>10x smoother experience</code> · <code>10x more secure self-custody vault</code> · <code>10x faster API calls</code>
</p>

---

You already collect passwords in iCloud Keychain. **What if you could do the same with API keys?** Store them once, securely. Whenever you're building — just plug in our vault. The API calls will be accelerated. That's it.

Dashboard for humans. SDK & CLI for agents. Same vault underneath.

### Three pillars

| | What you get |
|---|---|
| **10x smoother** | Browser extension auto-detects API keys on any page (OpenAI, Anthropic, Helius, …) and captures them in one tap. Dashboard for rotation — every project picks it up instantly. No more `.env` copy-paste loops. |
| **10x more secure** | AES-256-GCM encryption happens in your browser via WebAuthn PRF / wallet signature → HKDF. Our server only stores ciphertext — we **physically cannot** read your keys. Same zero-knowledge model as iCloud Keychain, built for API secrets. |
| **10x faster calls** | Rust proxy with two-tier cache (memory + disk) and single-flight dedup. 50 identical `getBalance` calls hit the network once. Hot-path Solana RPCs land in the 50–80ms band without changing your client code. |

### Architecture

KeyShield is a **non-custodial session-key sandbox for agent commerce**.
The human (or the agent's operator) encrypts provider keys on-device
(WebAuthn-PRF → HKDF → AES-256-GCM). The Cloudflare sync-worker stores
ciphertext only. At request time the client decrypts locally, the
Python proxy injects `X-Upstream-API-Key` once, and the key is never
persisted. The agent process holds a session token (`ksv2_…`), not
`sk-` / `gsk_` material.

The on-chain program is **pinocchio**, not Anchor. Instruction handlers
are `no_std`, read `aps_offset` instead of deserializing heap types,
and stay inside a tight CU budget: mint / PDA / tombstone checks run
after the cheap early returns so a bad settler or a zero-byte artifact
fails before `TransferChecked`.

**Two-phase commit closes the settlement vs fulfillment gap.** Phase 1
(`hold_estimate`) locks micro-USDC in the stream ledger. Phase 2
(`verify_fulfillment` + `assert_settlement_artifact`) hashes the
upstream body and refuses empty, error, or short digests. Phase 3
(`settle_receipt`) accepts `HMAC-SHA256(session, artifact)` and only
then builds `mpp_settle`. A 502, a truncated SSE, or a missing 32-byte
hash cannot debit the Devnet escrow.

```
  You ──► Store keys in vault (dashboard or Chrome extension)
             │
             ├── encrypted in your browser (AES-256-GCM)
             └── server only holds ciphertext
                    │
  Your agent ──► session token (never the raw key)
                    │
                    └──► Python proxy ──► upstream (OpenRouter / Ollama / vLLM / …)
                            │
                            ├── hold → verify artifact (32-byte sha256) → capture
                            ├── Rust hot-path cache: 50–80ms Solana RPCs
                            └── pinocchio mpp_settle on Devnet USDC
```

### Same vault. Two interfaces.

**For you** — Dashboard + Chrome extension. Add keys, rotate, see usage, share with teammates (scoped, revocable).

**For your agent** — Python SDK / CLI / REST API. Agent gets a session token, never the raw key. Spending cap enforced on-chain. Kill switch from your dashboard.

```python
from keyshield import KeyShield

ks = KeyShield(token=os.environ["KS_TOKEN"])
client = ks.openai_client()   # zero raw keys
```

---

## Quickstart

```bash
# 1. start the stack
node dev.cjs

# 2. open the vault UI
open http://localhost:5173

# 3. connect wallet → store a provider key → copy Developer token

# 4. call an upstream via the proxy
export KS_TOKEN="ksv2_..."
export KS_BASE="http://localhost:8001"

curl -s -X POST "$KS_BASE/proxy/openai/v1/chat/completions" \
  -H "Authorization: Bearer $KS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'
```

→ Full setup: [DEVELOPMENT.md](DEVELOPMENT.md)

---

## How to use this

Two interfaces, one vault. Humans use the dashboard. Agents hold a
session token and never see `sk-` / `gsk_` material.

### 1. Start the stack

```bash
node dev.cjs
# Vault UI     http://localhost:5173
# Control API  http://localhost:8001
```

Production: [https://app.ks.aileena.xyz](https://app.ks.aileena.xyz)
(marketing: [https://ks.aileena.xyz](https://ks.aileena.xyz)).

### 2. Humans — store a key, copy a token

1. Open the vault UI and connect a Solana wallet (Phantom / Solflare).
2. Unlock the Device Vault (passkey / WebAuthn-PRF). Encryption stays
   on this device; the server stores ciphertext only.
3. **Vault** — paste a provider key (OpenAI, Anthropic, Helius,
   OpenRouter, Groq, …).
4. **Developer** — copy the session token. That is the Bearer you put
   in `KS_TOKEN`. Demo / harness tokens may look like `ksv2_…`.
5. Call any upstream through the proxy. The client decrypts locally and
   sends the key once in `X-Upstream-API-Key`. The proxy does not persist it.

```bash
export KS_TOKEN="<paste from Developer>"
export KS_BASE="http://localhost:8001"   # or https://app.ks.aileena.xyz

curl -s -X POST "$KS_BASE/proxy/openai/v1/chat/completions" \
  -H "Authorization: Bearer $KS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'
```

```python
import os
from keyshield import KeyShield

ks = KeyShield(token=os.environ["KS_TOKEN"], base_url=os.environ.get("KS_BASE", "http://localhost:8001"))
client = ks.openai_client()   # same OpenAI SDK, zero raw keys
```

CLI equivalent: `source keyshield-cli.sh` then `ks_store openai "sk-…"`
and `ks_login <wallet> <passphrase>`.

Dashboard tabs stay as they are: **Home**, **Vault**, **Payments**
(Activity), **Developer**, **Agents**, **Sharing**, **Sessions**,
**Settings**, **Docs**, **Reports**, **X402 Trust**. Do not rename them.

### 3. Pay for a stream (optional)

On **Payments** (Activity): connect / paste an OpenRouter key once, then
open a stream. On-chain order is Universal Vault → agent grant →
`OpenStream` (ix 24) → meter → `MppSettle` (ix 26). Dry-run:

```bash
npm run live:e2e:dry
```

Do not run a live Devnet settle unless you intend to spend operator
USDC. Stage 4 live stays opt-in (`LIVE_E2E=1`).

---

## How agents register

An agent is an ed25519 identity. You register its **public** key once.
The agent keeps the seed. It then signs a server challenge and receives
a session token. The server never stores the private key.

```
Owner  →  register pubkey  →  /agents/register
Agent  →  sign challenge   →  /auth/agent-challenge + /auth/agent-login
Agent  →  Bearer token     →  /proxy/:upstream/...
```

### Option A — dashboard (one click)

1. Open **Agents**.
2. Type a name (e.g. `trading-bot-v1`).
3. Click **Generate & Register**. The UI creates an ed25519 keypair in
   the browser, POSTs `pubkeyB58` + `name` to `/agents/register`, and
   shows the seed **once**. Copy it. If the Device Vault is unlocked,
   the seed is sealed on this device; the server only has the pubkey.
4. Or paste an existing base58 pubkey and click **Register**.

### Option B — owner API / SDK

You need an owner session token first (Developer tab, or wallet login).

```bash
# Register an existing pubkey
curl -s -X POST "$KS_BASE/agents/register" \
  -H "Authorization: Bearer $KS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pubkeyB58":"9WzDX...","name":"trading-bot-v1","scopes":"*"}'

# List
curl -s "$KS_BASE/agents/list" -H "Authorization: Bearer $KS_TOKEN"
```

```python
from keyshield import KeyShield, generate_keypair

ks = KeyShield(token=os.environ["KS_TOKEN"], base_url=os.environ["KS_BASE"])
creds = generate_keypair()          # {"private_key_hex", "pubkey_b58"}
ks.agent_register(creds["pubkey_b58"], name="trading-bot-v1")
# Ship creds["private_key_hex"] to the agent process only. Not the repo.
```

`POST /agents` is the REST alias (name only; the server mints a
placeholder id). Prefer `/agents/register` with a real ed25519 pubkey
so the agent can self-authenticate.

### Option C — agent process logs itself in

The pubkey must already be registered (A or B). Then:

```bash
# 1. challenge
CHAL=$(curl -s -X POST "$KS_BASE/auth/agent-challenge")
# 2. sign the challenge bytes with the agent seed (ed25519)
# 3. login
curl -s -X POST "$KS_BASE/auth/agent-login" \
  -H "Content-Type: application/json" \
  -d '{"pubkeyB58":"<agent-pubkey>","challenge":"<challenge>","nonce":"<nonce>","signature":"<ed25519-sig-base64>"}'
# → { "token": "..." }
```

```python
from keyshield import AgentKeyShield

agent = AgentKeyShield(
    owner_wallet=os.environ["KS_OWNER_WALLET"],
    private_key_hex=os.environ["KS_AGENT_KEY"],
    vault_passphrase=os.environ["KS_VAULT_PASS"],
    base_url=os.environ.get("KS_BASE", "http://localhost:8001"),
)
token = agent.authenticate()
resp = agent.proxy("openai", "v1/chat/completions", json={
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "ping"}],
})
```

Unregistered pubkeys get `401 agent not registered`. Duplicate register
returns `409` with `duplicate: true` (idempotent for demos). Revoke
from **Agents** or `DELETE /agents/{id}`.

### On-chain grant (paid streams)

Registration is off-chain identity. A live MPP stream also needs an
on-chain `GrantAgentAccess` on the owner's Universal Vault **before**
`OpenStream`. The Payments tab and `scripts/live_e2e_run.ts` do that
order for you. zk-vault ixs 40–43 are in source and are **not** on the
current Devnet program until upgrade authority extends ProgramData.

Full endpoint list: [docs/API.md](docs/API.md). Design notes:
[AGENTS.md](AGENTS.md).

---

## Repo map

| Path | Role |
|---|---|
| `src/web/` | Vault UI — store keys, inspect sessions, manage delegation |
| `src/backend/` | Control plane API — auth, session minting, policy |
| `src/proxy/` | Hot-path Rust proxy — upstream fan-out |
| `src/extension/` | Browser extension — save-to-vault prompts |
| `src/infra/sync-worker/` | Cloudflare Worker — encrypted vault sync (R2) |
| `packages/shared/` | Shared types and utilities |
| `packages/sdk-py/` | Python SDK — `pip install keyshield` |
| `packages/mcp-server/` | MCP server — manage vault and agents from Claude |
| `proxy-helius/` | Helius-specific Rust proxy crate |
| `sites/landing/` | Marketing site |
| `docs/` | Architecture, API reference, deployment, setup |

### Four-stage MPP harness

These suites are first-class. The matrix in [keyshield.md](keyshield.md)
mirrors the implementations exactly. Run them from the repo root.

| Stage | What it proves | Command | Files |
|---|---|---|---|
| 1 | Deterministic slot warp, clawback only after the dispute window, closed-account resurrection blocked, concurrent settle cannot double-claim | `npm run test:bankrun` | `tests/bankrun_security.test.ts` (host oracle: `src/programs/keyshield/tests/bankrun_invariants.rs`) |
| 2 | Arbitrary instruction sequences: spending bounds, escrow = deposit − spent, unauthorized / revoked / unverified signer paths leave state unchanged | `cargo test -p keyshield --test fuzz_invariants` | `tests/fuzz_invariants.rs` |
| 3 | Upstream mock: 502/504, dropped TCP, empty 200, truncated JSON — no fulfillment proof, no `mpp_settle`, escrow unmutated | `npm run test:fault` | `tests/proxy_fault_injection.test.ts`, `tests/proxy_fault_injection_driver.py` |
| 4 | Devnet e2e: WebAuthn-PRF session token → proxy data plane → confirmed `OpenStream` / `MppSettle` (dry-run default; `LIVE_E2E=1` for real OpenRouter/Ollama) | `npm run live:e2e:dry` | `scripts/live_e2e_run.ts`, `scripts/fixtures/devnet-wallets.json` |

```bash
npm run test:harness          # Stages 1 + 3 + 4 dry-run
npm run test:fault            # Stage 3 only
npm run live:e2e:dry          # Stage 4 crypto + path check
npm run live:e2e:setup        # gitignored wallets; YOU still add the inference key + USDC
LIVE_E2E=1 npm run live:e2e   # Stage 4 live (OPENROUTER_API_KEY or ollama)
npm run demo:record           # unattended ~2 minute take (mock + ks-proxy + clawback)
```

Stage 3 does not sign `mpp_settle`. Stage 4 live first creates the
USER Universal Vault and an active agent grant, then prepends the
owner Ed25519 binding (`sha256(stream || seq || debit || artifact)`)
as instruction 0 so the program does not return 6114.

---

## Production

| Surface | URL |
|---|---|
| App (vault + developer token) | https://app.ks.aileena.xyz |
| Marketing | https://ks.aileena.xyz |
| Record-demo harness | [`docs/DEMO_RECORDING_SCRIPT.md`](docs/DEMO_RECORDING_SCRIPT.md) · `npm run demo:record` |
| YouTube cut | Publish the voiced take from `docs/DEMO_RECORDING_SCRIPT.md` and paste the `youtu.be` URL here — none is checked into the repo yet |

## On-chain verification (Solana Devnet)

Reviewers can open these Explorer links with `?cluster=devnet` and confirm the program account is executable under BPFLoaderUpgradeable.

| What | Address / fact | Explorer |
|---|---|---|
| Program ID | `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j` | [program](https://explorer.solana.com/address/41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j?cluster=devnet) |
| Loader | `BPFLoaderUpgradeab1e11111111111111111111111` · `executable: true` | [loader](https://explorer.solana.com/address/BPFLoaderUpgradeab1e11111111111111111111111?cluster=devnet) |
| ProgramData | `48Ji7Wmwe8DDQxnGpbBRs2ey9oGo2qwdxTEodhwJk2nx` | [program data](https://explorer.solana.com/address/48Ji7Wmwe8DDQxnGpbBRs2ey9oGo2qwdxTEodhwJk2nx?cluster=devnet) |
| Upgrade authority | `74Xuc5BC5uttSiHj598sJJj3rgEUsfYF7xVs69tWLwDY` | [authority](https://explorer.solana.com/address/74Xuc5BC5uttSiHj598sJJj3rgEUsfYF7xVs69tWLwDY?cluster=devnet) |
| Upgrade-authority vault PDA | `8QBVXySkwWJcic2K4b7SAdaG4tQtyA2ekPvaRQLpizmp` (`universal_vault` + `74Xuc5…`) | [vault](https://explorer.solana.com/address/8QBVXySkwWJcic2K4b7SAdaG4tQtyA2ekPvaRQLpizmp?cluster=devnet) |
| MPP stream PDA (that vault) | `E5sMx86o3MWV562BxbWk6SxfqTFBWpCitj3AU9i6DgfR` | [stream](https://explorer.solana.com/address/E5sMx86o3MWV562BxbWk6SxfqTFBWpCitj3AU9i6DgfR?cluster=devnet) |
| Stream USDC ATA | `6QtooE6QVFF9pJ9Pa9DgAFAWpEWkB8VtjEytc5FyFtBH` | [token account](https://explorer.solana.com/address/6QtooE6QVFF9pJ9Pa9DgAFAWpEWkB8VtjEytc5FyFtBH?cluster=devnet) |
| Local-user vault PDA | `9MYSdKcRkg1F9hpYmUXsknEyuQ2vzqtW5JDdfsxnTqmV` (`universal_vault` + `DDNp8H…`) | [vault](https://explorer.solana.com/address/9MYSdKcRkg1F9hpYmUXsknEyuQ2vzqtW5JDdfsxnTqmV?cluster=devnet) |
| Devnet USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | [mint](https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet) |

`9MYS…` and `E5sM…` are **not** one owner’s vault/stream pair. Re-verification (2026-10-05, `confirmed`, public Devnet RPC): see [docs/EVIDENCE_INDEX.md](docs/EVIDENCE_INDEX.md).

**Confirmed execution slots** (`meta.err = null`; discriminator from compiled ix data, not Explorer copy):

| Tx | Slot | Verified ix |
|---|---|---|
| [`t6B8V4Wg…GVEh`](https://explorer.solana.com/tx/t6B8V4WgF3DLWsmWpVaukoogvrsTxY8MtKnLXijYReAmKeoEgaQntoSy9Jd5ZYT8fJJzRzshVSrkHbT5tgyGVEh?cluster=devnet) | 507665661 | **24 OpenStream** for user `DDNp8H…` / vault `9MYS…` / stream `ERTBCQ…`. Program consumed **2126** CUs. Not `MppSettle`. |
| [`2CnCiiji…3Qoj`](https://explorer.solana.com/tx/2CnCiijiu7UuRQWRJ1XbB7gq86N2YGFZpHxsoCaJtK3RPmJ3MktBruiPHkzxdUV7a5QEbbZdiZseRsvq4CTf3Qoj?cluster=devnet) | 507665666 | **26 MppSettle** (historical; not in the originally supplied two-sig list). Total **2024** CUs. |
| [`u99eN5uh…peyi`](https://explorer.solana.com/tx/u99eN5uhtTHrLBNiWCUzHLJgvj85cLnJ2Xhnhk57Zg7z7GHLDesyiEpGxKuGzP9RtNUQ9PHg2o7wwXUbwr9peyi?cluster=devnet) | 507665693 | **27 WithdrawAgentWallet**. Program consumed **3076** CUs. |
| [`678bqTSq…XTQc`](https://explorer.solana.com/tx/678bqTSq4gYspz2TWwdK3wCzZwEHuuDqseDUS2NcEPVQ45472iNPRykVh6K1zGEbq4nPmbLfDKKSiUx2nrT6XTQc?cluster=devnet) | 461386827 | **24 OpenStream** for `E5sM…` / vault `8QBV…`. |

Live payment surface on this program: `CreateUniversalVault`, `GrantAgentAccess`, `RevokeAgentAccess`, `UpdateVaultConfig`, `OpenStream` (ix 24), `MppSettle` (ix 26), `CloseStream`. Source also contains zk-vault ixs 40–43; they are **not** on this Devnet allocation until upgrade authority `74Xuc5…` extends ProgramData and swaps the buffer. Do not treat an `InvalidInstructionData` on ix 40 as a local-logic pass.

## Failure modes and security boundaries

| Boundary | What fails | Automated handling |
|---|---|---|
| **Settlement vs delivery desync** | Upstream HTTP 502/504 or a truncated SSE stream | `verify_fulfillment` refuses empty / error / short digests. No 32-byte artifact → no `mpp_settle`. Stage 3 asserts `settled=0`. |
| **Slot-bounded escrow timeout** | Clock drift or a hung counterparty | `clawback_ready` waits `last_active + timeout` (default 2250 slots). After that, `ForceClawback` (ix 28) returns remaining escrow to the owner with no counterparty signature. Inside the window the ix returns 6115 (`DisputeWindowActive`). |
| **Compute-unit ceiling** | Heap-heavy deserialization under load | Pinocchio handlers read `aps_offset` — no `String` / `Vec` unpack. Design ceiling is **&lt; 5,000 CUs** per hold / verify / settle transition. Cheap mint / PDA / tombstone checks run first. |
| **Memory boundary** | Proxy panic or error unwind | Decrypted keys and `X-Upstream-API-Key` live only in the request task. They are never written to disk or logs; buffers drop when the socket closes (`Memory zeroized on socket close` in the record-demo). `secrecy` + `zeroize` is the intended crate-level hardening of that drop-on-close contract and is not a current `ks-proxy` Cargo dependency. |

Full write-up: [keyshield.md](keyshield.md).

---

## Read more

| Doc | Purpose |
|---|---|
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local dev setup |
| [DEPLOY.md](DEPLOY.md) | Production deployment |
| [AGENTS.md](AGENTS.md) | Agent integration design |
| [docs/API.md](docs/API.md) | Endpoint reference + curl examples |
| [docs/architecture/](docs/architecture/) | System design |
| [keyshield.md](keyshield.md) | On-chain verification, failure boundaries, 4-stage test matrix |
| [docs/EVIDENCE_INDEX.md](docs/EVIDENCE_INDEX.md) | Artifact IDs, checksums, verified vs claimed |
| [docs/REVIEWER_QUICKSTART.md](docs/REVIEWER_QUICKSTART.md) | How to re-run the matrix and watch the takes |
| [docs/DEMO_RECORDING_SCRIPT.md](docs/DEMO_RECORDING_SCRIPT.md) | 2-minute record-demo scenes + voiceover |
| [docs/DEMO_STORYBOARD.md](docs/DEMO_STORYBOARD.md) | Scene table for the recorded takes |
| [CHANGELOG.md](CHANGELOG.md) | What shipped when |

---

## License

MIT
