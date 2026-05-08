"""Tests for the Prometheus metrics module and /metrics endpoint."""
import os
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("KS_VAULT_DIR", "/tmp/ks_test_metrics_vault")


@pytest.fixture
def client():
    from src.server import app
    return TestClient(app)


# ── /metrics endpoint ─────────────────────────────────────────────────────────

def test_metrics_endpoint_returns_200(client):
    r = client.get("/metrics")
    assert r.status_code == 200


def test_metrics_content_type_is_text_plain(client):
    r = client.get("/metrics")
    assert "text/plain" in r.headers["content-type"]


def test_metrics_body_contains_ks_prefix(client):
    r = client.get("/metrics")
    assert "ks_proxy_requests_total" in r.text or "ks_" in r.text


def test_metrics_token_required_when_set(monkeypatch, client):
    monkeypatch.setenv("KS_METRICS_TOKEN", "secret123")
    # Re-import to pick up env var — use module-level approach
    import importlib, src.server as srv
    srv._METRICS_TOKEN = "secret123"
    r = client.get("/metrics")
    assert r.status_code == 401
    srv._METRICS_TOKEN = ""  # reset


def test_metrics_token_accepted_when_correct(monkeypatch, client):
    import src.server as srv
    srv._METRICS_TOKEN = "secret123"
    r = client.get("/metrics", headers={"Authorization": "Bearer secret123"})
    assert r.status_code == 200
    srv._METRICS_TOKEN = ""  # reset


# ── metrics module helpers ────────────────────────────────────────────────────

def test_record_proxy_increments_counter():
    from src.metrics import PROXY_REQUESTS, record_proxy
    before = PROXY_REQUESTS.labels(upstream="openai", status_code="200")._value.get()
    record_proxy("openai", 200, 0.123)
    after = PROXY_REQUESTS.labels(upstream="openai", status_code="200")._value.get()
    assert after == before + 1


def test_record_vault_op_increments_counter():
    from src.metrics import VAULT_OPS, record_vault_op
    before = VAULT_OPS.labels(op="store")._value.get()
    record_vault_op("store")
    after = VAULT_OPS.labels(op="store")._value.get()
    assert after == before + 1


def test_record_auth_increments_counter():
    from src.metrics import AUTH_ATTEMPTS, record_auth
    before = AUTH_ATTEMPTS.labels(result="success")._value.get()
    record_auth("success")
    after = AUTH_ATTEMPTS.labels(result="success")._value.get()
    assert after == before + 1


def test_record_topup_increments_counter():
    from src.metrics import BILLING_TOPUPS, record_topup
    before = BILLING_TOPUPS.labels(method="x402")._value.get()
    record_topup("x402", 1.0)
    after = BILLING_TOPUPS.labels(method="x402")._value.get()
    assert after == before + 1


def test_metrics_response_returns_tuple():
    from src.metrics import metrics_response
    body, content_type = metrics_response()
    assert isinstance(body, str)
    assert "text/plain" in content_type
