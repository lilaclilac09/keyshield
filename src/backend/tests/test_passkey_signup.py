"""Passkey-first signup: a brand-new user creates an account with no wallet."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import passkey as pk_mod
from src.backend.auth import session as sess_mod
from src.backend.billing import plans as plans_mod
from src.backend.tests.test_passkey_register_then_login import ORIGIN, SoftAuthenticator

H = {"Origin": ORIGIN}


def _client(tmp_path, monkeypatch):
    monkeypatch.setattr(pk_mod, "DB_PATH", tmp_path / "keyshield.db")
    pk_mod._PENDING_AUTHS.clear()
    pk_mod._PENDING_REGS.clear()
    getattr(pk_mod, "_PENDING_SIGNUPS", {}).clear()
    pk_mod._init_db()
    monkeypatch.setattr(plans_mod, "DB_PATH", tmp_path / "usage.db")
    return TestClient(app)


def test_signup_then_passkey_login(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    auth = SoftAuthenticator()
    r = c.get("/auth/passkey/signup-options", headers=H)
    assert r.status_code == 200, r.text
    uid = r.json()["ksUserId"]
    assert uid.startswith("pk_")
    r = c.post(
        "/auth/passkey/signup-verify",
        headers=H,
        json={"userId": uid, "credential": auth.create(r.json()), "name": "Mac"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["userId"] == uid and sess_mod.get(r.json()["token"])
    r = c.get("/auth/passkey/auth-options", params={"user_id": uid}, headers=H)
    r = c.post(
        "/auth/passkey/auth-verify",
        params={"user_id": uid},
        headers=H,
        json={"credential": auth.get(r.json())},
    )
    assert r.status_code == 200 and r.json()["userId"] == uid


def test_signup_cannot_target_existing_or_unminted_ids(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    auth = SoftAuthenticator()
    # Existing wallet user with a normal "reg" challenge pending.
    victim = "F6AHWalletJ52R"
    tok = sess_mod.create_token(victim, "")
    opts = c.get(
        "/auth/passkey/register-options", headers={**H, "Authorization": f"Bearer {tok}"}
    ).json()
    cred = auth.create(opts)
    for uid in (victim, "pk_never_minted"):
        r = c.post(
            "/auth/passkey/signup-verify", headers=H, json={"userId": uid, "credential": cred}
        )
        assert r.status_code == 400, (uid, r.text)
    assert pk_mod.list_credentials(victim) == []


def test_signup_cannot_steal_existing_credential_id(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    auth = SoftAuthenticator()
    victim = "F6AHWalletJ52R"
    hdr = {**H, "Authorization": f"Bearer {sess_mod.create_token(victim, '')}"}
    opts = c.get("/auth/passkey/register-options", headers=hdr).json()
    assert (
        c.post(
            "/auth/passkey/register-verify", headers=hdr, json={"credential": auth.create(opts)}
        ).status_code
        == 200
    )
    r = c.get("/auth/passkey/signup-options", headers=H)
    r = c.post(
        "/auth/passkey/signup-verify",
        headers=H,
        json={"userId": r.json()["ksUserId"], "credential": auth.create(r.json())},
    )
    assert r.status_code == 400
    assert len(pk_mod.list_credentials(victim)) == 1


# ─── security review S1–S5 ────────────────────────────────────────────────────

import pytest  # noqa: E402

from src.backend import demo as demo_mod  # noqa: E402
from src.backend.auth import ratelimit as rl_mod  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_limiter():
    rl_mod.signup_limiter.reset()
    yield
    rl_mod.signup_limiter.reset()


def test_signup_options_burst_is_rate_limited(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    codes = [c.get("/auth/passkey/signup-options", headers=H).status_code for _ in range(11)]
    assert codes[:10] == [200] * 10 and codes[10] == 429
    r = c.post("/auth/passkey/signup-verify", headers=H, json={"userId": "pk_x"})
    assert r.status_code == 429  # verify shares the same per-IP budget


def test_signup_limiter_daily_cap_and_spoofed_xff():
    lim = rl_mod.WindowLimiter([(10, 60.0), (50, 86_400.0)])
    t = 0.0
    for _ in range(50):
        assert lim.allow("1.2.3.4", now=t)
        t += 61.0 / 10
    assert not lim.allow("1.2.3.4", now=t)
    assert lim.allow("1.2.3.4", now=t + 86_400.0)

    class R:
        client = None
        headers = {"X-Forwarded-For": "6.6.6.6, 9.9.9.9"}

    assert rl_mod.client_ip(R()) == "9.9.9.9"


def test_stash_purges_expired_and_caps_store(tmp_path, monkeypatch):
    _client(tmp_path, monkeypatch)
    pk_mod._PENDING_SIGNUPS.clear()
    pk_mod._stash_challenge("pk_old", "signup", "c", "", [])
    pk_mod._PENDING_SIGNUPS["pk_old"]["expires"] = 0
    with pk_mod._db() as conn:
        conn.execute("UPDATE passkey_challenges SET expires = 0")
    monkeypatch.setattr(pk_mod, "MAX_PENDING", 3)
    for i in range(5):
        pk_mod._stash_challenge(f"pk_{i}", "signup", "c", "", [])
    assert "pk_old" not in pk_mod._PENDING_SIGNUPS
    assert len(pk_mod._PENDING_SIGNUPS) <= 3
    with pk_mod._db() as conn:
        assert not conn.execute(
            "SELECT 1 FROM passkey_challenges WHERE user_id='pk_old'"
        ).fetchone()


def test_auth_challenge_cannot_satisfy_signup_verify(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    auth = SoftAuthenticator()
    opts = c.get("/auth/passkey/signup-options", headers=H).json()
    uid = opts["ksUserId"]
    cred = auth.create(opts)
    # A login challenge for the same id must not be accepted or clobber signup.
    pk_mod._stash_challenge(uid, "auth", "AAAA", "", [])
    assert uid in pk_mod._PENDING_SIGNUPS and uid in pk_mod._PENDING_AUTHS
    assert pk_mod._PENDING_SIGNUPS[uid]["kind"] == "signup"
    assert pk_mod._pop_challenge(uid, "signup")["challenge"] != "AAAA"
    # With only the auth challenge left, signup-verify is refused.
    r = c.post("/auth/passkey/signup-verify", headers=H, json={"userId": uid, "credential": cred})
    assert r.status_code == 400
    assert pk_mod.list_credentials(uid) == []


def test_signup_plan_limit_rolls_back_credential(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    auth = SoftAuthenticator()

    def boom(*a, **k):
        raise plans_mod.PlanLimitError({"detail": "seat limit"})

    monkeypatch.setattr(plans_mod, "claim_device", boom)
    opts = c.get("/auth/passkey/signup-options", headers=H).json()
    uid = opts["ksUserId"]
    r = c.post(
        "/auth/passkey/signup-verify",
        headers=H,
        json={"userId": uid, "credential": auth.create(opts)},
    )
    assert r.status_code == 402, r.text
    assert pk_mod.list_credentials(uid) == []


def test_signup_name_truncated_to_64(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    auth = SoftAuthenticator()
    seen = {}
    real = plans_mod.claim_device

    def spy(user_id, level, name, **k):
        seen["name"] = name
        return real(user_id, level, name, **k)

    monkeypatch.setattr(plans_mod, "claim_device", spy)
    opts = c.get("/auth/passkey/signup-options", headers=H).json()
    uid = opts["ksUserId"]
    r = c.post(
        "/auth/passkey/signup-verify",
        headers=H,
        json={"userId": uid, "credential": auth.create(opts), "name": "x" * 500},
    )
    assert r.status_code == 200, r.text
    assert pk_mod.list_credentials(uid)[0]["name"] == "x" * 64
    assert seen["name"] == "x" * 64


@pytest.mark.parametrize(
    "var,val", [("RAILWAY_ENVIRONMENT_NAME", "production"), ("KS_ENV", "prod")]
)
def test_demo_mode_refused_in_production(monkeypatch, var, val):
    for v in ("RAILWAY_ENVIRONMENT_NAME", "RAILWAY_ENVIRONMENT", "KS_ENV"):
        monkeypatch.delenv(v, raising=False)
    monkeypatch.setenv("KS_DEMO_MODE", "1")
    demo_mod.assert_safe_for_env()  # local demo is fine
    monkeypatch.setenv(var, val)
    with pytest.raises(RuntimeError):
        demo_mod.assert_safe_for_env()
    with pytest.raises(RuntimeError):
        with TestClient(app):
            pass
    monkeypatch.delenv("KS_DEMO_MODE")
    with TestClient(app) as c:
        assert c.get("/health").status_code == 200
    monkeypatch.setenv("KS_DEMO_MODE", "1")
    assert TestClient(app).get("/health").status_code == 503
