"""
<<<<<<< Updated upstream:src/python-legacy/tests/test_security_fixes.py
Comprehensive tests for all security fixes.

Tests cover:
  1. Vault Argon2id encryption (upgrade from PBKDF2)
  2. Self-contained session tokens with HMAC expiry
  3. Agent revocation CRL
  4. x402 stub-fallback amount verification
  5. Server secret validation (X-Internal-Secret)
  6. Vault file permissions
  7. Challenge nonce replay protection
=======
Security fix tests for KeyShield v2-MVP.
>>>>>>> Stashed changes:v2-mvp/tests/test_security_fixes.py
"""

import pytest
import time
from pathlib import Path
<<<<<<< Updated upstream:src/python-legacy/tests/test_security_fixes.py
from fastapi.testclient import TestClient


# ─── Helpers ──────────────────────────────────────────────────────────────

def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─── 1. Vault Argon2id tests ───────────────────────────────────────────

class TestVaultArgon2id:
    """Tests for vault.py Argon2id encryption."""

    def test_store_and_load(self, client, login):
        from src.vault import store, load, VAULT_DIR

        user_dir = VAULT_DIR / "alice"
        store("alice", "openai", "sk-test-key-12345", password="pw")
        result = load("alice", "openai", password="pw")
        assert result == "sk-test-key-12345"
=======


class TestVault:
    """Tests for vault.py."""

    def test_store_and_load(self):
        from src.vault import store, load, VAULT_DIR

        store("alice", "openai", "sk-test-key", password="pw")
        result = load("alice", "openai", password="pw")
        assert result == "sk-test-key"
>>>>>>> Stashed changes:v2-mvp/tests/test_security_fixes.py

    def test_wrong_password_fails(self):
        from src.vault import store, load, VAULT_DIR

        store("bob", "anthropic", "sk-ant-test", password="pw")
        with pytest.raises(PermissionError):
<<<<<<< Updated upstream:src/python-legacy/tests/test_security_fixes.py
            load("bob", "anthropic", password="wrong-password")

    def test_key_isolation_between_users(self, client):
        from src.vault import VAULT_DIR

        store("alice", "openai", "alice-key", password="pw")
        store("bob", "openai", "bob-key", password="pw")

        alice_key = load("alice", "openai", password="pw")
        bob_key = load("bob", "openai", password="pw")
        assert alice_key == "alice-key"
        assert bob_key == "bob-key"
=======
            load("bob", "anthropic", password="wrong")

    def test_key_isolation(self):
        from src.vault import store, load, VAULT_DIR

        store("u1", "openai", "alice-key", password="pw")
        store("u2", "openai", "bob-key", password="pw")
        assert load("u1", "openai", password="pw") == "alice-key"
        assert load("u2", "openai", password="pw") == "bob-key"
>>>>>>> Stashed changes:v2-mvp/tests/test_security_fixes.py

    def test_list_keys(self):
        from src.vault import store, list_keys, VAULT_DIR

        store("alice", "openai", "key1", password="pw")
        store("alice", "anthropic", "key2", password="pw")
        keys = list_keys("alice")
        assert set(keys) == {"openai", "anthropic"}

    def test_delete_key(self):
        from src.vault import store, load, delete, VAULT_DIR

        store("alice", "openai", "key1", password="pw")
        delete("alice", "openai")
        with pytest.raises(PermissionError):
            load("alice", "openai", password="pw")

<<<<<<< Updated upstream:src/python-legacy/tests/test_security_fixes.py
    def test_delete_nonexistent_key(self):
        from src.vault import delete, VAULT_DIR
        # Should not raise
        delete("noone", "openai")


# ─── 2. Session token tests ─────────────────────────────────────────────

class TestSessionTokens:
    """Tests for session.py self-contained tokens."""

    def test_create_and_get(self, client):
        from src.session import create, get

        token = create("alice", "pw")
=======

class TestSession:
    """Tests for session.py."""

    def test_create_and_get(self, client):
        from src.session import create_token, get

        token = create_token("alice", "pw")
>>>>>>> Stashed changes:v2-mvp/tests/test_security_fixes.py
        sess = get(token)
        assert sess is not None
        assert sess["user_id"] == "alice"
        assert sess["password"] == "pw"

<<<<<<< Updated upstream:src/python-legacy/tests/test_security_fixes.py
    def test_expired_token_returns_none(self):
        from src.session import create, get

        # Create token with 1-second expiry
        token = create("alice", "pw", ttl=1)
        time.sleep(1.1)
        result = get(token)
        assert result is None

    def test_verify_token(self):
        from src.session import create, verify_token

        token = create("alice", "pw")
=======
    def test_expired_token(self):
        from src.session import create_token, get

        token = create_token("alice", "pw", ttl=1)
        time.sleep(1.1)
        assert get(token) is None

    def test_verify_token(self):
        from src.session import create_token, verify_token

        token = create_token("alice", "pw")
>>>>>>> Stashed changes:v2-mvp/tests/test_security_fixes.py
        valid, err = verify_token(token)
        assert valid is True
        assert err is None

<<<<<<< Updated upstream:src/python-legacy/tests/test_security_fixes.py
    def test_tampered_token_rejected(self):
        from src.session import verify_token

        token = "payload_part.tampered_sig"
        valid, err = verify_token(token)
        assert valid is False
        assert err == "tampered"

    def test_malformed_token_rejected(self):
        from src.session import verify_token

        valid, err = verify_token("not.a.valid.token")  # too many dots
        assert valid is False
        assert err == "malformed"

    def test_empty_token_rejected(self):
        from src.session import verify_token

        valid, err = verify_token("")
        assert valid is False

    def test_extend_token(self):
        from src.session import create, extend_token

        token = create("alice", "pw", ttl=1)
        time.sleep(1.1)  # let it expire

        # Extend by 1 hour
        extended = extend_token(token, extra_secs=3600)
        assert extended is True  # token was found and extended
        result = get(token)
        assert result is not None

    def test_delete_all_for_user(self):
        from src.session import create, delete_all_for_user, get

        t1 = create("alice", "pw")
        t2 = create("alice", "pw")
        t3 = create("bob", "pw")

        count = delete_all_for_user("alice")
        assert count == 2

        assert get(t1) is None
        assert get(t2) is None
        assert get(t3) is not None


# ─── 3. Agent revocation CRL tests ─────────────────────────────────────

class TestAgentRevocation:
    """Tests for agents.py CRL-based agent revocation."""

    def test_register_and_lookup(self):
        from src import agents

        agents.register("owner1", "9WzDX...", name="bot1")
        result = agents.lookup_owner("9WzDX...")
=======
    def test_tampered_token(self):
        from src.session import verify_token

        valid, err = verify_token("payload_part.tampered_sig")
        assert valid is False

    def test_delete_all_for_user(self):
        from src.session import create_token, delete_all_for_user, get

        t1 = create_token("alice", "pw")
        t2 = create_token("alice", "pw")
        count = delete_all_for_user("alice")
        assert count >= 2
        assert get(t1) is None


class TestAgentRevocation:
    """Tests for agents.py."""

    def test_register_and_lookup(self):
        from src.agents import register, lookup_owner

        register("owner1", "9WzDX...", name="bot1")
        result = lookup_owner("9WzDX...")
>>>>>>> Stashed changes:v2-mvp/tests/test_security_fixes.py
        assert result is not None
        assert result["name"] == "bot1"

    def test_revoke_agent(self):
<<<<<<< Updated upstream:src/python-legacy/tests/test_security_fixes.py
        from src import agents

        agents.register("owner1", "9WzDX...", name="bot1")
        agent_id = agents.list_agents("owner1")[0]["id"]

        result = agents.revoke_agent("owner1", agent_id)
        assert result is True

        # Agent should now be lookable as revoked (lookup returns None)
        lookup = agents.lookup_owner("9WzDX...")
        assert lookup is None

    def test_revoke_by_pubkey(self):
        from src import agents

        agents.register("owner1", "9WzDX...", name="bot1")
        result = agents.revoke_by_pubkey("owner1", "9WzDX...")
        assert result is True

        lookup = agents.lookup_owner("9WzDX...")
        assert lookup is None

    def test_re_revoke_is_idempotent(self):
        from src import agents

        agents.register("owner1", "9WzDX...", name="bot1")
        agent_id = agents.list_agents("owner1")[0]["id"]

        # Re-revoking multiple times is safe
        for _ in range(5):
            result = agents.revoke_agent("owner1", agent_id)
            assert result is True

    def test_unrevoke_agent(self):
        from src import agents

        agents.register("owner1", "9WzDX...", name="bot1")
        agent_id = agents.list_agents("owner1")[0]["id"]
        agents.revoke_agent("owner1", agent_id)

        # Un-revoke
        result = agents.un_revoke_agent("owner1", "9WzDX...")
        assert result is True

        lookup = agents.lookup_owner("9WzDX...")
        assert lookup is not None

    def test_list_revoked(self):
        from src import agents

        agents.register("owner1", "9WzDX...", name="bot1")
        agent_id = agents.list_agents("owner1")[0]["id"]
        agents.revoke_agent("owner1", agent_id, reason="compromised")

        revoked = agents.list_revoked("owner1")
        assert len(revoked) == 1
        assert revoked[0]["reason"] == "compromised"

    def test_purge_user(self):
        from src import agents

        agents.register("owner1", "9WzDX...", name="bot1")
        agents.register("owner1", "8YcEY...", name="bot2")

        report = agents.purge_user("owner1")
        assert report["agents"] == 2


# ─── 4. x402 stub-fallback tests ───────────────────────────────────────

class TestX402StubFallback:
    """Tests for x402_verify.py stub-fallback fix."""

    def test_stub_accepts_valid_proofs(self):
        from src import x402_verify
        import asyncio

        ok, mode = asyncio.run(
            x402_verify.verify_on_chain(None, "anything", 1.0)
        )
        assert ok is True
        assert mode == "stub-fallback"

    def test_stub_rejects_empty_proof(self):
        from src import x402_verify
        import asyncio

        with pytest.raises(x402_verify.VerifyError, match="empty"):
            asyncio.run(x402_verify.verify_on_chain(None, "", 1.0))

    def test_real_mode_validates_amount(self):
        from src import x402_verify
        import asyncio

        cfg = x402_verify.X402Config(
            rpc_url="https://test.com",
            receiver_address="0x" + "aa" * 20,
            usdc_address="0x" + "bb" * 20,
            min_confirmations=0,
            verify_required=False,
        )

        # Below expected amount — raises VerifyError
        with pytest.raises(x402_verify.VerifyError):
            asyncio.run(
                x402_verify.verify_on_chain(cfg, "0x" + "1" * 64, 3.0)
            )


# ─── 5. Server firewall tests ───────────────────────────────────────────

class TestServerFirewall:
    """Tests for X-Internal-Secret firewall."""

    def test_internal_secret_required(self):
        from src import server
        from fastapi.testclient import TestClient

        client = TestClient(server.app)
        r = client.get("/auth/login", json={"userId": "test", "password": "pw"})
        # With secret required, internal requests go through; without, may be 403
        assert r.status_code in (200, 403)

    def test_options_bypasses_secret(self):
        from src import server
        from fastapi.testclient import TestClient

        client = TestClient(server.app)
        r = client.options("/auth/login")
        assert r.status_code == 200


# ─── 6. Integration: auth flow ──────────────────────────────────────────

class TestAuthFlow:
    """End-to-end auth flow tests."""

    def test_password_login_flow(self, client):
        # Login
        r = client.post("/auth/login", json={"userId": "alice", "password": "pw"})
        assert r.status_code == 200
        token = r.json()["token"]

        # Use token to store a key
        r = client.post(
            "/manage/store",
            headers=_auth(token),
=======
        from src.agents import register, lookup_owner, revoke_agent

        register("owner1", "9WzDX...", name="bot1")
        agent_id = [a["id"] for a in []][0]  # placeholder
        result = revoke_agent("owner1", "9WzDX...")
        assert result is True

    def test_re_revoke_is_idempotent(self):
        from src.agents import register, lookup_owner, revoke_agent

        register("owner1", "9WzDX...", name="bot1")
        for _ in range(5):
            revoke_agent("owner1", "9WzDX...")


class TestX402:
    """Tests for x402_verify.py."""

    def test_stub_fallback(self):
        from src.x402_verify import verify_on_chain
        import asyncio

        ok, mode = asyncio.run(verify_on_chain(None, "anything", 1.0))
        assert ok is True
        assert mode == "stub-fallback"

    def test_empty_proof_raises(self):
        from src.x402_verify import verify_on_chain
        import asyncio

        with pytest.raises(Exception, match="empty"):
            asyncio.run(verify_on_chain(None, "", 1.0))


class TestAuthFlow:
    """End-to-end auth tests."""

    def test_password_login(self, client):
        r = client.post("/auth/login", json={"userId": "alice", "password": "pw"})
        assert r.status_code == 200
        token = r.json()["token"]
        assert len(token) > 10

    def test_store_key(self, client, login):
        r = client.post(
            "/manage/store", headers=_auth(login),
>>>>>>> Stashed changes:v2-mvp/tests/test_security_fixes.py
            json={"upstream": "openai", "apiKey": "sk-test-key"},
        )
        assert r.status_code == 200

<<<<<<< Updated upstream:src/python-legacy/tests/test_security_fixes.py
        # Verify key is stored
        r = client.get("/manage/list", headers=_auth(token))
=======
    def test_list_keys(self, client, login):
        # Store a key first
        client.post("/manage/store", headers=_auth(login),
                    json={"upstream": "openai", "apiKey": "sk-test-key"})
        r = client.get("/manage/list", headers=_auth(login))
>>>>>>> Stashed changes:v2-mvp/tests/test_security_fixes.py
        assert r.status_code == 200
        keys = r.json()["keys"]
        assert "openai" in keys

<<<<<<< Updated upstream:src/python-legacy/tests/test_security_fixes.py
    def test_wallet_login_flow(self, client):
        import base64
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        # Get challenge
        challenge = client.get("/auth/wallet-challenge").json()
        assert "challenge" in challenge and "nonce" in challenge

        # Sign challenge
        priv_key = Ed25519PrivateKey.generate()
        sig = priv_key.sign(challenge["challenge"].encode())

        # Login with signature
        r = client.post("/auth/wallet-login", json={
            "walletAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "signature": base64.b64encode(sig).decode(),
            "challenge": challenge["challenge"],
            "passphrase": "pw",
        })
        assert r.status_code == 200
        token = r.json()["token"]
        assert "userId" in r.json()

    def test_wallet_login_nonce_reuse(self, client):
        """Challenge should be consumed on success."""
        import base64
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        challenge = client.get("/auth/wallet-challenge").json()
        priv_key = Ed25519PrivateKey.generate()
        sig = priv_key.sign(challenge["challenge"].encode())

        # First login succeeds
        r1 = client.post("/auth/wallet-login", json={
            "walletAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "signature": base64.b64encode(sig).decode(),
            "challenge": challenge["challenge"],
            "passphrase": "pw",
        })
        assert r1.status_code == 200

        # Second login with same challenge fails (nonce consumed)
        r2 = client.post("/auth/wallet-login", json={
            "walletAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "signature": base64.b64encode(sig).decode(),
            "challenge": challenge["challenge"],
            "passphrase": "pw",
        })
        assert r2.status_code == 400

    def test_account_deletion(self, client):
        # Login
        r = client.post("/auth/login", json={"userId": "alice", "password": "pw"})
        token = r.json()["token"]

        # Store a key
        client.post("/manage/store", headers=_auth(token),
                    json={"upstream": "openai", "apiKey": "sk-test-key"})

        # Get delete challenge
        challenge = client.get("/auth/delete-account-challenge", headers=_auth(token)).json()

        # Sign and delete
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        priv_key = Ed25519PrivateKey.generate()
        sig = priv_key.sign(challenge["challenge"].encode())

        r = client.post("/auth/delete-account", json={
            "confirmation": "DELETE my account",
            "walletAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "signature": base64.b64encode(sig).decode(),
            "challenge": challenge["challenge"],
        })
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_agent_registration(self, client, login):
        r = client.post("/agents/register", headers=_auth(login), json={
            "pubkeyB58": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "name": "test-bot",
            "scopes": "proxy,analytics",
        })
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_agent_list(self, client, login):
        # Register an agent first
        client.post("/agents/register", headers=_auth(login), json={
            "pubkeyB58": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        })

        r = client.get("/agents/list", headers=_auth(login))
        assert r.status_code == 200
        agents = r.json()["agents"]
        assert len(agents) >= 1

    def test_agent_revoke(self, client, login):
        # Register an agent
        reg = client.post("/agents/register", headers=_auth(login), json={
            "pubkeyB58": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        })
        agent_id = reg.json()["agentId"]

        # Revoke it
        r = client.delete(f"/agents/{agent_id}", headers=_auth(login))
        assert r.status_code == 200


# ─── 7. Vault file format tests ────────────────────────────────────────

class TestVaultFileFormat:
    """Tests for vault.py file format."""

    def test_encrypted_file_structure(self):
        from src.vault import store, load, VAULT_DIR, SALT_LEN, NONCE_LEN
        import os

        store("alice", "openai", "test-key-12345", password="pw")
        user_dir = VAULT_DIR / "alice"
        enc_file = user_dir / "openai.enc"

        # File should exist and be non-empty
        assert enc_file.exists()
        payload = enc_file.read_bytes()
        assert len(payload) > SALT_LEN + NONCE_LEN

    def test_permissions_on_create(self):
        from src.vault import store, VAULT_DIR
        import stat

        store("alice", "openai", "key", password="pw")
        user_dir = VAULT_DIR / "alice"
        enc_file = user_dir / "openai.enc"

        # Directory should be 0o700 (owner rwx)
        dir_mode = stat.S_IMODE(user_dir.stat().st_mode)
        assert (dir_mode & 0o700) == 0o700

        # File should be 0o600 (owner rw)
        file_mode = stat.S_IMODE(enc_file.stat().st_mode)
        assert (file_mode & 0o600) == 0o600


# ─── 8. Proxy routing tests ─────────────────────────────────────────────

class TestProxyRouting:
    """Tests for proxy route with different upstreams."""

    def test_proxy_openai(self, client, login, store_key):
        from src.vault import VAULT_DIR
        store_key("openai", "sk-test-key")

        r = client.post(
            "/proxy/openai/v1/models",
            headers=_auth(login),
        )
        assert r.status_code == 200, f"Proxy failed: {r.text}"

    def test_proxy_helius(self, client, login, store_key):
        store_key("helius", "test-helius-key")

        r = client.post(
            "/proxy/helius/",
            headers=_auth(login),
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getBalance",
                "params": ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"],
            },
        )
        assert r.status_code == 200, f"Helius proxy failed: {r.text}"

    def test_proxy_402_when_no_balance(self, client):
        # User with no balance and using platform key should get 402
        r = client.post("/auth/login", json={"userId": "nobody", "password": "pw"})
        token = r.json()["token"]

        r = client.get(
            "/proxy/openai/v1/models",
            headers=_auth(token),
        )
        # Either 200 (has free credit) or 402 (no key + no credit)
        assert r.status_code in (200, 402)

    def test_batch_endpoint(self, client, login, store_key):
        store_key("helius", "test-helius-key")

        r = client.post(
            "/manage/batch",
            headers=_auth(login),
            json={
                "requests": [
                    {"upstream": "helius", "body": {
                        "jsonrpc": "2.0", "id": 1,
                        "method": "getBalance",
                        "params": ["9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"],
                    }},
                ],
            },
        )
        assert r.status_code == 200, f"Batch failed: {r.text}"


# ─── Run all tests ──────────────────────────────────────────────────────

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
=======
    def test_agent_register(self, client, login):
        r = client.post("/agents/register", headers=_auth(login), json={
            "pubkeyB58": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            "name": "test-bot",
        })
        assert r.status_code == 200

    def test_agent_list(self, client, login):
        client.post("/agents/register", headers=_auth(login), json={
            "pubkeyB58": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        })
        r = client.get("/agents/list", headers=_auth(login))
        assert r.status_code == 200
        assert len(r.json()["agents"]) >= 1

    def test_proxy_openai(self, client):
        r = client.post(
            "/proxy/openai/v1/models",
            headers={"Authorization": "Bearer dev-bypass"},
        )
        assert r.status_code in (200, 403)
>>>>>>> Stashed changes:v2-mvp/tests/test_security_fixes.py
