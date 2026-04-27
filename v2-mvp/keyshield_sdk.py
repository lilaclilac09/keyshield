"""
keyshield_sdk.py — Python SDK for KeyShield v2

Supports:
  - Password login
  - Wallet (ed25519) login with automatic challenge-sign flow
  - Store / list / delete vault secrets
  - Single proxy request
  - Concurrent batch proxy requests

Requirements: Python 3.11+, httpx>=0.27, PyNaCl (for wallet auth)

Install:
  pip install httpx
  pip install pynacl   # only needed if using wallet_login()

Quick start:
  from keyshield_sdk import KeyShield

  ks = KeyShield("http://localhost:8000")
  ks.login("mywallet", "mypassphrase")      # password login

  ks.store("openai", "sk-proj-xxx")         # encrypt and vault the key
  print(ks.list_keys())                     # ['openai']

  # Proxy a request — KeyShield injects the encrypted key
  resp = ks.proxy("openai", "v1/chat/completions",
                  method="POST",
                  json={"model": "gpt-4o-mini",
                        "messages": [{"role": "user", "content": "hello"}]})
  print(resp.json())
"""

from __future__ import annotations

import base64
import os
from typing import Any

try:
    import httpx
except ImportError as exc:  # pragma: no cover
    raise ImportError("KeyShield SDK requires httpx: pip install httpx") from exc


class KeyShieldError(Exception):
    """Raised when the KeyShield API returns an error."""
    def __init__(self, status: int, detail: str):
        super().__init__(f"[{status}] {detail}")
        self.status = status
        self.detail = detail


class KeyShield:
    """
    KeyShield v2 Python client.

    Thread-safe for reads; not designed for concurrent login/logout.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        timeout: float = 30.0,
        token: str | None = None,
    ) -> None:
        self.base_url  = base_url.rstrip("/")
        self._token    = token
        self._client   = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

    # ── Auth ──────────────────────────────────────────────────────────────────

    def login(self, user_id: str, password: str) -> str:
        """
        Password-based login.
        Returns the session token and stores it for subsequent calls.
        """
        resp = self._post("/auth/login", {"userId": user_id, "password": password})
        self._token = resp["token"]
        return self._token

    def wallet_challenge(self) -> dict:
        """Fetch a one-time challenge from the server for wallet signing."""
        r = self._client.get("/auth/wallet-challenge")
        self._raise_for_status(r)
        return r.json()

    def wallet_login(
        self,
        wallet_address: str,
        signature_bytes: bytes,
        challenge: str,
        passphrase: str,
    ) -> str:
        """
        Wallet auth.
        You must sign the challenge with your ed25519 private key before calling
        this method.

        signature_bytes: raw 64-byte ed25519 signature (from nacl.signing.SigningKey.sign())
        """
        sig_b64 = base64.b64encode(signature_bytes).decode()
        resp = self._post("/auth/wallet-login", {
            "walletAddress": wallet_address,
            "signature":     sig_b64,
            "challenge":     challenge,
            "passphrase":    passphrase,
        })
        self._token = resp["token"]
        return self._token

    def wallet_login_with_key(
        self,
        signing_key_hex: str,
        passphrase: str,
    ) -> str:
        """
        Convenience: fetch challenge, sign it with the provided ed25519 private key,
        then login — all in one call.

        signing_key_hex: 64-hex-char ed25519 seed (or 128-hex full keypair)
        Requires: pip install pynacl
        """
        try:
            from nacl.signing import SigningKey
        except ImportError as exc:
            raise ImportError("wallet_login_with_key() requires pynacl: pip install pynacl") from exc

        seed = bytes.fromhex(signing_key_hex[:64])  # first 32 bytes = seed
        sk   = SigningKey(seed)
        wallet_address = base64.b64encode(bytes(sk.verify_key)).decode()
        # Solana uses base58; if you want base58 address, use base58.b58encode
        # This convenience method uses base64 for simplicity

        ch_data   = self.wallet_challenge()
        challenge = ch_data["challenge"]
        sig_bytes = sk.sign(challenge.encode()).signature
        return self.wallet_login(wallet_address, sig_bytes, challenge, passphrase)

    def logout(self) -> None:
        """Invalidate the current session token on the server."""
        if not self._token:
            return
        try:
            self._authed("POST", "/auth/logout")
        finally:
            self._token = None

    # ── Key management ────────────────────────────────────────────────────────

    def store(self, upstream: str, api_key: str) -> None:
        """
        Encrypt and vault an API key.
        upstream: one of openai | anthropic | mistral | cohere | groq | helius
        """
        self._authed_post("/manage/store", {"upstream": upstream, "apiKey": api_key})

    def list_keys(self) -> list[str]:
        """Return the list of upstream names for which you have stored keys."""
        return self._authed("GET", "/manage/list")["keys"]

    def delete_key(self, upstream: str) -> None:
        """Remove a stored API key from the vault."""
        self._authed("DELETE", f"/manage/secret/{upstream}")

    # ── Proxy ─────────────────────────────────────────────────────────────────

    def proxy(
        self,
        upstream: str,
        path: str,
        method: str = "POST",
        json: Any = None,
        headers: dict | None = None,
    ) -> httpx.Response:
        """
        Forward a request through the KeyShield proxy.
        The vault key for `upstream` is injected server-side.

        Returns the raw httpx.Response so you can inspect status, headers, and body.
        """
        self._require_token()
        full_path = f"/proxy/{upstream}/{path.lstrip('/')}"
        extra_headers = {"Authorization": f"Bearer {self._token}"}
        if headers:
            extra_headers.update(headers)
        r = self._client.request(method=method.upper(), url=full_path,
                                  json=json, headers=extra_headers)
        return r

    def batch(self, requests: list[dict]) -> list[dict]:
        """
        Send up to 20 requests concurrently through the proxy.

        Each request dict: {upstream, path, method, body}
        Returns list of {status, cache, data | error}

        Example:
          results = ks.batch([
            {"upstream": "openai", "path": "v1/models"},
            {"upstream": "helius", "body": {"jsonrpc":"2.0","id":1,
              "method":"getBalance","params":["<addr>"]}},
          ])
        """
        return self._authed_post("/manage/batch", {"requests": requests})["results"]

    # ── Helius skills ─────────────────────────────────────────────────────────

    def helius_tools(self) -> list[dict]:
        """List available Helius skill tools."""
        r = self._client.get("/skill/helius/tools")
        self._raise_for_status(r)
        return r.json()["tools"]

    def helius_run(self, tool: str, inputs: dict | None = None) -> Any:
        """
        Run a Helius skill tool.
        Example: ks.helius_run("portfolio", {"wallet": "9WzDX..."})
        """
        return self._authed_post(
            "/skill/helius/run",
            {"tool": tool, "inputs": inputs or {}},
        )["result"]

    # ── Health ────────────────────────────────────────────────────────────────

    def health(self) -> dict:
        """Check backend health."""
        r = self._client.get("/health")
        self._raise_for_status(r)
        return r.json()

    # ── Context manager ───────────────────────────────────────────────────────

    def __enter__(self) -> "KeyShield":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    # ── Internals ─────────────────────────────────────────────────────────────

    def _require_token(self) -> str:
        if not self._token:
            raise KeyShieldError(401, "Not authenticated. Call login() first.")
        return self._token

    def _raise_for_status(self, r: httpx.Response) -> None:
        if r.is_error:
            try:
                detail = r.json().get("detail", r.text)
            except Exception:
                detail = r.text
            raise KeyShieldError(r.status_code, detail)

    def _post(self, path: str, data: dict) -> dict:
        r = self._client.post(path, json=data)
        self._raise_for_status(r)
        return r.json()

    def _authed(self, method: str, path: str, **kwargs: Any) -> Any:
        token = self._require_token()
        r = self._client.request(
            method, path,
            headers={"Authorization": f"Bearer {token}"},
            **kwargs,
        )
        self._raise_for_status(r)
        return r.json()

    def _authed_post(self, path: str, data: dict) -> Any:
        return self._authed("POST", path, json=data)


# ── Async client ──────────────────────────────────────────────────────────────

class AsyncKeyShield:
    """
    Async version of the KeyShield client (uses httpx.AsyncClient).

    Usage:
      async with AsyncKeyShield() as ks:
          await ks.login("myuser", "mypass")
          keys = await ks.list_keys()
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        timeout: float = 30.0,
        token: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._token   = token
        self._client  = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

    async def login(self, user_id: str, password: str) -> str:
        r = await self._client.post("/auth/login", json={"userId": user_id, "password": password})
        _async_raise(r)
        self._token = r.json()["token"]
        return self._token

    async def store(self, upstream: str, api_key: str) -> None:
        token = self._require_token()
        r = await self._client.post(
            "/manage/store",
            json={"upstream": upstream, "apiKey": api_key},
            headers={"Authorization": f"Bearer {token}"},
        )
        _async_raise(r)

    async def list_keys(self) -> list[str]:
        token = self._require_token()
        r = await self._client.get(
            "/manage/list",
            headers={"Authorization": f"Bearer {token}"},
        )
        _async_raise(r)
        return r.json()["keys"]

    async def proxy(self, upstream: str, path: str, method: str = "POST",
                    json: Any = None) -> httpx.Response:
        token = self._require_token()
        return await self._client.request(
            method=method.upper(),
            url=f"/proxy/{upstream}/{path.lstrip('/')}",
            json=json,
            headers={"Authorization": f"Bearer {token}"},
        )

    async def health(self) -> dict:
        r = await self._client.get("/health")
        _async_raise(r)
        return r.json()

    def _require_token(self) -> str:
        if not self._token:
            raise KeyShieldError(401, "Not authenticated. Call login() first.")
        return self._token

    async def __aenter__(self) -> "AsyncKeyShield":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self._client.aclose()


def _async_raise(r: httpx.Response) -> None:
    if r.is_error:
        try:
            detail = r.json().get("detail", r.text)
        except Exception:
            detail = r.text
        raise KeyShieldError(r.status_code, detail)


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys, json as _json

    def _usage():
        print("""
Usage: python keyshield_sdk.py <command> [args]

Commands:
  health
  login     <userId> <password>
  store     <upstream> <apiKey>
  list
  delete    <upstream>
  proxy     <upstream> <path> [json_body]
""")
        sys.exit(1)

    args = sys.argv[1:]
    if not args:
        _usage()

    cmd  = args[0]
    rest = args[1:]
    ks = KeyShield(os.environ.get("KS_BASE", "http://localhost:8000"))
    # Load saved token from ~/.keyshield/token if present
    token_path = os.path.expanduser("~/.keyshield/token")
    if os.path.exists(token_path):
        with open(token_path) as f:
            ks._token = f.read().strip()

    if cmd == "health":
        print(_json.dumps(ks.health(), indent=2))
    elif cmd == "login":
        tok = ks.login(rest[0], rest[1])
        os.makedirs(os.path.dirname(token_path), exist_ok=True)
        with open(token_path, "w") as f: f.write(tok)
        os.chmod(token_path, 0o600)
        print(f"✅ Logged in. Token saved to {token_path}")
    elif cmd == "store":
        ks.store(rest[0], rest[1])
        print(f"✅ {rest[0]} key stored (encrypted)")
    elif cmd == "list":
        print(_json.dumps(ks.list_keys(), indent=2))
    elif cmd == "delete":
        ks.delete_key(rest[0])
        print(f"✅ {rest[0]} key deleted")
    elif cmd == "proxy":
        body = _json.loads(rest[2]) if len(rest) > 2 else None
        r = ks.proxy(rest[0], rest[1], json=body)
        print(r.text)
    else:
        _usage()
