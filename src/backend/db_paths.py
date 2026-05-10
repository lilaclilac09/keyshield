"""Single source of truth for SQLite file locations.

Set `KS_DATA_DIR` (e.g., a Railway Volume mounted at `/data`) to put all
SQLite files under one persistent directory. Otherwise the defaults
preserve the historical per-file layout so tests + local dev keep working.
"""
from __future__ import annotations

import os
from pathlib import Path

_BACKEND_DIR = Path(__file__).parent
_DEFAULT_DATA_SUBDIR = _BACKEND_DIR / "data"


def data_dir() -> Path:
    """Where per-domain SQLite files live (sharing.db, agents.db, etc.)."""
    env = os.getenv("KS_DATA_DIR")
    return Path(env) if env else _DEFAULT_DATA_SUBDIR


def backend_db_path(filename: str) -> Path:
    """For DBs that historically lived at the backend root (sessions.db, keyshield.db)."""
    env = os.getenv("KS_DATA_DIR")
    return Path(env) / filename if env else _BACKEND_DIR / filename
