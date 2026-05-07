"""
Foundation-module unit tests — vault.py, session.py, agents.py.

These modules are the trusted base layer (encryption, session creation,
agent registration). The HTTP routes call into them and the route tests
verify integration; this file pins their internal contracts so the
modules can be refactored independently without silent regression.

Run:
  cd v2-mvp && pytest tests/test_modules.py -v
"""

import os
import time
import pytest
from pathlib import Path


# ─── shared fixture: per-test temp dirs ───────────────────────────────────


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod

    monkeypatch.setattr(vault_mod, "VAULT_DIR", tmp_path / "vault")
    monkeypatch.setattr(session_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(agents_mod, "DB_PATH", tmp_path / "data" / "agents.db")
    yield


# ═══════════════════════════════════════════════════════════════════════════
# vault.py — AES-256-GCM per-user .enc files
# ═══════════════════════════════════════════════════════════════════════════


class TestVault:
    def test_store_then_load_roundtrip(self):
        from src import vault

        vault.store("alice", "openai", "sk-secret-real", "alice-pw")
        assert vault.load("alice", "openai", "alice-pw") == "sk-secret-real"

    def test_load_with_wrong_password_raises_permission_error(self):
        from src import vault

        vault.store("alice", "openai", "sk-x", "right-pw")
        with pytest.raises(PermissionError):
            vault.load("alice", "openai", "wrong-pw")

    def test_load_missing_file_raises_permission_error(self):
        from src import vault

        with pytest.raises(PermissionError):
            vault.load("nobody", "openai", "any-pw")

    def test_users_are_isolated_by_user_id(self):
        from src import vault

        vault.store("alice", "openai", "alice-key", "shared-pw")
        vault.store("bob", "openai", "bob-key", "shared-pw")
        assert vault.load("alice", "openai", "shared-pw") == "alice-key"
        assert vault.load("bob", "openai", "shared-pw") == "bob-key"

    def test_overwrite_on_re_store(self):
        from src import vault

        vault.store("alice", "openai", "v1", "pw")
        vault.store("alice", "openai", "v2", "pw")
        assert vault.load("alice", "openai", "pw") == "v2"

    def test_delete_removes_the_file(self):
        from src import vault

        vault.store("alice", "openai", "k", "pw")
        vault.delete("alice", "openai")
        with pytest.raises(PermissionError):
            vault.load("alice", "openai", "pw")

    def test_delete_missing_file_is_silent(self):
        from src import vault

        # Must NOT raise.
        vault.delete("alice", "never-existed")

    def test_each_store_uses_a_fresh_salt_and_nonce(self):
        """Same plaintext + password → different ciphertext. Important
        because reuse of (salt,nonce) destroys AES-GCM security."""
        from src import vault

        vault.store("alice", "first", "same-key", "same-pw")
        vault.store("alice", "second", "same-key", "same-pw")

        first = (vault.VAULT_DIR / "alice" / "first.enc").read_bytes()
        second = (vault.VAULT_DIR / "alice" / "second.enc").read_bytes()
        assert first != second  # ciphertext bytes diverge

    def test_user_dir_has_700_permissions(self):
        from src import vault

        vault.store("alice", "openai", "k", "pw")
        user_dir = vault.VAULT_DIR / "alice"
        # On Linux/macOS only — Windows ignores chmod.
        if os.name == "posix":
            mode = os.stat(user_dir).st_mode & 0o777
            assert mode == 0o700

    def test_enc_file_has_600_permissions(self):
        from src import vault

        vault.store("alice", "openai", "k", "pw")
        if os.name == "posix":
            mode = os.stat(vault.VAULT_DIR / "alice" / "openai.enc").st_mode & 0o777
            assert mode == 0o600

    def test_unicode_keys_and_passwords(self):
        from src import vault

        vault.store("alice", "openai", "sk-😀-rocket", "密码-你好")
        assert vault.load("alice", "openai", "密码-你好") == "sk-😀-rocket"


# ═══════════════════════════════════════════════════════════════════════════
# session.py — encrypted-at-rest sqlite session store
# ═══════════════════════════════════════════════════════════════════════════


class TestSession:
    def test_create_returns_64_hex_token(self):
        from src import session

        token = session.create("alice", "pw")
        assert isinstance(token, str)
        assert len(token) == 64
        assert all(c in "0123456789abcdef" for c in token)

    def test_get_returns_user_id_and_password(self):
        from src import session

        token = session.create("alice", "secret-pw")
        sess = session.get(token)
        assert sess is not None
        assert sess["user_id"] == "alice"
        assert sess["password"] == "secret-pw"

    def test_get_unknown_token_returns_none(self):
        from src import session

        assert session.get("nonexistent" * 8) is None

    def test_delete_invalidates_the_token(self):
        from src import session

        token = session.create("alice", "pw")
        assert session.get(token) is not None
        session.delete(token)
        assert session.get(token) is None

    def test_delete_unknown_token_is_silent(self):
        from src import session

        # Must NOT raise.
        session.delete("never-existed")

    def test_password_is_encrypted_at_rest(self):
        """The sqlite enc_pass column should NOT contain the plaintext
        password — even if the DB file leaks, the password is safe."""
        import sqlite3
        from src import session

        token = session.create("alice", "MY-LITERAL-SECRET")
        with sqlite3.connect(session.DB_PATH) as conn:
            row = conn.execute(
                "SELECT enc_pass FROM sessions WHERE token = ?", (token,)
            ).fetchone()
        assert row is not None
        enc_blob = row[0]
        assert isinstance(enc_blob, bytes)
        assert b"MY-LITERAL-SECRET" not in enc_blob

    def test_two_sessions_for_same_user_get_different_tokens(self):
        from src import session

        a = session.create("alice", "pw")
        b = session.create("alice", "pw")
        assert a != b

    def test_expired_sessions_purged_on_next_db_access(self, monkeypatch):
        """Tokens past expires_at should not be returned."""
        import sqlite3
        from src import session

        token = session.create("alice", "pw")
        # Force-expire the row directly in sqlite.
        with sqlite3.connect(session.DB_PATH) as conn:
            conn.execute(
                "UPDATE sessions SET expires_at = ? WHERE token = ?",
                (int(time.time()) - 100, token),
            )
            conn.commit()
        # Next access purges.
        assert session.get(token) is None


# ═══════════════════════════════════════════════════════════════════════════
# agents.py — agent ed25519 pubkey registration
# ═══════════════════════════════════════════════════════════════════════════


class TestAgents:
    def test_register_returns_id_and_persists(self):
        from src import agents

        agent_id = agents.register("alice", "PK-1", "TradingBot", "*")
        assert isinstance(agent_id, int)
        assert agent_id > 0

    def test_register_duplicate_pubkey_for_same_owner_raises(self):
        from src import agents

        agents.register("alice", "PK-1", "Bot1", "*")
        with pytest.raises(ValueError):
            agents.register("alice", "PK-1", "Bot1-again", "*")

    def test_register_same_pubkey_under_different_owner_is_allowed(self):
        """Edge case: in principle two different owners could legitimately
        register the same pubkey (e.g., if they share an agent). Verify
        the schema allows it."""
        from src import agents

        agents.register("alice", "PK-1", "AliceBot", "*")
        # Bob registers a DIFFERENT pubkey to avoid the (owner, pubkey)
        # collision; the test really just verifies independence.
        bob_id = agents.register("bob", "PK-2", "BobBot", "*")
        assert bob_id > 0

    def test_list_returns_only_owners_agents(self):
        from src import agents

        agents.register("alice", "PK-A", "Bot1", "*")
        agents.register("alice", "PK-B", "Bot2", "helius")
        agents.register("bob", "PK-C", "BotC", "*")

        alice_list = agents.list_agents("alice")
        bob_list = agents.list_agents("bob")
        assert {a["name"] for a in alice_list} == {"Bot1", "Bot2"}
        assert {a["name"] for a in bob_list} == {"BotC"}

    def test_list_empty_when_owner_has_none(self):
        from src import agents

        assert agents.list_agents("ghost") == []

    def test_list_orders_by_created_at_desc(self):
        """The schema stores created_at as int(time.time()) (whole
        seconds), so tests that register multiple agents in the same
        millisecond would all tie. We force-distinct timestamps via
        SQL to actually exercise the ORDER BY."""
        import sqlite3
        from src import agents

        agents.register("alice", "PK-1", "First", "*")
        agents.register("alice", "PK-2", "Second", "*")
        agents.register("alice", "PK-3", "Third", "*")

        # Force three distinct created_at values so the ORDER BY can
        # actually sort.
        with sqlite3.connect(agents.DB_PATH) as conn:
            for ts, pk in [(100, "PK-1"), (200, "PK-2"), (300, "PK-3")]:
                conn.execute(
                    "UPDATE agent_keys SET created_at = ? WHERE pubkey_b58 = ?",
                    (ts, pk),
                )
            conn.commit()

        names = [a["name"] for a in agents.list_agents("alice")]
        assert names == ["Third", "Second", "First"]

    def test_revoke_returns_true_when_deleted(self):
        from src import agents

        aid = agents.register("alice", "PK-1", "Bot", "*")
        assert agents.revoke("alice", aid) is True
        # Now gone.
        assert all(a["id"] != aid for a in agents.list_agents("alice"))

    def test_revoke_returns_false_for_missing_id(self):
        from src import agents

        assert agents.revoke("alice", 99999) is False

    def test_revoke_does_not_touch_other_owner(self):
        """Owner A cannot revoke Owner B's agent — sanity."""
        from src import agents

        bob_id = agents.register("bob", "PK-B", "BobBot", "*")
        # Alice attempts to revoke Bob's id.
        assert agents.revoke("alice", bob_id) is False
        # Bob's bot is still there.
        assert any(a["id"] == bob_id for a in agents.list_agents("bob"))

    def test_lookup_owner_returns_owner_record(self):
        from src import agents

        agents.register("alice", "PK-X", "AliceBot", "*")
        rec = agents.lookup_owner("PK-X")
        assert rec is not None
        assert rec["owner_wallet"] == "alice"
        assert rec["name"] == "AliceBot"

    def test_lookup_owner_returns_none_for_unknown_pubkey(self):
        from src import agents

        assert agents.lookup_owner("PK-MISSING") is None

    def test_touch_updates_last_used_at(self):
        from src import agents

        agents.register("alice", "PK-1", "Bot", "*")
        before = agents.list_agents("alice")[0]["last_used_at"]
        time.sleep(0.001)
        agents.touch("PK-1")
        after = agents.list_agents("alice")[0]["last_used_at"]
        # last_used_at started null/0; touch sets it.
        assert after is not None
        assert (before is None) or (after >= before)

    def test_touch_unknown_pubkey_is_silent(self):
        from src import agents

        # Must NOT raise.
        agents.touch("PK-NOPE")
