"""Real local ZK proxy acceptance boundary; no external network is permitted.

Approval scenarios intentionally send no approval proof: there is no product
approval/denial API to drive. A local bearer alone must not authorize these uses.
"""

from __future__ import annotations

import os
import socket
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "packages" / "sdk-py"))

from keyshield import zk as kzk  # noqa: E402
from keyshield.local_proxy import serve  # noqa: E402

from src.backend.app import app  # noqa: E402
from src.backend.auth import session as sess_mod  # noqa: E402

FAKE_KEY = "FAKE_KEYSHIELD_NOT_A_KEY::sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
OPERATION = "/vproxy/openai/v1/mock"
CACHE_SECONDS = 30.0


@dataclass
class Broker:
    control: TestClient
    owner_headers: dict
    server_token: str
    item_id: str
    zk: kzk.ZkClient
    agent: httpx.Client
    provider_requests: list
    control_requests: list
    provider_status: int = 200

    def request(self, method="POST", path=OPERATION, **kwargs):
        return self.agent.request(method, path, **kwargs)

    def revoke(self):
        response = self.control.post(
            f"/sessions/{self.server_token[-8:]}/revoke", headers=self.owner_headers
        )
        assert response.status_code == 200

    def share(self):
        return self.control.get(
            f"/zk/share/{self.item_id}",
            headers={"Authorization": f"Bearer {self.server_token}"},
        )


@pytest.fixture()
def broker(tmp_path, monkeypatch):
    from src.backend.routes import vault as vault_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    monkeypatch.setenv("SERVER_SECRET", "test-local-broker-acceptance")
    monkeypatch.delenv("KS_ZK_DISABLED", raising=False)
    control_requests = []
    provider_requests = []
    network_attempts = []
    allowed_port = None
    original_connect = socket.socket.connect

    def loopback_only(sock, address):
        if not (
            isinstance(address, tuple)
            and address[0] == "127.0.0.1"
            and address[1] == allowed_port
        ):
            network_attempts.append(address)
            raise AssertionError(f"Non-mock egress forbidden: {address!r}")
        return original_connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", loopback_only)

    def capture_control(request):
        control_requests.append(
            (str(request.url), list(request.headers.multi_items()), request.read())
        )

    control = TestClient(app)
    control.event_hooks["request"].append(capture_control)
    owner = sess_mod.create_token("acceptance-owner", "")
    owner_headers = {"Authorization": f"Bearer {owner}"}
    root = kzk.root_from_prf(os.urandom(32))
    assert (
        control.post(
            "/zk/enable", headers=owner_headers, json={"root_id": kzk.root_id(root)}
        ).status_code
        == 200
    )
    saved = kzk.seal_item(root, "openai", FAKE_KEY, name="Deliberate synthetic save")
    assert control.post("/manage/store", headers=owner_headers, json=saved).status_code == 200
    issued = control.post(
        "/sessions/proxy-token", headers=owner_headers, json={"ttl_seconds": 60}
    )
    assert issued.status_code == 200
    server_token = issued.json()["token"]

    def provider(request):
        assert request.url.scheme == "https"
        assert request.url.host == "api.openai.com"
        assert request.headers["authorization"] == f"Bearer {FAKE_KEY}"
        provider_requests.append(request)
        if state.provider_status == 307:
            return httpx.Response(307, headers={"location": "https://evil.test/collect"})
        return httpx.Response(200, json={"result": "synthetic mock result"})

    upstream = httpx.Client(transport=httpx.MockTransport(provider))
    zk = kzk.ZkClient(server_token, root, http=control)
    assert zk.share_ttl == CACHE_SECONDS
    httpd, local_token = serve(zk, port=0, upstream_http=upstream)
    allowed_port = httpd.server_address[1]
    agent = httpx.Client(
        base_url=f"http://127.0.0.1:{allowed_port}",
        headers={"Authorization": f"Bearer {local_token}"},
        trust_env=False,
        timeout=5,
    )
    state = Broker(
        control,
        owner_headers,
        server_token,
        saved["id"],
        zk,
        agent,
        provider_requests,
        control_requests,
    )
    try:
        yield state
    finally:
        agent.close()
        httpd.shutdown()
        httpd.server_close()
        upstream.close()
        control.close()
        assert not network_attempts
        assert control_requests
        for url, headers, body in control_requests:
            assert FAKE_KEY not in url
            assert all(FAKE_KEY not in name and FAKE_KEY not in value for name, value in headers)
            assert FAKE_KEY.encode() not in body


def test_authenticated_result_and_secret_boundary(broker):
    response = broker.request(json={"input": "harmless synthetic operation"})
    assert response.status_code == 200
    assert response.json() == {"result": "synthetic mock result"}
    assert FAKE_KEY not in response.text
    assert all(FAKE_KEY not in value for _, value in response.headers.multi_items())
    assert len(broker.provider_requests) == 1
    request = broker.provider_requests[0]
    assert request.method == "POST"
    assert str(request.url) == "https://api.openai.com/v1/mock"
    assert any("/zk/share/" in url for url, _, _ in broker.control_requests)


@pytest.mark.parametrize("token", [None, "wrong-local-token"])
def test_invalid_local_auth_fails_closed(broker, token):
    request = broker.agent.build_request("POST", OPERATION)
    request.headers.pop("authorization")
    if token:
        request.headers["authorization"] = f"Bearer {token}"
    response = broker.agent.send(request)
    assert response.status_code == 401
    assert not broker.provider_requests
    assert not any("/zk/share/" in url for url, _, _ in broker.control_requests)


@pytest.mark.xfail(
    strict=True, raises=AssertionError, reason="missing: human approval gate before each use"
)
def test_human_approval_required_before_use(broker):
    response = broker.request()
    assert 400 <= response.status_code < 500
    assert not broker.provider_requests


@pytest.mark.xfail(
    strict=True, raises=AssertionError, reason="missing: human denial API and fail-closed gate"
)
def test_human_denial_fails_closed(broker):
    # No denial API exists; withholding human approval must prevent execution.
    response = broker.request()
    assert 400 <= response.status_code < 500
    assert not broker.provider_requests


@pytest.mark.xfail(
    strict=True, raises=AssertionError, reason="missing: local approval expiration enforcement"
)
def test_local_approval_expiration(broker):
    # No approval grant/expiry API exists; no live approval may authorize this call.
    response = broker.request()
    assert 400 <= response.status_code < 500
    assert not broker.provider_requests


def test_server_session_expiry_refuses_share_and_egress(broker, monkeypatch):
    expired_time = time.time() + 61
    monkeypatch.setattr(sess_mod, "time", SimpleNamespace(time=lambda: expired_time))
    assert broker.share().status_code == 401
    response = broker.request()
    assert response.status_code == 401
    assert response.json() == {"error": "invalid token"}
    assert not broker.provider_requests


def test_server_revocation_after_real_share_cache_window(broker):
    assert broker.request().status_code == 200
    broker.revoke()
    revoked_at = time.monotonic()
    assert broker.share().status_code == 401
    cached = broker.request()
    assert cached.status_code == 200
    cached_delay = time.monotonic() - revoked_at
    time.sleep(CACHE_SECONDS + 0.1)
    count = len(broker.provider_requests)
    response = broker.request()
    blocked_delay = time.monotonic() - revoked_at
    assert response.status_code == 401
    assert len(broker.provider_requests) == count
    print(
        f"\nRevocation: cache_ttl={CACHE_SECONDS:.3f}s; "
        f"cached use accepted at +{cached_delay:.3f}s; "
        f"use blocked at +{blocked_delay:.3f}s"
    )


@pytest.mark.xfail(
    strict=True, raises=AssertionError, reason="missing: method/path-bound fixed operation grant"
)
def test_different_operation_is_refused(broker):
    response = broker.request("DELETE", "/vproxy/openai/v1/files")
    assert 400 <= response.status_code < 500
    assert not broker.provider_requests


def test_cross_host_redirect_is_not_followed(broker):
    broker.provider_status = 307
    response = broker.request()
    assert response.status_code == 307
    assert response.headers["location"] == "https://evil.test/collect"
    assert len(broker.provider_requests) == 1
    assert broker.provider_requests[0].url.host == "api.openai.com"
    assert FAKE_KEY not in response.text
    assert all(FAKE_KEY not in value for _, value in response.headers.multi_items())
