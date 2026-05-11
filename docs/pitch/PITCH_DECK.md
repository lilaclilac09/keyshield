---
marp: true
theme: default
class: invert
paginate: true
backgroundColor: "#0b1226"
color: "#e8ecff"
style: |
  section { font-family: 'Inter', -apple-system, sans-serif; padding: 64px 72px; }
  h1 { color: #ffffff; font-size: 56px; letter-spacing: -0.02em; }
  h2 { color: #ffffff; font-size: 40px; letter-spacing: -0.01em; margin-top: 0; }
  h3 { color: #a8b3d8; font-weight: 500; }
  strong { color: #6c8eff; }
  code { background: #131c39; color: #6c8eff; padding: 2px 6px; border-radius: 4px; }
  pre { background: #131c39; border: 1px solid #243365; border-radius: 8px; padding: 16px; }
  pre code { background: transparent; color: #e8ecff; padding: 0; }
  table { font-size: 22px; }
  th { color: #a8b3d8; text-align: left; }
  td { color: #e8ecff; padding: 6px 16px 6px 0; }
  .lead { color: #a8b3d8; font-size: 28px; line-height: 1.4; }
  .footer { color: #5e6a91; font-size: 14px; }
  blockquote { border-left: 3px solid #6c8eff; padding-left: 16px; color: #a8b3d8; }
---

<!-- _paginate: false -->

# KeyShield

<p class="lead">
Your agent never holds the key.<br/>
Your wallet sets the budget.<br/>
Solana settles the bill.
</p>

<p class="footer">Privacy Hack 2026 · Colosseum · keyshield.dev</p>

---

## The $40,000 problem

| | |
|---|---|
| **AI agents need API keys** | OpenAI, Anthropic, Helius, 0x — every agent needs many |
| **Keys leak** | `.env` files, Docker layers, process memory, log lines, AI context windows |
| **Bills explode overnight** | One leaked OpenAI key → $40k spend before you notice |
| **No accountability** | Which call? Which agent? You'll never know — env strings can't be revoked granularly |

> The agentic AI era is already here. **Key infrastructure is built for humans.**

---

## KeyShield in one line

<p class="lead">
A <strong>zero-trust API key proxy</strong> with <strong>client-side encrypted vault</strong> and <strong>Solana-native per-call micropayments</strong> — so your agent never holds your key, and you only pay for what it actually does.
</p>

---

## How it works — three layers

```
┌─────────────────────────────────────────────────────────┐
│  USER DEVICE                                            │
│    Passkey (Touch ID / Face ID / hw key)                │
│      → WebAuthn PRF → HKDF → AES-256-GCM master key     │
│      → encrypts vault entries locally                   │
└────────────────┬────────────────────────────────────────┘
                 │ ciphertext only
                 ▼
┌─────────────────────────────────────────────────────────┐
│  CLOUDFLARE SYNC WORKER (zero-knowledge)                │
│    R2-backed vault store. Can't decrypt anything.       │
└────────────────┬────────────────────────────────────────┘
                 │ X-Upstream-API-Key header (per request)
                 ▼
┌─────────────────────────────────────────────────────────┐
│  RUST PROXY (stateless)                                 │
│    Injects key → calls upstream → discards key.         │
│    Logs usage to Postgres. Charges MPP stream on-chain. │
└────────────────┬────────────────────────────────────────┘
                 │ ed25519-signed settle ix
                 ▼
┌─────────────────────────────────────────────────────────┐
│  SOLANA PROGRAM (7 instructions on-chain)               │
│    MppOpen / Record / Settle / Close · pay_x402         │
│    Embedded agent wallets · permission CRL              │
└─────────────────────────────────────────────────────────┘
```

---

## Differentiator 1 — Zero-knowledge vault

```python
# 🔴 OLD WAY — key is in your code, your logs, your CI
import openai
client = openai.OpenAI(api_key="sk-proj-...")
```

```python
# 🟢 KEYSHIELD — key is in the vault, injected at request time
from keyshield_sdk import KeyShield
ks = KeyShield(token=os.environ["KS_TOKEN"])
client = ks.openai_client()   # same OpenAI SDK, zero raw keys
```

The agent only ever sees the session token. The real API key lives in
an **AES-256-GCM ciphertext encrypted on the user's device**, stored
on a Cloudflare Worker that cannot decrypt it.

---

## Differentiator 2 — Solana-native settlement

Every proxy call routes through an **on-chain MPP stream**:

| Instruction | What it does |
|---|---|
| `MppOpen` | Caller funds a stream-PDA-owned USDC ATA + sets rate-per-token |
| `MppRecord` | Proxy posts off-chain receipt after each settled batch |
| `MppSettle` | Settle settles N tokens of consumption, moves USDC on-chain |
| `MppClose` | Caller closes the stream, refund unused balance |
| `pay_x402` | Auto-pay HTTP 402 challenges from upstream (Helius, etc.) |

> **Live demo runs against Solana devnet.** Every call you make in the
> demo will produce a real on-chain `MppSettle` transaction you can
> open in Explorer.

---

## Differentiator 3 — Agent wallets, scoped + revocable

Each agent gets its own embedded Solana wallet with a permission bitmask:

| Bit | Permission | Use |
|---|---|---|
| `0x01` | `PAY_X402` | Sign x402 micropayment ix |
| `0x02` | `MPP_RECORD` | Post stream-record after each call |
| `0x04` | `PROXY_CALL` | Hit `/proxy/*` with vault key |
| `0x08` | `READ_VAULT` | Pull decrypted keys (rare; pre-approved) |

Three preset configs ship: `PAY_ONLY`, `PAY_AND_PROXY`, `ALL`.

**Revocation = one on-chain ix.** No DB row to update on three servers.

---

## Differentiator 4 — x402 auto-pay

Helius, Pyth, and a growing list of providers price-tag responses with
**HTTP 402 Payment Required** + a `accept-payment` envelope. KeyShield
implements both sides:

```
agent → proxy → upstream
  ←─ 402 + envelope (price, asset, pay_to)
proxy: PaymentInterceptor.pay(envelope)
  → on-chain USDC SPL transfer + return proof
agent → proxy → upstream + X-Payment-Proof
  ←─ 200 OK
```

User controls **which domains** can auto-pay and **per-domain caps** via the
X402 Trust dashboard. **No surprise micro-spend.**

---

## What's shipped (live, devnet-verified)

| Component | Status | Lines |
|---|---|---|
| Rust hot-path proxy (6 crates) | ✅ shipped | ~12,000 + 78 tests |
| Python control plane (FastAPI) | ✅ shipped | ~8,000 |
| Solana program (7 instructions) | ✅ shipped | ~3,500 + program tests |
| Cloudflare sync worker (R2) | ⚙️ shipped | ~2,000 |
| Web dashboard (React 19 + v2 vault UI) | ✅ shipped | ~6,000 |
| Chrome extension (MV3, auto-detect API keys) | ✅ shipped | ~1,500 |
| Python + TS + Rust SDKs | ✅ shipped | ~2,500 each |

Total: **~35k lines of working code + tests.**

---

## Live demo flow

1. `https://app.ks.aileena.xyz` → Connect Phantom → Sign
2. **Device Vault** → enroll passkey (Touch ID)
3. Paste an OpenAI key → encrypted client-side → ciphertext to R2
4. **Agents** → register "demo-bot" → mint embedded wallet → top up $5 USDC
5. Terminal: `python bot.py` → calls `/proxy/openai/v1/chat/completions`
6. Activity log: row appears with token count + on-chain tx
7. Solana Explorer: real `MppSettle` instruction with USDC moved

> **All keys you see are encrypted. Server only ever sees ciphertext.**

---

## Why we win

| | Vault.dev / 1Password | OpenAI usage caps | KeyShield |
|---|---|---|---|
| Server can decrypt | ✅ yes | n/a | **❌ never** |
| Per-call micropayments | ❌ | ❌ | **✅ on-chain** |
| Revocation latency | DB sync | OpenAI dashboard | **✅ 1 Solana ix** |
| Agent-native (ed25519 sig) | ❌ | ❌ | **✅ from day 0** |
| Multi-upstream proxy | ❌ | n/a | **✅ 8+ providers** |
| Self-hostable | enterprise only | ❌ | **✅ MIT licensed** |

---

## Roadmap — 90 days

**Now (hackathon ship):**
- ✅ Devnet end-to-end working
- ✅ Three SDKs (Python, TS, Rust)
- ✅ Chrome extension shipping

**Next 30 days:**
- 🎯 Mainnet launch on Solana
- 🎯 Embedded wallet UX polish (Phantom Embedded Wallets)
- 🎯 Provider catalog → 25+ upstreams

**Next 90 days:**
- 🎯 SDK in 5 languages
- 🎯 Enterprise audit trail (SOC2-ready)
- 🎯 Per-agent budget alerts via webhooks

---

## Team & links

<p class="lead">
Built solo in 14 days for Privacy Hack 2026.<br/>
~35,000 lines, 80+ tests, devnet-verified.
</p>

| | |
|---|---|
| **Live app** | https://app.ks.aileena.xyz |
| **Landing** | https://keyshield.dev |
| **Code** | github.com/lilaclilac09/keyshield |
| **Docs** | github.com/lilaclilac09/keyshield/blob/main/docs/API.md |
| **License** | MIT |

---

<!-- _paginate: false -->

# Thanks

<p class="lead">
Your agent never holds the key.<br/>
Your wallet sets the budget.<br/>
Solana settles the bill.
</p>

<p class="footer">Aileen · Privacy Hack 2026 · Colosseum</p>
