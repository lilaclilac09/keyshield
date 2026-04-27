# KeyShield Agentic 🛡️

**The ultimate decentralized, Solana-native universal API-key + payment vault that serves BOTH humans and autonomous AI agents.**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-2026+-14f195.svg)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178c6.svg)](https://typescriptlang.org)

## Overview

KeyShield Agentic is a Solana-native API key vault that serves **both humans and autonomous AI agents**:

- 🔑 **Local-first vault** — API keys AES-256-GCM encrypted on device, **unlocked by Face ID / Touch ID / Windows Hello** (passkey / WebAuthn). Nothing sensitive ever touches the chain.
- 🕐 **2-hour session keys** — one grant per device, up to 32 concurrent, revoke one or all from the popup. Enforced on-chain by the `agent_grants` table.
- 🤖 **Agent-friendly** — SDK + GOAT Wallet plugin build the on-chain grant/revoke instructions; the agent signs with an ephemeral key that can't drain you
- ⚡ **Production-hardened Solana writes** — dynamic priority fees, `confirmed` commitment, shared Connection pool

> ### Project status
> This repo is under active development. **In scope and built today:** Solana program (Rust/Pinocchio) with session expiry + `revoke_all_agents`, `agent-sdk` SessionManager, `goat-wallet` priority-fee-aware send, V1 single-device popup (`extension/`), V1.1 cross-device sync popup (`extension-sync/`) with WebAuthn-PRF + 24-word recovery phrase + seed-bound server-side force-revoke, Cloudflare Workers sync backend (`infra/sync-worker/`), and a React Native skeleton (`mobile/`). **In scope, next:** mobile owner-wallet deep-link adapter, R2 lifecycle for orphaned PRF slots, per-vault rate limiting on `/auth/*` — see **[docs/technical/SYNC_VAULT_ARCHITECTURE.md](./docs/technical/SYNC_VAULT_ARCHITECTURE.md)** (current V1.1) and **[docs/technical/LOCAL_VAULT_ARCHITECTURE.md](./docs/technical/LOCAL_VAULT_ARCHITECTURE.md)** (legacy V1 single-device).
>
> **Not on the current roadmap:** Lit Protocol threshold encryption, Bonsol ZK proofs, Arcium MPC, x402 streaming payments. These were in an earlier iteration of the pitch but were displaced by the simpler local-first-vault + passkey direction. The SDK has stub classes for them so the old import graph still resolves; they're not being built out. The end-user surfaces today are the `extension-sync/` browser popup and the `mobile/` React Native skeleton.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Browser extension (device)                        │
│  ┌────────────────────┐  ┌────────────────────┐  ┌───────────────┐  │
│  │  Popup (React)     │  │  LocalVault        │  │  AuthService  │  │
│  │  unlock → CRUD     │──│  AES-256-GCM       │──│  Face ID /    │  │
│  │  session bar       │  │  chrome.storage    │  │  passkey      │  │
│  └────────┬───────────┘  └────────────────────┘  └───────────────┘  │
│           │                                                           │
│           ▼  buildGrantSessionTx / buildRevokeSessionTx / listActive  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │        packages/agent-sdk — SessionManager                      │  │
│  │        packages/goat-wallet — priority-fee send                 │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                               │                                       │
└───────────────────────────────┼───────────────────────────────────────┘
                                │  JSON-RPC (Helius / Triton / …)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                 Solana program (Rust / Pinocchio)                     │
│   UniversalVault PDA                                                  │
│   ├── agent_grants[32]    ← one slot per device, is_active + expiry   │
│   └── policy_rules[64]    ← domain allow/block, rate limits           │
│                                                                        │
│   ix 20 GrantAgentAccess · 21 Revoke · 22 Access · 24 RevokeAll       │
└──────────────────────────────────────────────────────────────────────┘
```

The Rust program also still contains a `payment_streams[8]` table and `grant_agent_payment_access` / `settle_payment` / `close_payment_stream` instructions — leftovers from the earlier pitch. They compile and got the Clock-sysvar fix, but **no active client code calls them**.

## Features (✅ built · 🧪 scaffolded · 💤 stub)

### ✅ Local-first vault (V1)
- AES-256-GCM encryption in `chrome.storage.local`, master key gated by Face ID / passkey
- Vault contents never leave the device; moving to a new device means re-importing keys
- Passkey itself syncs via iCloud Keychain / Google Password Manager (so you only register Face ID once)
- Lives in `extension/src/lib/vault.ts` + `auth.ts`, 23 unit tests

### ✅ Cross-device sync vault (V1.1, `extension-sync/`)
- WebAuthn PRF derives an HKDF-domain-separated AES-256-GCM key + a stable vault ID; cipher only ever leaves the device encrypted
- 24-word BIP-39 recovery phrase wrapped under the PRF (dual-write at PRF-id + seed-id) so a fresh device with the same passkey OR the phrase can decrypt
- Tombstone-merged conflict resolution surfaces a `ConflictDialog` per-key only when values actually diverge
- **Seed-bound server-side force-revoke**: a recovery-phrase-only user can drop every existing passkey registration via Ed25519 over a server-issued nonce — the lost device's next sync 404s
- Cloudflare Worker + R2 backend in `infra/sync-worker/`, runs in workerd-pool tests via `@cloudflare/vitest-pool-workers`
- 219 unit + integration tests across the popup, hook, lib, and worker

### ✅ Per-device session model
- One `agent_grant` per device, up to 32 concurrent on-chain
- Default 2-hour session with a "5 minutes until expiry" in-popup prompt
- `revoke_all_agents` instruction for "sign out everywhere"
- `SessionManager` in `packages/agent-sdk/src/session.ts` + 18 unit tests

### ✅ Production-hardened transactions
- `goat-wallet` auto-prepends `ComputeBudgetProgram.setComputeUnitPrice` using median recent priority fees — grant/revoke no longer sits unlanded on congested mainnet
- Explicit `commitment: 'confirmed'` shaves ~1-2 s off the default finality wait
- `Connection` is reusable across SDK + plugin instead of double-building the HTTP pool

### 🧪 Solana program (Rust / Pinocchio)
- `grant_agent_access`, `revoke_agent_access`, `revoke_all_agents`, `access_with_agent`, payment-stream ix all implemented
- Mollusk integration tests for `revoke_all_agents` (success / empty / wrong-owner)
- P0 timestamp-is-hardcoded-0 bug is fixed: session expiry now actually fires on-chain
- TODO: Bonsol / Arcium verifiers are stubs; `allowed_endpoints` / `allowed_models` scope not yet wired into `grant` ix

### 🧪 Popup UI scaffold
- `extension/src/popup/` — React 18 + Tailwind, state machine covers `checking → firstRun → locked → unlocked`
- Unlock screen (register-or-authenticate), vault CRUD list, live session countdown bar with renew / revoke-all
- Needs a Vite build step and an owner-wallet adapter (Phantom / Backpack / OKX) to actually run — the `plasmoid` build tooling referenced previously was never published to npm

### 💤 Stubbed, not on the roadmap
Earlier iterations of the pitch included Lit Protocol threshold decryption, Bonsol ZK proofs, Arcium MPC ephemeral signer creation, and real x402 streaming-payment settlement. The V1 local-first-vault + passkey direction replaces them for the foreseeable future.

The SDK still carries stub classes for `LitProtocol`, `BonsolVerifier`, `ArciumMPC`, `X402Client`, and `KeyShieldClient` so the old import graph resolves, but calling into them throws. The on-chain payment-stream instructions are left in place but unexercised — removing or wiring them is a separate deliberate decision, not a "later" one.

### OKX / Phantom / Solflare wallet support
Owner-wallet connection in the popup uses the Solana Wallet Standard via `extension-sync/src/popup/hooks/useOwnerWallet.ts`. SDK-side, any standard Solana wallet adapter can sign the `grant` / `revoke` transactions the SessionManager builds.

## Two extension implementations: V1 vs Path A

The repo ships **two parallel browser-extension workspaces**. They share the V1 lib code path and on-chain SessionManager but diverge on how the API-key vault itself is stored. Pick the one whose UX matches your product target.

| | **V1 — `extension/`** | **Path A — `extension-sync/`** |
|---|---|---|
| Master key | Generated locally, stored in `chrome.storage.local`, gated by Face ID | **HKDF-derived from WebAuthn PRF**, never persisted |
| Vault ciphertext | `chrome.storage.local` only | **Cloudflare R2** (via `infra/sync-worker`) + local cache |
| Cross-device | Passkey login syncs, vault doesn't — re-import on every device | **Vault auto-follows** any device with the synced passkey |
| Browser floor | Any WebAuthn-capable browser | **Safari 17+ / Chrome 116+ / Firefox 119+** (PRF required) |
| Server dependency | None | One Cloudflare Worker + 2 R2 buckets |
| Conflict resolution | Last-write-wins, no UX | **`ConflictDialog`** with per-key merge |
| Lines of code (lib + popup) | ~750 | ~1,400 |
| When to ship | You can't / won't run any backend | You want iCloud-Keychain UX |

Architecture docs:
- V1 → [docs/technical/LOCAL_VAULT_ARCHITECTURE.md](./docs/technical/LOCAL_VAULT_ARCHITECTURE.md)
- Path A → [docs/technical/SYNC_VAULT_ARCHITECTURE.md](./docs/technical/SYNC_VAULT_ARCHITECTURE.md)

To run Path A locally:

```bash
# Terminal 1: sync worker (Cloudflare R2 in Miniflare)
cd infra/sync-worker
npx wrangler dev                        # http://localhost:8787

# Terminal 2: popup (Vite SPA)
cd extension-sync
VITE_KEYSHIELD_SYNC_URL=http://localhost:8787 npx vite dev
```

## Quickstarts

### Quickstart 0: Run what's already green (no Solana toolchain required)

```bash
# Clone + install the TS workspace
git clone https://github.com/lilaclilac09/keyshield.git
cd keyshield
npm install

# Run the TS test suite (68 vitest tests across agent-sdk / goat-wallet / extension)
npm test

# Strict-mode tsc on all three packages
npm run typecheck

# Rust program build + lib tests
cargo check -p keyshield --tests
cargo test -p keyshield --lib
```

To run the Mollusk integration tests you need the Solana CLI installed
(`sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`), then:

```bash
cargo build-sbf
SBF_OUT_DIR=target/deploy cargo test -p keyshield
```

### Quickstart 1: Grant + revoke a session from a script

```typescript
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { SessionManager } from '@keyshield/agent-sdk';

const connection = new Connection(process.env.SOLANA_RPC_URL!);  // Helius etc.
const owner = Keypair.generate();                                 // or load from file / wallet
const manager = new SessionManager({
  connection,
  programId: new PublicKey(process.env.KEYSHIELD_PROGRAM_ID!),
  ownerPubkey: owner.publicKey,
});

// One device = one ephemeral agent keypair:
const device = Keypair.generate();

// Grant a 2-hour session on-chain:
const grantTx = manager.buildGrantSessionTx({ agentPubkey: device.publicKey });
await sendAndConfirmTransaction(connection, grantTx, [owner]);

// List everything that's active right now:
console.log(await manager.listActiveSessions());

// Nuclear option — revoke every device:
const revokeAllTx = manager.buildRevokeAllSessionsTx();
await sendAndConfirmTransaction(connection, revokeAllTx, [owner]);
```

### Quickstart 2: Agent with OpenClaw

> **Status:** Illustrative — `@keyshield/openclaw-skill` is a stub. `getApiKey` routes into the Lit-decryption stub which throws. Lit integration is **not on the roadmap**; this example is kept as a reference of what the API would look like if the older design is ever revived.

```bash
# Install the skill
clawhub install github:lilaclilac09/keyshield-openclaw-skill
```

```typescript
import { KeyShieldSkill } from "@keyshield/openclaw-skill";

// Initialize skill
const skill = new KeyShieldSkill({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  programId: "KEYSHIELD_PROGRAM_ID",
  ownerPublicKey: "OWNER_WALLET_ADDRESS",
  agentPublicKey: "AGENT_WALLET_ADDRESS",
});

await skill.registerAgent();

// Get API key
const openaiKey = await skill.getApiKey("openai");

// Use with OpenAI
const response = await openai.completions.create({
  model: "gpt-4",
  prompt: "Hello",
  api_key: openaiKey, // Injected securely
});
```

### Quickstart 3: Streaming x402 Demo

> **Status:** Illustrative — `startStreamingPayment` hits the `KeyShieldClient` stub and throws. The on-chain payment-stream instructions are present but unexercised; **wiring x402 is not on the current roadmap**. Kept for reference only.

```typescript
import { KeyShieldAgent } from "@keyshield/agent-sdk";

const agent = await createKeyShieldAgent({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  programId: "KEYSHIELD_PROGRAM_ID",
  ownerPublicKey: "OWNER_WALLET",
  agentPublicKey: "AGENT_WALLET",
});

// Start streaming payment for Claude API
const stream = await agent.startStreamingPayment("https://api.anthropic.com/v1", {
  maxRateUsdPerMin: 1.00,
  unit: "per_token",
});

// In your agent loop
const response = await anthropic.messages.create({
  model: "claude-3-opus",
  messages: [{ role: "user", content: "Hello" }],
});

// Record token usage
await stream.recordUsage(response.usage.input_tokens + response.usage.output_tokens);

// Auto-settles every 60 seconds
// Or manually:
await stream.settle();

// Close when done
await stream.close();
```

### Quickstart 4: GOAT Wallet Plugin

> **Status:** `sendTransaction` is real and includes the dynamic priority-fee path described in the Features section. `createSigner` still goes through the Arcium MPC stub — in tests it returns a locally-generated keypair so the flow is end-to-end runnable.

```typescript
import { Connection, Transaction } from '@solana/web3.js';
import { KeyShieldGOATPlugin } from '@keyshield/goat-wallet';

const connection = new Connection(process.env.SOLANA_RPC_URL!);
const plugin = new KeyShieldGOATPlugin({
  connection,                // reuse the Connection across the app
  programId: 'KEYSHIELD_PROGRAM_ID',
  keyShieldProgramId: 'KEYSHIELD_PROGRAM_ID',
  ownerPublicKey: 'OWNER_WALLET',
  agentPublicKey: 'AGENT_WALLET',
});

await plugin.initialize();
await plugin.createSigner({ allowedActions: ['swap', 'send'], expirySeconds: 300 });

const tx = new Transaction().add(/* your instructions */);
const signature = await plugin.sendTransaction(tx);
// ^ auto-prepends setComputeUnitPrice using median recent fees,
//   confirms at 'confirmed' commitment
console.log('Transaction sent:', signature);
```

## Security Model Comparison

| Feature | KeyShield | Coinbase Agentic | OpenClaw Vault-0 | Custodial |
|---------|-----------|------------------|-------------------|-----------|
| **Raw keys to agent** | ❌ Never | ❌ Never | ❌ Never | ✅ Yes |
| **ZK proofs** | ✅ Bonsol | ✅ Native | ✅ Custom | ❌ |
| **MPC** | ✅ Arcium | ❌ | ✅ Custom | ❌ |
| **Threshold encryption** | ✅ Lit | ❌ | ❌ | ❌ |
| **Human override** | ✅ Revocable | ✅ Revocable | ✅ Revocable | ❌ |
| **Rate limiting** | ✅ On-chain | ✅ On-chain | ✅ Policy | ❌ |
| **Spend caps** | ✅ Per-session | ✅ Per-session | ✅ Policy | ❌ |
| **OpenClaw skill** | ✅ Native | ❌ | ✅ Native | ❌ |
| **GOAT compatible** | ✅ Plugin | ❌ | ❌ | ❌ |
| **x402 payments** | ✅ Streaming | ❌ | ❌ | ✅ |
| **Decentralized** | ✅ 100% | ⚠️ Hybrid | ✅ 100% | ❌ |

### Key Security Guarantees

1. **Zero Knowledge**: Agents prove authorization without revealing keys
2. **Threshold Decryption**: No single party can decrypt alone
3. **Ephemeral Keys**: Signers expire and are zeroed
4. **Policy Enforcement**: On-chain policy checks
5. **Revocable**: Human can revoke at any time

## Deployment

### Local Solana Validator

```bash
# Start local validator
solana-test-validator

# Build Rust program
cd programs/keyshield
cargo build-bpf

# Deploy
solana program deploy target/deploy/keyshield.so --url localhost
```

### OpenClaw Test Agent

```bash
# Install OpenClaw
npm install -g @openclaw/cli

# Setup test agent
clawhub init test-agent

# Add KeyShield skill
cd test-agent
clawhub install @keyshield/openclaw-skill

# Run agent with KeyShield
clawhub run --skill keyshield --test-mode
```

### Run Tests

| Suite | Command | Status |
|---|---|---|
| TypeScript unit (5 workspaces) | `npm test` | **246 / 246 passing** |
| TypeScript strict typecheck | `npm run typecheck` | clean |
| Rust program check | `cargo check -p keyshield --tests` | clean |
| Rust program lib tests | `cargo test -p keyshield --lib` | 1 / 1 passing |
| Rust Mollusk integration | `cargo build-sbf && cargo test -p keyshield` | 13 / 13 (needs Solana CLI) |
| End-to-end demo | `npm run demo` | needs deployed program + funded wallet |

TypeScript breakdown:

```
@keyshield/agent-sdk         24 tests  (session lifecycle, client construction, smoke)
@keyshield/goat-wallet        6 tests  (dynamic priority fee math + edge cases)
@keyshield/extension         57 tests  (V1 — auth / vault / session libs + popup UI)
@keyshield/extension-sync   119 tests  (Path A — PRF + sync + conflict + UpgradeScreen)
@keyshield/sync-worker       40 tests  (Cloudflare Worker routes against real workerd)
```

The sync-worker tests run inside a real Cloudflare workerd via
`@cloudflare/vitest-pool-workers`, so the R2 binding behaves exactly
like production.

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| `@keyshield/agent-sdk` | Main TypeScript SDK for agents | 2.0.0 |
| `@keyshield/openclaw-skill` | OpenClaw skill package | 2.0.0 |
| `@keyshield/goat-wallet` | GOAT Wallet plugin | 2.0.0 |
| `@keyshield/extension` | Browser extension — V1 (local vault) | 2.0.0 |
| `@keyshield/extension-sync` | Browser extension — Path A (PRF + sync) | 0.1.0 |
| `@keyshield/sync-worker` | Cloudflare Worker for Path A vault sync | 0.1.0 |

## Configuration

### RPC Provider Requirement

> **KeyShield will not perform well on the public `mainnet-beta` endpoint.**

The public Solana RPC (`https://api.mainnet-beta.solana.com`) is heavily rate-limited and is explicitly not supported for production use. Under even modest load you will see HTTP 429s mid-pagination and `grant` / `revoke` transactions that sit unlanded for minutes.

Use one of:

| Provider | URL shape | Notes |
|---|---|---|
| [Helius](https://www.helius.dev/) | `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY` | Recommended for production. Has a WebSocket endpoint for `accountSubscribe`, stake-weighted QoS, and a priority-fee API. |
| [Triton](https://triton.one/) | `https://<your-endpoint>.rpcpool.com/...` | Dedicated nodes, low latency. |
| [QuickNode](https://www.quicknode.com/chains/sol) | `https://<your-endpoint>.solana-mainnet.quiknode.pro/...` | Easy to provision. |
| [FluxRPC](https://fluxrpc.com/docs/rpc) | `https://solana-mainnet.fluxrpc.com/...` | Budget-friendly. Benchmark p99 latency on `getAccountInfo` and `sendTransaction` (incl. priority fees) against your own workload before promoting it past staging. |
| Self-hosted validator | `http://your-validator:8899` | For teams with infra. |

The SDK supports **`Connection` reuse** — instead of constructing a new `Connection` per component, build one and share it:

```typescript
import { Connection } from '@solana/web3.js';
import { KeyShieldAgent } from '@keyshield/agent-sdk';
import { KeyShieldGOATPlugin } from '@keyshield/goat-wallet';

const connection = new Connection(process.env.SOLANA_RPC_URL!);

const agent  = new KeyShieldAgent({ connection, programId: '...' });
const plugin = new KeyShieldGOATPlugin({
  connection,  // reuse the same instance
  programId: '...',
  keyShieldProgramId: '...',
  ownerPublicKey: '...',
  agentPublicKey: '...',
});
```

Reusing the Connection keeps the underlying HTTP keep-alive pool warm, avoids double-handshake on WebSocket subscriptions, and is friendlier to your RPC quota.

### Environment Variables

```bash
# Solana — replace with a fast private RPC in production; see above.
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY
SOLANA_WS_URL=wss://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_API_KEY

# KeyShield Program
KEYSHIELD_PROGRAM_ID=...

# Lit Protocol
LIT_NETWORK=datil-dev
LIT_CHAIN=solana

# Bonsol
BONSOL_API_URL=https://api.bonsol.xyz
BONSOL_NETWORK=mainnet

# Arcium
ARCIUM_CLUSTER=mainnet
```

### Policy YAML Format

```yaml
# Example policy
name: my-agent
version: 1

rateLimit:
  callsPerHour: 1000
  tokensPerMin: 10000

maxSpend: 1000000  # $1.00 in micro-USDC

allowedDomains:
  - api.openai.com
  - api.anthropic.com

blockedDomains:
  - malicious.io

allowedTools:
  - getApiKey
  - startStreamingPayment

session:
  timeoutSeconds: 3600
  requireReauth: false

payments:
  streamingEnabled: true
  settlementIntervalSeconds: 60
```

## API Reference

### Agent SDK

- [`KeyShieldAgent`](packages/agent-sdk/src/index.ts) - Main agent class
- [`StreamingPaymentSession`](packages/agent-sdk/src/index.ts) - Streaming payments
- [`EphemeralSignerSession`](packages/agent-sdk/src/index.ts) - Temporary signers

### OpenClaw Skill

- [`KeyShieldSkill`](packages/openclaw-skill/src/index.ts) - OpenClaw skill implementation
- [`createSkill()`](packages/openclaw-skill/src/index.ts) - Factory function

### GOAT Plugin

- [`KeyShieldGOATPlugin`](packages/goat-wallet/src/index.ts) - GOAT interface
- [`createGOATPlugin()`](packages/goat-wallet/src/index.ts) - Factory function
- [`CrossMintKeyShieldWallet`](packages/goat-wallet/src/index.ts) - CrossMint hybrid

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) first.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Solana Foundation](https://solana.org)
- [Lit Protocol](https://litprotocol.com)
- [Bonsol](https://bonsol.xyz)
- [Arcium](https://arcium.com)
- [OpenClaw](https://openclaw.xyz)
- [GOAT SDK](https://goat-sdk.xyz)
- [CrossMint](https://crossmint.com)

