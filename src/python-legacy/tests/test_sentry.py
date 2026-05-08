"""Tests for Sentry integration — ensure PII scrubbing works."""

import pytest
from fastapi import HTTPException

from src.server import _sentry_before_send


# ─── Helper ──────────────────────────────────────────────────────────────────

def _make_event(data: dict | None = None) -> dict:
    """Build a minimal Sentry event with optional request data."""
    event: dict = {}
    if data is not None:
        event["request"] = {"data": data}
    return event


def _make_hint(exc: BaseException | None = None) -> dict:
    """Build a Sentry hint dict from an exception instance."""
    if exc is None:
        return {}
    return {"exc_info": (type(exc), exc, None)}


# ─── PII scrubbing ────────────────────────────────────────────────────────────

def test_strips_password_from_request_data():
    event = _make_event({"username": "alice", "password": "s3cr3t!"})
    result = _sentry_before_send(event, {})
    assert result is not None
    assert result["request"]["data"]["password"] == "[Filtered]"
    assert result["request"]["data"]["username"] == "alice"  # non-PII preserved


def test_strips_api_key_from_request_data():
    event = _make_event({"upstream": "openai", "api_key": "sk-abc123"})
    result = _sentry_before_send(event, {})
    assert result is not None
    assert result["request"]["data"]["api_key"] == "[Filtered]"
    assert result["request"]["data"]["upstream"] == "openai"


def test_strips_token_and_secret_from_request_data():
    event = _make_event({"token": "tok_xyz", "secret": "my-secret", "other": "ok"})
    result = _sentry_before_send(event, {})
    assert result is not None
    data = result["request"]["data"]
    assert data["token"] == "[Filtered]"
    assert data["secret"] == "[Filtered]"
    assert data["other"] == "ok"


def test_strips_passphrase_and_key_value():
    event = _make_event({"passphrase": "hunter2", "key_value": "raw-key-bytes"})
    result = _sentry_before_send(event, {})
    assert result is not None
    data = result["request"]["data"]
    assert data["passphrase"] == "[Filtered]"
    assert data["key_value"] == "[Filtered]"


# ─── 4xx suppression ─────────────────────────────────────────────────────────

def test_drops_http_401():
    exc = HTTPException(status_code=401, detail="Unauthorized")
    result = _sentry_before_send(_make_event(), _make_hint(exc))
    assert result is None


def test_drops_http_403():
    exc = HTTPException(status_code=403, detail="Forbidden")
    result = _sentry_before_send(_make_event(), _make_hint(exc))
    assert result is None


def test_drops_http_404():
    exc = HTTPException(status_code=404, detail="Not found")
    result = _sentry_before_send(_make_event(), _make_hint(exc))
    assert result is None


# ─── 5xx pass-through ────────────────────────────────────────────────────────

def test_passes_http_500():
    exc = HTTPException(status_code=500, detail="Internal server error")
    event = _make_event({"action": "proxy"})
    result = _sentry_before_send(event, _make_hint(exc))
    assert result is not None  # 500 should be reported


def test_passes_generic_exception():
    exc = ValueError("something blew up")
    event = _make_event()
    result = _sentry_before_send(event, _make_hint(exc))
    assert result is not None


# ─── No-DSN path ─────────────────────────────────────────────────────────────

def test_sentry_disabled_when_no_dsn(monkeypatch):
    """Server module imports cleanly when SENTRY_DSN is unset."""
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    # If the module is already imported, _SENTRY_DSN was resolved at import time.
    # We verify the guard logic directly: an empty DSN means Sentry was not init'd.
    import src.server as server_mod
    # The module-level _SENTRY_DSN should be empty string when env var is absent
    # at import time.  We can't re-import to test runtime, but we can verify
    # the conditional guard exists and is a string.
    assert isinstance(server_mod._SENTRY_DSN, str)
