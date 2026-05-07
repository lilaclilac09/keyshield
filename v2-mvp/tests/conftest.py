"""
Shared pytest fixtures for KeyShield v2-MVP.
Loads src/python-legacy/src/ so that `from src import server` resolves correctly.
"""

import os, sys, pytest
from pathlib import Path

_repo = Path('C:/Users/justi/Desktop/keyshield')
# Add the directory containing 'src' as a child
# so Python's import finds 'src' as a module (not namespace)
_src_parent = str(_repo / 'src/python-legacy')
if _src_parent not in sys.path:
    sys.path.insert(0, _src_parent)

from src import server, api_router, x402_verify, agents  # noqa: E402


@pytest.fixture(autouse=True)
def clean_dbs(monkeypatch):
    server._NONCES.clear()
    server._CACHE.clear()
    api_router._CACHE.clear()
    x402_verify._WARNED_ENV_MISSING = False
    yield
    server._NONCES.clear()
    server._CACHE.clear()
    api_router._CACHE.clear()
    x402_verify._WARNED_ENV_MISSING = False


def _auth(token):
    return {"Authorization": f"Bearer {token}"}
