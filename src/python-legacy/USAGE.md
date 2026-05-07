# KeyShield v2 — Usage Guide

## What KeyShield does

KeyShield is a **zero-trust API key vault + proxy gateway** for AI agents.

- Your agent **never handles raw API keys** — KeyShield injects them at proxy time.
- Keys are encrypted at rest with **AES-256-GCM + PBKDF2-SHA256** (100k iterations).
- The server never knows your passphrase; decryption happens on every proxy request.
- Auth is two-factor: **Solana wallet signature** (proves identity) + **vault passphrase** (decrypts keys).

---

## 1. Start the backend

```bash
cd keyshield/v2-mvp
pip install -r requirements.txt
uvicorn src.server:app --reload --port 8000
```

---

## 2. Shell CLI (`keyshield-cli.sh`)

```bash
chmod +x keyshield-cli.sh

# Check backend is up
./keyshield-cli.sh health

# Password login (stores token at ~/.keyshield/token)
./keyshield-cli.sh login mywalletaddress mysecretpassphrase

# Store an API key (encrypted with your passphrase)
./keyshield-cli.sh store openai     sk-proj-xxxxxxxxxxxxxxxx
./keyshield-cli.sh store anthropic  sk-ant-api03-xxxxxxxx
./keyshield-cli.sh store mistral    xxxxxxxxxxxxxxxxxxxx
./keyshield-cli.sh store helius     xxxxxxxx-xxxx-xxxx-xxxx

# List stored upstreams
./keyshield-cli.sh list
# → {"keys":["openai","anthropic"]}

# Proxy a request (key injected server-side)
./keyshield-cli.sh proxy openai v1/chat/completions \
  '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'

# Delete a key
./keyshield-cli.sh delete anthropic

# Logout
./keyshield-cli.sh logout
```

---

## 3. Python SDK (`keyshield_sdk.py`)

```bash
pip install httpx
```

### Basic usage

```python
from keyshield_sdk import KeyShield

ks = KeyShield("http://localhost:8000")
ks.login("mywalletaddress", "mysecretpassphrase")

# Store keys
ks.store("openai",    "sk-proj-xxxx")
ks.store("anthropic", "sk-ant-xxxx")

# List
print(ks.list_keys())    # ['openai', 'anthropic']

# Proxy a request — raw key never leaves the vault server
resp = ks.proxy("openai", "v1/chat/completions",
                json={"model": "gpt-4o-mini",
                      "messages": [{"role": "user", "content": "Hello!"}]})
print(resp.json()["choices"][0]["message"]["content"])

# Delete a key
ks.delete_key("anthropic")
```

### Concurrent batch requests

```python
results = ks.batch([
    {"upstream": "openai",   "path": "v1/models"},
    {"upstream": "anthropic","path": "v1/models"},
])
for r in results:
    print(r.get("status"), r.get("data"))
```

### Async usage

```python
import asyncio
from keyshield_sdk import AsyncKeyShield

async def main():
    async with AsyncKeyShield() as ks:
        await ks.login("myuser", "mypass")
        await ks.store("openai", "sk-xxxx")
        keys = await ks.list_keys()
        print(keys)

asyncio.run(main())
```

### Wallet auth (advanced)

```python
# Install: pip install pynacl base58
from keyshield_sdk import KeyShield
from nacl.signing import SigningKey
import base64, base58

ks = KeyShield()

# Fetch challenge
ch_data = ks.wallet_challenge()
challenge = ch_data["challenge"]

# Sign with your ed25519 private key
sk   = SigningKey(bytes.fromhex("YOUR_64_HEX_SEED"))
sig  = sk.sign(challenge.encode()).signature
addr = base58.b58encode(bytes(sk.verify_key)).decode()

# Login
token = ks.wallet_login(addr, sig, challenge, "mypassphrase")
print("Token:", token)
```

---

## 4. TypeScript/JavaScript SDK (`keyshield-sdk.ts`)

Works in Node.js (v18+) and browsers. Zero dependencies.

### Node.js / agent usage

```typescript
import { KeyShield } from './keyshield-sdk';

const ks = new KeyShield('http://localhost:8000');
await ks.login('mywalletaddress', 'mypassphrase');

// Store keys
await ks.store('openai',    'sk-proj-xxxx');
await ks.store('anthropic', 'sk-ant-xxxx');

// List stored upstreams
const keys = await ks.listKeys();    // ['openai', 'anthropic']

// Proxy a request
const res = await ks.proxy('openai', 'v1/chat/completions', {
  json: {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'What is 2+2?' }],
  },
});
const data = await res.json();
console.log(data.choices[0].message.content);

// Delete
await ks.deleteKey('anthropic');
```

### Wallet login (browser / Solana wallet adapter)

```typescript
import { useWallet } from '@solana/wallet-adapter-react';
import { KeyShield } from './keyshield-sdk';

const { publicKey, signMessage } = useWallet();
const ks = new KeyShield('http://localhost:8000');

// 1. Get challenge
const { challenge } = await ks.walletChallenge();

// 2. Sign it
const msgBytes = new TextEncoder().encode(challenge);
const sigBytes = await signMessage!(msgBytes);

// 3. Login → token stored in ks
await ks.walletLogin(
  publicKey!.toBase58(),
  sigBytes,
  challenge,
  'mypassphrase',
);

// 4. Use vault
await ks.store('anthropic', 'sk-ant-xxxx');
```

### Drop-in OpenAI / Anthropic wrappers

```typescript
import { KeyShield, KeyShieldOpenAI, KeyShieldAnthropic } from './keyshield-sdk';

const ks = new KeyShield();
await ks.login('myuser', 'mypass');

// OpenAI
const openai = new KeyShieldOpenAI(ks);
const result = await openai.chatCompletions({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Explain PBKDF2 in one sentence.' }],
});

// Anthropic
const claude = new KeyShieldAnthropic(ks);
const msg = await claude.messages({
  model: 'claude-opus-4-5',
  max_tokens: 128,
  messages: [{ role: 'user', content: 'Hi Claude!' }],
});
```

### Environment-based agent integration

Set `KS_TOKEN` and `KS_BASE` env vars so agents don't need to authenticate themselves:

```typescript
import { ksProxy } from './keyshield-sdk';

// Works if KS_TOKEN and KS_BASE are set in the environment
const res = await ksProxy('openai', 'v1/chat/completions', {
  json: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }] },
});
console.log(await res.json());
```

---

## 5. Supported upstreams

| Upstream    | Base URL                      | Notes                     |
|-------------|-------------------------------|---------------------------|
| `openai`    | https://api.openai.com        | GPT-4o, DALL-E, etc.      |
| `anthropic` | https://api.anthropic.com     | Claude 3/4 models         |
| `mistral`   | https://api.mistral.ai        | Mistral / Mixtral          |
| `cohere`    | https://api.cohere.ai         | Command R+                |
| `groq`      | https://api.groq.com/openai   | Fast inference (OpenAI-compat) |
| `helius`    | https://mainnet.helius-rpc.com | Solana RPC + NFT APIs    |

---

## 6. Auth flow summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Wallet connects (Phantom/Solflare)                                      │
│      ↓                                                                   │
│  GET /auth/wallet-challenge → {challenge, nonce}                         │
│      ↓                                                                   │
│  wallet.signMessage(challenge bytes) → signature (64 bytes, ed25519)    │
│      ↓                                                                   │
│  User enters vault passphrase in UI                                      │
│      ↓                                                                   │
│  POST /auth/wallet-login {walletAddress, signature, challenge, passphrase}│
│      ↓ server verifies ed25519 sig, creates session                      │
│      ↓ session stores (walletAddress, encrypted_passphrase)              │
│      ↓                                                                   │
│  {token} → stored in localStorage / SDK                                  │
│      ↓                                                                   │
│  All subsequent requests: Authorization: Bearer <token>                  │
│  Vault decrypts keys on each proxy request using passphrase from session │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Encryption verification

Every API key stored with `store()` goes through:

1. `salt = os.urandom(16)` — fresh random salt per key
2. `key_32 = PBKDF2-HMAC-SHA256(passphrase, salt, iterations=100_000)`
3. `nonce = os.urandom(12)` — fresh AES-GCM nonce
4. `ciphertext = AES-256-GCM.encrypt(key_32, nonce, api_key)`
5. File: `vault/{walletAddress}/{upstream}.enc` = `salt || nonce || ciphertext`

The passphrase is **never stored** on disk. It is held in memory only for the duration of the session (encrypted with the server's `SERVER_SECRET`). On every proxy request, the session passphrase is used to re-derive the AES key and decrypt the vault file.

To verify:
```bash
# Store a key, then check the encrypted file
./keyshield-cli.sh store openai sk-test-xxx
xxd vault/<walletAddress>/openai.enc | head
# First 16 bytes = random salt, next 12 = nonce, rest = ciphertext+tag
```
