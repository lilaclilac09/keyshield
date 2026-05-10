"""
keyshield — Python SDK for the v2-mvp server (vault, proxy, x402 billing,
agent identity).

Three client classes:

  KeyShield        — sync, password / wallet login. The owner-side surface.
  AsyncKeyShield   — async/await variant of the above.
  AgentKeyShield   — programmatic ed25519 self-auth for AI agents. After
                     `authenticate()`, every call bills against the agent's
                     own balance (not the owner's), matching the caller_id
                     wiring on the server side.

Quick start (owner):

    from keyshield import KeyShield
    with KeyShield("http://localhost:8000") as ks:
        ks.login("alice", "secret")
        ks.store("openai", "sk-...")
        ks.set_pricing("openai", price_usd=0.001)   # opt-in to billing

Quick start (agent):

    from keyshield import AgentKeyShield
    agent = AgentKeyShield(
        owner_wallet="9WzDX...",
        private_key_hex=os.environ["AGENT_KEY"],
        vault_passphrase=os.environ["VAULT_PASS"],
    )
    resp = agent.proxy("openai", "v1/chat/completions", json={
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "hi"}],
    })

The wire format and endpoints are documented inside `v2-mvp/src/server.py`;
this module is a thin, type-friendly facade over them.
"""

from __future__ import annotations

import base64
import os
from typing import Any

try:
    import httpx
except ImportError as exc:  # pragma: no cover
    raise ImportError("keyshield requires httpx: pip install httpx") from exc


__version__ = "0.1.0"
__all__ = [
    "KeyShield",
    "AsyncKeyShield",
    "AgentKeyShield",
    "KeyShieldError",
    "generate_keypair",
]


# ─── shared helpers ──────────────────────────────────────────────────────────

_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58encode(data: bytes) -> str:
    """Base58 (Bitcoin/Solana) of arbitrary bytes. Leading-zero bytes
    become leading '1's, matching Solana's 32-byte pubkey convention."""
    n = int.from_bytes(data, "big")
    res = ""
    while n:
        n, r = divmod(n, 58)
        res = _B58[r] + res
    pad = len(data) - len(data.lstrip(b"\x00"))
    return "1" * pad + res


class KeyShieldError(Exception):
    """Raised when the KeyShield API returns an error status."""

    def __init__(self, status: int, detail: str):
        super().__init__(f"[{status}] {detail}")
        self.status = status
        self.detail = detail


def _raise(r: httpx.Response) -> None:
    if r.is_error:
        try:
            detail = r.json().get("detail", r.text)
        except Exception:
            detail = r.text
        raise KeyShieldError(r.status_code, str(detail))


def generate_keypair() -> dict:
    """Module-level convenience wrapper — same as `AgentKeyShield.generate_keypair()`."""
    return AgentKeyShield.generate_keypair()


# ─── Sync client ─────────────────────────────────────────────────────────────


class KeyShield:
    """Synchronous client. Thread-safe for reads; not for concurrent login/logout."""

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        timeout: float = 30.0,
        token: str | None = None,
        transport: httpx.BaseTransport | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._token = token
        if client is not None:
            # Caller supplied a fully-built client (e.g. starlette's
            # TestClient in the SDK's parity tests) — use it as-is and
            # don't close it on __exit__ since we don't own its lifetime.
            self._client = client
            self._owns_client = False
        else:
            client_kwargs: dict[str, Any] = {
                "base_url": self.base_url,
                "timeout": timeout,
                "headers": {"Content-Type": "application/json"},
            }
            if transport is not None:
                client_kwargs["transport"] = transport
            self._client = httpx.Client(**client_kwargs)
            self._owns_client = True

    # ── Auth ─────────────────────────────────────────────────────────────────

    def login(self, user_id: str, password: str) -> str:
        resp = self._post("/auth/login", {"userId": user_id, "password": password})
        self._token = resp["token"]
        return self._token

    def wallet_challenge(self) -> dict:
        r = self._client.get("/auth/wallet-challenge")
        _raise(r)
        return r.json()

    def wallet_login(
        self,
        wallet_address: str,
        signature_bytes: bytes,
        challenge: str,
        passphrase: str,
    ) -> str:
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

    def wallet_login_with_key(self, signing_key_hex: str, passphrase: str) -> str:
        """Fetch challenge → sign → login, all in one call. Requires `pynacl`."""
        try:
            from nacl.signing import SigningKey
        except ImportError as exc:  # pragma: no cover
            raise ImportError("wallet_login_with_key() requires pynacl") from exc
        seed = bytes.fromhex(signing_key_hex[:64])
        sk = SigningKey(seed)
        wallet_address = _b58encode(bytes(sk.verify_key))
        ch = self.wallet_challenge()
        sig = sk.sign(ch["challenge"].encode()).signature
        return self.wallet_login(wallet_address, sig, ch["challenge"], passphrase)

    def logout(self) -> None:
        if not self._token:
            return
        try:
            self._authed("POST", "/auth/logout")
        finally:
            self._token = None

    # ── Vault ────────────────────────────────────────────────────────────────

    def store(self, upstream: str, api_key: str) -> None:
        self._authed_post("/manage/store", {"upstream": upstream, "apiKey": api_key})

    def list_keys(self) -> list[str]:
        return self._authed("GET", "/manage/list")["keys"]

    def list_items(self) -> list[dict]:
        return self._authed("GET", "/manage/list").get("items", [])

    def decrypt_key(self, upstream: str) -> str:
        return self._authed("GET", f"/manage/decrypt/{upstream}")["key"]

    def delete_key(self, upstream: str) -> None:
        self._authed("DELETE", f"/manage/secret/{upstream}")

    # ── Proxy ────────────────────────────────────────────────────────────────

    def proxy(
        self,
        upstream: str,
        path: str = "",
        method: str = "POST",
        json: Any = None,
        headers: dict | None = None,
    ) -> httpx.Response:
        self._require_token()
        full_path = f"/proxy/{upstream}/{path.lstrip('/')}"
        hdrs = {"Authorization": f"Bearer {self._token}"}
        if headers:
            hdrs.update(headers)
        return self._client.request(
            method=method.upper(), url=full_path, json=json, headers=hdrs
        )

    def batch(self, requests: list[dict]) -> list[dict]:
        return self._authed_post("/manage/batch", {"requests": requests})["results"]

    # ── Billing & pricing (slice 1+2 of the x402 wiring) ─────────────────────

    def get_balance(self) -> dict:
        """Current prepaid balance, total spend, free credit."""
        return self._authed("GET", "/billing/balance")

    def topup(self, amount_usd: float, payment_proof: str = "") -> dict:
        return self._authed_post(
            "/billing/topup",
            {"amount_usd": amount_usd, "payment_proof": payment_proof},
        )

    def list_pricing(self) -> list[dict]:
        """Per-upstream prices the owner has set. Empty list if none."""
        return self._authed("GET", "/billing/pricing")["pricing"]

    def set_pricing(self, upstream: str, price_usd: float) -> dict:
        """Opt in to billing for `upstream` at this per-call price."""
        return self._authed(
            "PUT",
            f"/billing/pricing/{upstream}",
            json={"price_usd": price_usd},
        )

    def clear_pricing(self, upstream: str) -> dict:
        """Disable billing for `upstream` — reverts to free."""
        return self._authed("DELETE", f"/billing/pricing/{upstream}")

    # ── Usage stats ─────────────────────────────────────────────────────────

    def usage_stats(self) -> dict:
        return self._authed("GET", "/usage/stats")

    def usage_history(self, limit: int = 50) -> list[dict]:
        return self._authed("GET", f"/usage/history?limit={limit}")["history"]

    # ── Agents (owner side) ──────────────────────────────────────────────────

    def agent_register(
        self, pubkey_b58: str, name: str = "agent", scopes: str = "*"
    ) -> dict:
        return self._authed_post(
            "/agents/register",
            {"pubkeyB58": pubkey_b58, "name": name, "scopes": scopes},
        )

    def agent_list(self) -> list[dict]:
        return self._authed("GET", "/agents/list")["agents"]

    def agent_revoke(self, agent_id: int) -> None:
        self._authed("DELETE", f"/agents/{agent_id}")

    def agent_create(self, name: str = "agent", scopes: str = "*") -> dict:
        """
        Generate an ed25519 keypair locally, register the pubkey under
        the current owner session, and return everything the agent
        process will need to authenticate later.

        Mirrors `keyshield agent create <name>` on the TS CLI side.
        Requires `pynacl` (install via `pip install keyshield[agent]`).
        """
        kp = generate_keypair()
        registered = self.agent_register(kp["pubkey_b58"], name=name, scopes=scopes)
        return {
            **kp,  # private_key_hex, pubkey_b58
            "name": name,
            "agent_id": registered["agentId"],
            "server": self.base_url,
        }

    # ── Convenience: pre-wired AI client SDKs through the proxy ──────────────

    def proxy_url(self, upstream: str) -> str:
        return f"{self.base_url}/proxy/{upstream}/"

    def openai_client(self) -> Any:
        try:
            import openai
        except ImportError as exc:  # pragma: no cover
            raise ImportError("openai_client() requires: pip install openai") from exc
        return openai.OpenAI(
            base_url=self.proxy_url("openai"),
            api_key="keyshield-proxy",
            default_headers={"Authorization": f"Bearer {self._require_token()}"},
        )

    def anthropic_client(self) -> Any:
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover
            raise ImportError(
                "anthropic_client() requires: pip install anthropic"
            ) from exc
        return anthropic.Anthropic(
            base_url=self.proxy_url("anthropic"),
            api_key="keyshield-proxy",
            default_headers={"Authorization": f"Bearer {self._require_token()}"},
        )

    # ── Lifecycle ────────────────────────────────────────────────────────────

    def __enter__(self) -> "KeyShield":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def close(self) -> None:
        if getattr(self, "_owns_client", True):
            self._client.close()

    # ── Internals ────────────────────────────────────────────────────────────

    def _require_token(self) -> str:
        if not self._token:
            raise KeyShieldError(
                401, "Not authenticated. Call login() or wallet_login() first."
            )
        return self._token

    def _post(self, path: str, data: dict) -> dict:
        r = self._client.post(path, json=data)
        _raise(r)
        return r.json()

    def _authed(self, method: str, path: str, **kwargs: Any) -> Any:
        r = self._client.request(
            method,
            path,
            headers={"Authorization": f"Bearer {self._require_token()}"},
            **kwargs,
        )
        _raise(r)
        # 204 / empty body endpoints (DELETE) shouldn't blow up.
        if r.status_code == 204 or not r.content:
            return None
        try:
            return r.json()
        except ValueError:
            return None

    def _authed_post(self, path: str, data: dict) -> Any:
        return self._authed("POST", path, json=data)


# ─── Async client ────────────────────────────────────────────────────────────


class AsyncKeyShield:
    """Async/await variant of `KeyShield` with the same surface."""

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        timeout: float = 30.0,
        token: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._token = token
        client_kwargs: dict[str, Any] = {
            "base_url": self.base_url,
            "timeout": timeout,
            "headers": {"Content-Type": "application/json"},
        }
        if transport is not None:
            client_kwargs["transport"] = transport
        self._client = httpx.AsyncClient(**client_kwargs)

    # auth
    async def login(self, user_id: str, password: str) -> str:
        r = await self._client.post(
            "/auth/login", json={"userId": user_id, "password": password}
        )
        _raise(r)
        self._token = r.json()["token"]
        return self._token

    async def logout(self) -> None:
        if not self._token:
            return
        try:
            await self._authed("POST", "/auth/logout")
        finally:
            self._token = None

    # vault
    async def store(self, upstream: str, api_key: str) -> None:
        await self._authed_post(
            "/manage/store", {"upstream": upstream, "apiKey": api_key}
        )

    async def list_keys(self) -> list[str]:
        return (await self._authed("GET", "/manage/list"))["keys"]

    async def decrypt_key(self, upstream: str) -> str:
        return (await self._authed("GET", f"/manage/decrypt/{upstream}"))["key"]

    async def delete_key(self, upstream: str) -> None:
        await self._authed("DELETE", f"/manage/secret/{upstream}")

    # proxy
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

    # billing & pricing
    async def get_balance(self) -> dict:
        return await self._authed("GET", "/billing/balance")

    async def topup(self, amount_usd: float, payment_proof: str = "") -> dict:
        return await self._authed_post(
            "/billing/topup", {"amount_usd": amount_usd, "payment_proof": payment_proof}
        )

    async def list_pricing(self) -> list[dict]:
        return (await self._authed("GET", "/billing/pricing"))["pricing"]

    async def set_pricing(self, upstream: str, price_usd: float) -> dict:
        return await self._authed(
            "PUT",
            f"/billing/pricing/{upstream}",
            json={"price_usd": price_usd},
        )

    async def clear_pricing(self, upstream: str) -> dict:
        return await self._authed("DELETE", f"/billing/pricing/{upstream}")

    # agents
    async def agent_register(
        self, pubkey_b58: str, name: str = "agent", scopes: str = "*"
    ) -> dict:
        return await self._authed_post(
            "/agents/register",
            {"pubkeyB58": pubkey_b58, "name": name, "scopes": scopes},
        )

    async def agent_list(self) -> list[dict]:
        return (await self._authed("GET", "/agents/list"))["agents"]

    async def agent_revoke(self, agent_id: int) -> None:
        await self._authed("DELETE", f"/agents/{agent_id}")

    async def agent_create(self, name: str = "agent", scopes: str = "*") -> dict:
        kp = generate_keypair()
        registered = await self.agent_register(
            kp["pubkey_b58"], name=name, scopes=scopes
        )
        return {
            **kp,
            "name": name,
            "agent_id": registered["agentId"],
            "server": self.base_url,
        }

    # lifecycle
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
        if r.status_code == 204 or not r.content:
            return None
        try:
            return r.json()
        except ValueError:
            return None

    async def _authed_post(self, path: str, data: dict) -> Any:
        return await self._authed("POST", path, json=data)

    async def __aenter__(self) -> "AsyncKeyShield":
        return self

    async def __aexit__(self, *_: Any) -> None:
        await self._client.aclose()


# ─── AgentKeyShield ──────────────────────────────────────────────────────────


class AgentKeyShield:
    """
    Programmatic ed25519 self-auth. The CLI counterpart is
    `keyshield agent login <name>`. After `authenticate()`, every call is
    billed against the *agent's* balance (caller_id), not the owner's —
    so the agent process needs to top up its own balance to keep running.

    Construct with explicit args, or rely on env:
      KS_OWNER_WALLET / KS_AGENT_KEY / KS_VAULT_PASS / KS_BASE
    """

    def __init__(
        self,
        owner_wallet: str | None = None,
        private_key_hex: str | None = None,
        vault_passphrase: str | None = None,
        base_url: str = "http://localhost:8000",
        timeout: float = 30.0,
        transport: httpx.BaseTransport | None = None,
        client: httpx.Client | None = None,
    ) -> None:
        self._owner = owner_wallet or os.getenv("KS_OWNER_WALLET", "")
        self._key_hex = private_key_hex or os.getenv("KS_AGENT_KEY", "")
        self._pass = vault_passphrase or os.getenv("KS_VAULT_PASS", "")
        self._base = (base_url or os.getenv("KS_BASE", "http://localhost:8000")).rstrip(
            "/"
        )
        self._token: str | None = None
        if client is not None:
            self._client = client
            self._owns_client = False
        else:
            client_kwargs: dict[str, Any] = {
                "base_url": self._base,
                "timeout": timeout,
                "headers": {"Content-Type": "application/json"},
            }
            if transport is not None:
                client_kwargs["transport"] = transport
            self._client = httpx.Client(**client_kwargs)
            self._owns_client = True

    @staticmethod
    def generate_keypair() -> dict:
        """Generate a fresh ed25519 keypair for a new agent. Requires pynacl."""
        try:
            from nacl.signing import SigningKey
        except ImportError as exc:  # pragma: no cover
            raise ImportError("generate_keypair() requires pynacl") from exc
        sk = SigningKey.generate()
        return {
            "private_key_hex": sk.encode().hex(),
            "pubkey_b58": _b58encode(bytes(sk.verify_key)),
        }

    @property
    def pubkey_b58(self) -> str:
        try:
            from nacl.signing import SigningKey
        except ImportError as exc:  # pragma: no cover
            raise ImportError("Requires pynacl") from exc
        sk = SigningKey(bytes.fromhex(self._key_hex[:64]))
        return _b58encode(bytes(sk.verify_key))

    def authenticate(self) -> str:
        try:
            from nacl.signing import SigningKey
        except ImportError as exc:  # pragma: no cover
            raise ImportError("AgentKeyShield requires pynacl") from exc
        if not self._owner:
            raise KeyShieldError(
                400, "owner_wallet missing — pass it or set KS_OWNER_WALLET"
            )
        if not self._key_hex:
            raise KeyShieldError(
                400, "private_key_hex missing — pass it or set KS_AGENT_KEY"
            )
        if not self._pass:
            raise KeyShieldError(
                400, "vault_passphrase missing — pass it or set KS_VAULT_PASS"
            )

        r = self._client.get("/auth/agent-challenge")
        _raise(r)
        challenge = r.json()["challenge"]

        sk = SigningKey(bytes.fromhex(self._key_hex[:64]))
        sig_b64 = base64.b64encode(sk.sign(challenge.encode()).signature).decode()
        pubkey = _b58encode(bytes(sk.verify_key))

        r = self._client.post(
            "/auth/agent-login",
            json={
                "ownerWallet": self._owner,
                "agentPubkey": pubkey,
                "signature": sig_b64,
                "challenge": challenge,
                "passphrase": self._pass,
            },
        )
        _raise(r)
        self._token = r.json()["token"]
        return self._token

    def store(self, upstream: str, api_key: str) -> None:
        self._authed_post("/manage/store", {"upstream": upstream, "apiKey": api_key})

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

    def get_balance(self) -> dict:
        return self._authed("GET", "/billing/balance")

    def topup(self, amount_usd: float, payment_proof: str = "") -> dict:
        return self._authed_post(
            "/billing/topup", {"amount_usd": amount_usd, "payment_proof": payment_proof}
        )

    def proxy_url(self, upstream: str) -> str:
        return f"{self._base}/proxy/{upstream}/"

    # internals
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
        if r.status_code == 204 or not r.content:
            return None
        try:
            return r.json()
        except ValueError:
            return None

    def _authed_post(self, path: str, data: dict) -> Any:
        return self._authed("POST", path, json=data)

    def __enter__(self) -> "AgentKeyShield":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def close(self) -> None:
        if getattr(self, "_owns_client", True):
            self._client.close()
