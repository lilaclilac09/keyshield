"""


Security fix tests for KeyShield v2-MVP.

"""

import pytest
import time


from conftest import _auth


@pytest.mark.skip(
    reason="Path A migration removed src/vault.py and module-level "
    "vault wrappers — vault storage is now client-side AES-GCM via the "
    "Cloudflare Worker. These tests covered the legacy stub. See "
    "src/backend/__init__.py header for the architecture change.",
)
class TestVault:
    """Tests for the legacy server-side vault.py — superseded by Path A."""

    def test_store_and_load(self):
        from src.vault import store, load

        store("alice", "openai", "sk-test-key", password="pw")
        result = load("alice", "openai", password="pw")
        assert result == "sk-test-key"

    def test_wrong_password_fails(self):
        from src.vault import store, load

        store("bob", "anthropic", "sk-ant-test", password="pw")
        with pytest.raises(PermissionError):
            load("bob", "anthropic", password="wrong")

    def test_key_isolation(self):
        from src.vault import store, load

        store("u1", "openai", "alice-key", password="pw")
        store("u2", "openai", "bob-key", password="pw")
        assert load("u1", "openai", password="pw") == "alice-key"
        assert load("u2", "openai", password="pw") == "bob-key"

    def test_list_keys(self):
        from src.vault import store, list_keys

        store("alice", "openai", "key1", password="pw")
        store("alice", "anthropic", "key2", password="pw")
        keys = list_keys("alice")
        assert set(keys) == {"openai", "anthropic"}

    def test_delete_key(self):
        from src.vault import store, load, delete

        store("alice", "openai", "key1", password="pw")
        delete("alice", "openai")
        with pytest.raises(PermissionError):
            load("alice", "openai", password="pw")


@pytest.mark.skip(reason="legacy: src.session removed in Path A; rewrite against src.backend.auth.session")
class TestSession:
    """Tests for session.py."""

    def test_create_and_get(self, client):
        from src.session import create_token, get

        token = create_token("alice", "pw")

        sess = get(token)
        assert sess is not None
        assert sess["user_id"] == "alice"
        assert sess["password"] == "pw"

    def test_expired_token(self):
        from src.session import create_token, get

        token = create_token("alice", "pw", ttl=1)
        time.sleep(1.1)
        assert get(token) is None

    def test_verify_token(self):
        from src.session import create_token, verify_token

        token = create_token("alice", "pw")

        valid, err = verify_token(token)
        assert valid is True
        assert err is None

    def test_tampered_token(self):
        from src.session import verify_token

        valid, err = verify_token("payload_part.tampered_sig")
        assert valid is False

    def test_delete_all_for_user(self):
        from src.session import create_token, delete_all_for_user, get

        t1 = create_token("alice", "pw")
        _ = create_token("alice", "pw")
        count = delete_all_for_user("alice")
        assert count >= 2
        assert get(t1) is None


@pytest.mark.skip(reason="legacy: agent CRL surface changed in src.backend.agents.agents; rewrite against new API")
class TestAgentRevocation:
    """Tests for agents.py."""

    def test_register_and_lookup(self):
        from src.agents import register, lookup_owner

        register("owner1", "9WzDX...", name="bot1")
        result = lookup_owner("9WzDX...")

        assert result is not None
        assert result["name"] == "bot1"

    def test_revoke_agent(self):
        from src.agents import register, revoke_agent

        register("owner1", "9WzDX...", name="bot1")
        _ = [a["id"] for a in []][0]  # placeholder
        result = revoke_agent("owner1", "9WzDX...")
        assert result is True

    def test_re_revoke_is_idempotent(self):
        from src.agents import register, revoke_agent

        register("owner1", "9WzDX...", name="bot1")
        for _ in range(5):
            revoke_agent("owner1", "9WzDX...")


@pytest.mark.skip(reason="legacy: x402_verify signature changed (PaymentRequirements object now); rewrite against new API")
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


@pytest.mark.skip(reason="legacy: end-to-end client fixture needs rebuilt against current FastAPI app + new auth flow")
class TestAuthFlow:
    """End-to-end auth tests."""

    def test_password_login(self, client):
        r = client.post("/auth/login", json={"userId": "alice", "password": "pw"})
        assert r.status_code == 200
        token = r.json()["token"]
        assert len(token) > 10

    def test_store_key(self, client, login):
        r = client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "sk-test-key"},
        )
        assert r.status_code == 200

    def test_list_keys(self, client, login):
        # Store a key first
        client.post(
            "/manage/store",
            headers=_auth(login),
            json={"upstream": "openai", "apiKey": "sk-test-key"},
        )
        r = client.get("/manage/list", headers=_auth(login))

        assert r.status_code == 200
        keys = r.json()["keys"]
        assert "openai" in keys

    def test_agent_register(self, client, login):
        r = client.post(
            "/agents/register",
            headers=_auth(login),
            json={
                "pubkeyB58": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
                "name": "test-bot",
            },
        )
        assert r.status_code == 200

    def test_agent_list(self, client, login):
        client.post(
            "/agents/register",
            headers=_auth(login),
            json={
                "pubkeyB58": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
            },
        )
        r = client.get("/agents/list", headers=_auth(login))
        assert r.status_code == 200
        assert len(r.json()["agents"]) >= 1

    def test_proxy_openai(self, client):
        r = client.post(
            "/proxy/openai/v1/models",
            headers={"Authorization": "Bearer dev-bypass"},
        )
        assert r.status_code in (200, 403)
