"""
Shared fixtures for the python-sdk tests.

Drive the real FastAPI app (`src.backend.app`) in-process. DBs land under
tmp_path. Password login is 403 on the live API — tests use wallet login.
"""

from __future__ import annotations

import sys
from pathlib import Path

import httpx
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture(autouse=True)
def isolate_dbs(tmp_path, monkeypatch):
    monkeypatch.setenv("KS_DEV_MODE", "1")
    from src.backend.auth import session as session_mod
    from src.backend.routes import vault as vault_mod
    from src.backend.agents import agents as agents_mod
    from src.backend.billing import usage as usage_mod

    monkeypatch.setattr(session_mod, "DB_PATH", Path(tmp_path / "sessions.db"))
    monkeypatch.setattr(vault_mod, "_DB_PATH", Path(tmp_path / "vault_shim.db"))
    monkeypatch.setattr(agents_mod, "DB_PATH", Path(tmp_path / "data" / "agents.db"))
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
    yield


@pytest.fixture
def asgi_app():
    from src.backend.app import app

    return app


@pytest.fixture
def sync_client(asgi_app):
    from starlette.testclient import TestClient

    with TestClient(asgi_app, base_url="http://test") as c:
        yield c


@pytest.fixture
def async_transport(asgi_app):
    return httpx.ASGITransport(app=asgi_app)


def wallet_login_sync(ks, passphrase: str = "secret") -> str:
    """Mint a session via /auth/wallet-login. Returns the wallet address."""
    pytest.importorskip("nacl.signing")
    import base58
    from nacl.signing import SigningKey

    sk = SigningKey.generate()
    wallet = base58.b58encode(bytes(sk.verify_key)).decode()
    ch = ks.wallet_challenge()
    sig = sk.sign(ch["challenge"].encode()).signature
    ks.wallet_login(wallet, sig, ch["challenge"], passphrase)
    return wallet
