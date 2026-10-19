"""keyshield-proxy (packages/sdk-py) against the real backend app.

Proves the ZK loop end to end: the SDK seals a key, the server stores it,
the local proxy decrypts it with root + share and injects it into the
upstream call, and revoking the proxy's token stops it.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "packages" / "sdk-py"))

from keyshield import zk as kzk  # noqa: E402
from keyshield.local_proxy import serve  # noqa: E402

from src.backend.app import app  # noqa: E402
from src.backend.auth import session as sess_mod  # noqa: E402

FAKE_KEY = "sk-demo-local-proxy-not-real-" + "5" * 20


@pytest.fixture()
def world(tmp_path, monkeypatch):
    from src.backend.routes import vault as vault_mod

    monkeypatch.setattr(sess_mod, "DB_PATH", tmp_path / "sessions.db")
    monkeypatch.setattr(vault_mod, "_DB_PATH", tmp_path / "vault.db")
    monkeypatch.setenv("SERVER_SECRET", "test-zk-local-proxy")
    monkeypatch.delenv("KS_ZK_DISABLED", raising=False)
    server = TestClient(app)
    owner = sess_mod.create_token("pat", "")
    h = {"Authorization": f"Bearer {owner}"}
    root = kzk.root_from_prf(os.urandom(32))
    assert (
        server.post("/zk/enable", headers=h, json={"root_id": kzk.root_id(root)}).status_code == 200
    )
    body = kzk.seal_item(root, "openai", FAKE_KEY, hint="sk-demo-")
    assert server.post("/manage/store", headers=h, json=body).status_code == 200
    proxy_tok = server.post("/sessions/proxy-token", headers=h, json={}).json()["token"]

    seen: list[httpx.Request] = []

    def upstream(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json={"object": "list", "data": []})

    zk = kzk.ZkClient(proxy_tok, root, http=server, share_ttl=0)
    httpd, local = serve(
        zk, port=0, upstream_http=httpx.Client(transport=httpx.MockTransport(upstream))
    )
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    yield server, h, proxy_tok, base, local, seen, root
    httpd.shutdown()


def test_vectors_match_sdk():
    v = json.loads((REPO / "docs" / "zk" / "vectors.json").read_text())
    root = kzk.root_from_prf(kzk.unb64u(v["prf_output"]))
    assert kzk.root_id(root) == v["root_id"]
    item = {"id": v["item_id"], "upstream": v["upstream"], "iv": v["iv"], "cipher": v["cipher"]}
    assert kzk.open_item(root, kzk.unb64u(v["share"]), item) == v["plaintext"]


def test_local_proxy_injects_and_revoke_stops_it(world):
    server, h, proxy_tok, base, local, seen, _ = world
    r = httpx.get(f"{base}/vproxy/openai/v1/models", headers={"Authorization": f"Bearer {local}"})
    assert r.status_code == 200, r.text
    assert r.headers["x-ks-key-type"] == "zk-local"
    assert seen[-1].url == "https://api.openai.com/v1/models"
    assert seen[-1].headers["authorization"] == f"Bearer {FAKE_KEY}"
    assert local not in str(seen[-1].headers)  # the local token is never forwarded

    # The hosted proxy can't do this for a ZK key.
    hosted = server.get("/vproxy/openai/v1/models", headers=h)
    assert hosted.status_code == 409 and hosted.json()["error"] == "zk_item"

    # Revoke the proxy's KeyShield token: the next call can't get the share.
    assert server.post(f"/sessions/{proxy_tok[-8:]}/revoke", headers=h).status_code == 200
    r = httpx.get(f"{base}/vproxy/openai/v1/models", headers={"Authorization": f"Bearer {local}"})
    assert r.status_code == 401 and r.json() == {"error": "invalid token"}


def test_local_proxy_requires_local_token_and_loopback_host(world):
    _, _, _, base, local, seen, _ = world
    assert httpx.get(f"{base}/vproxy/openai/v1/models").status_code == 401
    bad = httpx.get(f"{base}/openai/v1/models", headers={"Authorization": "Bearer nope"})
    assert bad.status_code == 401
    rebind = httpx.get(
        f"{base}/openai/v1/models",
        headers={"Authorization": f"Bearer {local}", "Host": "evil.example"},
    )
    assert rebind.status_code == 401
    assert not seen


def test_wrong_root_is_refused(world):
    server, _, proxy_tok, *_ = world
    other = kzk.ZkClient(proxy_tok, kzk.root_from_prf(os.urandom(32)), http=server)
    with pytest.raises(kzk.ZkError, match="different passkey root"):
        other.check_root()
    with pytest.raises(kzk.ZkError, match="can't decrypt"):
        other.key_for("openai")


def test_root_file_permissions(tmp_path):
    root = kzk.root_from_prf(os.urandom(32))
    p = kzk.save_root(root, tmp_path / "ks" / "zk-root")
    assert oct(p.stat().st_mode & 0o777) == "0o600"
    assert kzk.load_root(p) == root
    p.chmod(0o644)
    with pytest.raises(kzk.ZkError, match="readable by other users"):
        kzk.load_root(p)
