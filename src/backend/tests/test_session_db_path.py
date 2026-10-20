"""sessions.db location: env overrides, default unchanged."""

import importlib
from pathlib import Path

from src.backend.auth import session as sess_mod

_BACKEND = Path(sess_mod.__file__).parent.parent


def _reload(monkeypatch, **env):
    for k in ("KS_SESSION_DB", "KS_DATA_DIR"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return importlib.reload(sess_mod).DB_PATH


def test_session_db_path(monkeypatch, tmp_path):
    try:
        assert _reload(monkeypatch) == _BACKEND / "sessions.db"
        assert _reload(monkeypatch, KS_DATA_DIR=str(tmp_path)) == tmp_path / "sessions.db"
        explicit = tmp_path / "x" / "s.db"
        assert (
            _reload(monkeypatch, KS_DATA_DIR=str(tmp_path), KS_SESSION_DB=str(explicit)) == explicit
        )
        assert sess_mod.register_password("alice", "hunter2")
        assert explicit.exists()
        assert sess_mod.verify_password("alice", "hunter2")
    finally:
        monkeypatch.delenv("KS_SESSION_DB", raising=False)
        monkeypatch.delenv("KS_DATA_DIR", raising=False)
        importlib.reload(sess_mod)
