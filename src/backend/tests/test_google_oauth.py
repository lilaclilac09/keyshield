"""Google OAuth status/start/callback without live Google credentials."""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.backend.app import app
from src.backend.auth import google_oauth as google_mod
from src.backend.auth import session as sess_mod


def _iso(tmp_path, monkeypatch):
    from src.backend.auth import ratelimit as rl_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    rl_mod.login_limiter.reset()
    monkeypatch.setenv("SERVER_SECRET", "test-google-oauth-secret")
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("KS_GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("KS_GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("GOOGLE_REDIRECT_URI", raising=False)
    google_mod.reset()


def test_google_status_disabled_without_secrets(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.get("/auth/google/status")
    assert res.status_code == 200
    body = res.json()
    assert body["enabled"] is False
    assert body["env"]["GOOGLE_CLIENT_ID"] is False
    assert "GOOGLE_CLIENT_ID" in body["detail"]
    assert "KS_GOOGLE_CLIENT_ID" in body["aliases"]


def test_google_start_without_secrets_is_503(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    client = TestClient(app)
    res = client.get("/auth/google/start?json=1")
    assert res.status_code == 503
    assert res.json()["enabled"] is False
    assert "Next step" in res.json()["detail"]


def test_google_callback_mocked_mints_gmail_session(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "http://testserver/auth/google/callback")
    monkeypatch.setenv("KS_GOOGLE_SUCCESS_URL", "https://app.ks.aileena.xyz/")

    def fake_http(method, url, *, data=None, headers=None):
        if "token" in url:
            return {"access_token": "ya29.test"}
        return {"email": "aileen@gmail.com", "verified_email": True, "name": "Aileen"}

    monkeypatch.setattr(google_mod, "http_json", fake_http)
    client = TestClient(app, follow_redirects=False)
    start = client.get("/auth/google/start?json=1")
    assert start.status_code == 200, start.text
    state = start.json()["state"]
    assert "accounts.google.com" in start.json()["url"]

    cb = client.get(f"/auth/google/callback?code=4/test-code&state={state}")
    assert cb.status_code == 302
    loc = cb.headers["location"]
    assert "ks_google=" in loc
    ticket = loc.split("ks_google=", 1)[1]
    exchanged = client.post("/auth/google/exchange", json={"ticket": ticket})
    assert exchanged.status_code == 200, exchanged.text
    body = exchanged.json()
    assert body["userId"] == "aileen@gmail.com"
    assert body["registered"] is True
    assert body["provider"] == "google"
    sess = sess_mod.get(body["token"])
    assert sess is not None
    assert sess["user_id"] == "aileen@gmail.com"


def test_google_desktop_poll(tmp_path, monkeypatch):
    _iso(tmp_path, monkeypatch)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")

    def fake_http(method, url, *, data=None, headers=None):
        if "token" in url:
            return {"access_token": "ya29.test"}
        return {"email": "mac@gmail.com", "verified_email": True}

    monkeypatch.setattr(google_mod, "http_json", fake_http)
    client = TestClient(app)
    start = client.get("/auth/google/start?json=1&desktop=1")
    state = start.json()["state"]
    pending = client.get(f"/auth/google/poll?state={state}")
    assert pending.status_code == 202
    cb = client.get(f"/auth/google/callback?code=4/desk&state={state}")
    assert cb.status_code == 200
    assert "Return to the KeyShield app" in cb.text
    done = client.get(f"/auth/google/poll?state={state}")
    assert done.status_code == 200
    assert done.json()["userId"] == "mac@gmail.com"
    assert sess_mod.get(done.json()["token"])["user_id"] == "mac@gmail.com"
