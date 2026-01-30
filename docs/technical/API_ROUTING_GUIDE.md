# API Routing Guide

**Confidential Proxy for Agent-to-API Calls**

This guide describes the API routing bridge: a proxy endpoint that decrypts API keys on-demand (via Lit), calls external APIs (OpenAI, Helius, etc.), and returns encrypted responses so agents never hold plaintext keys.

---

## 1. Problem

- External APIs (OpenAI, Helius, AWS) require keys in headers or query params.
- Agents should not store plaintext API keys.
- Keys are in KeyShield vaults (Lit-encrypted; hash on-chain; ciphertext in IndexedDB).

---

## 2. Solution

A **proxy endpoint** (e.g. `POST /api/proxy`) that:

1. Accepts encrypted intent + vault hash + wallet signature.
2. Verifies wallet signature (authorization).
3. Decrypts API key from vault using Lit (conditional decrypt).
4. Routes the request to the target API with the decrypted key.
5. Returns the API response (optionally encrypted for the agent).

```mermaid
flowchart LR
  Agent[AI Agent] -->|Encrypted Intent| Proxy[/api/proxy]
  Proxy -->|Decrypt with Lit| Lit[Lit Protocol]
  Lit -->|API Key| Proxy
  Proxy -->|Real Call| API[OpenAI / Helius]
  API -->|Response| Proxy
  Proxy -->|Encrypt Response| Agent
```

---

## 3. Architecture

| Step | Action |
|------|--------|
| 1 | Agent sends `{ encryptedIntent, vaultHash, walletSignature, targetAPI }` to proxy. |
| 2 | Proxy verifies `walletSignature` (e.g. SIWS or message signature). |
| 3 | Proxy loads ciphertext from storage (IndexedDB or server-side cache keyed by vault hash). |
| 4 | Proxy calls Lit to decrypt with session signatures (wallet proof). |
| 5 | Proxy calls target API (OpenAI, Helius, etc.) with decrypted key. |
| 6 | Proxy returns response; optionally encrypts for agent. |

**Note**: Ciphertext is today stored in the browser (IndexedDB). For a server-side proxy you either (a) pass ciphertext in the request (encrypted for server), or (b) add a server-side ciphertext store keyed by vault hash and populated when user stores a key. The code below assumes (a) or a future server-side store.

---

## 4. Implementation (Conceptual)

### 4.1 Route Handler (Next.js App Router)

```typescript
// frontend/app/api/proxy/route.ts (conceptual — new file)
import { NextRequest, NextResponse } from 'next/server';
import { decryptWithLit } from '@/lib/lit-protocol';
import { verifyWalletSignature } from '@/lib/auth';

export async function POST(req: NextRequest) {
  let body: {
    encryptedIntent: string;
    vaultHash: string;
    walletSignature: string;
    targetAPI: 'openai' | 'helius' | 'generic';
    ciphertextBase64?: string; // Optional: if client sends ciphertext for server-side decrypt
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { encryptedIntent, vaultHash, walletSignature, targetAPI } = body;

  // 1. Verify wallet signature (prevent unauthorized proxy use)
  const wallet = await verifyWalletSignature(walletSignature);
  if (!wallet) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 2. Decrypt API key from vault (Lit Protocol conditional decrypt)
  // If ciphertext is sent in body, decode and use; else fetch from server store by vaultHash
  const hashBytes = Buffer.from(vaultHash, 'base64');
  const apiKey = await decryptWithLit(hashBytes, wallet);
  if (!apiKey) {
    return NextResponse.json({ error: 'Decryption failed or access denied' }, { status: 403 });
  }

  // 3. Decrypt agent's intent (e.g. "call OpenAI with prompt X")
  let intent: { payload: unknown };
  try {
    intent = JSON.parse(decryptIntent(encryptedIntent, wallet));
  } catch {
    return NextResponse.json({ error: 'Invalid intent' }, { status: 400 });
  }

  // 4. Route to real API based on targetAPI
  let response: Response;
  if (targetAPI === 'openai') {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(intent.payload),
    });
  } else if (targetAPI === 'helius') {
    response = await fetch(
      `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intent.payload),
      }
    );
  } else {
    return NextResponse.json({ error: 'Unsupported targetAPI' }, { status: 400 });
  }

  const data = await response.json().catch(() => ({}));

  // 5. Optionally encrypt response for agent
  const encryptedResponse = await encryptForAgent(JSON.stringify(data), wallet);

  return NextResponse.json({
    encryptedResponse,
    status: response.status,
  });
}

function decryptIntent(encrypted: string, wallet: any): string {
  // Implement: decrypt with wallet or shared key
  return encrypted; // Placeholder
}

async function encryptForAgent(data: string, wallet: any): Promise<string> {
  // Implement: encrypt response for agent (e.g. Lit or symmetric)
  return data; // Placeholder: return as-is or encrypted
}
```

### 4.2 Wallet Signature Verification (Conceptual)

```typescript
// frontend/lib/auth.ts (conceptual)
export async function verifyWalletSignature(walletSignature: string): Promise<any | null> {
  // Parse signature payload: { message, signature, publicKey }
  const payload = JSON.parse(Buffer.from(walletSignature, 'base64').toString());
  const { message, signature, publicKey } = payload;
  // Verify Solana message signature
  const keypair = await getWalletFromPublicKey(publicKey);
  const valid = verifyMessage(message, signature, publicKey);
  return valid ? keypair : null;
}
```

---

## 5. Client-Side: Agent Calls Proxy

```typescript
// Agent or frontend calling the proxy
async function callProxy(params: {
  encryptedIntent: string;
  vaultHash: string;
  walletSignature: string;
  targetAPI: 'openai' | 'helius';
}) {
  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await res.text());
  const { encryptedResponse, status } = await res.json();
  const decrypted = await decryptResponse(encryptedResponse); // Agent's decrypt
  return { data: decrypted, status };
}
```

---

## 6. Security Considerations

| Concern | Mitigation |
|--------|------------|
| **Key on server** | Decrypt in memory only; never log or persist plaintext key. |
| **Replay** | Include nonce/timestamp in signed message; reject expired. |
| **Rate limiting** | Apply rate limits per wallet or IP. |
| **CORS** | Restrict origin to your app/extension. |
| **Audit** | Optionally log proxy calls (without keys) on-chain or to audit log. |

---

## 7. Supported Targets (Extensible)

| targetAPI | Description |
|-----------|-------------|
| `openai` | POST to OpenAI chat/completions with Bearer key. |
| `helius` | POST to Helius RPC with api-key query param. |
| `generic` | Forward to configurable URL with header/query key (implement as needed). |

Add more branches in the route handler for additional APIs.

---

## 8. Benefits

- **Reusable**: Single endpoint for all agent-to-API calls.
- **Confidential**: Keys never leave the proxy as plaintext in responses.
- **Auditable**: Log metadata (wallet, targetAPI, timestamp) without keys.
- **Agent-friendly**: Agents send encrypted intent and get encrypted response; no key handling.

---

## 9. Relevant Files

| File | Role |
|------|------|
| `frontend/app/api/proxy/route.ts` | Proxy route (create when using Next.js App Router). |
| `frontend/lib/lit-protocol.ts` | `decryptWithLit` for key decryption. |
| `frontend/lib/auth.ts` | Wallet signature verification. |
| [MPC_COORDINATION_GUIDE.md](MPC_COORDINATION_GUIDE.md) | Optional: use MPC result for proxy instead of direct Lit. |

---

## 10. Summary

- **Problem**: Agents need to call APIs that require API keys; agents must not store keys.
- **Solution**: Proxy verifies wallet, decrypts key with Lit, calls API, returns (optionally encrypted) response.
- **Implementation**: Next.js API route, Lit decrypt, and target-specific fetch; extend with more APIs and optional encryption of response.

---

*KeyShield API routing bridge: confidential agent-to-API calls without exposing keys to agents.*
