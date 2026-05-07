"""
HTTP route tests for /mpp/streams/* and /mpp/events.

Stub-on-chain mode — all settlement is DB-only, so these tests
exercise the full happy path (open → record → settle → close)
without needing a Solana mock. Real on-chain CPI lands in Phase
10.4-real and will need its own test file.

Mirrors the test fixture pattern in test_billing_routes.py +
test_topup_solana.py (per-test sqlite isolation under tmp_path).
"""

import pytest
from pathlib import Path


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    """Per-test SQLite + vault dir, including the new mpp.db path."""
    from src import vault as vault_mod
    from src import session as session_mod
    from src import agents as agents_mod
    from src import usage as usage_mod
    from src import mpp_streams as mpp_mod

    monkeypatch.setattr(vault_mod, "VAULT_DIR", Path(tmp_path / "vault"))
    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
    monkeypatch.setattr(mpp_mod, "DB_PATH", Path(tmp_path / "data" / "mpp.db"))
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from src import server

    server._NONCES.clear()
    server._CACHE.clear()
    return TestClient(server.app)


@pytest.fixture
def login(client):
    r = client.post("/auth/login", json={"userId": "alice", "password": "pw"})
    return r.json()["token"]


def _auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _open_payload(**overrides) -> dict:
    base = {
        "agentPubkey":            "AgentPubkeyAlice11111111111111111111111111",
        "agentName":              "trading-bot-v1",
        "upstream":               "anthropic",
        "ratePerTokenMicroUsdc":  15,
        "ratePerCallMicroUsdc":   0,
        "settlementIntervalSecs": 60,
    }
    base.update(overrides)
    return base


# ─── auth gate ─────────────────────────────────────────────────────────────


class TestAuth:
    def test_open_requires_bearer(self, client):
        r = client.post("/mpp/streams", json=_open_payload())
        assert r.status_code == 401

    def test_list_requires_bearer(self, client):
        assert client.get("/mpp/streams").status_code == 401

    def test_record_requires_bearer(self, client):
        assert client.post("/mpp/streams/1/record", json={"tokens": 1}).status_code == 401

    def test_settle_requires_bearer(self, client):
        assert client.post("/mpp/streams/1/settle").status_code == 401

    def test_close_requires_bearer(self, client):
        assert client.post("/mpp/streams/1/close").status_code == 401

    def test_events_requires_bearer(self, client):
        assert client.get("/mpp/events").status_code == 401


# ─── happy path: open → record → settle → close ───────────────────────────


class TestHappyPath:
    def test_full_lifecycle(self, client, login):
        # Open
        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        assert r.status_code == 200, r.text
        s = r.json()["stream"]
        assert s["status"] == "open"
        assert s["agent_name"] == "trading-bot-v1"
        assert s["upstream"] == "anthropic"
        assert s["rate_per_token_micro_usdc"] == 15
        assert s["pending_micro_usdc"] == 0
        assert s["settled_micro_usdc"] == 0
        assert s["total_calls"] == 0
        assert s["total_tokens"] == 0
        sid = s["id"]

        # Record 100 tokens × 15 µUSDC/tok = 1500 pending.
        r = client.post(
            f"/mpp/streams/{sid}/record",
            json={"tokens": 100, "calls": 1},
            headers=_auth(login),
        )
        assert r.status_code == 200, r.text
        s = r.json()["stream"]
        assert s["total_tokens"] == 100
        assert s["total_calls"] == 1
        assert s["pending_micro_usdc"] == 1500
        # Auto-settle would not have triggered because elapsed < interval (60s).
        assert s["just_settled_micro_usdc"] == 0

        # Manual settle.
        r = client.post(f"/mpp/streams/{sid}/settle", headers=_auth(login))
        assert r.status_code == 200, r.text
        s = r.json()["stream"]
        assert s["pending_micro_usdc"] == 0
        assert s["settled_micro_usdc"] == 1500
        assert s["just_settled_micro_usdc"] == 1500
        assert s["status"] == "open"

        # Close.
        r = client.post(f"/mpp/streams/{sid}/close", headers=_auth(login))
        assert r.status_code == 200, r.text
        s = r.json()["stream"]
        assert s["status"] == "closed"
        assert s["closed_at"] is not None

    def test_close_drains_pending(self, client, login):
        """Closing while pending > 0 auto-settles before flipping status."""
        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        sid = r.json()["stream"]["id"]

        client.post(
            f"/mpp/streams/{sid}/record",
            json={"tokens": 50},
            headers=_auth(login),
        )

        r = client.post(f"/mpp/streams/{sid}/close", headers=_auth(login))
        assert r.status_code == 200
        s = r.json()["stream"]
        assert s["status"] == "closed"
        assert s["pending_micro_usdc"] == 0
        assert s["settled_micro_usdc"] == 50 * 15
        assert s["just_settled_micro_usdc"] == 50 * 15

    def test_per_call_rate(self, client, login):
        """Streams that bill per-call (not per-token) sum correctly."""
        r = client.post(
            "/mpp/streams",
            json=_open_payload(
                ratePerTokenMicroUsdc=0,
                ratePerCallMicroUsdc=200,
            ),
            headers=_auth(login),
        )
        sid = r.json()["stream"]["id"]

        client.post(
            f"/mpp/streams/{sid}/record",
            json={"tokens": 0, "calls": 3},
            headers=_auth(login),
        )
        r = client.get("/mpp/streams", headers=_auth(login))
        s = r.json()["streams"][0]
        assert s["pending_micro_usdc"] == 600  # 3 calls × 200 µUSDC


# ─── auto-settle on long elapsed ──────────────────────────────────────────


class TestAutoSettle:
    def test_record_auto_settles_when_interval_elapsed(self, client, login, monkeypatch):
        """When elapsed >= settlement_interval_secs, /record returns
        with just_settled_micro_usdc > 0."""
        from src import mpp_streams as mpp

        r = client.post(
            "/mpp/streams",
            json=_open_payload(settlementIntervalSecs=5),
            headers=_auth(login),
        )
        sid = r.json()["stream"]["id"]

        # Time-travel: rewind the row's last_settled_at by 1 hour so
        # the next record auto-settles.
        conn = mpp._db()
        conn.execute(
            "UPDATE mpp_streams SET last_settled_at = last_settled_at - 3600 WHERE id = ?",
            (sid,),
        )
        conn.commit()
        conn.close()

        r = client.post(
            f"/mpp/streams/{sid}/record",
            json={"tokens": 10, "calls": 1},
            headers=_auth(login),
        )
        assert r.status_code == 200, r.text
        s = r.json()["stream"]
        assert s["just_settled_micro_usdc"] == 10 * 15
        assert s["pending_micro_usdc"] == 0
        assert s["settled_micro_usdc"] == 10 * 15


# ─── list streams + summary ───────────────────────────────────────────────


class TestListStreams:
    def test_empty_when_none_open(self, client, login):
        r = client.get("/mpp/streams", headers=_auth(login))
        assert r.status_code == 200
        body = r.json()
        assert body == {
            "streams": [],
            "summary": {
                "streams_total": 0,
                "streams_open":  0,
                "calls_total":   0,
                "tokens_total":  0,
                "settled_usd":   0,
                "pending_usd":   0,
            },
        }

    def test_summary_aggregates_across_streams(self, client, login):
        # Two streams, different upstreams.
        r1 = client.post("/mpp/streams", json=_open_payload(upstream="anthropic"), headers=_auth(login))
        r2 = client.post("/mpp/streams", json=_open_payload(upstream="openai"), headers=_auth(login))
        sid1, sid2 = r1.json()["stream"]["id"], r2.json()["stream"]["id"]

        client.post(f"/mpp/streams/{sid1}/record", json={"tokens": 100, "calls": 2}, headers=_auth(login))
        client.post(f"/mpp/streams/{sid2}/record", json={"tokens": 50, "calls": 1}, headers=_auth(login))
        # Settle one so we can verify settled_usd != 0.
        client.post(f"/mpp/streams/{sid1}/settle", headers=_auth(login))

        body = client.get("/mpp/streams", headers=_auth(login)).json()
        assert body["summary"]["streams_total"] == 2
        assert body["summary"]["streams_open"]  == 2
        assert body["summary"]["tokens_total"]  == 150
        assert body["summary"]["calls_total"]   == 3
        # 100 tok × 15 µUSDC settled; 50 tok × 15 µUSDC pending.
        assert body["summary"]["settled_usd"] == pytest.approx(0.0015, rel=1e-9)
        assert body["summary"]["pending_usd"] == pytest.approx(0.00075, rel=1e-9)

    def test_each_stream_has_expected_fields(self, client, login):
        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        body = client.get("/mpp/streams", headers=_auth(login)).json()
        assert len(body["streams"]) == 1
        s = body["streams"][0]
        for field in (
            "id", "agent_pubkey", "agent_name", "upstream",
            "rate_per_call_micro_usdc", "rate_per_token_micro_usdc",
            "settlement_interval_secs", "status",
            "opened_at", "last_settled_at", "closed_at",
            "total_calls", "total_tokens",
            "pending_micro_usdc", "settled_micro_usdc",
        ):
            assert field in s, f"missing field {field}"


# ─── validation + error paths ─────────────────────────────────────────────


class TestValidation:
    def test_unknown_upstream_rejected(self, client, login):
        r = client.post(
            "/mpp/streams",
            json=_open_payload(upstream="not-a-real-upstream"),
            headers=_auth(login),
        )
        assert r.status_code == 400

    def test_zero_rates_rejected(self, client, login):
        r = client.post(
            "/mpp/streams",
            json=_open_payload(ratePerTokenMicroUsdc=0, ratePerCallMicroUsdc=0),
            headers=_auth(login),
        )
        assert r.status_code == 400

    def test_interval_out_of_range_rejected(self, client, login):
        r = client.post(
            "/mpp/streams",
            json=_open_payload(settlementIntervalSecs=1),
            headers=_auth(login),
        )
        assert r.status_code == 400

        r = client.post(
            "/mpp/streams",
            json=_open_payload(settlementIntervalSecs=99999),
            headers=_auth(login),
        )
        assert r.status_code == 400

    def test_record_on_closed_stream_returns_400(self, client, login):
        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        sid = r.json()["stream"]["id"]
        client.post(f"/mpp/streams/{sid}/close", headers=_auth(login))

        r = client.post(
            f"/mpp/streams/{sid}/record",
            json={"tokens": 1, "calls": 1},
            headers=_auth(login),
        )
        assert r.status_code == 400

    def test_settle_with_no_pending_succeeds(self, client, login):
        """Per spec: settle with no pending succeeds with 0."""
        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        sid = r.json()["stream"]["id"]

        r = client.post(f"/mpp/streams/{sid}/settle", headers=_auth(login))
        assert r.status_code == 200
        s = r.json()["stream"]
        assert s["just_settled_micro_usdc"] == 0
        assert s["pending_micro_usdc"] == 0

    def test_close_idempotent(self, client, login):
        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        sid = r.json()["stream"]["id"]
        client.post(f"/mpp/streams/{sid}/close", headers=_auth(login))

        # Re-close.
        r = client.post(f"/mpp/streams/{sid}/close", headers=_auth(login))
        assert r.status_code == 200
        s = r.json()["stream"]
        assert s["status"] == "closed"
        assert s["just_settled_micro_usdc"] == 0

    def test_record_unknown_stream_404(self, client, login):
        r = client.post(
            "/mpp/streams/99999/record",
            json={"tokens": 1},
            headers=_auth(login),
        )
        assert r.status_code == 404

    def test_settle_unknown_stream_404(self, client, login):
        r = client.post("/mpp/streams/99999/settle", headers=_auth(login))
        assert r.status_code == 404

    def test_close_unknown_stream_404(self, client, login):
        r = client.post("/mpp/streams/99999/close", headers=_auth(login))
        assert r.status_code == 404


# ─── tenant isolation: alice ≠ bob ────────────────────────────────────────


class TestTenantIsolation:
    def test_bob_cannot_see_alice_streams(self, client):
        a = client.post("/auth/login", json={"userId": "alice", "password": "p"}).json()["token"]
        b = client.post("/auth/login", json={"userId": "bob",   "password": "p"}).json()["token"]

        client.post("/mpp/streams", json=_open_payload(), headers=_auth(a))

        bob_body = client.get("/mpp/streams", headers=_auth(b)).json()
        assert bob_body["streams"] == []
        assert bob_body["summary"]["streams_total"] == 0

    def test_bob_cannot_record_against_alice_stream(self, client):
        a = client.post("/auth/login", json={"userId": "alice", "password": "p"}).json()["token"]
        b = client.post("/auth/login", json={"userId": "bob",   "password": "p"}).json()["token"]

        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(a))
        sid = r.json()["stream"]["id"]

        # Bob tries to record/settle/close alice's stream — must 404 (we
        # don't even leak that the id exists).
        for r in (
            client.post(f"/mpp/streams/{sid}/record", json={"tokens": 1}, headers=_auth(b)),
            client.post(f"/mpp/streams/{sid}/settle", headers=_auth(b)),
            client.post(f"/mpp/streams/{sid}/close",  headers=_auth(b)),
        ):
            assert r.status_code == 404

        # And alice's stream is unchanged (no record happened).
        body = client.get("/mpp/streams", headers=_auth(a)).json()
        assert body["streams"][0]["total_tokens"] == 0
        assert body["streams"][0]["status"] == "open"

    def test_bob_cannot_see_alice_events(self, client):
        a = client.post("/auth/login", json={"userId": "alice", "password": "p"}).json()["token"]
        b = client.post("/auth/login", json={"userId": "bob",   "password": "p"}).json()["token"]

        client.post("/mpp/streams", json=_open_payload(), headers=_auth(a))

        a_evs = client.get("/mpp/events", headers=_auth(a)).json()["events"]
        b_evs = client.get("/mpp/events", headers=_auth(b)).json()["events"]
        assert len(a_evs) == 1 and a_evs[0]["kind"] == "open"
        assert b_evs == []


# ─── /mpp/events ──────────────────────────────────────────────────────────


class TestEvents:
    def test_open_emits_open_event(self, client, login):
        client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        evs = client.get("/mpp/events", headers=_auth(login)).json()["events"]
        assert len(evs) == 1
        assert evs[0]["kind"] == "open"
        assert evs[0]["upstream"] == "anthropic"

    def test_full_lifecycle_emits_four_event_kinds(self, client, login):
        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        sid = r.json()["stream"]["id"]
        client.post(f"/mpp/streams/{sid}/record", json={"tokens": 100}, headers=_auth(login))
        client.post(f"/mpp/streams/{sid}/settle", headers=_auth(login))
        client.post(f"/mpp/streams/{sid}/close",  headers=_auth(login))

        evs = client.get("/mpp/events", headers=_auth(login)).json()["events"]
        # Newest first.
        kinds = [e["kind"] for e in evs]
        assert kinds == ["close", "settle", "record", "open"]

    def test_event_fields_present(self, client, login):
        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        sid = r.json()["stream"]["id"]
        client.post(f"/mpp/streams/{sid}/record", json={"tokens": 100}, headers=_auth(login))

        evs = client.get("/mpp/events", headers=_auth(login)).json()["events"]
        assert len(evs) == 2
        for ev in evs:
            for field in (
                "id", "stream_id", "kind", "calls", "tokens",
                "micro_usdc", "cost_usd", "ts",
                "upstream", "agent_name", "agent_pubkey",
            ):
                assert field in ev, f"missing field {field}"

    def test_limit_param_honored(self, client, login):
        r = client.post(
            "/mpp/streams",
            json=_open_payload(settlementIntervalSecs=3600),
            headers=_auth(login),
        )
        sid = r.json()["stream"]["id"]
        for _ in range(5):
            client.post(
                f"/mpp/streams/{sid}/record",
                json={"tokens": 1},
                headers=_auth(login),
            )

        # Default limit returns all 6 (1 open + 5 record).
        evs = client.get("/mpp/events", headers=_auth(login)).json()["events"]
        assert len(evs) == 6

        # Explicit `limit=2` truncates to 2 newest.
        evs = client.get("/mpp/events?limit=2", headers=_auth(login)).json()["events"]
        assert len(evs) == 2


# ─── Spec 10 Phase 10.5: build-tx endpoints ───────────────────────────────
#
# Owner-signed ixs where the server only assembles the byte-perfect ix
# payload; frontend wallet adapter signs + submits in-browser. Tests
# verify the response shape (programId / keys / data), the env
# guardrails (503 when MPP config incomplete), and that stored
# settlement_interval is honoured when the request omits an override.


@pytest.fixture
def mpp_env(monkeypatch):
    """Configure the KS_* env vars mpp_onchain.load_mpp_config() needs.
    Uses a deterministic test keypair so tests are reproducible."""
    from src import mpp_onchain
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (
        Ed25519PrivateKey,
    )
    from cryptography.hazmat.primitives import serialization

    seed = bytes(range(32))
    priv = Ed25519PrivateKey.from_private_bytes(seed)
    pub_bytes = priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    secret_key = seed + pub_bytes
    b58_key = (
        mpp_onchain._base58.b58encode(secret_key).decode()  # type: ignore[union-attr]
        if mpp_onchain._HAS_BASE58
        else mpp_onchain._b58encode_pure(secret_key)
    )

    monkeypatch.setenv("KS_MPP_SETTLER_KEY", b58_key)
    monkeypatch.setenv(
        "KS_PLATFORM_USDC_ATA",
        mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x01"),
    )
    monkeypatch.setenv(
        "KS_KEYSHIELD_PROGRAM_ID",
        mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x02"),
    )
    monkeypatch.setenv(
        "KS_VAULT_PDA",
        mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x03"),
    )
    mpp_onchain._WARNED_ENV_MISSING = False
    yield


class TestBuildTxEndpoints:
    """build-open-tx / build-withdraw-tx response contract."""

    def _open_stream(self, client, login) -> int:
        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        assert r.status_code == 200, r.text
        return r.json()["stream"]["id"]

    # — env guardrails —

    def test_build_open_returns_503_when_env_missing(self, client, login):
        sid = self._open_stream(client, login)
        r = client.post(
            f"/mpp/streams/{sid}/build-open-tx",
            json={
                "ownerPubkey":       "1" * 32,
                "streamPda":         "1" * 32,
                "bump":              255,
                "usdcAta":           "1" * 32,
                "maxTotalMicroUsdc": 1_000_000,
            },
            headers=_auth(login),
        )
        assert r.status_code == 503
        assert "MPP on-chain config incomplete" in r.text

    def test_build_withdraw_returns_503_when_env_missing(self, client, login):
        sid = self._open_stream(client, login)
        r = client.post(
            f"/mpp/streams/{sid}/build-withdraw-tx",
            json={
                "ownerPubkey":             "1" * 32,
                "streamPda":               "1" * 32,
                "streamAta":               "1" * 32,
                "ownerAta":                "1" * 32,
                "withdrawAmountMicroUsdc": 500_000,
            },
            headers=_auth(login),
        )
        assert r.status_code == 503

    # — happy paths —

    def test_build_open_tx_returns_ix_bytes(self, client, login, mpp_env):
        """Server returns the ix payload — programId from
        KS_KEYSHIELD_PROGRAM_ID, 8 keys in spec order, base64 data of
        30 bytes (1 disc + 1 bump + 8+8+8+4 body)."""
        import base64

        sid = self._open_stream(client, login)
        owner = "8" * 32
        stream_pda = "9" * 32
        usdc_ata = "ATA" + ("1" * 29)

        r = client.post(
            f"/mpp/streams/{sid}/build-open-tx",
            json={
                "ownerPubkey":              owner,
                "streamPda":                stream_pda,
                "bump":                     254,
                "usdcAta":                  usdc_ata,
                "maxTotalMicroUsdc":        2_500_000,
                "costPerUnitMicroUsdc":     1,
                "maxRateUsdPerMinBits":     0,
                "settlementIntervalSecsOverride": 0,
            },
            headers=_auth(login),
        )
        assert r.status_code == 200, r.text
        body = r.json()

        from src import mpp_onchain
        expected_program = mpp_onchain._b58encode_pure(b"\x00" * 31 + b"\x02")
        assert body["programId"] == expected_program

        assert len(body["keys"]) == 8
        assert body["keys"][0] == {
            "pubkey": owner, "isSigner": True, "isWritable": False,
        }
        assert body["keys"][2]["pubkey"] == stream_pda
        assert body["keys"][2]["isWritable"] is True
        assert body["keys"][4]["pubkey"] == usdc_ata
        assert body["keys"][7]["pubkey"] == mpp_onchain.SYSTEM_PROGRAM_ID

        raw = base64.b64decode(body["data"])
        assert len(raw) == 30
        assert raw[0] == 0x18
        assert raw[1] == 254
        assert int.from_bytes(raw[2:10], "little") == 2_500_000

    def test_build_withdraw_tx_returns_ix_bytes(self, client, login, mpp_env):
        import base64

        sid = self._open_stream(client, login)
        owner = "Owner" + ("1" * 27)
        stream_pda = "Stream" + ("2" * 26)
        stream_ata = "StreamAta" + ("3" * 23)
        owner_ata = "OwnerAta" + ("4" * 24)

        r = client.post(
            f"/mpp/streams/{sid}/build-withdraw-tx",
            json={
                "ownerPubkey":             owner,
                "streamPda":               stream_pda,
                "streamAta":               stream_ata,
                "ownerAta":                owner_ata,
                "withdrawAmountMicroUsdc": 750_000,
            },
            headers=_auth(login),
        )
        assert r.status_code == 200, r.text
        body = r.json()

        assert len(body["keys"]) == 7
        assert body["keys"][0] == {
            "pubkey": owner, "isSigner": True, "isWritable": True,
        }
        assert body["keys"][2]["pubkey"] == stream_pda
        assert body["keys"][2]["isWritable"] is True
        assert body["keys"][3]["pubkey"] == stream_ata
        assert body["keys"][4]["pubkey"] == owner_ata

        raw = base64.b64decode(body["data"])
        assert len(raw) == 9
        assert raw[0] == 0x1B
        assert int.from_bytes(raw[1:9], "little") == 750_000

    # — error paths —

    def test_build_open_404_when_stream_missing(self, client, login, mpp_env):
        r = client.post(
            "/mpp/streams/99999/build-open-tx",
            json={
                "ownerPubkey":       "1" * 32,
                "streamPda":         "1" * 32,
                "bump":              255,
                "usdcAta":           "1" * 32,
                "maxTotalMicroUsdc": 1_000_000,
            },
            headers=_auth(login),
        )
        assert r.status_code == 404

    def test_build_open_400_when_zero_max_total(self, client, login, mpp_env):
        sid = self._open_stream(client, login)
        r = client.post(
            f"/mpp/streams/{sid}/build-open-tx",
            json={
                "ownerPubkey":       "1" * 32,
                "streamPda":         "1" * 32,
                "bump":              255,
                "usdcAta":           "1" * 32,
                "maxTotalMicroUsdc": 0,
            },
            headers=_auth(login),
        )
        assert r.status_code == 400
        assert "max_total_micro_usdc must be positive" in r.text

    def test_build_open_uses_stored_settlement_interval(
        self, client, login, mpp_env,
    ):
        """When the request omits settlementIntervalSecsOverride (or
        sends 0), the server uses the value the stream was opened with
        — guarantees the on-chain ix matches what the frontend already
        committed to off-chain."""
        import base64

        r_open = client.post(
            "/mpp/streams",
            json=_open_payload(settlementIntervalSecs=300),
            headers=_auth(login),
        )
        sid = r_open.json()["stream"]["id"]

        r = client.post(
            f"/mpp/streams/{sid}/build-open-tx",
            json={
                "ownerPubkey":       "1" * 32,
                "streamPda":         "1" * 32,
                "bump":              255,
                "usdcAta":           "1" * 32,
                "maxTotalMicroUsdc": 1_000_000,
            },
            headers=_auth(login),
        )
        assert r.status_code == 200, r.text
        raw = base64.b64decode(r.json()["data"])
        assert int.from_bytes(raw[26:30], "little") == 300


# ─── Spec 10 Phase 10.5: /record-tx (post-sign callback) ──────────────────
#
# After the frontend wallet adapter signs+sends an open_payment_stream
# (or withdraw_agent_wallet) ix, the resulting base58 tx signature is
# POSTed here so the row's `on_chain_signature` field flips from null
# to the signature string. The UI keys off that field to render the
# green "ON-CHAIN" explorer badge.


class TestRecordTx:
    """POST /mpp/streams/{id}/record-tx — wallet sign-off callback."""

    def _open_stream(self, client, login) -> int:
        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        assert r.status_code == 200, r.text
        return r.json()["stream"]["id"]

    # — auth gate —

    def test_record_tx_requires_bearer(self, client):
        r = client.post(
            "/mpp/streams/1/record-tx",
            json={"tx_signature": "abc"},
        )
        assert r.status_code == 401

    # — happy path —

    def test_record_tx_persists_signature(self, client, login):
        """The signature posted here surfaces back via GET /mpp/streams
        as `on_chain_signature` — that's the contract the frontend
        green-badge logic depends on."""
        sid = self._open_stream(client, login)

        # Before sign-off, the row reports null.
        body = client.get("/mpp/streams", headers=_auth(login)).json()
        assert body["streams"][0]["on_chain_signature"] is None

        sig = "5KJp7zHj1nQYQEi8mXdPyx" * 4  # mimic 88-char base58 sig
        r = client.post(
            f"/mpp/streams/{sid}/record-tx",
            json={"tx_signature": sig},
            headers=_auth(login),
        )
        assert r.status_code == 200, r.text
        assert r.json()["stream"]["on_chain_signature"] == sig

        # Survives a GET round-trip (column is persisted).
        body = client.get("/mpp/streams", headers=_auth(login)).json()
        assert body["streams"][0]["on_chain_signature"] == sig

    def test_record_tx_idempotent_same_signature(self, client, login):
        """Re-posting the same signature is a no-op — the UI may retry
        on transient network errors and shouldn't get a 4xx for it."""
        sid = self._open_stream(client, login)
        sig = "abc" * 30
        client.post(
            f"/mpp/streams/{sid}/record-tx",
            json={"tx_signature": sig},
            headers=_auth(login),
        )
        # Re-post.
        r = client.post(
            f"/mpp/streams/{sid}/record-tx",
            json={"tx_signature": sig},
            headers=_auth(login),
        )
        assert r.status_code == 200
        assert r.json()["stream"]["on_chain_signature"] == sig

    def test_record_tx_overwrites_with_new_signature(self, client, login):
        """A second call (e.g. withdraw after open) overwrites — withdraw
        is terminal and we don't carry both. The open-sig is preserved
        in mpp_events for audit purposes (open emits an 'open' event)."""
        sid = self._open_stream(client, login)
        client.post(
            f"/mpp/streams/{sid}/record-tx",
            json={"tx_signature": "open_sig_xxxxxxxxxxxxxxxxxxxx"},
            headers=_auth(login),
        )
        r = client.post(
            f"/mpp/streams/{sid}/record-tx",
            json={"tx_signature": "withdraw_sig_yyyyyyyyyyyyyyyy"},
            headers=_auth(login),
        )
        assert r.status_code == 200
        assert r.json()["stream"]["on_chain_signature"] == "withdraw_sig_yyyyyyyyyyyyyyyy"

    # — validation —

    def test_record_tx_empty_signature_400(self, client, login):
        sid = self._open_stream(client, login)
        r = client.post(
            f"/mpp/streams/{sid}/record-tx",
            json={"tx_signature": ""},
            headers=_auth(login),
        )
        assert r.status_code == 400

    def test_record_tx_whitespace_only_400(self, client, login):
        sid = self._open_stream(client, login)
        r = client.post(
            f"/mpp/streams/{sid}/record-tx",
            json={"tx_signature": "   "},
            headers=_auth(login),
        )
        assert r.status_code == 400

    def test_record_tx_oversize_signature_400(self, client, login):
        """Bound payload to keep the column from growing unboundedly —
        base58-encoded ed25519 sigs are ~88 chars; 129+ is junk."""
        sid = self._open_stream(client, login)
        r = client.post(
            f"/mpp/streams/{sid}/record-tx",
            json={"tx_signature": "x" * 129},
            headers=_auth(login),
        )
        assert r.status_code == 400

    # — error paths —

    def test_record_tx_unknown_stream_404(self, client, login):
        r = client.post(
            "/mpp/streams/99999/record-tx",
            json={"tx_signature": "abc" * 20},
            headers=_auth(login),
        )
        assert r.status_code == 404

    def test_record_tx_tenant_isolation(self, client):
        """Bob cannot record-tx against alice's stream — owner-scoped
        lookup should 404 even if bob guesses the id."""
        a = client.post("/auth/login", json={"userId": "alice", "password": "p"}).json()["token"]
        b = client.post("/auth/login", json={"userId": "bob",   "password": "p"}).json()["token"]

        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(a))
        sid = r.json()["stream"]["id"]

        r = client.post(
            f"/mpp/streams/{sid}/record-tx",
            json={"tx_signature": "abc" * 20},
            headers=_auth(b),
        )
        assert r.status_code == 404


class TestStreamFieldShape:
    """Stream rows expose `on_chain_signature` (null until /record-tx)
    so the frontend banner + green badge can key off it."""

    def test_open_stream_response_includes_on_chain_signature_null(
        self, client, login,
    ):
        r = client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        s = r.json()["stream"]
        assert "on_chain_signature" in s
        assert s["on_chain_signature"] is None

    def test_list_streams_includes_on_chain_signature(self, client, login):
        client.post("/mpp/streams", json=_open_payload(), headers=_auth(login))
        body = client.get("/mpp/streams", headers=_auth(login)).json()
        assert all("on_chain_signature" in s for s in body["streams"])
