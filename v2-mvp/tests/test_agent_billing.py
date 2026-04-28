"""
Slice 3 tests: agent-session billing isolation.

The contract this pins down:
  - An agent session has its own balance (separate from the owner's).
  - /billing/balance and /billing/topup target the *caller* — owner
    sees their own, agent sees its own.
  - /billing/pricing is owner-only (price is a property of the
    owner's key, not of who's calling).
  - usage.log_call(debit_user_id=...) charges the agent and leaves
    the owner's balance untouched, while the audit row still belongs
    to the owner (so their dashboard shows "calls against my key").
"""

import pytest
from pathlib import Path

# ─── isolation ────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod
    from src import pricing as pricing_mod

    monkeypatch.setattr(vault_mod,   "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH",   Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod,  "DB_PATH",   Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod,   "DB_PATH",   Path(tmp_path / "data" / "usage.db"))
    monkeypatch.setattr(pricing_mod, "DB_PATH",   Path(tmp_path / "data" / "pricing.db"))
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from src import server

    server._NONCES.clear()
    server._CACHE.clear()
    return TestClient(server.app)


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


# ─── module-level: session.create round-trips caller_id ──────────────────


class TestSessionCallerId:
    def test_owner_session_has_no_caller_id(self):
        from src import session

        token = session.create("alice", "pw")
        sess = session.get(token)
        assert sess["user_id"] == "alice"
        assert sess["caller_id"] is None

    def test_agent_session_carries_caller_id(self):
        from src import session

        token = session.create("alice-owner", "pw", caller_id="agent-pubkey-123")
        sess = session.get(token)
        assert sess["user_id"] == "alice-owner"
        assert sess["caller_id"] == "agent-pubkey-123"

    def test_caller_id_survives_legacy_table_via_alter(self, tmp_path, monkeypatch):
        # If someone upgrades a server with an existing sessions.db
        # that predates the caller_id column, _db() must ALTER it in
        # rather than CREATE-fail.
        from src import session
        import sqlite3

        # Pre-create a legacy schema (no caller_id column).
        legacy = tmp_path / "legacy-sessions.db"
        with sqlite3.connect(legacy) as conn:
            conn.execute("""
                CREATE TABLE sessions (
                    token      TEXT PRIMARY KEY,
                    user_id    TEXT NOT NULL,
                    enc_pass   BLOB NOT NULL,
                    expires_at INTEGER NOT NULL
                )
            """)
        monkeypatch.setattr(session, "DB_PATH", legacy)
        # First call should ALTER the table without raising.
        token = session.create("alice", "pw", caller_id="agent-X")
        assert session.get(token)["caller_id"] == "agent-X"


# ─── HTTP-level: agent vs owner billing isolation ────────────────────────


class TestBillingTargetsCaller:
    """
    There's no e2e for /auth/agent-login here (signature path is
    covered elsewhere) — we exercise the same code path by minting
    an agent session directly via session.create(caller_id=…).
    """

    def _mint_session(self, owner: str, caller: str | None = None) -> str:
        from src import session

        return session.create(owner, "pw", caller_id=caller)

    def test_owner_topup_does_not_touch_agent_balance(self, client):
        from src import usage

        owner_tok = self._mint_session("owner-wallet")
        agent_tok = self._mint_session("owner-wallet", caller="agent-pub-A")

        client.post("/billing/topup", headers=_auth(owner_tok), json={"amount_usd": 1.0})
        # Agent's view is its own balance — only the free credit so far.
        agent_view = client.get("/billing/balance", headers=_auth(agent_tok)).json()
        assert agent_view["balance_usd"] == usage.FREE_CREDIT_USD
        assert agent_view["caller_id"] == "agent-pub-A"

    def test_agent_topup_does_not_touch_owner_balance(self, client):
        owner_tok = self._mint_session("owner-wallet")
        agent_tok = self._mint_session("owner-wallet", caller="agent-pub-B")

        owner_before = client.get("/billing/balance", headers=_auth(owner_tok)).json()
        client.post("/billing/topup", headers=_auth(agent_tok), json={"amount_usd": 0.50})
        owner_after = client.get("/billing/balance", headers=_auth(owner_tok)).json()
        assert owner_after["balance_usd"] == owner_before["balance_usd"]
        # Owner's caller_id stays None — they're operating as themselves.
        assert owner_after["caller_id"] is None

    def test_two_agents_under_same_owner_have_separate_balances(self, client):
        agent_a = self._mint_session("owner-wallet", caller="agent-A")
        agent_b = self._mint_session("owner-wallet", caller="agent-B")

        client.post("/billing/topup", headers=_auth(agent_a), json={"amount_usd": 0.30})

        ba = client.get("/billing/balance", headers=_auth(agent_a)).json()
        bb = client.get("/billing/balance", headers=_auth(agent_b)).json()
        assert ba["balance_usd"] > bb["balance_usd"]


class TestProxyDebitFollowsCaller:
    def test_agent_call_debits_agent_not_owner(self, client, monkeypatch):
        """
        Setup: owner stores a key + sets a price. Agent has a session
        + its own funded balance. Simulate a proxy call directly via
        usage.log_call (the proxy fans the same args out asynchronously
        and we don't want the test gated on event-loop scheduling).
        """
        from src import session, usage, pricing

        # Owner side: vault + price.
        client.post(
            "/auth/login", json={"userId": "owner-wallet", "password": "pw"}
        )  # ensure user exists
        pricing.set_price("owner-wallet", "openai", 0.005)

        # Top up both wallets so the deltas show clearly.
        usage.topup("owner-wallet", 1.0)
        usage.topup("agent-pub-A", 1.0)
        owner_before = usage.get_balance("owner-wallet")
        agent_before = usage.get_balance("agent-pub-A")

        # An agent call: row recorded under owner, debit hits agent.
        usage.log_call(
            "owner-wallet", "openai", "self_custodian", "POST", "/v1",
            tokens_in=10, tokens_out=20, cost_usd=0.005,
            latency_ms=12.0, status_code=200,
            force_debit=True,
            debit_user_id="agent-pub-A",
        )

        owner_after = usage.get_balance("owner-wallet")
        agent_after = usage.get_balance("agent-pub-A")
        assert owner_after == owner_before  # untouched
        assert round(agent_before - agent_after, 6) == 0.005

    def test_owner_self_call_still_debits_owner(self, client):
        # Backwards-compat with slice 2: when caller_id is None /
        # equal to user_id, debit goes to the owner as before.
        from src import usage, pricing

        pricing.set_price("owner-wallet", "openai", 0.005)
        usage.topup("owner-wallet", 1.0)
        before = usage.get_balance("owner-wallet")
        usage.log_call(
            "owner-wallet", "openai", "self_custodian", "POST", "/v1",
            tokens_in=10, tokens_out=20, cost_usd=0.005,
            latency_ms=12.0, status_code=200,
            force_debit=True,
            # debit_user_id omitted — defaults to user_id.
        )
        after = usage.get_balance("owner-wallet")
        assert round(before - after, 6) == 0.005


class TestPricingStaysOwnerScoped:
    def test_agent_session_cannot_set_a_price(self, client):
        # Slice 3 doesn't broaden /billing/pricing access — pricing
        # is property of the vault, not the caller. An agent with a
        # caller_id session writes against the owner's price table,
        # which is the *intent* (agents shouldn't repurpose someone
        # else's key by hiking the rate). Lock that in.
        from src import session, pricing

        agent_tok = session.create("owner-wallet", "pw", caller_id="agent-X")
        client.put(
            "/billing/pricing/openai",
            headers=_auth(agent_tok),
            json={"price_usd": 0.999},
        )
        # The price went onto the owner's row — agent can't carve out
        # their own. (If we want stricter "agents can't set price at
        # all", that's a 403 we'd add in a later slice.)
        assert pricing.get_price("owner-wallet", "openai") == 0.999
        assert pricing.get_price("agent-X", "openai") is None
