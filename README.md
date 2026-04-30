# KeyShield Agentic 🛡️

**Solana-native universal API-key + payment vault for humans and autonomous AI agents.**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-2026+-14f195.svg)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178c6.svg)](https://typescriptlang.org)

> **Status note (2026-04-30):** see [`ROADMAP.md`](ROADMAP.md) for the
> ground-truth feature inventory. The list below is the design vision;
> some pieces are shipped, others are designed-on-chain-but-not-wired,
> a few are README-only aspirations. Each bullet links to its actual
> status.

## Overview

KeyShield Agentic combines, in order of build-out:

- 🔐 **Encrypted vault** ([ROADMAP §1](ROADMAP.md)) — AES-256-GCM per-secret,
  passkey/passphrase-bound. Multi-type: API keys, passwords, notes, env
  files, ssh keys. **Shipped.**
- ⚡ **Hot-path Rust proxy** with key injection per request — auth → vault
  decrypt → upstream forward → cache. 78 tests, byte-parity with Python
  oracle. **Shipped.**
- 🔍 **Browser auto-detect** — Chrome content script detects 8 providers
  (OpenAI / Anthropic / Groq / Mistral / Cohere / Helius / 0x / Alchemy)
  via 12 regex patterns + domain-aware filtering. **Shipped.**
- 💳 **x402 micropayments** — HTTP 402 response shape works; on-chain
  verification of `payment_proof` is still a TODO at
  [`server.py:1067`](v2-mvp/src/server.py#L1067). **Half-built.**
- 💰 **Solana SOL/USDC top-up** — Pyth oracle pricing + memo binding +
  idempotent crediting. **Shipped.**
- 🪪 **Ephemeral signers / agent embedded wallets** — on-chain design
  in `programs/keyshield/` (struct + `CreateEphemeralSigner` instruction
  #23 + 8-slot capacity per AgentGrant). Server/UI not yet wrapping it.
  **Designed on-chain, unwired upstream.**
- 🌊 **MPP streaming payments** — `PaymentStream` PDA exists; no settler
  loop, no streaming UI. **Designed only.**
- 🤖 **OpenClaw skill** — `packages/agent-sdk/` exposes the SessionManager
  interface; `clawhub install` distribution is not published. **Local
  imports work; not on the registry.**

Designed for in the original pitch but **not yet built** (placeholders
in `packages/agent-sdk/src/{lit,bonsol,arcium}.ts`):

- 🧊 **Lit Protocol** threshold encryption — placeholder file
- 🔗 **Bonsol** ZK proofs — placeholder file
- 🔁 **Arcium** MPC — placeholder file
- 💼 **GOAT Wallet** "250+ onchain actions" — currently only
  priority-fee handler is implemented

If you read these bullets, then go to integrate against the listed
service, expect the unbuilt ones to be missing. PRs welcome.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           KeyShield Agentic                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   Human Wallet   │    │   AI Agent       │    │   x402 Service   │  │
│  │   (Owner)       │    │   (Operator)     │    │   (Provider)     │  │
│  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘  │
│           │                       │                       │             │
│           │  ┌───────────────────┼───────────────────────┘             │
│           │  │                   │                                     │
│           ▼  ▼                   ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Solana Program (Rust/Pinocchio)                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │  │
│  │  │ UniversalVault │  │ AgentGrant   │  │ PaymentStream         │ │  │
│  │  │ PDA            │  │ PDA          │  │ PDA                   │ │  │
│  │  └──────────────┘  └──────────────┘  └───────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│           │                       │                                     │
│           │  ┌───────────────────┼───────────────────────┐            │
│           │  │                   │                       │            │
│           ▼  ▼                   ▼                       ▼            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     Encryption Layer                               │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │  │
│  │  │ Lit Protocol │  │ Bonsol ZK   │  │ Arcium MPC              │ │  │
│  │  │ (Threshold)  │  │ (Proofs)    │  │ (Multi-party)           │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Features

### 1. Universal Key Vault — ✅ shipped
- One wallet → One vault → multiple secret types
- Slug prefixes: API key (no prefix), `pw__`, `note__`, `env__`, `ssh__`
- Per-secret AES-256-GCM with PBKDF2-HMAC-SHA256 (100k iters, fresh salt
  per secret). Passphrase or passkey-PRF binds the key.
- See `v2-mvp/src/vault.py` + `proxy-rs/specs/01-vault-format.md`.
- Policy-based time locks / rate limits — designed in
  `programs/keyshield/src/state.rs`, not yet wired to runtime.

### 2. Browser auto-detect content script — ✅ shipped
- 8 providers, 12 regex patterns, domain-aware confidence scoring (see
  [`frontend/content.js`](frontend/content.js))
- "Save to KeyShield" toast on detection → goes through `background.js`
  → backend `/manage/store`
- `requiresDomain` flag avoids false positives on tutorial blogs

### 3. Agentic features — ⚠️ partial
- ✅ Agent registration via on-chain `AgentGrant` PDA
  (`/agents/register|list|{id}`) + ed25519 self-auth flow
  (`/auth/agent-challenge|agent-login`)
- ⚠️ **Ephemeral signers / embedded wallets** — designed on-chain
  (`EphemeralSigner` 64-byte struct, `CreateEphemeralSigner` ix #23,
  up to 8 slots per AgentGrant); SDK type at
  `packages/agent-sdk/src/types.ts:95`. Server endpoint to wrap this
  flow + frontend UI to "give the agent a wallet, top it up" is the
  next pillar to build (see ROADMAP).
- 📋 Bonsol ZK proofs — placeholder file
- 📋 Arcium MPC — placeholder file
- ✅ Live monitoring dashboard (ActivitySection)

### 4. x402 + MPP payments — ⚠️ partial
- ✅ Per-request 402 response shape (Coinbase format) — see
  `server.py:_x402_body`
- 🔴 On-chain verification of `payment_proof` is TODO
  (`server.py:1067`). Currently any string ≤$10 credits without check.
- ✅ Solana SOL/USDC top-up flow (Pyth oracle + memo binding + idempotency)
- 📋 MPP streaming (PaymentStream PDA exists; settler loop + UI absent)
- See [`docs/PAYMENT-FLOWS.md`](docs/PAYMENT-FLOWS.md) for byte-level walks

### 5. OpenClaw Integration — ⚙️ local-only
- ✅ `packages/agent-sdk/` exposes `SessionManager` consumed by
  OpenClaw-style agents; works via local workspace import
- 📋 `clawhub install @keyshield/openclaw-skill` — package not published
  to clawhub registry yet

### 6. GOAT Wallet Plugin — ⚠️ scaffolded only
- ✅ Plugin shell + ephemeral key injection scaffold
- ⚠️ "250+ onchain actions" was the long-term claim; currently only
  priority-fee handler is implemented in `packages/goat-wallet/src/`
- 📋 CrossMint hybrid support — designed in README, not coded

## Quickstarts

> **First — get it running:** `bash scripts/dev.sh` (see
> [`DEVELOPMENT.md`](DEVELOPMENT.md)). One command launches Python:8001
> + Rust:8000 + Vite:5173.

### Quickstart 1: Human Autofill (Browser Extension) — ✅ works today

```bash
# Build the frontend (it doubles as the Chrome extension)
cd frontend
npm install
npm run build
```

```
Load unpacked in Chrome:
  1. chrome://extensions
  2. Enable Developer mode
  3. "Load unpacked" → select frontend/dist
```

```javascript
// The extension automatically:
// 1. Scans every page for API keys via frontend/content.js (8 providers)
// 2. Shows a toast with "Save to vault as <provider>"
// 3. Encrypts via the connected v2-mvp backend (AES-256-GCM with your
//    passphrase / passkey-PRF — not Lit Protocol; that's still on the
//    roadmap)
// 4. Stores under {VAULT_DIR}/{user_id}/{upstream}.enc
```

### Quickstart 2: Agent with OpenClaw — ⚙️ local imports only

> The `clawhub install` flow below assumes a published clawhub registry
> entry which **does not yet exist**. For now, import via local
> workspace.

```bash
# (designed flow — clawhub package not yet published)
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

### Quickstart 3: Streaming x402 Demo — 📋 designed, not yet built

> The streaming x402 / MPP code path is described in
> [`docs/PAYMENT-FLOWS.md`](docs/PAYMENT-FLOWS.md) but the server
> endpoints (`/billing/streams/open|close`) and on-chain settlement
> loop **don't exist yet**. The snippet below is the intended SDK
> shape once shipped.

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

### Quickstart 4: GOAT Wallet Example — ⚠️ scaffolded, limited actions

> The plugin shell + `createSigner` flow exists. Actually-useful action
> handlers are limited to priority-fee handling today. The "250+
> actions" claim from the original pitch is a long-term goal, not
> shipped.

```typescript
import { createGOATPlugin } from "@keyshield/goat-wallet";

const plugin = createGOATPlugin({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  programId: "KEYSHIELD_PROGRAM_ID",
  keyShieldProgramId: "KEYSHIELD_PROGRAM_ID",
  ownerPublicKey: "OWNER_WALLET",
  agentPublicKey: "AGENT_WALLET",
});

await plugin.initialize();

// Create ephemeral signer for swap
await plugin.createSigner({
  allowedActions: ["swap", "send"],
  expirySeconds: 300, // 5 minutes
});

// Sign transaction
const tx = new Transaction().add(/* instructions */);
const signature = await plugin.sendTransaction(tx);

console.log("Transaction sent:", signature);
```

## Security Model Comparison

> ✅ = shipped today. ⚠️ = designed but not all wired. 📋 = aspirational
> (file exists / placeholder, no working code).

| Feature | KeyShield | Coinbase Agentic | OpenClaw Vault-0 | Custodial |
|---------|-----------|------------------|-------------------|-----------|
| **Raw keys to agent** | ❌ Never | ❌ Never | ❌ Never | ✅ Yes |
| **ZK proofs** | 📋 Bonsol (placeholder) | ✅ Native | ✅ Custom | ❌ |
| **MPC** | 📋 Arcium (placeholder) | ❌ | ✅ Custom | ❌ |
| **Threshold encryption** | 📋 Lit (placeholder) | ❌ | ❌ | ❌ |
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

```bash
# Run Rust tests
cd programs/keyshield
cargo test

# Run TypeScript tests
npm test

# Run e2e demo
npm run demo
```

## Packages

| Package | Description | Version |
|---------|-------------|---------|
| `@keyshield/agent-sdk` | Main TypeScript SDK for agents | 2.0.0 |
| `@keyshield/openclaw-skill` | OpenClaw skill package | 2.0.0 |
| `@keyshield/goat-wallet` | GOAT Wallet plugin | 2.0.0 |
| `@keyshield/extension` | Browser extension | 2.0.0 |

## Configuration

### Environment Variables

```bash
# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com

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

---

## Development Notes

### Next.js 15 App Router SSR Configuration

This project uses Next.js 15.5.12 with App Router. When using client-side libraries (Solana wallet adapters, Clerk auth, Lit Protocol), special handling is required to avoid "window is not defined" errors during server-side rendering.

#### Root Cause
- In the App Router (`app/` directory), **layout.tsx** is a **Server Component** by default
- Server Components run on the server during SSR - there is no browser environment (`window`, `document`, `localStorage` don't exist)
- Third-party libraries like Solana wallet adapters, Clerk, and Lit Protocol often access `window` during module initialization

#### Solution: Split Layout Architecture

The layout is split into two files:

**1. Server Component** - `frontend/src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { ClientLayout } from './ClientLayout';

export const metadata: Metadata = {
  title: 'KeyShield API Vault',
  description: 'Enterprise-grade AI Agent API Key Vault + Zero-Trust Proxy Gateway',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ClientLayout>{children}</ClientLayout>;
}
```

**2. Client Component** - `frontend/src/app/ClientLayout.tsx`:
```tsx
'use client';

import { ClerkProvider } from '@clerk/clerk-react';
import { SolanaProvider } from '@/components/SolanaProvider';
import { useState, useEffect } from 'react';

const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 'pk_test_placeholder';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} ...>
      <SolanaProvider>
        {isMounted ? children : <Loading />}
      </SolanaProvider>
    </ClerkProvider>
  );
}
```

#### SolanaProvider Browser Guard

The SolanaProvider component must check for browser environment:

```tsx
// frontend/components/SolanaProvider.tsx
'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { UnsafeBurnerWalletAdapter } from '@solana/wallet-adapter-wallets';

export const SolanaProvider: React.FC<Props> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const wallets = useMemo(() => {
    if (typeof window === 'undefined') return [];  // Guard for SSR
    return [new UnsafeBurnerWalletAdapter()];
  }, [mounted]);

  if (!mounted) return <>{children}</>;
  
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
};
```

#### Environment Variables

All frontend environment variables must use the `NEXT_PUBLIC_` prefix:

```bash
# frontend/.env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_HELIUS_API_KEY=...
NEXT_PUBLIC_PROGRAM_ID=...
```

#### Dependency Fix: ethers

Lit Protocol requires `ethers` for SIWE authentication. Install it:

```bash
cd frontend
npm install ethers@6
```

#### Running the Frontend

```bash
cd frontend
npm run dev
```

The app will be available at http://localhost:3000

#### Clearing Cache (If Issues Persist)

If you encounter ChunkLoadError or stale cache issues:

```bash
rm -rf frontend/.next
npm run dev
```

Open the app in incognito mode to avoid browser cache conflicts.

---

## Development Notes

### Next.js 15 App Router SSR Configuration

This project uses Next.js 15.5.12 with App Router. When using client-side libraries (Solana wallet adapters, Clerk auth), special handling is required to avoid "window is not defined" errors during server-side rendering.

#### Key Fix: Split Layout Architecture

The layout is split into two files:

1. **`frontend/src/app/layout.tsx`** - Server Component that exports metadata
2. **`frontend/src/app/ClientLayout.tsx`** - Client Component that wraps providers

```tsx
// layout.tsx - Server Component
export const metadata: Metadata = { ... };
export default function RootLayout({ children }) {
  return <ClientLayout>{children}</ClientLayout>;
}
```

```tsx
// ClientLayout.tsx - Client Component with 'use client'
'use client';
export function ClientLayout({ children }) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  
  return (
    <ClerkProvider ...>
      <SolanaProvider>
        {isMounted ? children : <Loading />}
      </SolanaProvider>
    </ClerkProvider>
  );
}
```

#### Environment Variables

All frontend environment variables must use the `NEXT_PUBLIC_` prefix:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SOLANA_RPC_URL=...
NEXT_PUBLIC_HELIUS_API_KEY=...
```

#### Running the Frontend

```bash
cd frontend
npm run dev
```

The app will be available at http://localhost:3000
