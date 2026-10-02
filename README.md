<p align="center">
  <img src="src/web/public/keyshield.svg" alt="KeyShield" width="64" height="64" />
</p>

<h1 align="center">KeyShield</h1>

<p align="center">
  <strong>Stop copy-pasting API keys.</strong><br/>
  iCloud Keychain for your API keys — store once, plug in anywhere, calls get accelerated.
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
  <a href="SPEC.md#10-implementation-status--known-gaps"><img src="https://img.shields.io/badge/status-alpha-orange" alt="Status: alpha" /></a>
</p>

<p align="center">
  <code>10x smoother experience</code> · <code>10x more secure self-custody vault</code> · <code>10x faster API calls</code>
</p>

---

You already collect passwords in iCloud Keychain. **What if you could do the same with API keys?** Store them once, securely. Whenever you're building — just plug in our vault. The API calls will be accelerated. That's it.

Dashboard for humans. SDK & CLI for agents. Same vault underneath.

> **Status: alpha.** Dashboard, control plane, sync worker, and the devnet program run end-to-end. The Python / TypeScript SDKs and the Rust hot-path proxy are still being re-aligned with the current API. [SPEC.md §10](SPEC.md#10-implementation-status--known-gaps) is the single list of what works today, what is partial, and what is still on the roadmap — read it before deploying.

### Three pillars

| | What you get |
|---|---|
| **10x smoother** | Browser extension detects API keys on provider pages (OpenAI, Anthropic, Helius, …) and saves them to the vault in one tap. Rotate in the dashboard — the next request picks up the new key. No more `.env` copy-paste loops. |
| **10x more secure** | **Device Vault:** AES-256-GCM in your browser with a key derived from your passkey (WebAuthn PRF → HKDF). The Cloudflare sync worker stores ciphertext only — it **cannot** read your keys. **Extension-captured keys** go through the `/manage/*` shim on the control plane: encrypted with a wallet-signature-derived key when the dashboard has registered one, plaintext otherwise. Caveats in [SPEC.md §3](SPEC.md#3-vault-encryption-model). |
| **10x faster calls** | Per-method response cache with provider-aware TTLs (`getBalance` 5 s, `getAsset` 300 s, `GET /v1/models` 1 h) plus single-flight dedup in the Rust Helius hot path — 50 identical `getBalance` calls hit the network once. Cache keys are byte-compatible between the Python and Rust proxies. In-memory today; a disk tier is on the roadmap. |

### How it flows

```
  You ──► Store keys in vault (dashboard or browser extension)
             │
             ├── Device Vault: encrypted in your browser (AES-256-GCM, passkey-derived key)
             │     └── Cloudflare sync worker holds ciphertext only
             └── Extension: /manage/* shim on the control plane
                   (encrypted client-side when a vault key is registered)
                    │
  Your code ──► Session token + REST / SDK (same OpenAI-style API)
                    │
                    └──► KeyShield proxy ──► upstream provider
                            │   (Python control plane today; Rust ks-proxy hot path in local dev)
                            ├── raw key used for one upstream call, never persisted
                            ├── response cache: x-ks-cache: HIT | MISS
                            └── x402 / MPP USDC micropayments settled on Solana devnet
```

### Same vault. Two interfaces.

**For you** — Dashboard + browser extension. Add keys, rotate, see per-session usage, share key metadata with teammates, revoke sessions and agents from the dashboard.

**For your agent** — REST API today; Python SDK, MCP server, and CLI in the repo. The agent holds a session token instead of a key in its config. Two proxy paths: `/proxy/*`, where your client decrypts the vault entry and sends it per request in `X-Upstream-API-Key` (the server never stores it), and `/vproxy/*`, where the control plane injects a shim-stored key server-side. Usage (tokens, cost, latency) is recorded per session; scoped agent tokens and spending caps are specified in [SPEC.md §4–5](SPEC.md#4-session-token) and tracked in §10.

```python
from keyshield import KeyShield

ks = KeyShield(token=os.environ["KS_TOKEN"])
client = ks.openai_client()   # zero raw keys in agent config
```

> The snippet is the target developer experience. `packages/sdk-py` still targets endpoints from the previous backend and does not yet send `X-Upstream-API-Key` ([SPEC.md §10.3](SPEC.md#103-broken-developer-surface-documentation--code)) — use the REST calls below until it is realigned.

---

## Quickstart

```bash
# 0. one-time setup (Node 20+, Python 3.12)
npm install
python3 -m venv .venv && source .venv/bin/activate
pip install -r src/backend/requirements.txt

# 1. start the stack — one terminal each
npm run dev:api        # control plane + proxy routes    → http://localhost:8001
npm run dev:worker     # encrypted vault sync (wrangler)  → http://localhost:8787
npm run dev:web        # dashboard                        → http://localhost:3000
# optional Rust hot path: (cd src/proxy && cargo run --bin ks-proxy)  → http://localhost:8000

# 2. open the vault UI
open http://localhost:3000

# 3. sign in with your wallet or a passkey → Vault → store a provider key → Developer → copy token

# 4. call an upstream through the proxy
export KS_TOKEN="<token from the Developer tab>"
export KS_BASE="http://localhost:8001"

# a) zero-knowledge path: your client decrypts the key and sends it with the request
curl -s "$KS_BASE/proxy/openai/v1/models" \
  -H "Authorization: Bearer $KS_TOKEN" \
  -H "X-Upstream-API-Key: $OPENAI_API_KEY"

# b) shim path: key saved by the extension (or POST /manage/store with {"upstream","value"}),
#    resolved server-side — only the session token leaves your machine
curl -s "$KS_BASE/vproxy/openai/v1/models" -H "Authorization: Bearer $KS_TOKEN"
```

`node dev.cjs` starts web + Rust proxy + the Python control plane (`uvicorn src.backend.app:app` from the repo root). Set `KS_DEV_MODE=1` if you need `X-Dev-Mode` / `/manage/decrypt` locally.

→ Full setup: [DEVELOPMENT.md](DEVELOPMENT.md)

---

## GitNexus (Cursor)

Local code graph for agents. **Desktop MCP and Cloud Agents are separate** — attaching MCP on a laptop does not install it on Cloud.

Pin used here: `gitnexus@1.6.12`. Node `^22.18.0` or `>=24.11.0` (`node -v`). `v22.14.0` may hang on the native Ladybug addon (`EBADENGINE`).

### 1. MCP (once per machine)

`npx gitnexus setup` after `Ok to proceed? (y)` shows a spinner (`⠇ …`). That is **npm downloading the package**, not another prompt. Wait ~2 min. If it is still stuck: `Ctrl+C`, then:

```bash
npx -y gitnexus@1.6.12 setup --coding-agent cursor
```

Or skip setup: create `~/.cursor/` if needed and edit `~/.cursor/mcp.json`.

Empty file:

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

File already has other servers: add the `"gitnexus"` entry inside `mcpServers` (comma after the previous entry; no trailing comma). Do not remove existing keys.

Windows: `"command": "cmd"`, `"args": ["/c", "npx", "-y", "gitnexus@1.6.12", "mcp"]`. Path: `%USERPROFILE%\.cursor\mcp.json`.

Quit Cursor fully (macOS `Cmd+Q`, Windows Alt+F4) and reopen. **Settings → MCP** → `gitnexus` connected.

### 2. Index this repo

```bash
cd /path/to/keyshield
rm -rf .gitnexus    # required if analyze says storage is "foreign"
npx -y gitnexus@1.6.12 analyze --index-only --skip-fts --name keyshield
```

`.gitnexus/` is gitignored. Never commit `meta.json` (a copy from another machine is **foreign** and blocks analyze).

### 3. Validate (anyone)

```bash
npx -y gitnexus@1.6.12 --version          # 1.6.12
npx -y gitnexus@1.6.12 status             # this checkout is indexed
npx -y gitnexus@1.6.12 list               # includes keyshield
./scripts/gitnexus-cloud.sh doctor
./scripts/gitnexus-cloud.sh impact --direction upstream get_stats
```

MCP file (desktop only):

```bash
python3 -c "import json,pathlib; p=pathlib.Path.home()/'.cursor'/'mcp.json'; g=json.loads(p.read_text())['mcpServers']['gitnexus']; assert 'mcp' in g.get('args',[]) or g.get('args')==['mcp']; print(g)"
```

Cloud Agents: skip MCP; run `./scripts/gitnexus-cloud.sh analyze` then `impact` / `detect-changes`. Full procedure: [docs/internal/GITNEXUS.md](docs/internal/GITNEXUS.md).

---

## Repo map

| Path | Role |
|---|---|
| `src/web/` | Vault UI (Vite + React, `:3000`) — Device Vault, sessions, agents, sharing, developer token |
| `src/backend/` | Control plane API (FastAPI, `:8001`) — auth, sessions, `/proxy` + `/vproxy`, `/manage/*` shim, usage, x402 |
| `src/proxy/` | Rust hot-path proxy `ks-proxy` (`:8000`) — Helius fast path, cache, single-flight; local dev only today |
| `src/infra/sync-worker/` | Cloudflare Worker (Hono + R2, `:8787`) — zero-knowledge ciphertext sync for the Device Vault |
| `src/programs/keyshield/` | Solana program (pinocchio) — vault, agent access, payment streams; deployed to devnet |
| `src/extension/` | Browser extension — detect & save keys to the vault |
| `src/sdk/` | TypeScript workspaces — `agent-sdk`, `cli`, `goat-wallet` |
| `src/mobile/` | React Native skeleton reusing the extension-sync vault layer |
| `src/scripts/` | Devnet deploy, demo, and e2e scripts |
| `packages/shared/` | Shared TypeScript types and utilities |
| `packages/sdk-py/` | Python SDK — install from source with `pip install -e packages/sdk-py` (the `keyshield` project on PyPI is unrelated) |
| `packages/mcp-server/` | MCP server — manage vault and agents from Claude (`pip install -e packages/mcp-server`; not on PyPI yet) |
| `proxy-helius/` | Diverged standalone copy of the Helius crate; not in either Cargo workspace — `ks-proxy` builds `src/proxy/crates/ks-helius` |
| `sites/landing/` | Marketing site |
| `tests/` | Playwright e2e + Python integration tests |
| `docs/` | Architecture, API reference, deployment, setup — index at [docs/README.md](docs/README.md) |

---

## Production

| Surface | URL |
|---|---|
| App (vault + developer token) | https://app.ks.aileena.xyz |
| Marketing | https://ks.aileena.xyz |

Topology: dashboard on Cloudflare Pages → FastAPI control plane on Railway (`api.ks.aileena.xyz`) → sync worker on Cloudflare Workers (`sync.ks.aileena.xyz`). The Rust `ks-proxy` is not part of the deployed path yet. Steps in [DEPLOY.md](DEPLOY.md).

## On-chain (Solana devnet)

| What | Address |
|---|---|
| KeyShield program | [`41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j`](https://explorer.solana.com/address/41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j?cluster=devnet) |
| MPP stream PDA | [`E5sMx86o3MWV562BxbWk6SxfqTFBWpCitj3AU9i6DgfR`](https://explorer.solana.com/address/E5sMx86o3MWV562BxbWk6SxfqTFBWpCitj3AU9i6DgfR?cluster=devnet) |
| USDC token account | [`6QtooE6QVFF9pJ9Pa9DgAFAWpEWkB8VtjEytc5FyFtBH`](https://explorer.solana.com/address/6QtooE6QVFF9pJ9Pa9DgAFAWpEWkB8VtjEytc5FyFtBH?cluster=devnet) |

**Verified transactions:**
- [Open MPP payment stream](https://explorer.solana.com/tx/678bqTSq4gYspz2TWwdK3wCzZwEHuuDqseDUS2NcEPVQ45472iNPRykVh6K1zGEbq4nPmbLfDKKSiUx2nrT6XTQc?cluster=devnet) — stream opened, settle round-trip verified

18 on-chain instructions, routed by a one-byte discriminator (`src/programs/keyshield/src/lib.rs`):

| Discriminator | Group | Instructions |
|---|---|---|
| 0–2 | Legacy vault | `StoreKey`, `AccessKey`, `ShareKey` |
| 10–12 | Universal vault | `CreateUniversalVault`, `UpdateUniversalPolicy`, `AddKeyToGroup` |
| 20–23 | Agent access | `GrantAgentAccess`, `RevokeAgentAccess`, `AccessWithAgent`, `CreateEphemeralSigner` |
| 24–27 | Embedded wallet | `OpenPaymentStream`, `PayX402`, `MppSettle`, `WithdrawAgentWallet` |
| 30–33 | Payment stream | `GrantAgentPaymentAccess`, `SettlePayment`, `PayForService`, `ClosePaymentStream` |

---

## Read more

| Doc | Purpose |
|---|---|
| [SPEC.md](SPEC.md) | Protocol spec v0.1 — every clause carries an implemented / partial / planned marker, plus the known-gaps list |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local dev setup |
| [DEPLOY.md](DEPLOY.md) | Production deployment |
| [AGENTS.md](AGENTS.md) | Agent integration design |
| [docs/internal/GITNEXUS.md](docs/internal/GITNEXUS.md) | GitNexus MCP vs CLI — attach, validate, Cloud fallback |
| [docs/README.md](docs/README.md) | Documentation index |
| [docs/API.md](docs/API.md) | Endpoint reference + curl examples |
| [docs/architecture/](docs/architecture/) | System design |
| [CHANGELOG.md](CHANGELOG.md) | What shipped when |

---

## License

MIT
