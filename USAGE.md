# KeyShield — How to Use Everything

> Zero-knowledge API key vault. Your keys are encrypted on-device before they ever leave your machine. The server stores only ciphertext.

---

## Table of Contents

1. [What KeyShield Does](#1-what-keyshield-does)
2. [Architecture](#2-architecture)
3. [Getting Started — Run the Stack](#3-getting-started)
4. [The Web Dashboard](#4-the-web-dashboard)
5. [Auth — Wallet Login](#5-auth--wallet-login)
6. [Auth — Passkey Login](#6-auth--passkey-login)
7. [The Vault — Store and Use Keys](#7-the-vault)
8. [The Proxy — Zero-Trust API Calls](#8-the-proxy)
9. [CLI — keyshield-cli.sh](#9-cli)
10. [Python SDK](#10-python-sdk)
11. [TypeScript SDK](#11-typescript-sdk)
12. [Batch Requests](#12-batch-requests)
13. [Helius RPC Skills](#13-helius-rpc-skills)
14. [Passkey Management (WebAuthn)](#14-passkey-management)
15. [Sessions Panel](#15-sessions-panel)
16. [Developer Panel](#16-developer-panel)
17. [Encryption Verified](#17-encryption-verified)
18. [API Reference](#18-api-reference)
19. [Supported Upstreams](#19-supported-upstreams)

---

## 1. What KeyShield Does

You have API keys for OpenAI, Anthropic, Helius, etc.

The problem: you paste them into `.env` files, GitHub repos leak them, agents see them raw, teammates share them in Slack.

KeyShield fixes this:

1. **You encrypt your key** with your passphrase on your device (AES-256-GCM).
2. **The server stores only the encrypted blob** — it has no idea what your key is.
3. **Agents call the proxy URL** instead of the real API. The server decrypts at request time using the session passphrase baked into the token.
4. **Your raw key never appears in agent code, logs, or network traffic.**

---

## 2. Architecture

```
Your Browser / Agent
        │
        │  POST /proxy/openai/v1/chat/completions
        │  Authorization: Bearer <session_token>
        ▼
  ┌──────────────────────────────────────┐
  │  KeyShield Server (FastAPI :8000)    │
  │                                       │
  │  1. Validate Bearer token            │
  │  2. Decrypt vault key (AES-256-GCM)  │
  │  3. Inject key into upstream request │
  │  4. Forward to OpenAI                │
  └──────────────────────────────────────┘
        │
        ▼
   api.openai.com
```

**Encryption scheme:**
```
key = PBKDF2-HMAC-SHA256(passphrase, random_salt, 100_000_iterations)
ciphertext = AES-256-GCM(key, random_nonce, your_api_key)
stored_file = [16B salt] + [12B nonce] + [ciphertext + 16B GCM tag]
```

The passphrase is never stored. It lives in the session token (encrypted with a server secret) and is extracted at proxy time.

---

## 3. Getting Started

### Prerequisites

```bash
# Python 3.11+
python3 --version

# Node.js 18+
node --version
```

### Step 1 — Start the backend

```bash
cd keyshield/v2-mvp

# Create virtual env and install deps
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Start server
uvicorn src.server:app --port 8000 --reload
```

Verify it works:
```bash
curl http://localhost:8000/health
# {"status":"ok","version":"2.0"}
```

### Step 2 — Start the frontend

```bash
cd keyshield/frontend
npm install
npm run dev
# Opens on http://localhost:3001
```

---

## 4. The Web Dashboard

Open `http://localhost:3001` in your browser.

You'll see the auth screen with two options:

| Option | When to use |
|--------|-------------|
| **Wallet** | First time, or if you have Phantom/Solflare installed |
| **Passkey** | After you've registered a passkey (Face ID / Touch ID) |

### Sidebar sections

| Section | What it does |
|---------|-------------|
| **Vault** | See and manage your encrypted API keys |
| **Activity** | Audit log of reads, writes, proxy calls |
| **Agents** | AI agents with scoped access (coming soon) |
| **Sharing** | Share keys with teammates via wallet (coming soon) |
| **Sessions** | View current token, revoke access |
| **Settings** | Register/remove passkeys, wallet info |
| **Developer** | Copy your token, CLI commands, SDK snippets |

---

## 5. Auth — Wallet Login

This is the primary login method. It proves you own your Solana wallet by signing a challenge with your private key.

### How it works

```
Browser                          Server
  │                                │
  │  GET /auth/wallet-challenge    │
  │ ──────────────────────────────►│
  │  ◄── {challenge, nonce}        │
  │                                │
  │  wallet.signMessage(challenge) │  (Phantom pop-up)
  │                                │
  │  POST /auth/wallet-login       │
  │  {walletAddress, signature,    │
  │   challenge, passphrase}       │
  │ ──────────────────────────────►│
  │                                │  verify ed25519 sig
  │                                │  consume nonce (replay protection)
  │                                │  create session token
  │  ◄── {token, userId}           │
  │                                │
  │  localStorage.ks_token = token │
```

### Steps in the UI

1. Click **Connect Wallet**
2. Select your wallet (Phantom, Solflare, or Burner for dev)
3. Approve the signature request in your wallet
4. Enter your **vault passphrase** — this is NOT your wallet password. It's a separate password only you know that encrypts your keys.
5. Click **Unlock Vault**

> The passphrase is never sent to the server in plaintext. It's baked into the session token (server-side AES-GCM), then extracted at proxy time to decrypt your keys.

### Dev bypass (development only)

On the login screen there's a "Skip wallet" button. It sets a hardcoded `dev-bypass` token that the server accepts. Remove this before production.

---

## 6. Auth — Passkey Login

After your first wallet login, you can register a passkey (Face ID, Touch ID, YubiKey) so you never need your wallet again.

### Register a passkey

1. Log in with your wallet first
2. Go to **Settings**
3. Under **Passkeys**, type a name (e.g., "MacBook Touch ID")
4. Click **Add passkey**
5. Your browser prompts for biometric confirmation

### Login with passkey

1. On the auth screen, click the **Passkey** tab
2. Enter your **wallet address** (the user ID your keys are stored under)
3. Enter your **vault passphrase**
4. Click **Sign in with Passkey**
5. Your browser prompts for biometric confirmation (Face ID / Touch ID / hardware key)

---

## 7. The Vault

The vault is where your encrypted API keys live.

### Add a key

1. Click **New secret** (top right in Vault section)
2. Choose the provider from the dropdown (only supported upstreams are shown)
3. Paste your API key
4. Click **Save secret**

What happens:
- Your raw key is sent to `POST /manage/store` over HTTPS
- The server encrypts it with your session passphrase (PBKDF2 + AES-256-GCM)
- The encrypted blob is saved to disk as `vault/{your_wallet}/{upstream}.enc`

### Reveal a key

Each vault card has an **eye icon**. Click it to decrypt and briefly show your key (hides after 30 seconds). The server decrypts using the passphrase embedded in your session token.

### Copy proxy URL

Each card also shows the **proxy URL** — this is what you give to agents. Format:
```
http://localhost:8000/proxy/openai/
```

Agents call this URL instead of `api.openai.com`. They use your session token. They never see your raw API key.

### Delete a key

Hover over a card and click the trash icon. The encrypted file is deleted from disk.

---

## 8. The Proxy

The proxy is the core feature. Any API call that would go to `api.openai.com` instead goes to `http://localhost:8000/proxy/openai/`.

KeyShield:
1. Validates your Bearer token
2. Decrypts your stored OpenAI key using the passphrase in the token
3. Injects the key into the real request
4. Forwards to `api.openai.com`

### With the OpenAI Python SDK

```python
import openai
from keyshield_sdk import KeyShield

ks = KeyShield()
ks.login("my_wallet_address", "my_passphrase")

client = ks.openai_client()  # pre-configured, token injected

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)
```

### With the Anthropic Python SDK

```python
import anthropic
from keyshield_sdk import KeyShield

ks = KeyShield()
ks.login("my_wallet_address", "my_passphrase")

client = ks.anthropic_client()

msg = client.messages.create(
    model="claude-opus-4-5",
    max_tokens=256,
    messages=[{"role": "user", "content": "Hello!"}],
)
print(msg.content[0].text)
```

### Manual curl

```bash
TOKEN="your_session_token"

curl -sS http://localhost:8000/proxy/openai/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

---

## 9. CLI

The CLI is a bash script that wraps the REST API with curl.

### Setup

```bash
cd keyshield/v2-mvp
chmod +x keyshield-cli.sh
source keyshield-cli.sh        # loads all ks_* functions into your shell
```

Or add to your `.bashrc`:
```bash
source ~/path/to/keyshield-cli.sh
export KS_BASE=http://localhost:8000
```

### Commands

#### Check server
```bash
ks_health
# {"status":"ok","version":"2.0"}
```

#### Password login
```bash
ks_login my_wallet_address my_passphrase
# Token saved to ~/.keyshield/token
```

#### Wallet login (signs challenge automatically)
```bash
# Requires: npm install -g @solana/web3.js  (or use Python SDK)
# For dev, use the Python SDK wallet-login command instead:
python3 keyshield_sdk.py wallet-login <seed_hex> <passphrase>
```

#### Store an API key
```bash
ks_store openai sk-proj-your-key-here
# {"ok":true}
```

#### List keys
```bash
ks_list
# {"keys":["openai","anthropic"]}
```

#### Delete a key
```bash
ks_delete openai
# {"ok":true}
```

#### Proxy a request
```bash
ks_proxy openai v1/chat/completions '{
  "model": "gpt-4o-mini",
  "messages": [{"role": "user", "content": "What is 2+2?"}]
}'
```

#### Logout
```bash
ks_logout
```

---

## 10. Python SDK

### Install

```bash
pip install httpx                  # required
pip install pynacl                 # only for wallet login
```

### Quickstart

```python
from keyshield_sdk import KeyShield

# Create client
ks = KeyShield("http://localhost:8000")

# Login (password)
ks.login("my_wallet_address", "my_passphrase")

# Login (wallet — automatic sign)
# ks.wallet_login_with_key("your_64hex_seed", "my_passphrase")

# Store a key
ks.store("openai", "sk-proj-xxx")
ks.store("anthropic", "sk-ant-api03-xxx")

# List keys
print(ks.list_keys())
# ['openai', 'anthropic']

# Call OpenAI through the proxy
client = ks.openai_client()
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)

# Call Anthropic through the proxy
claude = ks.anthropic_client()
msg = claude.messages.create(
    model="claude-opus-4-5",
    max_tokens=256,
    messages=[{"role": "user", "content": "Hello!"}],
)
print(msg.content[0].text)

# Decrypt and inspect a raw key (careful!)
raw = ks.decrypt_key("openai")
print(raw[:8] + "…")

# Delete a key
ks.delete_key("openai")
```

### Context manager

```python
with KeyShield() as ks:
    ks.login("user", "pass")
    print(ks.list_keys())
# HTTP connection closed automatically
```

### Async

```python
import asyncio
from keyshield_sdk import AsyncKeyShield

async def main():
    async with AsyncKeyShield() as ks:
        await ks.login("user", "pass")
        await ks.store("openai", "sk-proj-xxx")
        keys = await ks.list_keys()
        print(keys)

asyncio.run(main())
```

### Python SDK CLI

```bash
# Health
python3 keyshield_sdk.py health

# Login
python3 keyshield_sdk.py login myuser mypass

# Wallet login (auto sign)
python3 keyshield_sdk.py wallet-login <64hex_seed> <passphrase>

# Store
python3 keyshield_sdk.py store openai sk-proj-xxx

# List
python3 keyshield_sdk.py list

# Decrypt (see raw key)
python3 keyshield_sdk.py decrypt openai

# Delete
python3 keyshield_sdk.py delete openai

# Proxy
python3 keyshield_sdk.py proxy openai v1/models
python3 keyshield_sdk.py proxy openai v1/chat/completions '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'

# Passkeys
python3 keyshield_sdk.py passkey-list
python3 keyshield_sdk.py passkey-delete <credId>
```

---

## 11. TypeScript SDK

The SDK works in both browsers and Node.js (no dependencies).

### Usage in an agent / app

```typescript
import { KeyShield, KeyShieldOpenAI, KeyShieldAnthropic } from './keyshield-sdk';

const ks = new KeyShield({ baseUrl: 'http://localhost:8000' });

// Login
await ks.login('my_wallet', 'my_passphrase');

// Store a key
await ks.store('openai', 'sk-proj-xxx');

// Use through proxy — raw key never appears in your code
const openai = new KeyShieldOpenAI(ks);
const resp = await openai.chat('gpt-4o-mini', [
    { role: 'user', content: 'Hello!' }
]);
console.log(resp.choices[0].message.content);

// List keys
const keys = await ks.listKeys();
console.log(keys);  // ['openai']

// Decrypt a key (for inspection only)
const raw = await ks.decryptKey('openai');

// Delete
await ks.deleteKey('openai');
```

### Use with an existing OpenAI SDK

```typescript
import OpenAI from 'openai';
import { KeyShield } from './keyshield-sdk';

const ks = new KeyShield({ token: 'your_session_token' });

const openai = new OpenAI({
    baseURL: ks.proxyUrl('openai'),
    apiKey:  'keyshield-proxy',   // ignored — real key injected server-side
    defaultHeaders: { Authorization: `Bearer ${ks.token}` },
});

const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hello!' }],
});
```

---

## 12. Batch Requests

Send up to 20 API calls in one HTTP round trip. The server runs them concurrently with `asyncio.gather`.

```python
from keyshield_sdk import KeyShield

ks = KeyShield()
ks.login("user", "pass")

results = ks.batch([
    # OpenAI — list models
    {"upstream": "openai", "path": "v1/models", "method": "GET"},

    # Helius — get wallet balance
    {"upstream": "helius", "body": {
        "jsonrpc": "2.0", "id": 1,
        "method": "getBalance",
        "params": ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"]
    }},

    # Anthropic — chat
    {"upstream": "anthropic", "path": "v1/messages", "method": "POST", "body": {
        "model": "claude-haiku-20240307",
        "max_tokens": 64,
        "messages": [{"role": "user", "content": "What is 2+2?"}]
    }},
])

for r in results:
    print(r.get("status"), r.get("cache"), r.get("error"))
```

**Timing:** 5 serial requests at ~300ms each = 1.5s. Same 5 in batch = ~300ms (fastest one wins).

---

## 13. Helius RPC Skills

Higher-level Solana helpers built on top of the Helius API.

```python
from keyshield_sdk import KeyShield

ks = KeyShield()
ks.login("user", "pass")

WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"

# Portfolio — all tokens + SOL balance
portfolio = ks.helius_run("portfolio", {"wallet": WALLET})

# NFTs owned
nfts = ks.helius_run("nft_owners", {"mint": "NftMint..."})

# Token price
price = ks.helius_run("price", {"token": "So11111111111111111111111111111111111111112"})

# Transaction history
txs = ks.helius_run("tx_history", {"wallet": WALLET, "limit": 10})

# List all available tools
tools = ks.helius_tools()
for t in tools:
    print(t["name"], "—", t["description"])
```

---

## 14. Passkey Management

Passkeys let you log in with Face ID, Touch ID, or a hardware key (YubiKey). No wallet required after setup.

### Register (web UI)

1. Log in with your wallet
2. Go to **Settings → Passkeys**
3. Type a name for the device (e.g., "MacBook Touch ID")
4. Click **Add passkey**
5. Approve the biometric prompt

### Register (Python SDK)

The Python SDK doesn't control the browser's WebAuthn UI directly. Use the web dashboard or TypeScript SDK to register.

### Login with passkey (web UI)

1. Go to `http://localhost:3001`
2. Click the **Passkey** tab
3. Enter your wallet address and vault passphrase
4. Click **Sign in with Passkey**
5. Approve biometric

### List / delete passkeys

```python
# Python
creds = ks.passkey_list()
for c in creds:
    print(c["name"], c["id"][:16])

ks.passkey_delete(cred_id)
```

```bash
# CLI
python3 keyshield_sdk.py passkey-list
python3 keyshield_sdk.py passkey-delete <credId>
```

---

## 15. Sessions Panel

In the dashboard, go to **Sessions**.

You'll see:
- Your current **session token** (copy button included)
- Your **wallet address**
- **Auth method** (Solana wallet / ed25519)
- **TTL** (24 hours)
- **Revoke** button — invalidates the token immediately on the server

When you click Revoke, the server deletes the session and you're logged out.

---

## 16. Developer Panel

Go to **Developer** in the sidebar (look for the DEV badge).

This panel is pre-filled with your live session token. You can:

- **Copy the token** with one click
- **Copy CLI commands** with your token already embedded
- **Copy Python SDK snippet** — ready to run, no substitution needed
- **Copy TypeScript snippet** — same

All snippets auto-update whenever your token changes.

The endpoint reference table at the bottom shows every available endpoint with method, path, and description.

---

## 17. Encryption Verified

Want to verify the encryption is real? Here's how to inspect a vault file directly.

```python
from pathlib import Path
import hashlib, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

VAULT_FILE = Path("keyshield/v2-mvp/vault/YOUR_WALLET/openai.enc")
PASSPHRASE = "your_passphrase"

payload  = VAULT_FILE.read_bytes()
salt     = payload[:16]
nonce    = payload[16:28]
cipher   = payload[28:]

key = hashlib.pbkdf2_hmac("sha256", PASSPHRASE.encode(), salt, 100_000, dklen=32)
aes = AESGCM(key)
raw = aes.decrypt(nonce, cipher, None).decode()

print(f"File size: {len(payload)} bytes")
print(f"Ciphertext: {cipher[:16].hex()}…  (looks like noise? good.)")
print(f"Decrypted: {raw[:8]}…")
```

**What the encrypted file looks like (hex):**
```
7a3f9c1d 2e8b4a56 f0c7d391 5e2a8b4c   ← 16B random salt
a1b2c3d4 e5f60718 293a4b5c           ← 12B random nonce
[encrypted ciphertext + 16B GCM tag]  ← indistinguishable from random
```

Every store generates a fresh salt and nonce. Two identical keys encrypted twice produce completely different ciphertexts.

---

## 18. API Reference

All endpoints except `/health` and `/auth/wallet-challenge` require `Authorization: Bearer <token>`.

### Auth

| Method | Path | Body / Params | Returns |
|--------|------|---------------|---------|
| GET  | `/auth/wallet-challenge` | — | `{challenge, nonce}` |
| POST | `/auth/wallet-login` | `{walletAddress, signature, challenge, passphrase}` | `{token, userId}` |
| POST | `/auth/login` | `{userId, password}` | `{token}` |
| POST | `/auth/logout` | — | `{ok}` |

### Vault

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET    | `/manage/list` | — | `{keys[], items[{upstream,createdAt,updatedAt}]}` |
| POST   | `/manage/store` | `{upstream, apiKey}` | `{ok}` |
| GET    | `/manage/decrypt/{upstream}` | — | `{upstream, key}` |
| DELETE | `/manage/secret/{upstream}` | — | `{ok}` |

### Proxy

| Method | Path | Notes |
|--------|------|-------|
| ANY | `/proxy/{upstream}/{path}` | Forwards to upstream with your key injected |
| POST | `/manage/batch` | `{requests: [{upstream,path,method,body}]}` — up to 20, concurrent |

### Passkeys

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/auth/passkey/register-options` | Returns WebAuthn creation options |
| POST | `/auth/passkey/register-verify` | `{credential, name}` — stores passkey |
| GET  | `/auth/passkey/auth-options` | `?user_id=` — no token needed |
| POST | `/auth/passkey/auth-verify` | `?user_id=&passphrase=` → `{token}` |
| GET  | `/auth/passkey/list` | Lists your passkeys |
| DELETE | `/auth/passkey/{cred_id}` | Removes a passkey |

### Helius Skills

| Method | Path | Notes |
|--------|------|-------|
| GET  | `/skill/helius/tools` | List available tools |
| POST | `/skill/helius/run` | `{tool, inputs}` — run a Helius skill |

### Health

| Method | Path | Returns |
|--------|------|---------|
| GET  | `/health` | `{status, version, generic_cache, router}` |

---

## 19. Supported Upstreams

| ID | Provider | Base URL |
|----|----------|----------|
| `openai` | OpenAI | `https://api.openai.com` |
| `anthropic` | Anthropic Claude | `https://api.anthropic.com` |
| `mistral` | Mistral AI | `https://api.mistral.ai` |
| `cohere` | Cohere | `https://api.cohere.ai` |
| `groq` | Groq | `https://api.groq.com/openai` |
| `helius` | Helius Solana RPC | `https://mainnet.helius-rpc.com` |

---

## Troubleshooting

**"challenge expired or already used"**
Challenges have a 5-minute TTL and are single-use. Refresh the page and try again.

**"key not found or wrong passphrase"**
You're trying to decrypt a key that doesn't exist, or you logged in with a different passphrase than the one used to encrypt it.

**"unknown upstream"**
The provider you're trying to store isn't in the supported list. Check section 19.

**Vite shows blank screen after login**
Open DevTools → Console. Usually a CORS issue. Verify the server is running on port 8000 and CORS allows port 3001.

**Wallet signature fails**
Some wallets (Ledger hardware) don't support arbitrary message signing. Use Phantom or Solflare.

**Backend restarts and I get 401**
Sessions are stored in SQLite. They survive restarts. If you get 401, your token may have expired (24h TTL) — log in again.
