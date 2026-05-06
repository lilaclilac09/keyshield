#!/usr/bin/env python3
"""
KeyShield Agent Demo
====================

Demonstrates an AI agent authenticating with KeyShield and making a real
proxy call through it.

KeyShield value prop: Store your API key once in the vault. Your agent
authenticates with KeyShield using an ed25519 keypair, gets a short-lived
token, then calls /proxy/openai/... instead of api.openai.com directly.
KeyShield injects the real key server-side — the agent never holds it.

Auth flow:
  1. GET  /auth/agent-challenge  -> {challenge, nonce}
  2. Sign the challenge bytes with ed25519 private key -> base64 signature
  3. POST /auth/agent-login      -> {token, userId, agentName, scopes}
  4. Use Authorization: Bearer <token> on all subsequent calls

Environment variables:
  KS_BASE          KeyShield server URL (default: http://localhost:8000)
  KS_AGENT_KEY     Hex-encoded 32-byte ed25519 seed (from the dashboard)
  KS_AGENT_PUBKEY  Base58 agent public key (from the dashboard)
  KS_OWNER_WALLET  Base58 Solana pubkey of the vault owner
  KS_PASSPHRASE    Vault decryption passphrase for the owner
  KS_OWNER_TOKEN   Owner session Bearer token — enables auto-registration
                   of the generated keypair (skips manual dashboard step)
"""

import base64
import json
import os
import sys

# ── dependency check ─────────────────────────────────────────────────────────

def _import_or_die(module, package=None):
    import importlib
    try:
        return importlib.import_module(module)
    except ImportError:
        pkg = package or module
        print(f"\nMissing dependency: {pkg}")
        print(f"  Install with: pip install {pkg}")
        sys.exit(1)


# Crypto: prefer `cryptography` (already in requirements.txt), fall back to nacl
_CRYPTO_BACKEND = None

try:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
        Ed25519PublicKey,
    )
    _CRYPTO_BACKEND = "cryptography"
except ImportError:
    pass

if _CRYPTO_BACKEND is None:
    try:
        import nacl.signing  # type: ignore
        _CRYPTO_BACKEND = "nacl"
    except ImportError:
        print(
            "\nNeither `cryptography` nor `PyNaCl` is installed.\n"
            "Install one of:\n"
            "  pip install cryptography\n"
            "  pip install PyNaCl\n"
        )
        sys.exit(1)

# HTTP: prefer httpx (ships with the venv), fall back to requests, then urllib
_HTTP_BACKEND = None
try:
    import httpx as _httpx
    _HTTP_BACKEND = "httpx"
except ImportError:
    pass

if _HTTP_BACKEND is None:
    try:
        import requests as _requests  # type: ignore[import]
        _HTTP_BACKEND = "requests"
    except ImportError:
        _HTTP_BACKEND = "urllib"

# base58: available in the venv (base58 2.1.1)
try:
    import base58 as _base58_lib
    def _b58encode(data: bytes) -> str:
        return _base58_lib.b58encode(data).decode()
    def _b58decode(s: str) -> bytes:
        return _base58_lib.b58decode(s)
except ImportError:
    # Pure-Python fallback (Bitcoin/Solana alphabet)
    _B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

    def _b58encode(data: bytes) -> str:  # type: ignore[misc]
        n = int.from_bytes(data, "big")
        result = []
        while n:
            n, rem = divmod(n, 58)
            result.append(_B58_ALPHABET[rem])
        padding = len(data) - len(data.lstrip(b"\x00"))
        return "1" * padding + "".join(reversed(result))

    def _b58decode(s: str) -> bytes:  # type: ignore[misc]
        n = 0
        for c in s:
            n = n * 58 + _B58_ALPHABET.index(c)
        result: list[int] = []
        while n:
            result.append(n & 0xFF)
            n >>= 8
        padding = len(s) - len(s.lstrip("1"))
        return bytes([0] * padding + result[::-1])


# ── key generation ────────────────────────────────────────────────────────────

def _generate_keypair() -> tuple[bytes, bytes]:
    """Return (seed_32_bytes, pubkey_32_bytes)."""
    if _CRYPTO_BACKEND == "cryptography":
        priv = Ed25519PrivateKey.generate()
        seed = priv.private_bytes_raw()
        pub = priv.public_key().public_bytes_raw()
        return seed, pub
    else:
        import nacl.signing
        sk = nacl.signing.SigningKey.generate()
        return bytes(sk), bytes(sk.verify_key)


def _keypair_from_seed(seed_hex: str) -> tuple[bytes, bytes]:
    """Restore keypair from hex-encoded 32-byte seed."""
    seed = bytes.fromhex(seed_hex.strip())
    if len(seed) != 32:
        print(f"KS_AGENT_KEY must be a 32-byte (64 hex char) seed, got {len(seed)} bytes")
        sys.exit(1)
    if _CRYPTO_BACKEND == "cryptography":
        priv = Ed25519PrivateKey.from_private_bytes(seed)
        pub = priv.public_key().public_bytes_raw()
        return seed, pub
    else:
        import nacl.signing
        sk = nacl.signing.SigningKey(seed)
        return seed, bytes(sk.verify_key)


def _sign(seed: bytes, message: bytes) -> bytes:
    """Return 64-byte ed25519 signature."""
    if _CRYPTO_BACKEND == "cryptography":
        priv = Ed25519PrivateKey.from_private_bytes(seed)
        return priv.sign(message)
    else:
        import nacl.signing
        sk = nacl.signing.SigningKey(seed)
        return bytes(sk.sign(message).signature)


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _get(url: str, headers: dict | None = None) -> tuple[int, dict]:
    headers = headers or {}
    if _HTTP_BACKEND == "httpx":
        with _httpx.Client(timeout=30) as c:
            r = c.get(url, headers=headers)
            return r.status_code, r.json()
    elif _HTTP_BACKEND == "requests":
        r = _requests.get(url, headers=headers, timeout=30)
        return r.status_code, r.json()
    else:
        import urllib.request, urllib.error
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())


def _post(url: str, body: dict, headers: dict | None = None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json", **(headers or {})}
    payload = json.dumps(body).encode()
    if _HTTP_BACKEND == "httpx":
        with _httpx.Client(timeout=30) as c:
            r = c.post(url, content=payload, headers=headers)
            return r.status_code, r.json()
    elif _HTTP_BACKEND == "requests":
        r = _requests.post(url, data=payload, headers=headers, timeout=30)
        return r.status_code, r.json()
    else:
        import urllib.request, urllib.error
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())


# ── banner ────────────────────────────────────────────────────────────────────

BANNER = """
KeyShield Agent Demo
====================
"""


def _step(n: int, total: int, title: str) -> None:
    print(f"\n[{n}/{total}] {title}")


def _info(label: str, value: str, indent: int = 2) -> None:
    pad = " " * indent
    print(f"{pad}{label}: {value}")


def _warn(msg: str) -> None:
    print(f"  WARNING  {msg}")


def _ok(msg: str) -> None:
    print(f"  {msg}")


def _err(msg: str) -> None:
    print(f"  ERROR  {msg}")


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print(BANNER)

    base_url = os.environ.get("KS_BASE", "http://localhost:8000").rstrip("/")
    agent_key_hex = os.environ.get("KS_AGENT_KEY", "").strip()
    agent_pubkey_b58 = os.environ.get("KS_AGENT_PUBKEY", "").strip()
    owner_wallet = os.environ.get("KS_OWNER_WALLET", "").strip()
    passphrase = os.environ.get("KS_PASSPHRASE", "").strip()
    owner_token = os.environ.get("KS_OWNER_TOKEN", "").strip()

    # ── step 1: keypair ───────────────────────────────────────────────────────
    TOTAL = 4
    _step(1, TOTAL, "Generating ed25519 keypair...")

    if agent_key_hex:
        # Restore from env
        seed, pubkey_bytes = _keypair_from_seed(agent_key_hex)
        computed_pubkey = _b58encode(pubkey_bytes)

        # Sanity-check pubkey if also provided
        if agent_pubkey_b58 and computed_pubkey != agent_pubkey_b58:
            _warn(
                f"KS_AGENT_PUBKEY={agent_pubkey_b58!r} does not match the key "
                f"derived from KS_AGENT_KEY (expected {computed_pubkey!r}). "
                "Using the derived pubkey."
            )
        agent_pubkey_b58 = computed_pubkey
        _info("Loaded keypair — pubkey (base58)", agent_pubkey_b58)
    else:
        # Fresh keypair
        seed, pubkey_bytes = _generate_keypair()
        agent_pubkey_b58 = _b58encode(pubkey_bytes)
        seed_hex = seed.hex()

        _info("Private key (KS_AGENT_KEY)", seed_hex)
        _info("Public key (base58)        ", agent_pubkey_b58)
        print()

        if not owner_token:
            print(
                "  To use this keypair:\n"
                "\n"
                "  Option A — register via dashboard:\n"
                "    1. Open KeyShield dashboard -> Agents tab\n"
                "    2. Click 'Add Agent' and paste the public key above\n"
                f"    3. Re-run: KS_AGENT_KEY={seed_hex} \\\n"
                f"               KS_AGENT_PUBKEY={agent_pubkey_b58} \\\n"
                "               KS_OWNER_WALLET=<your-wallet> \\\n"
                "               KS_PASSPHRASE=<your-passphrase> \\\n"
                "               python scripts/agent-demo.py\n"
                "\n"
                "  Option B — auto-register (requires owner session token):\n"
                f"    KS_AGENT_KEY={seed_hex} \\\n"
                f"    KS_AGENT_PUBKEY={agent_pubkey_b58} \\\n"
                "    KS_OWNER_WALLET=<your-wallet> \\\n"
                "    KS_PASSPHRASE=<your-passphrase> \\\n"
                "    KS_OWNER_TOKEN=<owner-bearer-token> \\\n"
                "    python scripts/agent-demo.py\n"
            )
            print("\nDemo stopping here (keypair generation only — no server needed).")
            return

    # ── auto-register if owner token supplied ─────────────────────────────────
    if owner_token:
        _ok("KS_OWNER_TOKEN detected — attempting auto-registration...")
        status, body = _post(
            f"{base_url}/agents/register",
            {"pubkeyB58": agent_pubkey_b58, "name": "demo-agent", "scopes": "*"},
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        if status == 200 and body.get("ok"):
            _ok(f"Agent registered (id={body.get('agentId')})")
        elif status == 400 and "already registered" in str(body.get("detail", "")):
            _ok("Agent already registered — continuing")
        else:
            _err(f"Registration failed [{status}]: {body.get('detail', body)}")
            _warn("Continuing anyway — login will fail if not registered.")

    # ── validate required fields for auth ─────────────────────────────────────
    missing = []
    if not owner_wallet:
        missing.append("KS_OWNER_WALLET")
    if not passphrase:
        missing.append("KS_PASSPHRASE")
    if missing:
        print(
            f"\nRequired env vars not set: {', '.join(missing)}\n"
            "\n"
            "The agent-login flow needs to know which vault owner to scope the\n"
            "session to, and the passphrase to decrypt that vault.\n"
            "\n"
            "Set them and re-run:\n"
            f"  KS_AGENT_KEY={seed.hex()} \\\n"
            f"  KS_OWNER_WALLET=<your-solana-wallet-address> \\\n"
            f"  KS_PASSPHRASE=<your-vault-passphrase> \\\n"
            "  python scripts/agent-demo.py\n"
        )
        sys.exit(1)

    # ── step 2: agent auth ────────────────────────────────────────────────────
    _step(2, TOTAL, "Agent auth: challenge -> sign -> token")

    # 2a. Fetch challenge
    status, body = _get(f"{base_url}/auth/agent-challenge")
    if status != 200:
        _err(
            f"Could not reach KeyShield at {base_url} [{status}].\n"
            "  Is the server running? (bash scripts/dev.sh)"
        )
        sys.exit(1)

    challenge: str = body["challenge"]
    nonce: str = body["nonce"]
    _info("Challenge nonce", nonce)

    # 2b. Sign
    sig_bytes = _sign(seed, challenge.encode("utf-8"))
    sig_b64 = base64.b64encode(sig_bytes).decode()

    # 2c. Login
    status, body = _post(
        f"{base_url}/auth/agent-login",
        {
            "ownerWallet":  owner_wallet,
            "agentPubkey":  agent_pubkey_b58,
            "signature":    sig_b64,
            "challenge":    challenge,
            "passphrase":   passphrase,
        },
    )
    if status != 200:
        _err(f"Agent login failed [{status}]: {body.get('detail', body)}")
        if status == 403:
            print(
                "\n  The agent pubkey is not registered.\n"
                "  Register it in the dashboard (Agents tab) then re-run.\n"
                "  Or set KS_OWNER_TOKEN=<session_token> to auto-register.\n"
            )
        sys.exit(1)

    token: str = body["token"]
    agent_name: str = body.get("agentName", "demo-agent")
    _info("Token         ", token[:20] + "...")
    _info("Agent name    ", agent_name)
    _info("Scopes        ", body.get("scopes", "*"))

    auth_headers = {"Authorization": f"Bearer {token}"}

    # ── step 3: proxy call ────────────────────────────────────────────────────
    _step(3, TOTAL, "Proxy call: POST /proxy/openai/v1/chat/completions")

    openai_path = "v1/chat/completions"
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "user",
                "content": "Say 'KeyShield works!' and nothing else.",
            }
        ],
        "max_tokens": 20,
    }

    _info("Model ", "gpt-4o-mini")
    _info("Prompt", "'Say KeyShield works! and nothing else.'")

    status, body = _post(
        f"{base_url}/proxy/openai/{openai_path}",
        payload,
        headers={**auth_headers, "Content-Type": "application/json"},
    )

    if status == 200:
        try:
            reply = body["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError):
            reply = str(body)
        _info("Response", repr(reply))
        _info("Cost    ", "FREE (self-custodian key) — you own the key")
    elif status == 402:
        _err(
            "Payment required (402). The vault has no OpenAI key stored AND\n"
            "  no platform key is available, or your credit balance is zero.\n"
            "\n"
            "  To fix:\n"
            "  1. Go to the KeyShield dashboard -> Keys tab\n"
            "  2. Store your OpenAI API key under 'openai'\n"
            "  3. Re-run this script\n"
            "\n"
            f"  x402 body: {json.dumps(body, indent=4)}"
        )
    elif status == 401 or status == 403:
        _err(
            f"Authorization error [{status}]: {body.get('detail', body)}\n"
            "\n"
            "  Your vault likely has no OpenAI key. Store one:\n"
            "    curl -s -X POST http://localhost:8000/manage/store \\\n"
            "      -H 'Authorization: Bearer <owner-token>' \\\n"
            "      -H 'Content-Type: application/json' \\\n"
            "      -d '{\"upstream\": \"openai\", \"apiKey\": \"sk-...\"}'\n"
        )
    else:
        # Surface any upstream error transparently
        _err(f"Proxy returned [{status}]:")
        try:
            print(f"  {json.dumps(body, indent=2)}")
        except Exception:
            print(f"  {body}")

    # ── step 4: check usage log ───────────────────────────────────────────────
    _step(4, TOTAL, "Usage logged — check Activity tab in dashboard")

    status, body = _get(f"{base_url}/usage/stats", headers=auth_headers)
    if status == 200:
        stats = body.get("stats", [])
        openai_stat = next((s for s in stats if s.get("upstream") == "openai"), None)
        if openai_stat:
            calls = openai_stat.get("calls", 0)
            cost = openai_stat.get("cost_usd", 0.0)
            _info(
                "GET /usage/stats",
                f"{calls} call(s) for openai — ${cost:.6f} logged",
            )
        else:
            _info("GET /usage/stats", "No openai calls logged yet (or vault error above)")
    else:
        _err(f"Could not fetch usage stats [{status}]: {body.get('detail', body)}")

    print("\nDemo complete.")


if __name__ == "__main__":
    main()
