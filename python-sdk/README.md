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
