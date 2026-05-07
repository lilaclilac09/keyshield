"""
Shared pytest fixtures for KeyShield v2-MVP.

All tests get isolated databases (tmp_path) via autouse fixtures.
This ensures tests don't pollute each other's state and runs deterministically.

Usage in test files:
  from conftest import login, client, clean_dbs   # all available as fixtures
"""

import os
import pytest
from pathlib import Path
from fastapi.testclient import TestClient


# ─── Temp directories ─────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def tmp_dir(monkeypatch):
    """Create a temp directory for all DBs and vault."""
    base = Path(__file__).parent / "tmp_test_data"
    base.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("KS_VAULT_DIR", str(base / "vault"))
    yield base
    # Cleanup after each test (optional — pytest cleans tmp_path automatically)


# ─── Test client ──────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clean_dbs(monkeypatch):
    """Ensure all module-level caches are fresh for each test."""
    from src import server
    from src import api_router
    from src import x402_verify
    from src.vault import VAULT_DIR

    # Clear in-memory caches
    server._NONCES.clear()
    server._CACHE.clear()
    api_router._CACHE.clear()
    x402_verify._WARNED_ENV_MISSING = False

    yield

    # Reset after test
    server._NONCES.clear()
    server._CACHE.clear()
    api_router._CACHE.clear()
    x402_verify._WARNED_ENV_MISSING = False


@pytest.fixture(scope="session")
def client():
    """Session-scoped TestClient for fast tests that don't need fresh state."""
    from src import server
    # Reset module-level state
    server._NONCES.clear()
    server._CACHE.clear()
    return TestClient(server.app)


# ─── Auth helpers ─────────────────────────────────────────────────────────

@pytest.fixture
def login(client):
    """Create a user and return the session token."""
    r = client.post("/auth/login", json={"userId": "alice", "password": "pw"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture
def login_bob(client):
    """Create a second user and return the session token."""
    r = client.post("/auth/login", json={"userId": "bob", "password": "pw"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture
def wallet_login(client):
    """Perform a wallet-login and return the session token."""
    challenge = client.get("/auth/wallet-challenge").json()
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    priv_key = Ed25519PrivateKey.generate()
    sig = priv_key.sign(challenge["challenge"].encode())
    import base64
    import base58

    pubkey = priv_key.public_key().public_bytes(
        encoding=__import__("cryptography.hazmat.primitives.serialization", fromlist=["Encoding"]),
        format=__import__("cryptography.hazmat.primitives.serialization", fromlist=["PublicFormat"])
    )
    # For testing, use a deterministic wallet address
    import base64
    r = client.post("/auth/wallet-login", json={
        "walletAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        "signature": base64.b64encode(sig).decode(),
        "challenge": challenge["challenge"],
        "passphrase": "pw",
    })
    assert r.status_code == 200, f"Wallet login failed: {r.text}"
    return r.json()["token"]


# ─── Auth header helper ──────────────────────────────────────────────────

def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─── Vault helpers ───────────────────────────────────────────────────────

@pytest.fixture
def store_key(client, login):
    """Helper to store a key for the logged-in user."""
    def _store(upstream: str, api_key: str) -> None:
        r = client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": upstream, "apiKey": api_key},
        )
        assert r.status_code == 200, f"Store key failed: {r.text}"
    return _store


# ─── Key types for tests ────────────────────────────────────────────────

class KeyTypes:
    """Known API keys for testing (these are real-ish values)."""
    OPENAI = "sk-test-openai-key-12345"
    ANTHROPIC = "sk-test-anthropic-key-67890"
    GROQ = "gsk_test_groq_key_12345"
    HELIUS = "test-helius-api-key-12345"
    ZEROX = "test-0x-api-key-12345"
    TITAN = "test-titan-api-key-12345"
    PYTH = "test-pyth-api-key-12345"


# ─── x402 test config ──────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clean_x402_env(monkeypatch):
    """Strip x402 env vars between tests so config-loading is deterministic."""
    for var in (
        "KS_X402_BASE_RPC_URL",
        "KS_X402_RECEIVER_ADDRESS",
        "KS_X402_USDC_ADDRESS",
        "KS_X402_MIN_CONFIRMATIONS",
        "KS_X402_VERIFY_REQUIRED",
    ):
        monkeypatch.delenv(var, raising=False)


@pytest.fixture
def x402_configured(monkeypatch):
    """Set env vars to enable real x402 verification."""
    monkeypatch.setenv("KS_X402_BASE_RPC_URL", "https://mainnet.base.org")
    monkeypatch.setenv(
        "KS_X402_RECEIVER_ADDRESS",
        "0x1234567890abcdef1234567890abcdef12345678",
    )
    yield


# ─── Agent fixtures ─────────────────────────────────────────────────────

@pytest.fixture
def agent_pubkey():
    """Generate a deterministic agent pubkey for testing."""
    return "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"


@pytest.fixture
def registered_agent(client, login, agent_pubkey):
    """Register an agent and return the registration result."""
    from src import agents

    # Clear existing registrations for this agent
    existing = agents.lookup_owner(agent_pubkey)
    if existing:
        agents.revoke(existing["owner_wallet"], existing["agent_id"])

    r = client.post(
        "/agents/register",
        headers=_auth(login),
        json={"pubkeyB58": agent_pubkey, "name": "test-bot", "scopes": "proxy"},
    )
    assert r.status_code == 200, f"Agent register failed: {r.text}"
    return r.json()
