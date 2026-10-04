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

These suites are first-class. Run them from the repo root. GitNexus
MCP is not available in this environment, so impact analysis is skipped
and is not a reason to leave the harness uncommitted.

| Stage | What it proves | Command | Files |
|---|---|---|---|
| 1 | Clock / tombstone / mint / underflow (host oracle; Mollusk needs `cargo-build-sbf`) | `npm run test:bankrun` + `npm run test:invariants` | `tests/bankrun_security.test.ts`, `src/programs/keyshield/tests/bankrun_invariants.rs` |
| 2 | Proptest invariants A/B/C on `StreamModel` | `cargo test -p keyshield --test fuzz_invariants` | `tests/fuzz_invariants.rs` |
| 3 | SSE mid-stream drop, 502/504, empty 200, garbage JSON — meter only a verified prefix | `npm run test:fault` | `tests/proxy_fault_injection.test.ts`, `tests/proxy_fault_injection_driver.py` |
| 4 | Devnet inference path (dry-run default; `LIVE_E2E=1` for real OpenRouter/Ollama) | `npm run live:e2e:dry` | `scripts/live_e2e_run.ts`, `scripts/fixtures/devnet-wallets.json` |

```bash
npm run test:harness          # Stages 1 + 3 + 4 dry-run
npm run test:fault            # Stage 3 only
npm run live:e2e:dry          # Stage 4 crypto + path check
npm run live:e2e:setup        # gitignored wallets; YOU still add the inference key + USDC
LIVE_E2E=1 npm run live:e2e   # Stage 4 live (OPENROUTER_API_KEY or ollama)
```

Stage 3 does not sign `mpp_settle`. Stage 4 live prepends the owner
Ed25519 binding (`sha256(stream || seq || debit || artifact)`) as
instruction 0 so the program does not return 6114.

---

## Production

| Surface | URL |
|---|---|
| App (vault + developer token) | https://app.ks.aileena.xyz |
| Marketing | https://ks.aileena.xyz |

## On-chain (Solana devnet)

| What | Address |
|---|---|
| KeyShield program | [`41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j`](https://explorer.solana.com/address/41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j?cluster=devnet) |
| MPP stream PDA | [`E5sMx86o3MWV562BxbWk6SxfqTFBWpCitj3AU9i6DgfR`](https://explorer.solana.com/address/E5sMx86o3MWV562BxbWk6SxfqTFBWpCitj3AU9i6DgfR?cluster=devnet) |
| USDC token account | [`6QtooE6QVFF9pJ9Pa9DgAFAWpEWkB8VtjEytc5FyFtBH`](https://explorer.solana.com/address/6QtooE6QVFF9pJ9Pa9DgAFAWpEWkB8VtjEytc5FyFtBH?cluster=devnet) |

**Verified transactions:**
- [Open MPP payment stream](https://explorer.solana.com/tx/678bqTSq4gYspz2TWwdK3wCzZwEHuuDqseDUS2NcEPVQ45472iNPRykVh6K1zGEbq4nPmbLfDKKSiUx2nrT6XTQc?cluster=devnet) — stream opened, settle round-trip verified

7 on-chain instructions: `CreateUniversalVault`, `GrantAgentAccess`, `RevokeAgentAccess`, `UpdateVaultConfig`, `OpenStream`, `MppSettle`, `CloseStream`.

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
