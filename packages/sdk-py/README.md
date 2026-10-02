# keyshield (Python SDK)

`pip install keyshield` — Python client for the KeyShield server.
Talks to the same vault, proxy, and x402 billing endpoints the TypeScript
CLI uses. Default base URL is FastAPI on **:8001**.

> `pip install keyshield` on PyPI may resolve an unrelated project. Prefer
> installing from this repo: `pip install ./packages/sdk-py`.

## Install

```sh
pip install ./packages/sdk-py                 # owner / proxy use
pip install './packages/sdk-py[agent]'        # adds pynacl for AgentKeyShield
```

## Quick start — owner

Password `/auth/login` is **403**. Use a dashboard token or wallet login.

```python
from keyshield import KeyShield
import os

with KeyShield("http://localhost:8001", token=os.environ["KS_TOKEN"]) as ks:
    ks.store("openai", "sk-...")
    resp = ks.proxy("openai", "v1/chat/completions", api_key="sk-...", json={
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "hi"}],
    })
    print(resp.json())
```

## Convenience: pre-wired OpenAI / Anthropic clients

```python
# Path A: session as OpenAI api_key, raw key in X-Upstream-API-Key
client = ks.openai_client(api_key="sk-...")
client.chat.completions.create(model="gpt-4o-mini", messages=[...])

# No raw key → /vproxy (vault shim lookup)
client = ks.openai_client()
```

## Quick start — agent (self-paying)

```python
from keyshield import AgentKeyShield, generate_keypair

# Owner-side, one-time:
#   creds = generate_keypair()
#   ks.agent_register(creds["pubkey_b58"], name="trading-bot")

agent = AgentKeyShield(
    owner_wallet="9WzDX...",
    private_key_hex=os.environ["AGENT_KEY"],
    vault_passphrase=os.environ["VAULT_PASS"],
    base_url="http://localhost:8001",
)
agent.authenticate()  # POST /auth/agent-login with pubkeyB58 + signature
```

## Async

```python
import asyncio
from keyshield import AsyncKeyShield

async def main():
    async with AsyncKeyShield("http://localhost:8001", token=os.environ["KS_TOKEN"]) as ks:
        print(await ks.list_keys())

asyncio.run(main())
```
