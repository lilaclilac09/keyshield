<p align="center">
  <img src="src/web/public/keyshield.svg" alt="KeyShield" width="64" height="64" style="filter: brightness(0) invert(1);" />
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

### How it flows

```
  You ──► Store keys in vault (dashboard or Chrome extension)
             │
             ├── encrypted in your browser (AES-256-GCM)
             └── server only holds ciphertext
                    │
  Your code ──► Plug in the SDK (3 lines, same OpenAI API)
                    │
                    └──► Rust proxy ──► upstream provider
                            │
                            ├── raw key injected once, discarded immediately
                            ├── response cache: 50–80ms hot path
                            └── USDC micropayment settled on Solana
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

## What is actually best here

Other vaults store a key. Other 402 clients sign a payment. KeyShield
refuses to treat those as the same event.

| Everywhere else | Here |
|---|---|
| Session signature spends the balance | Signature only **authorizes**. `settled` moves after fulfillment |
| Timeout cached as “failed” / “paid” | Timeout is `indeterminate` — hold stays, no debit, retry can reconcile |
| `parseFloat` on a 402 body | Integer micro-USDC, and the DOM amount must equal the compiled Pinocchio ix |
| Anchor-style account macros | Pinocchio program: envelope, PDA, CU snapshot. No `anchor-lang` |

The rule: **a session-key signature never decrements balance unless the downstream state change is verified** (artifact hash + consumer HMAC, then `Confirmed` / stub-ledger `Stub` — never a dropped RPC).

That is Hold-Verify-Capture. It is why a blank upstream body, a 5xx, or a hung Solana submit cannot become a USDC transfer. Details: [docs/PAYMENT-FLOWS.md](docs/PAYMENT-FLOWS.md), [docs/security/SCVD_SYSTEMS_REPORT.md](docs/security/SCVD_SYSTEMS_REPORT.md).

Honest limits: `ks-proxy` does not use `secrecy`/`zeroize` (those live in `ks-session-engine`). Host SHA-256 context digests are not WebAuthn-PRF. CI locks the honest Pinocchio path at **4,500 CU** under a **5,000** budget — not a 4,120 marketing figure.

---

## Real-world shopping

KeyShield shopping is not Amazon. You are buying a **delivered API / agent result**, priced in USDC (6 decimals, integer micro-USDC). Three ways to pay:

| Path | When | Real money today |
|---|---|---|
| **A. Prepaid** | Human tops up, then agents spend | Dashboard wallet transfer (SOL/USDC) → balance. Best first purchase. |
| **B. MPP stream** | Long job, no per-call 402 | Real debit only after wallet `OpenPaymentStream` + settler env + capture MAC. Otherwise the DB is a **stub ledger**. |
| **C. x402** | Pay-as-you-go agent | 402 body + extension prompt work. **On-chain proof verify is not finished** — do not treat a random `X-Payment-Proof` as paid in production. |

### 1. Practice on Devnet (no mainnet USDC)

1. Phantom (or any Solana wallet) on **Devnet**. Airdrop SOL. Get Devnet USDC from [faucet.circle.com](https://faucet.circle.com/) (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`).
2. `node dev.cjs` — API `:8001`, proxy `:8000`, UI `:5173` (use `http://127.0.0.1:5173` for passkeys).
3. Sign in → Vault → store the provider key **or** plan to pay KeyShield to use a platform key.
4. Activity → **Top Up** for Path A, or MPP tab → `POST /mpp/streams` then wallet-sign `POST /mpp/streams/{id}/build-open-tx` for Path B.
5. Call through the proxy with your session token. For MPP, send `X-Mpp-Stream-Id`.
6. Watch the three phases: **hold** (reserve) → **verify** (2xx, non-empty body, artifact hash) → **capture** (HMAC over that hash, then `mpp_settle` ix 26). Empty / 5xx / timeout → **no debit**.
7. Confirm the settle on [Devnet explorer](https://explorer.solana.com/?cluster=devnet) against program [`41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j`](https://explorer.solana.com/address/41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j?cluster=devnet).

Operator script: [docs/DEVNET.md](docs/DEVNET.md) (`KS_MPP_SETTLER_KEY`, `KS_PLATFORM_USDC_ATA`, `KS_KEYSHIELD_PROGRAM_ID`). If any of those is missing, capture stays stub — the chain does not move.

### 2. Mainnet (real USDC)

Do not flip `KS_SOLANA_RPC_URL` to mainnet until all of this is true:

1. Pinocchio program **deployed on mainnet** (the address above is Devnet).
2. Escrow ATA is **mainnet USDC** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
3. Settler key in a KMS / signing service — not a laptop JSON keypair.
4. Stream opened **on-chain** (wallet signed `open_payment_stream`). A DB-only `POST /mpp/streams` is not a shop.
5. Capture only on `SettleOutcome.mode=submitted`. Treat `indeterminate` as “check the explorer, then retry” — never as paid, never as a hard fail.
6. Extension 402: amount and program id must match the compiled ix or it will not sign (`src/extension/dom-intent.js`).
7. Leave Path C (x402 proof verify) off until Base USDC receipts are checked on-chain.

Cap every stream (`max_total_micro_usdc`). Start with a few dollars. One artifact hash = one capture. Replay is `NonceReused`, not a second purchase.

```bash
# Agent: session token only — never the provider key, never the settler key
export KS_TOKEN="ksv2_..."
export KS_BASE="https://app.ks.aileena.xyz"   # or http://127.0.0.1:8001

curl -s -X POST "$KS_BASE/proxy/openai/v1/chat/completions" \
  -H "Authorization: Bearer $KS_TOKEN" \
  -H "X-Mpp-Stream-Id: $STREAM_ID" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'
```

You paid only if: upstream delivered a real body, the consumer MAC matched, and the chain (or an explicit stub ledger) captured. A hung RPC is not a receipt.

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
