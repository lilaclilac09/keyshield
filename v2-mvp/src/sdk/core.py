"""Core KeyShield client class."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac as _hmac
import json
import os
import secrets
import time
from typing import Any
from urllib.parse import urljoin

import httpx


# ─── base58 (inline, no extra dep needed for SDK internals) ───────────────────
_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58encode(data: bytes) -> str:
    n = int.from_bytes(data, "big")
    res = ""
    while n:
        n, r = divmod(n, 58)
        res = _B58[r] + res
    pad = len(data) - len(data.lstrip(b"\x00"))
    return "1" * pad + res


class KeyShieldError(Exception):
    """Raised when the KeyShield API returns an error."""
    def __init__(self, status: int, detail: str):
        super().__init__(f"[{status}] {detail}")
        self.status = status
        self.detail = detail


class KeyShield:
    """KeyShield v2 Python client (synchronous).

    Thread-safe for reads; not designed for concurrent login/logout.

    Usage:
        ks = KeyShield()
        ks.login("myuser", "mypassphrase")
        ks.store("openai", "sk-proj-xxx")
        resp = ks.proxy("openai", "v1/chat/completions", json={...})
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        timeout: float = 30.0,
        token: str | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.token = token
        self._client = httpx.Client(timeout=timeout)
        self._session_info: dict | None = None

    # ─── Authentication ─────────────────────────────────────────────

    def login(self, user_id: str, password: str) -> str:
        """Login with password and store session token."""
        r = self._client.post(
            f"{self.base_url}/auth/login",
            json={"userId": user_id, "password": password},
        )
        r.raise_for_status()
        data = r.json()
        self.token = data["token"]
        self._session_info = {"user_id": user_id, "password": password}
        return self.token

    def wallet_login_with_key(self, seed_hex: str, passphrase: str) -> str:
        """Login with a Solana wallet keypair."""
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.backends import default_backend

        seed = bytes.fromhex(seed_hex)
        private_key = Ed25519PrivateKey.from_private_bytes(seed, backend=default_backend())
        pub_key = private_key.public_key().public_bytes(
            encoding=__import__('cryptography.hazmat.primitives.serialization').serialization.Encoding.X962.UncompressedPoint,
            format=__import__('cryptography.hazmat.primitives.serialization').serialization.PublicFormat.UncompressedPoint,
        )

        r = self._client.get(f"{self.base_url}/auth/wallet-challenge")
        challenge_data = r.json()
        nonce = challenge_data["nonce"]
        challenge = challenge_data["challenge"]

        sig = private_key.sign(challenge.encode()).hex()
        r = self._client.post(
            f"{self.base_url}/auth/wallet-login",
            json={"walletAddress": seed_hex, "signature": sig, "challenge": challenge, "nonce": nonce, "passphrase": passphrase},
        )
        r.raise_for_status()
        data = r.json()
        self.token = data["token"]
        return self.token

    def logout(self) -> None:
        if self.token:
            self._client.post(f"{self.base_url}/auth/logout")
        self.token = None
        self._session_info = None

    # ─── Vault operations ───────────────────────────────────────────

    def store(self, upstream: str, api_key: str) -> None:
        """Store a key in the vault."""
        r = self._client.post(
            f"{self.base_url}/manage/store",
            headers={"Authorization": f"Bearer {self.token}"},
            json={"upstream": upstream, "apiKey": api_key},
        )
        r.raise_for_status()

    def get(self, upstream: str) -> str:
        """Get a decrypted key from the vault."""
        r = self._client.get(
            f"{self.base_url}/manage/decrypt/{upstream}",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        r.raise_for_status()
        return r.json()["key"]

    def delete_key(self, upstream: str) -> None:
        """Delete a key from the vault."""
        self._client.delete(
            f"{self.base_url}/manage/secret/{upstream}",
            headers={"Authorization": f"Bearer {self.token}"},
        )

    def list_keys(self) -> list[str]:
        """List all stored keys."""
        r = self._client.get(
            f"{self.base_url}/manage/list",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        return r.json()["keys"]

    # ─── Proxy ───────────────────────────────────────────────────────

    def proxy(self, upstream: str, path: str, json: Any = None, **kwargs) -> httpx.Response:
        """Forward a request to the upstream provider."""
        headers = dict(kwargs.get("headers", {}))
        headers["Authorization"] = f"Bearer {self.token}"
        return self._client.post(
            f"{self.base_url}/proxy/{upstream}/{path}",
            json=json,
            headers=headers,
        )

    # ─── Batch ──────────────────────────────────────────────────────

    def batch(self, requests: list[dict]) -> list[dict]:
        """Send batch requests (concurrent)."""
        r = self._client.post(
            f"{self.base_url}/manage/batch",
            headers={"Authorization": f"Bearer {self.token}"},
            json={"requests": requests},
        )
        return r.json()["results"]

    # ─── Agent operations ───────────────────────────────────────────

    def agent_register(self, pubkey_b58: str, name: str = "agent") -> None:
        """Register an AI agent."""
        self._client.post(
            f"{self.base_url}/agents/register",
            headers={"Authorization": f"Bearer {self.token}"},
            json={"pubkeyB58": pubkey_b58, "name": name},
        )

    def agent_list(self) -> list[dict]:
        """List registered agents."""
        r = self._client.get(
            f"{self.base_url}/agents/list",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        return r.json()["agents"]

    def agent_revoke(self, agent_id: int) -> None:
        """Revoke an agent."""
        self._client.delete(
            f"{self.base_url}/agents/{agent_id}",
            headers={"Authorization": f"Bearer {self.token}"},
        )

    # ─── Helius skill ───────────────────────────────────────────────

    def helius_tools(self) -> list[dict]:
        """List available Helius tools."""
        r = self._client.get(
            f"{self.base_url}/skill/helius/tools",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        return r.json()["tools"]

    def helius_run(self, tool: str, inputs: dict) -> Any:
        """Run a Helius tool."""
        r = self._client.post(
            f"{self.base_url}/skill/helius/run",
            headers={"Authorization": f"Bearer {self.token}"},
            json={"tool": tool, "inputs": inputs},
        )
        return r.json()["result"]

    # ─── Passkeys ───────────────────────────────────────────────────

    def passkey_list(self) -> list[dict]:
        r = self._client.get(
            f"{self.base_url}/auth/passkey/list",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        return r.json()

    def passkey_delete(self, cred_id: str) -> None:
        self._client.delete(
            f"{self.base_url}/auth/passkey/{cred_id}",
            headers={"Authorization": f"Bearer {self.token}"},
        )

    # ─── Pre-configured clients ─────────────────────────────────────

    def openai_client(self, **kwargs) -> Any:
        """Return a pre-configured OpenAI client."""
        import openai
        return openai.OpenAI(
            base_url=f"{self.base_url}/proxy/openai/v1",
            api_key="keyshield-proxy",
            default_headers={"Authorization": f"Bearer {self.token}"},
            **kwargs,
        )

    def anthropic_client(self, **kwargs) -> Any:
        """Return a pre-configured Anthropic client."""
        import anthropic
        return anthropic.Anthropic(
            base_url=f"{self.base_url}/proxy/anthropic/v1",
            api_key="keyshield-proxy",
            default_headers={"Authorization": f"Bearer {self.token}"},
            **kwargs,
        )

    # ─── Context manager ─────────────────────────────────────────────

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self._client.close()

    # ─── Misc ──────────────────────────────────────────────────────────

    @property
    def session(self) -> dict | None:
        return self._session_info

    def health(self) -> dict:
        r = self._client.get(f"{self.base_url}/health")
        return r.json()


class AsyncKeyShield(KeyShield):
    """Async version of KeyShield client."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._client = httpx.AsyncClient(timeout=self.timeout)

    async def login(self, user_id: str, password: str) -> str:
        r = await self._client.post(
            f"{self.base_url}/auth/login",
            json={"userId": user_id, "password": password},
        )
        r.raise_for_status()
        data = r.json()
        self.token = data["token"]
        self._session_info = {"user_id": user_id, "password": password}
        return self.token

    async def store(self, upstream: str, api_key: str) -> None:
        await self._client.post(
            f"{self.base_url}/manage/store",
            headers={"Authorization": f"Bearer {self.token}"},
            json={"upstream": upstream, "apiKey": api_key},
        )

    async def get(self, upstream: str) -> str:
        r = await self._client.get(
            f"{self.base_url}/manage/decrypt/{upstream}",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        r.raise_for_status()
        return r.json()["key"]

    async def list_keys(self) -> list[str]:
        r = await self._client.get(
            f"{self.base_url}/manage/list",
            headers={"Authorization": f"Bearer {self.token}"},
        )
        return r.json()["keys"]

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self._client.aclose()


class AgentKeyShield(KeyShield):
    """Agent-specific KeyShield client with ed25519 auth."""

    def __init__(self, owner_wallet: str, private_key_hex: str, vault_passphrase: str, **kwargs):
        super().__init__(**kwargs)
        self.owner_wallet = owner_wallet
        self.private_key_hex = private_key_hex
        self.vault_passphrase = vault_passphrase
