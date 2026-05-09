#!/usr/bin/env python3
"""Seed combined vault + session fixtures for the ks-proxy integration test.

Output layout:

    {out_dir}/
        manifest.json
        vault/{user_id}/{upstream}.enc
        sessions.db

manifest.json:
    {
      "vault_root":     "<absolute>",
      "session_db":     "<absolute>",
      "server_secret":  "...",
      "user_a": {
          "user_id": "alice",
          "password": "pw_a",
          "token":   "<32-hex token>",
          "stored_keys": [{"upstream": "openai", "value": "sk-self-custodian-key"}]
      },
      "user_b": {
          "user_id": "bob",
          "password": "pw_b",
          "token":   "<32-hex token>",
          "stored_keys": []   # bob has NO key stored → platform-key path
      }
    }

The Rust integration test:
- Reads manifest.json
- Opens vault + session DB read-only via the production crates
- Drives the axum router with the right tokens to hit each branch.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROXY_RS = SCRIPT_DIR.parent
REPO_ROOT = PROXY_RS.parent.parent  # post-SOTA: src/proxy/ → up 2 levels to repo root
V2_VAULT_PY = REPO_ROOT / "v2-mvp" / "src" / "vault.py"
V2_SESSION_PY = REPO_ROOT / "v2-mvp" / "src" / "session.py"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <out_dir>", file=sys.stderr)
        sys.exit(2)
    out_dir = Path(sys.argv[1]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    server_secret = "ks-proxy-test-secret-AAAA"
    os.environ["SERVER_SECRET"] = server_secret

    vault_root = out_dir / "vault"
    vault_root.mkdir(parents=True, exist_ok=True)
    session_db = out_dir / "sessions.db"

    # vault: store one key for user_a (openai). user_b has nothing → platform fallback.
    vault = _load_module("v2_vault_proxytest", V2_VAULT_PY)
    vault.VAULT_DIR = vault_root

    user_a = {
        "user_id": "alice",
        "password": "pw_a",
        "stored_keys": [{"upstream": "openai", "value": "sk-self-custodian-key"}],
    }
    user_b = {
        "user_id": "bob",
        "password": "pw_b",
        "stored_keys": [],
    }

    for entry in user_a["stored_keys"]:
        vault.store(user_a["user_id"], entry["upstream"], entry["value"], user_a["password"])

    # session: create a fresh token per user. We re-import the module after
    # setting DB_PATH so the connection points at our scratch file.
    session = _load_module("v2_session_proxytest", V2_SESSION_PY)
    session.DB_PATH = session_db

    user_a["token"] = session.create(user_a["user_id"], user_a["password"])
    user_b["token"] = session.create(user_b["user_id"], user_b["password"])

    manifest = {
        "vault_root":    str(vault_root),
        "session_db":    str(session_db),
        "server_secret": server_secret,
        "user_a": user_a,
        "user_b": user_b,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({"status": "ok"}))


if __name__ == "__main__":
    main()
