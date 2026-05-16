<p align="center">
  <img src="src/web/public/keyshield.svg" alt="KeyShield" width="64" height="64" style="filter: brightness(0) invert(1);" />
</p>

<h1 align="center">KeyShield</h1>

<p align="center">
  Zero-trust API credential gateway for humans, agents, and delegated bots.
</p>

<p align="center">
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://solana.com"><img src="https://img.shields.io/badge/Solana-wallet-9945ff?logo=solana&logoColor=white" alt="Solana" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white" alt="Python" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

---

KeyShield lets users store upstream provider secrets in an encrypted vault while agents and bots receive short-lived scoped session tokens instead of raw API keys.

**Why it matters:** most agent systems pass raw secrets directly into tools or runtimes. KeyShield separates secret custody from capability usage — humans keep control, agents get limited, revocable access.

### Why KeyShield

| | What you get |
|---|---|
| **10x consumer experience** | Browser extension auto-detects API keys on any page (OpenAI, Anthropic, Helius, …) and saves them to your vault in one click — like iCloud Keychain for developer secrets. |
| **Keychain-grade security** | Every key is AES-256-GCM encrypted in the browser with a passkey-derived master key before it leaves the device. The server only ever holds ciphertext — physical guarantee, not a policy promise. At least as strong as 1Password's zero-knowledge model. |
| **10x faster API calls** | Rust proxy with in-memory response caching (5s–300s TTL by method). Hot-path RPC calls like `getBalance` or `getAsset` resolve from cache at <50ms p99 instead of round-tripping to the provider every time. |

```
Human  ──► Vault (encrypted)  ──► mint session token
                                        │
Agent  ◄────────── KS_TOKEN ◄───────────┘
  │
  └──► KeyShield Proxy ──► upstream provider (OpenAI / Helius / …)
              ▲
              └── raw key decrypted in-memory for one hop, never logged
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

## How it works

1. **Human** stores a provider key (OpenAI, Helius, …) in the encrypted vault.
2. **Agent** authenticates and receives a scoped session token (`ksv2_…`).
3. **Proxy** validates the token, decrypts the upstream key in-memory for one request, and forwards — raw key never leaves the proxy process.

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
| `proxy-helius/` | Helius-specific Rust proxy crate |
| `sites/landing/` | Marketing site |
| `docs/` | Architecture, API reference, deployment, setup |

---

## Production

| Surface | URL |
|---|---|
| App (vault + developer token) | https://app.ks.aileena.xyz |
| API (proxy + auth) | https://keyshield-production.up.railway.app |
| Marketing | https://ks.aileena.xyz |

## On-chain (Solana devnet)

| What | Address |
|---|---|
| KeyShield program | `41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j` |
| USDC mint (devnet) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

---

## Read more

| Doc | Purpose |
|---|---|
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local dev setup |
| [DEPLOY.md](DEPLOY.md) | Production deployment |
| [AGENTS.md](AGENTS.md) | Agent integration design |
| [docs/API.md](docs/API.md) | Endpoint reference + curl examples |
| [docs/architecture/](docs/architecture/) | System design |
| [CHANGELOG.md](CHANGELOG.md) | What shipped when |

---

## License

MIT
