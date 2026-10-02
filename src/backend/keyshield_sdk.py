"""
keyshield_sdk.py — Python SDK for KeyShield v2
===============================================

Supported upstreams: openai | anthropic | mistral | cohere | groq | helius

Install:
  pip install httpx
  pip install pynacl   # only needed for wallet_login_with_key()
  pip install base58   # only needed for wallet_login_with_key()

Quick start — password login:
  from keyshield_sdk import KeyShield
  ks = KeyShield()
  ks.login("myuser", "mypassphrase")
  ks.store("openai", "sk-proj-xxx")
  resp = ks.proxy("openai", "v1/chat/completions", json={
      "model": "gpt-4o-mini",
      "messages": [{"role": "user", "content": "hello"}]
  })
  print(resp.json())

Quick start — wallet login (one call):
  ks = KeyShield()
  ks.wallet_login_with_key("your_64_hex_ed25519_seed", "vault_passphrase")

Async:
  from keyshield_sdk import AsyncKeyShield
  async with AsyncKeyShield() as ks:
      await ks.wallet_login_with_key("seed_hex", "passphrase")
      keys = await ks.list_keys()
"""

from __future__ import annotations

import base64
import os
from typing import Any

try:
    import httpx
except ImportError as exc:
    raise ImportError("KeyShield SDK requires httpx: pip install httpx") from exc


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


# ─── Sync client ──────────────────────────────────────────────────────────────


class KeyShield:
    """
    KeyShield v2 Python client (synchronous).

    Thread-safe for reads; not designed for concurrent login/logout.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8001",
        timeout: float = 30.0,
        token: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._token = token
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

    # ── Auth ──────────────────────────────────────────────────────────────────

    def login(self, user_id: str, password: str) -> str:
        """Password login. Returns + stores the session token."""
        resp = self._post("/auth/login", {"userId": user_id, "password": password})
        self._token = resp["token"]
        return self._token

    def wallet_challenge(self) -> dict:
        """Fetch a one-time signing challenge from the server."""
        r = self._client.get("/auth/wallet-challenge")
        self._raise(r)
        return r.json()

    def wallet_login(
        self,
        wallet_address: str,
        signature_bytes: bytes,
        challenge: str,
        passphrase: str,
    ) -> str:
        """
        Submit a signed wallet challenge and get a session token.

        wallet_address: base58-encoded Solana public key (32 bytes)
        signature_bytes: raw 64-byte ed25519 signature
        challenge: the exact string returned by wallet_challenge()
        passphrase: your vault decryption passphrase
        """
        sig_b64 = base64.b64encode(signature_bytes).decode()
        resp = self._post(
            "/auth/wallet-login",
            {
                "walletAddress": wallet_address,
                "signature": sig_b64,
                "challenge": challenge,
                "passphrase": passphrase,
            },
        )
        self._token = resp["token"]
        return self._token

    def wallet_login_with_key(
        self,
        signing_key_hex: str,
        passphrase: str,
    ) -> str:
        """
        One-call wallet login: fetch challenge → sign → login.

        signing_key_hex: 64-hex-char ed25519 seed (first 32 bytes of keypair)
        passphrase: your vault passphrase

        Requires: pip install pynacl base58
        """
        try:
            from nacl.signing import SigningKey
        except ImportError as exc:
            raise ImportError(
                "wallet_login_with_key() requires pynacl: pip install pynacl"
            ) from exc

        seed = bytes.fromhex(signing_key_hex[:64])
        sk = SigningKey(seed)
        # Solana addresses are base58-encoded 32-byte public keys
        wallet_address = _b58encode(bytes(sk.verify_key))

        ch_data = self.wallet_challenge()
        challenge = ch_data["challenge"]
        sig_bytes = sk.sign(challenge.encode()).signature
        return self.wallet_login(wallet_address, sig_bytes, challenge, passphrase)

    def logout(self) -> None:
        """Revoke the current session token on the server."""
        if not self._token:
            return
        try:
            self._authed("POST", "/auth/logout")
        finally:
            self._token = None

    # ── Key management ────────────────────────────────────────────────────────

    def store(self, upstream: str, api_key: str) -> None:
        """
        Encrypt and store an API key.
        upstream: openai | anthropic | mistral | cohere | groq | helius
        """
        self._authed_post("/manage/store", {"upstream": upstream, "value": api_key, "apiKey": api_key})

    def list_keys(self) -> list[str]:
        """Return the list of upstream names you have stored keys for."""
        return self._authed("GET", "/manage/list")["keys"]

    def list_items(self) -> list[dict]:
        """Return vault items with metadata (upstream, createdAt, updatedAt)."""
        return self._authed("GET", "/manage/list").get("items", [])

    def decrypt_key(self, upstream: str) -> str:
        """
        Decrypt and return a stored API key in plaintext.
        The server decrypts using your session passphrase.
        Never share or log this value.
        """
        return self._authed("GET", f"/manage/decrypt/{upstream}")["key"]

    def delete_key(self, upstream: str) -> None:
        """Remove a stored API key from the vault."""
        self._authed("DELETE", f"/manage/secret/{upstream}")

    # ── Proxy ─────────────────────────────────────────────────────────────────

    def proxy(
        self,
        upstream: str,
        path: str = "",
        method: str = "POST",
        json: Any = None,
        headers: dict | None = None,
    ) -> httpx.Response:
        """
        Forward a request through the KeyShield proxy.
        The encrypted API key is injected server-side — you never handle it.

        Returns the raw httpx.Response.

        Example:
          resp = ks.proxy("openai", "v1/chat/completions", json={
              "model": "gpt-4o-mini",
              "messages": [{"role": "user", "content": "hello"}],
          })
          print(resp.json()["choices"][0]["message"]["content"])
        """
        self._require_token()
        full_path = f"/proxy/{upstream}/{path.lstrip('/')}"
        hdrs = {"Authorization": f"Bearer {self._token}"}
        if headers:
            hdrs.update(headers)
        return self._client.request(method=method.upper(), url=full_path, json=json, headers=hdrs)

    # ── Batch ─────────────────────────────────────────────────────────────────

    def batch(self, requests: list[dict]) -> list[dict]:
        """
        Send up to 20 requests concurrently (server-side asyncio.gather).

        Each item: {"upstream": str, "path": str, "method": str, "body": dict}
        Returns: [{"status": int, "cache": str, "data": dict | None} | {"error": str}]

        Example:
          results = ks.batch([
              {"upstream": "openai", "path": "v1/models", "method": "GET"},
              {"upstream": "helius", "body": {"jsonrpc":"2.0","id":1,
               "method":"getBalance","params":["9WzDX..."]}},
          ])
        """
        return self._authed_post("/manage/batch", {"requests": requests})["results"]

    # ── Helius skills ─────────────────────────────────────────────────────────

    def helius_tools(self) -> list[dict]:
        """List available Helius skill tool schemas."""
        r = self._client.get("/skill/helius/tools")
        self._raise(r)
        return r.json()["tools"]

    def helius_run(self, tool: str, inputs: dict | None = None) -> Any:
        """
        Run a Helius skill tool by name.
        Available tools: portfolio, nft_owners, top_holders, price, tx_history, token_metadata

        Example:
          result = ks.helius_run("portfolio", {"wallet": "9WzDX..."})
        """
        return self._authed_post("/skill/helius/run", {"tool": tool, "inputs": inputs or {}})[
            "result"
        ]

    # ── Passkeys ──────────────────────────────────────────────────────────────

    def passkey_list(self) -> list[dict]:
        """List WebAuthn passkeys registered for your account."""
        return self._authed("GET", "/auth/passkey/list")["credentials"]

    def passkey_delete(self, cred_id: str) -> None:
        """Remove a registered passkey by credential ID."""
        self._authed("DELETE", f"/auth/passkey/{cred_id}")

    # ── Health ────────────────────────────────────────────────────────────────

    def health(self) -> dict:
        """Check backend health and cache stats."""
        r = self._client.get("/health")
        self._raise(r)
        return r.json()

    # ── Context manager ───────────────────────────────────────────────────────

    def __enter__(self) -> "KeyShield":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    # ── Proxy URL helpers ─────────────────────────────────────────────────────

    def proxy_url(self, upstream: str) -> str:
        """Return the proxy base URL for an upstream. Use this as base_url in AI SDKs."""
        return f"{self.base_url}/proxy/{upstream}/"

    def openai_client(self, api_key: str | None = None) -> Any:
        """
        Return a pre-configured openai.OpenAI client routed through the proxy.
        Session token is the OpenAI api_key; pass api_key= for X-Upstream-API-Key.
        Requires: pip install openai
        """
        try:
            import openai
        except ImportError as exc:
            raise ImportError("openai_client() requires: pip install openai") from exc
        token = self._require_token()
        extra = {"X-Upstream-API-Key": api_key} if api_key else {}
        base = self.proxy_url("openai") if api_key else f"{self.base_url}/vproxy/openai/"
        return openai.OpenAI(
            base_url=base,
            api_key=token,
            default_headers=extra or None,
        )

    def anthropic_client(self) -> Any:
        """
        Return a pre-configured anthropic.Anthropic client routed through the proxy.
        Requires: pip install anthropic
        """
        try:
            import anthropic
        except ImportError as exc:
            raise ImportError("anthropic_client() requires: pip install anthropic") from exc
        return anthropic.Anthropic(
            base_url=self.proxy_url("anthropic"),
            api_key="keyshield-proxy",
            default_headers={"Authorization": f"Bearer {self._require_token()}"},
        )

    # ── Internals ─────────────────────────────────────────────────────────────

    def _require_token(self) -> str:
        if not self._token:
            raise KeyShieldError(401, "Not authenticated. Call login() or wallet_login() first.")
        return self._token

    def _raise(self, r: httpx.Response) -> None:
        if r.is_error:
            try:
                detail = r.json().get("detail", r.text)
            except Exception:
                detail = r.text
            raise KeyShieldError(r.status_code, str(detail))

    def _post(self, path: str, data: dict) -> dict:
        r = self._client.post(path, json=data)
        self._raise(r)
        return r.json()

    def _authed(self, method: str, path: str, **kwargs: Any) -> Any:
        r = self._client.request(
            method,
            path,
            headers={"Authorization": f"Bearer {self._require_token()}"},
            **kwargs,
        )
        self._raise(r)
        return r.json()

    def _authed_post(self, path: str, data: dict) -> Any:
        return self._authed("POST", path, json=data)


# ─── Async client ─────────────────────────────────────────────────────────────


class AsyncKeyShield:
    """
    Async version of the KeyShield client.

    Usage:
      async with AsyncKeyShield() as ks:
          await ks.wallet_login_with_key("seed_hex", "passphrase")
          print(await ks.list_keys())
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8001",
        timeout: float = 30.0,
        token: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._token = token
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

    async def login(self, user_id: str, password: str) -> str:
        r = await self._client.post("/auth/login", json={"userId": user_id, "password": password})
        _raise(r)
        self._token = r.json()["token"]
        return self._token

    async def wallet_challenge(self) -> dict:
        r = await self._client.get("/auth/wallet-challenge")
        _raise(r)
        return r.json()

    async def wallet_login(
        self,
        wallet_address: str,
        signature_bytes: bytes,
        challenge: str,
        passphrase: str,
    ) -> str:
        sig_b64 = base64.b64encode(signature_bytes).decode()
        r = await self._client.post(
            "/auth/wallet-login",
            json={
                "walletAddress": wallet_address,
                "signature": sig_b64,
                "challenge": challenge,
                "passphrase": passphrase,
            },
        )
        _raise(r)
        self._token = r.json()["token"]
        return self._token

    async def wallet_login_with_key(self, signing_key_hex: str, passphrase: str) -> str:
        """One-call async wallet login. Requires pynacl."""
        try:
            from nacl.signing import SigningKey
        except ImportError as exc:
            raise ImportError("Requires pynacl: pip install pynacl") from exc
        seed = bytes.fromhex(signing_key_hex[:64])
        sk = SigningKey(seed)
        wallet_addr = _b58encode(bytes(sk.verify_key))
        ch_data = await self.wallet_challenge()
        challenge = ch_data["challenge"]
        sig_bytes = sk.sign(challenge.encode()).signature
        return await self.wallet_login(wallet_addr, sig_bytes, challenge, passphrase)

    async def logout(self) -> None:
        if not self._token:
            return
        try:
            await self._authed("POST", "/auth/logout")
        finally:
            self._token = None

    async def store(self, upstream: str, api_key: str) -> None:
        await self._authed_post("/manage/store", {"upstream": upstream, "value": api_key, "apiKey": api_key})

    async def list_keys(self) -> list[str]:
        data = await self._authed("GET", "/manage/list")
        return data["keys"]

    async def list_items(self) -> list[dict]:
        data = await self._authed("GET", "/manage/list")
        return data.get("items", [])

    async def decrypt_key(self, upstream: str) -> str:
        data = await self._authed("GET", f"/manage/decrypt/{upstream}")
        return data["key"]

    async def delete_key(self, upstream: str) -> None:
        await self._authed("DELETE", f"/manage/secret/{upstream}")

    async def proxy(
        self,
        upstream: str,
        path: str = "",
        method: str = "POST",
        json: Any = None,
        headers: dict | None = None,
    ) -> httpx.Response:
        self._require_token()
        hdrs = {"Authorization": f"Bearer {self._token}"}
        if headers:
            hdrs.update(headers)
        return await self._client.request(
            method=method.upper(),
            url=f"/proxy/{upstream}/{path.lstrip('/')}",
            json=json,
            headers=hdrs,
        )

    async def batch(self, requests: list[dict]) -> list[dict]:
        data = await self._authed_post("/manage/batch", {"requests": requests})
        return data["results"]

    async def helius_run(self, tool: str, inputs: dict | None = None) -> Any:
        data = await self._authed_post("/skill/helius/run", {"tool": tool, "inputs": inputs or {}})
        return data["result"]

    async def passkey_list(self) -> list[dict]:
        data = await self._authed("GET", "/auth/passkey/list")
        return data["credentials"]

    async def passkey_delete(self, cred_id: str) -> None:
        await self._authed("DELETE", f"/auth/passkey/{cred_id}")

    async def health(self) -> dict:
        r = await self._client.get("/health")
        _raise(r)
        return r.json()

    def proxy_url(self, upstream: str) -> str:
        return f"{self.base_url}/proxy/{upstream}/"

    def _require_token(self) -> str:
        if not self._token:
            raise KeyShieldError(401, "Not authenticated. Call login() first.")
        return self._token

    async def _authed(self, method: str, path: str, **kwargs: Any) -> Any:
        r = await self._client.request(
            method,
            path,
            headers={"Authorization": f"Bearer {self._require_token()}"},
            **kwargs,
        )
        _raise(r)
        return r.json()

    async def _authed_post(self, path: str, data: dict) -> Any:
        return await self._authed("POST", path, json=data)

    async def __aenter__(self) -> "AsyncKeyShield":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self._client.aclose()


def _raise(r: httpx.Response) -> None:
    if r.is_error:
        try:
            detail = r.json().get("detail", r.text)
        except Exception:
            detail = r.text
        raise KeyShieldError(r.status_code, str(detail))


# ─── AgentKeyShield — programmatic vault access for AI agents ─────────────────


class AgentKeyShield:
    """
    KeyShield client for AI agents.

    Agents have their own ed25519 keypair — no human, no WebAuthn, no wallet
    extension. The vault owner registers the agent's pubkey once. The agent then
    self-authenticates by signing a server challenge.

    Quick start:
      # 1. Generate a keypair for your agent (run once, save the output)
      creds = AgentKeyShield.generate_keypair()
      print(creds)
      # → {"private_key_hex": "abcd...", "pubkey_b58": "9WzDX..."}

      # 2. Owner registers the pubkey in the dashboard (or SDK):
      ks = KeyShield(token=OWNER_TOKEN)
      ks.agent_register(pubkey_b58=creds["pubkey_b58"], name="trading-bot-v1")

      # 3. Agent authenticates on every run:
      agent = AgentKeyShield(
          owner_wallet  = "9WzDX...",        # owner's Solana wallet
          private_key_hex = os.getenv("AGENT_KEY"),
          vault_passphrase = os.getenv("VAULT_PASS"),
      )
      agent.authenticate()

      # 4. Use exactly like KeyShield:
      resp = agent.proxy("openai", "v1/chat/completions", json={
          "model": "gpt-4o-mini",
          "messages": [{"role": "user", "content": "analyze SOL price"}],
      })

    Environment variables (optional, picked up automatically):
      KS_OWNER_WALLET   — owner's Solana wallet address
      KS_AGENT_KEY      — agent private key hex (64 chars)
      KS_VAULT_PASS     — vault decryption passphrase
      KS_BASE           — KeyShield URL (default: http://localhost:8001)
    """

    def __init__(
        self,
        owner_wallet: str | None = None,
        private_key_hex: str | None = None,
        vault_passphrase: str | None = None,
        base_url: str = "http://localhost:8001",
        timeout: float = 30.0,
    ) -> None:
        self._owner = owner_wallet or os.getenv("KS_OWNER_WALLET", "")
        self._key_hex = private_key_hex or os.getenv("KS_AGENT_KEY", "")
        self._pass = vault_passphrase or os.getenv("KS_VAULT_PASS", "")
        self._base = (base_url or os.getenv("KS_BASE", "http://localhost:8001")).rstrip("/")
        self._token: str | None = None
        self._client = httpx.Client(
            base_url=self._base,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

    # ── Keypair utilities ─────────────────────────────────────────────────────

    @staticmethod
    def generate_keypair() -> dict:
        """
        Generate a fresh ed25519 keypair for a new agent.

        Returns:
          {
            "private_key_hex": "...",   # 64-char hex — store in env var, NEVER commit
            "pubkey_b58":      "...",   # register this in the KeyShield dashboard
          }

        Requires: pip install pynacl
        """
        try:
            from nacl.signing import SigningKey
        except ImportError as exc:
            raise ImportError("generate_keypair() requires pynacl: pip install pynacl") from exc
        sk = SigningKey.generate()
        return {
            "private_key_hex": sk.encode().hex(),
            "pubkey_b58": _b58encode(bytes(sk.verify_key)),
        }

    @property
    def pubkey_b58(self) -> str:
        """Return this agent's base58 public key (derived from private_key_hex)."""
        try:
            from nacl.signing import SigningKey
        except ImportError as exc:
            raise ImportError("Requires pynacl: pip install pynacl") from exc
        sk = SigningKey(bytes.fromhex(self._key_hex[:64]))
        return _b58encode(bytes(sk.verify_key))

    # ── Auth ──────────────────────────────────────────────────────────────────

    def authenticate(self) -> str:
        """
        Sign a server challenge and exchange it for a session token.
        Called automatically on first proxy/store/list call if not already done.
        Re-authenticates transparently when the token expires.

        Returns the session token.
        """
        try:
            from nacl.signing import SigningKey
        except ImportError as exc:
            raise ImportError("AgentKeyShield requires pynacl: pip install pynacl") from exc

        if not self._owner:
            raise KeyShieldError(400, "owner_wallet not set — pass it or set KS_OWNER_WALLET")
        if not self._key_hex:
            raise KeyShieldError(400, "private_key_hex not set — pass it or set KS_AGENT_KEY")
        if not self._pass:
            raise KeyShieldError(400, "vault_passphrase not set — pass it or set KS_VAULT_PASS")

        # 1. Fetch challenge
        r = self._client.post("/auth/agent-challenge")
        _raise(r)
        challenge = r.json()["challenge"]

        # 2. Sign with agent's private key
        sk = SigningKey(bytes.fromhex(self._key_hex[:64]))
        sig_bytes = sk.sign(challenge.encode()).signature
        sig_b64 = base64.b64encode(sig_bytes).decode()
        pubkey = _b58encode(bytes(sk.verify_key))

        # 3. Submit
        r = self._client.post(
            "/auth/agent-login",
            json={
                "pubkeyB58": pubkey,
                "ownerWallet": self._owner,
                "signature": sig_b64,
                "challenge": challenge,
                "nonce": challenge,
                "passphrase": self._pass,
            },
        )
        _raise(r)
        d = r.json()
        self._token = d["token"]
        return self._token

    # ── Vault + proxy (same interface as KeyShield) ───────────────────────────

    def store(self, upstream: str, api_key: str) -> None:
        """Store an API key in the owner's vault."""
        self._authed_post("/manage/store", {"upstream": upstream, "value": api_key, "apiKey": api_key})

    def list_keys(self) -> list[str]:
        return self._authed("GET", "/manage/list")["keys"]

    def proxy(
        self,
        upstream: str,
        path: str = "",
        method: str = "POST",
        json: Any = None,
        headers: dict | None = None,
    ) -> httpx.Response:
        """Forward a request through the KeyShield proxy as the vault owner."""
        self._ensure_token()
        hdrs = {"Authorization": f"Bearer {self._token}"}
        if headers:
            hdrs.update(headers)
        return self._client.request(
            method=method.upper(),
            url=f"/proxy/{upstream}/{path.lstrip('/')}",
            json=json,
            headers=hdrs,
        )

    def proxy_url(self, upstream: str) -> str:
        return f"{self._base}/proxy/{upstream}/"

    def openai_client(self, api_key: str | None = None) -> Any:
        try:
            import openai
        except ImportError as exc:
            raise ImportError("requires: pip install openai") from exc
        self._ensure_token()
        extra = {"X-Upstream-API-Key": api_key} if api_key else {}
        base = self.proxy_url("openai") if api_key else f"{self._base}/vproxy/openai/"
        return openai.OpenAI(
            base_url=base,
            api_key=self._token,
            default_headers=extra or None,
        )

    def anthropic_client(self) -> Any:
        """Pre-configured anthropic.Anthropic routed through the proxy. Requires: pip install anthropic"""
        try:
            import anthropic
        except ImportError as exc:
            raise ImportError("requires: pip install anthropic") from exc
        self._ensure_token()
        return anthropic.Anthropic(
            base_url=self.proxy_url("anthropic"),
            api_key="keyshield-agent",
            default_headers={"Authorization": f"Bearer {self._token}"},
        )

    # ── Agent management helpers (owner operations) ───────────────────────────

    def agent_register(self, pubkey_b58: str, name: str = "agent", scopes: str = "*") -> dict:
        """Register an agent pubkey under this client's vault. Requires owner token."""
        return self._authed_post(
            "/agents/register",
            {
                "pubkeyB58": pubkey_b58,
                "name": name,
                "scopes": scopes,
            },
        )

    def agent_list(self) -> list[dict]:
        """List all agents registered under this vault."""
        return self._authed("GET", "/agents/list")["agents"]

    def agent_revoke(self, agent_id: int) -> None:
        """Revoke an agent's access by id."""
        self._authed("DELETE", f"/agents/{agent_id}")

    # ── Internals ─────────────────────────────────────────────────────────────

    def _ensure_token(self) -> None:
        if not self._token:
            self.authenticate()

    def _authed(self, method: str, path: str, **kwargs: Any) -> Any:
        self._ensure_token()
        r = self._client.request(
            method,
            path,
            headers={"Authorization": f"Bearer {self._token}"},
            **kwargs,
        )
        _raise(r)
        return r.json()

    def _authed_post(self, path: str, data: dict) -> Any:
        return self._authed("POST", path, json=data)

    def __enter__(self) -> "AgentKeyShield":
        return self

    def __exit__(self, *_: Any) -> None:
        self._client.close()

    def close(self) -> None:
        self._client.close()


# ─── Add agent_register/agent_list/agent_revoke to KeyShield + AsyncKeyShield ─


def _ks_agent_register(
    self: "KeyShield", pubkey_b58: str, name: str = "agent", scopes: str = "*"
) -> dict:
    return self._authed_post(
        "/agents/register", {"pubkeyB58": pubkey_b58, "name": name, "scopes": scopes}
    )


def _ks_agent_list(self: "KeyShield") -> list[dict]:
    return self._authed("GET", "/agents/list")["agents"]


def _ks_agent_revoke(self: "KeyShield", agent_id: int) -> None:
    self._authed("DELETE", f"/agents/{agent_id}")


KeyShield.agent_register = _ks_agent_register  # type: ignore[attr-defined]
KeyShield.agent_list = _ks_agent_list  # type: ignore[attr-defined]
KeyShield.agent_revoke = _ks_agent_revoke  # type: ignore[attr-defined]


# ─── CLI entry point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import json as _json

    TOKEN_PATH = os.path.expanduser("~/.keyshield/token")

    def _load_token(ks: KeyShield) -> None:
        if os.path.exists(TOKEN_PATH):
            with open(TOKEN_PATH) as f:
                ks._token = f.read().strip()

    def _save_token(token: str) -> None:
        os.makedirs(os.path.dirname(TOKEN_PATH), exist_ok=True)
        with open(TOKEN_PATH, "w") as f:
            f.write(token)
        os.chmod(TOKEN_PATH, 0o600)
        print(f"Token saved → {TOKEN_PATH}")

    def _usage():
        print("""
KeyShield Python SDK — CLI

Usage: python keyshield_sdk.py <command> [args]

Auth:
  health
  login         <userId> <password>
  wallet-login  <seed_hex> <passphrase>      # sign challenge with ed25519 key
  logout

Vault:
  store   <upstream> <apiKey>
  list
  decrypt <upstream>                          # show raw key (handle with care!)
  delete  <upstream>

Proxy:
  proxy   <upstream> <path> [json_body]

Passkeys:
  passkey-list
  passkey-delete <credId>

Examples:
  python keyshield_sdk.py health
  python keyshield_sdk.py login myuser mypass
  python keyshield_sdk.py wallet-login abc123def456... mypassphrase
  python keyshield_sdk.py store openai sk-proj-xxx
  python keyshield_sdk.py list
  python keyshield_sdk.py proxy openai v1/models
  python keyshield_sdk.py proxy openai v1/chat/completions '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'
""")
        sys.exit(1)

    args = sys.argv[1:]
    if not args:
        _usage()

    cmd = args[0]
    rest = args[1:]
    ks = KeyShield(os.environ.get("KS_BASE", "http://localhost:8001"))
    _load_token(ks)

    if cmd == "health":
        print(_json.dumps(ks.health(), indent=2))

    elif cmd == "login":
        if len(rest) < 2:
            print("Usage: login <userId> <password>")
            sys.exit(1)
        tok = ks.login(rest[0], rest[1])
        _save_token(tok)
        print("Logged in.")

    elif cmd in ("wallet-login", "wlogin"):
        if len(rest) < 2:
            print("Usage: wallet-login <seed_hex_64chars> <passphrase>")
            sys.exit(1)
        tok = ks.wallet_login_with_key(rest[0], rest[1])
        _save_token(tok)
        print("Wallet login successful.")

    elif cmd == "logout":
        ks.logout()
        if os.path.exists(TOKEN_PATH):
            os.remove(TOKEN_PATH)
        print("Logged out.")

    elif cmd == "store":
        if len(rest) < 2:
            print("Usage: store <upstream> <apiKey>")
            sys.exit(1)
        ks.store(rest[0], rest[1])
        print(f"Stored {rest[0]} key (encrypted).")

    elif cmd == "list":
        items = ks.list_items()
        if not items:
            print("No keys stored.")
        else:
            for item in items:
                from datetime import datetime

                ts = datetime.fromtimestamp(item["createdAt"]).strftime("%Y-%m-%d")
                print(f"  {item['upstream']:12s}  (stored {ts})")

    elif cmd == "decrypt":
        if not rest:
            print("Usage: decrypt <upstream>")
            sys.exit(1)
        print("WARNING: raw key below — handle with care\n")
        print(ks.decrypt_key(rest[0]))

    elif cmd == "delete":
        if not rest:
            print("Usage: delete <upstream>")
            sys.exit(1)
        ks.delete_key(rest[0])
        print(f"Deleted {rest[0]} key.")

    elif cmd == "proxy":
        if not rest:
            print("Usage: proxy <upstream> <path> [json_body]")
            sys.exit(1)
        upstream = rest[0]
        path = rest[1] if len(rest) > 1 else ""
        body = _json.loads(rest[2]) if len(rest) > 2 else None
        r = ks.proxy(upstream, path, json=body)
        print(r.text)

    elif cmd == "passkey-list":
        creds = ks.passkey_list()
        if not creds:
            print("No passkeys registered.")
        else:
            for c in creds:
                from datetime import datetime

                ts = datetime.fromtimestamp(c["createdAt"]).strftime("%Y-%m-%d")
                print(f"  {c['name']:20s}  {c['id'][:24]}…  {ts}")

    elif cmd == "passkey-delete":
        if not rest:
            print("Usage: passkey-delete <credId>")
            sys.exit(1)
        ks.passkey_delete(rest[0])
        print("Passkey deleted.")

    else:
        print(f"Unknown command: {cmd}")
        _usage()
