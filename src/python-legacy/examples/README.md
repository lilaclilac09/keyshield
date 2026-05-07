# KeyShield agent integration examples

Two end-to-end runnable examples showing how to plug KeyShield into real
agent frameworks. Both follow the same pattern: **the agent never sees
plaintext API keys**.

## What you need (one-time setup)

1. KeyShield server running:
   ```bash
   cd v2-mvp && uvicorn src.server:app --port 8000
   ```

2. Run the installer in this directory:
   ```bash
   curl -fsSL http://localhost:8000/install.sh | bash
   ```
   It generates the agent keypair, writes `.env`, prints the public key.

3. Open the dashboard at `http://localhost:3001` → **Agents** tab →
   paste the agent's public key → Register.

4. Store the API keys you want the agent to use:
   ```bash
   source ../keyshield-cli.sh
   ks_login your-wallet-or-userid your-passphrase
   ks_store openai     sk-proj-...
   ks_store anthropic  sk-ant-api03-...
   ks_store groq       gsk_...
   ks_store helius     your-helius-key
   ```

5. Run an example:
   ```bash
   python openclaw_with_keyshield.py
   # or
   python hermes_with_keyshield.py
   ```

## openclaw_with_keyshield.py

OpenClaw-style autonomous Solana agent. Shows:

- **Helius RPC** through KeyShield with method-level cache (5s TTL on
  `getBalance`, 30s on `getAssetsByOwner`). Cache HIT/MISS visible in
  `x-ks-cache` header.
- **Groq llama-3.1-70b** for fast signals (~100ms p50)
- **Anthropic Claude** for deep analysis (every 5 iterations)
- **0x swap quote** for trade execution

The agent loop:
1. Pull SOL balance from Helius
2. Mock a price tick (replace with Hermes SSE in production)
3. Quick signal via Groq
4. Deep analysis via Claude every 5th iteration
5. If high-confidence signal, request 0x swap quote

## hermes_with_keyshield.py

Real-time Pyth/Hermes price stream + KeyShield AI analysis. Shows:

- **SSE streaming** of Pyth prices through KeyShield's persistent
  connection pool (~50ms p50 from Pyth validators)
- **race(groq, openai)** — same prompt to both models in parallel,
  return first to respond, cancel the slower one
- **Per-symbol rate limiting** (max 1 signal per symbol per 10s)
- **20-bar SMA threshold** triggers AI analysis when price moves >0.3%

The latency story:
| Step                           | Time    |
|--------------------------------|---------|
| Pyth Hermes SSE push           | 50ms    |
| KeyShield proxy (in-memory)    | +5ms    |
| Groq llama-70b URGENT inference| +100ms  |
| **Total tick → trade signal**  | **155ms** |

## Why this matters

Without KeyShield, an OpenClaw or Hermes agent has these in its `.env`:

```
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
HELIUS_API_KEY=...
ZEROX_API_KEY=...
```

Anyone who reads the file (or the env in a process listing) can drain
the accounts.

With KeyShield, the agent's `.env` has only:

```
KS_OWNER_WALLET=9WzDX...
KS_AGENT_KEY=<32-byte ed25519 seed>
KS_VAULT_PASS=<vault passphrase>
```

The `KS_AGENT_KEY` only proves identity — it can't be used to call OpenAI
directly. All the real API keys stay encrypted on the KeyShield server
and only get injected into outgoing requests at proxy time.

## Switching from "BYO key" to platform key

If you don't store an OpenAI key in your vault, the proxy automatically
falls back to KeyShield's platform key (if configured) and bills you
per call. The agent code doesn't change — same proxy URL, same SDK call.
The `x-ks-key-type` response header tells you which one was used.

## What's next

- `ks_skill helius portfolio --wallet <addr>` — pre-built Solana queries
- `agent.batch([...])` — up to 20 concurrent proxied calls
- Top up balance via x402 from inside an agent (when balance hits zero)
