# keyshield (Python SDK)

`pip install keyshield` — Python client for the KeyShield server.
Talks to the same vault, proxy, and x402 billing endpoints the TypeScript
CLI uses.

## Install

```sh
pip install keyshield                 # owner / proxy use
pip install 'keyshield[agent]'        # adds pynacl for AgentKeyShield + agent_create
```

## Quick start — owner

```python
from keyshield import KeyShield

with KeyShield("http://localhost:8000") as ks:
    ks.login("alice", "secret")
    ks.store("openai", "sk-...")
    ks.set_pricing("openai", price_usd=0.001)   # opt in to billing

    resp = ks.proxy("openai", "v1/chat/completions", json={
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "hi"}],
    })
    print(resp.json())
```

## Quick start — agent (self-paying)

```python
from keyshield import AgentKeyShield, generate_keypair

# Owner-side, one-time:
#   creds = generate_keypair()
#   ks.agent_register(creds["pubkey_b58"], name="trading-bot")
#   ship `creds["private_key_hex"]` to the agent securely.

# Agent process:
agent = AgentKeyShield(
    owner_wallet="9WzDX...",          # the vault owner's Solana wallet
    private_key_hex=os.environ["AGENT_KEY"],
    vault_passphrase=os.environ["VAULT_PASS"],
    base_url="http://localhost:8000",
)
resp = agent.proxy("openai", "v1/chat/completions", json={
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "what's SOL at?"}],
})
```

The proxy debit goes against the **agent's** balance once
`AgentKeyShield.authenticate()` has run, so the agent process needs to
top up its own balance to keep running:

```python
agent.topup(amount_usd=1.00)
```

## Convenience: pre-wired OpenAI / Anthropic clients

```python
client = ks.openai_client()           # injects KeyShield bearer + proxy URL
client.chat.completions.create(model="gpt-4o-mini", messages=[...])
```

## Async

```python
import asyncio
from keyshield import AsyncKeyShield

async def main():
    async with AsyncKeyShield() as ks:
        await ks.login("alice", "secret")
        print(await ks.list_keys())

asyncio.run(main())
```

## ZK mode: `keyshield-proxy` (local, zero-knowledge)

In ZK mode the KeyShield server holds only ciphertext and a per-key share. It can't read your provider keys, so the hosted `/vproxy` can't inject them either. Instead, run this proxy on your machine or your agent's machine. It decrypts each key locally, using your passkey-derived root plus the server share, and calls the provider directly. Spec: [`docs/zk/ZK-MODE.md`](../../docs/zk/ZK-MODE.md).

```bash
pip install "keyshield[zk] @ git+https://github.com/lilaclilac09/keyshield.git#subdirectory=packages/sdk-py"

keyshield-proxy enroll            # paste the ksz1.… unlock code from the dashboard (stored 0600)
export KS_TOKEN=<proxy-only agent token>   # Developer → Create agent token
keyshield-proxy status
keyshield-proxy run               # prints the base URL and a local token
```

Point your agent at it, using the printed local token as the API key:

```python
from openai import OpenAI
client = OpenAI(base_url="http://127.0.0.1:8787/vproxy/openai/v1", api_key="<local token>")
```

- **Revoke:** revoke the agent token under Sessions. The proxy caches shares for at most 60 s, so new calls fail within that window. A machine that already decrypted a key could have kept a copy, so rotate the provider key if you think the host was compromised.
- **Limits:**
  - The proxy only listens on loopback and refuses other `Host` headers.
  - The hosted guardrails (spend caps, 5xx freeze, MPP metering, Helius RPC cache) don't run locally.
  - Supported upstreams: openai, anthropic, openrouter, groq, mistral, cohere, nvidia, helius.
