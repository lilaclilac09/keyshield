#!/usr/bin/env python3
"""Seed AES-256-GCM session-store fixtures for the ks-session oracle tests.

This script monkey-patches the v2-mvp `session.DB_PATH` and `session._SERVER_SECRET`
so test runs never touch the real `v2-mvp/sessions.db`. The Rust side opens
the same temp DB read-only and calls `SessionStore::get(token)`.

Subcommands:
  fresh     — write a non-expired session row (the default happy-path case)
  expired   — write a row whose `expires_at` is already in the past, so
              the Python `session.get` predicate filters it out and Rust's
              should too
  decrypt-mismatch
            — write a row encrypted under SERVER_SECRET=A; the Rust harness
              opens the same DB with SERVER_SECRET=B to assert SessionError::Decrypt

Args: <subcommand> <out_dir> [<server_secret>] [<user_id>] [<password>]

Output:
  <out_dir>/sessions.db        # the SQLite file
  <out_dir>/manifest.json      # token + matching expectations for the Rust test

Manifest schema:
  {
    "scenario":     "fresh" | "expired" | "decrypt-mismatch",
    "db_path":      "...",
    "server_secret": "...",
    "user_id":      "...",
    "password":     "...",
    "token":        "...",
  }
"""
from __future__ import annotations

import importlib.util
import json
import os
import sqlite3
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROXY_RS = SCRIPT_DIR.parent
REPO_ROOT = PROXY_RS.parent
V2_SESSION_PY = REPO_ROOT / "v2-mvp" / "src" / "session.py"


def _load_session_module(db_path: Path, server_secret: str):
    """Import v2-mvp/src/session.py with overridden DB_PATH and SERVER_SECRET.

    `_SERVER_SECRET` is captured from `os.getenv` at import time, so we set
    the env var first and then load the module fresh.
    """
    os.environ["SERVER_SECRET"] = server_secret
    spec = importlib.util.spec_from_file_location("v2_session", V2_SESSION_PY)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {V2_SESSION_PY}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.DB_PATH = db_path
    return mod


def _create_session(out_dir: Path, server_secret: str, user_id: str, password: str) -> str:
    db_path = out_dir / "sessions.db"
    session = _load_session_module(db_path, server_secret)
    return session.create(user_id, password)


def _create_expired(out_dir: Path, server_secret: str, user_id: str, password: str) -> str:
    """Mirror what `session.create` does, but stamp expires_at into the past.

    We can't ask Python `session.create` to do this — `_db()` deletes rows
    where `expires_at < now()` on every connection. So we bypass `_db()`
    and write directly with the same encryption.
    """
    db_path = out_dir / "sessions.db"
    session = _load_session_module(db_path, server_secret)
    import secrets

    token = secrets.token_hex(32)
    enc_pass = session._encrypt(password)
    expires_at = int(time.time()) - 60  # one minute ago

    # Use a vanilla connection to skip _db()'s delete-expired sweep.
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL,
            enc_pass   BLOB NOT NULL,
            expires_at INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        "INSERT INTO sessions (token, user_id, enc_pass, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, enc_pass, expires_at),
    )
    conn.commit()
    conn.close()
    return token


def main() -> None:
    if len(sys.argv) < 3:
        print(
            f"usage: {sys.argv[0]} <subcommand> <out_dir> "
            "[server_secret] [user_id] [password]",
            file=sys.stderr,
        )
        sys.exit(2)
    sub = sys.argv[1]
    out_dir = Path(sys.argv[2]).resolve()
    server_secret = sys.argv[3] if len(sys.argv) > 3 else "test-secret-A"
    user_id = sys.argv[4] if len(sys.argv) > 4 else "user_a"
    password = sys.argv[5] if len(sys.argv) > 5 else "pw_a"

    out_dir.mkdir(parents=True, exist_ok=True)
    # Defensive: never write into the real sessions.db.
    real_db = REPO_ROOT / "v2-mvp" / "sessions.db"
    if (out_dir / "sessions.db").resolve() == real_db.resolve():
        raise SystemExit(
            f"refusing to seed into the real session db: {real_db}"
        )

    if sub == "fresh":
        token = _create_session(out_dir, server_secret, user_id, password)
    elif sub == "expired":
        token = _create_expired(out_dir, server_secret, user_id, password)
    elif sub == "decrypt-mismatch":
        # Same as fresh, but the Rust caller will open with a different
        # secret. The fixture itself is just a normal session row.
        token = _create_session(out_dir, server_secret, user_id, password)
    else:
        raise SystemExit(f"unknown subcommand: {sub}")

    manifest = {
        "scenario": sub,
        "db_path": str(out_dir / "sessions.db"),
        "server_secret": server_secret,
        "user_id": user_id,
        "password": password,
        "token": token,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({"status": "ok", "token": token, "scenario": sub}))


if __name__ == "__main__":
    main()
