"""Local demo session + server-side OpenRouter key paste.

Enabled only when KS_DEMO_MODE=1. The owner keystore signs a wallet
challenge so AuthScreen can enter without Phantom. Anyone who can reach
a demo-mode process can mint a session for that owner pubkey — this is
not a public unauthenticated proxy. Upstream keys stay on the server.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from nacl.signing import SigningKey

from .proxy.openrouter_interface import DEMO_MODEL, DEMO_UPSTREAM

DEMO_AGENT_NAME = "demo-agent"


def demo_enabled() -> bool:
    return os.getenv("KS_DEMO_MODE", "").strip() in {"1", "true", "TRUE", "yes"}


def demo_status() -> dict:
    """Public health shape — never includes keys."""
    from .mpp import owner_keystore

    owner = owner_keystore.owner_status()
    env_key = bool(os.getenv("KS_OPENROUTER_API_KEY", "").strip())
    return {
        "enabled": demo_enabled(),
        "owner_loaded": bool(owner.get("loaded")),
        "owner_pubkey": owner.get("pubkey"),
        "upstream": DEMO_UPSTREAM,
        "model": DEMO_MODEL,
        "openrouter_key_configured": env_key,
        "public_unauthenticated_proxy": False,
    }


def _b58encode(data: bytes) -> str:
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    n = int.from_bytes(data, "big")
    res = ""
    while n:
        n, r = divmod(n, 58)
        res = alphabet[r] + res
    pad = len(data) - len(data.lstrip(b"\x00"))
    return "1" * pad + res


def demo_agent_pubkey(owner_b58: str) -> str:
    seed = hashlib.sha256(f"keyshield-demo-agent-v1:{owner_b58}".encode()).digest()
    return _b58encode(bytes(SigningKey(seed).verify_key))


def seed_demo_agent(owner_wallet: str) -> dict:
    from .agents import agents as agents_mod

    pubkey = demo_agent_pubkey(owner_wallet)
    existing = [
        a
        for a in agents_mod.list_agents(owner_wallet)
        if a.get("pubkey_b58") == pubkey or a.get("name") == DEMO_AGENT_NAME
    ]
    if existing:
        row = existing[0]
        return {
            "id": row["id"],
            "name": row["name"],
            "pubkey_b58": row["pubkey_b58"],
            "seeded": False,
        }
    try:
        agent_id = agents_mod.register(
            owner_wallet, pubkey, name=DEMO_AGENT_NAME, scopes="proxy,mpp"
        )
    except ValueError:
        found = next(
            (
                a
                for a in agents_mod.list_agents(owner_wallet)
                if a.get("pubkey_b58") == pubkey
            ),
            None,
        )
        if found:
            return {
                "id": found["id"],
                "name": found["name"],
                "pubkey_b58": found["pubkey_b58"],
                "seeded": False,
            }
        raise
    return {
        "id": agent_id,
        "name": DEMO_AGENT_NAME,
        "pubkey_b58": pubkey,
        "seeded": True,
    }


def sign_wallet_challenge(challenge: str) -> tuple[str, bytes]:
    from .mpp import owner_keystore

    owner = owner_keystore.load_owner()
    if owner is None:
        raise owner_keystore.OwnerKeystoreError("owner keystore unavailable")
    signature = bytes(SigningKey(owner.seed).sign(challenge.encode("utf-8")).signature)
    return owner.pubkey_b58, signature


def _vault_db_path() -> Path:
    from .routes import vault as vault_mod

    return vault_mod._DB_PATH


def lookup_vault_key(user_id: str, upstream: str) -> str | None:
    import sqlite3

    path = _vault_db_path()
    if not path.is_file():
        return None
    conn = sqlite3.connect(str(path))
    try:
        row = conn.execute(
            "SELECT value FROM vault_items "
            "WHERE user_id = ? AND upstream = ? AND value != '' "
            "ORDER BY created_at DESC LIMIT 1",
            (user_id, upstream),
        ).fetchone()
    finally:
        conn.close()
    if not row or not row[0]:
        return None
    return str(row[0])


def resolve_upstream_key(user_id: str, upstream: str) -> tuple[str | None, str]:
    """Return (key, source). Never log the key."""
    env_name = {
        "openrouter": "KS_OPENROUTER_API_KEY",
        "openai": "KS_OPENAI_API_KEY",
        "ollama": "KS_OLLAMA_API_KEY",
    }.get(upstream, f"KS_{upstream.upper()}_API_KEY")
    env = os.getenv(env_name, "").strip()
    if env:
        return env, "env"
    stored = lookup_vault_key(user_id, upstream)
    if stored:
        return stored, "vault"
    if upstream != DEMO_UPSTREAM:
        fallback = lookup_vault_key(user_id, DEMO_UPSTREAM)
        if fallback:
            return fallback, "vault"
        env_or = os.getenv("KS_OPENROUTER_API_KEY", "").strip()
        if env_or:
            return env_or, "env"
    return None, "none"


def store_upstream_key(user_id: str, upstream: str, api_key: str) -> str:
    """Write a pasted key into vault_items. Returns the row id only."""
    import time
    import uuid

    from .routes import vault as vault_mod

    item_id = f"ks_demo_{upstream}_{uuid.uuid4().hex[:8]}"
    now = time.time()
    vault_mod._DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with vault_mod._db() as conn:
        conn.execute(
            """
            INSERT INTO vault_items
              (id, user_id, name, type, upstream, value, tags,
               created_at, updated_at, expires_at,
               cipher, iv, cipher_v)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', 0)
            """,
            (
                item_id,
                user_id,
                f"{upstream} demo",
                "api_key",
                upstream,
                api_key,
                '["demo","ai"]',
                now,
                now,
                None,
            ),
        )
    return item_id
