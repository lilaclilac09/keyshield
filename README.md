# KeyShield Agentic 🛡️

**The ultimate decentralized, Solana-native universal API-key + payment vault that serves BOTH humans and autonomous AI agents.**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-2026+-14f195.svg)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178c6.svg)](https://typescriptlang.org)

## Overview

KeyShield Agentic is a next-generation API key management system built on Solana that combines:

- 🔐 **Zero-trust security** via Lit Protocol threshold encryption
- 🧊 **ZK proofs** via Bonsol for privacy-preserving authorization
- 🔗 **MPC** via Arcium for secure agent-to-agent communication
- 💳 **x402 payments** for per-request and streaming micropayments
- 🤖 **OpenClaw compatibility** for AI agent integration
- 💰 **GOAT Wallet** plugin for 250+ onchain actions

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

### 1. Universal Key Vault
- One wallet → One vault → Unlimited key groups
- Groups: `openai`, `anthropic`, `stripe`, `payment-usdc`, `universal`
- Policy-based access control with time locks and rate limits

### 2. Browser Extension
- Auto-detect 100+ API key patterns
- Auto-save with Lit-encrypted storage
- One-click autofill
- x402 payment handling

### 3. Agentic Features
- Bonsol ZK proofs for authorization
- Arcium MPC for secure sharing
- Ephemeral signers (Vault-0 style)
- Live monitoring dashboard

### 4. x402 Payments
- Per-request micropayments
- Streaming/batched usage-based payments
- Automatic settlement intervals

### 5. OpenClaw Integration
- Install via `clawhub install @keyshield/openclaw-skill`
- Full skill interface implementation
- Policy YAML engine

### 6. GOAT Wallet Plugin
- 250+ onchain actions
- CrossMint hybrid support
- Ephemeral key injection

## Quickstarts

### Quickstart 1: Human Autofill (Browser Extension)

```bash
# Install the extension
cd extension
npm install
npm run build

# Load unpacked extension in Chrome
# 1. Go to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select the dist folder
```

```typescript
// The extension automatically:
// 1. Detects API key fields on any page
// 2. Shows "Save to KeyShield" prompt
// 3. Encrypts with Lit Protocol
// 4. Stores in IndexedDB + on-chain
```

### Quickstart 2: Agent with OpenClaw

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

### Quickstart 4: GOAT Wallet Example

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

### RPC Provider Requirement

> **KeyShield will not perform well on the public `mainnet-beta` endpoint.**

The public Solana RPC (`https://api.mainnet-beta.solana.com`) is heavily rate-limited and is explicitly not supported for production use. Under even modest load you will see HTTP 429s mid-pagination and `grant` / `revoke` transactions that sit unlanded for minutes.

Use one of:

| Provider | URL shape | Notes |
|---|---|---|
| [Helius](https://www.helius.dev/) | `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY` | Recommended. Has a WebSocket endpoint for `accountSubscribe`. |
| [Triton](https://triton.one/) | `https://<your-endpoint>.rpcpool.com/...` | Dedicated nodes, low latency. |
| [QuickNode](https://www.quicknode.com/chains/sol) | `https://<your-endpoint>.solana-mainnet.quiknode.pro/...` | Easy to provision. |
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
