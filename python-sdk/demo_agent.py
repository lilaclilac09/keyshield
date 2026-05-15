#!/usr/bin/env python3
"""End-to-end KeyShield agent demo.

Run against a live KeyShield deployment (default: Railway). Walks through:

  1. Owner: generate Solana-style ed25519 wallet keypair, sign in.
  2. Owner: store an upstream API key in the server-side vault.
  3. Owner: register an agent's public key under the owner account.
  4. Agent: challenge + sign + login → agent bearer token.
  5. Agent: call /vproxy/<upstream>/... using its own bearer; KeyShield
     auto-resolves the upstream key from the owner's vault and forwards
     the request. The agent never sees the raw upstream key.

Usage:

  pip install pynacl base58 httpx
  export OPENAI_API_KEY=sk-...        # optional; skips upstream call if unset
  python demo_agent.py

Override target:
  KS_API=http://127.0.0.1:8001 python demo_agent.py
"""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

import base58
import httpx
from nacl.signing import SigningKey

KS_API = os.getenv("KS_API", "https://keyshield-production.up.railway.app").rstrip("/")
STATE_DIR = Path(os.getenv("KS_DEMO_STATE", str(Path.home() / ".keyshield-demo")))
STATE_DIR.mkdir(parents=True, exist_ok=True)


def _load_or_make(name: str) -> SigningKey:
    """Persist keypairs across runs so we don't re-register every time."""
    path = STATE_DIR / f"{name}.sk"
    if path.exists():
        return SigningKey(path.read_bytes())
    sk = SigningKey.generate()
    path.write_bytes(bytes(sk))
    return sk


def _pubkey_b58(sk: SigningKey) -> str:
    return base58.b58encode(bytes(sk.verify_key)).decode()


def _sign_b64(sk: SigningKey, message: str) -> str:
    """Detached signature, base64-encoded — what /auth/*-login expects."""
    return base64.b64encode(sk.sign(message.encode()).signature).decode()


def _post(
    path: str,
    *,
    token: str | None = None,
    json_body: dict | None = None,
    ok_statuses: tuple[int, ...] = (200, 201),
) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = httpx.post(f"{KS_API}{path}", headers=headers, json=json_body or {}, timeout=30)
    if r.status_code not in ok_statuses:
        r.raise_for_status()
    return r.json()


def _get(path: str, *, token: str | None = None) -> dict:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = httpx.get(f"{KS_API}{path}", headers=headers, timeout=30)
    r.raise_for_status()
    return r.json()


def step(n: int, title: str) -> None:
    print(f"\n[{n}] {title}")
    print("─" * (len(title) + 4))


def main() -> int:
    print(f"KeyShield demo against {KS_API}")

    # 1. Owner identity ────────────────────────────────────────────────
    step(1, "Owner: generate wallet + sign in")
    owner = _load_or_make("owner")
    owner_pk = _pubkey_b58(owner)
    print(f"  wallet pubkey: {owner_pk}")

    c = _get("/auth/wallet-challenge")
    sig = _sign_b64(owner, c["challenge"])
    out = _post(
        "/auth/wallet-login",
        json_body={
            "walletAddress": owner_pk,
            "challenge": c["challenge"],
            "nonce": c["nonce"],
            "signature": sig,
            "passphrase": "",
        },
    )
    owner_token = out["token"]
    print(f"  owner bearer: {owner_token[:24]}…")

    # 2. Store an upstream key in the server-side vault ────────────────
    step(2, "Owner: stash upstream API key in vault")
    upstream_key = os.getenv("OPENAI_API_KEY", "")
    upstream_name = "openai"
    if upstream_key:
        item = _post(
            "/manage/store",
            token=owner_token,
            json_body={
                "name": "demo openai",
                "type": "api_key",
                "upstream": upstream_name,
                "value": upstream_key,
            },
        )
        print(f"  stored vault item id: {item['id']}")
    else:
        print("  OPENAI_API_KEY not set — skipping vault store + upstream call")

    # 3. Register agent pubkey under owner ─────────────────────────────
    step(3, "Owner: register agent pubkey")
    agent = _load_or_make("agent")
    agent_pk = _pubkey_b58(agent)
    print(f"  agent pubkey: {agent_pk}")

    reg = _post(
        "/agents/register",
        token=owner_token,
        json_body={"pubkeyB58": agent_pk, "name": "demo-agent"},
        ok_statuses=(200, 409),  # 409 = already registered (re-run)
    )
    print("  registered ✓" if not reg.get("duplicate") else "  already registered ✓")

    # 4. Agent self-auth ───────────────────────────────────────────────
    step(4, "Agent: challenge + sign + login")
    c = _post("/auth/agent-challenge")
    sig = _sign_b64(agent, c["challenge"])
    out = _post(
        "/auth/agent-login",
        json_body={
            "pubkeyB58": agent_pk,
            "challenge": c["challenge"],
            "nonce": c["nonce"],
            "signature": sig,
        },
    )
    agent_token = out["token"]
    print(f"  agent bearer: {agent_token[:24]}…")

    # 5. Sanity: the agent bearer is real and inherits owner scope ────
    step(5, "Agent: list agents under owner (proves bearer is live)")
    listed = _get("/agents/list", token=agent_token)
    names = [a.get("name") for a in listed.get("agents", [])]
    print(f"  agents visible to this token: {names}")

    # 6. Agent calls upstream via /vproxy/ ─────────────────────────────
    step(6, "Agent: call upstream through KeyShield proxy")
    if not upstream_key:
        print("  (skipped — set OPENAI_API_KEY to demo the upstream hop)")
    else:
        r = httpx.post(
            f"{KS_API}/vproxy/{upstream_name}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {agent_token}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": "Reply with one word: pong."}],
            },
            timeout=60,
        )
        print(f"  status: {r.status_code}")
        print(f"  cache: {r.headers.get('x-ks-cache')}  key-type: {r.headers.get('x-ks-key-type')}")
        body = r.json()
        if r.status_code == 200 and isinstance(body, dict) and body.get("choices"):
            print(f"  reply:  {body['choices'][0]['message']['content']!r}")
        else:
            print(f"  body:   {json.dumps(body)[:300]}")

    # 7. x402 trust: pre-authorize a paid upstream for auto-pay ────────
    #
    # An x402-protected endpoint replies HTTP 402 with payment instructions
    # (USDC amount + payee). KeyShield's proxy will auto-pay (within limits)
    # and retry IFF the user has trusted the upstream domain. This step
    # establishes that trust; actual payment requires the Railway server to
    # have KS_X402_HOT_KEYPAIR_B58 + HELIUS_API_KEY set and the hot wallet
    # to be funded with USDC on mainnet.
    step(7, "Owner: trust an x402 domain for auto-pay (caps in micro-USDC)")
    probe = httpx.get(
        f"{KS_API}/x402/trust",
        headers={"Authorization": f"Bearer {owner_token}"},
        timeout=10,
    )
    if probe.status_code == 404:
        print("  /x402/trust route not deployed yet on this server — skipping")
        return 0
    trust = _post(
        "/x402/trust",
        token=owner_token,
        json_body={
            "domain": "stableenrich.dev",   # any x402-protected origin
            "max_micro": 200_000,           # 0.20 USDC per request
            "daily_cap": 2_000_000,         # 2.00 USDC per day
            "enabled": True,
        },
    )
    print(f"  trust set: {trust}")
    listed = _get("/x402/trust", token=owner_token)
    print(f"  trust list: {[r['domain'] for r in listed.get('trust_list', [])]}")
    print(
        "  next: agent hits a x402-protected endpoint via /vproxy/<domain>/...; "
        "KeyShield catches the 402, pays from the server-held hot wallet (if "
        "configured), and retries — transparently to the agent."
    )

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except httpx.HTTPStatusError as e:
        print(f"\nHTTP {e.response.status_code}: {e.response.text}", file=sys.stderr)
        sys.exit(1)
