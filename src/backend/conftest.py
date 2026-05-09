"""Test fixtures for KeyShield backend."""
import sys
from pathlib import Path
import pytest

# Ensure src/ is on sys.path for imports
_repo = Path(__file__).resolve().parent.parent  # /src/
if str(_repo) not in sys.path:
    sys.path.insert(0, str(_repo))

from src.auth import create_token


@pytest.fixture
def _auth():
    """Return an auth header generator that accepts a token."""
    def _make(token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}
    return _make


@pytest.fixture
def client():
    """Return a test HTTP client for the FastAPI app."""
    from fastapi.testclient import TestClient
    from src.app import app
    return TestClient(app)


@pytest.fixture
def login(client):
    """Create a test session and return the token."""
    token = create_token("testuser", "testpass")
    return token
