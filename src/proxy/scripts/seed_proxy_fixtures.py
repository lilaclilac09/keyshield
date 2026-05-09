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
REPO_ROOT = PROXY_RS.parent.parent  # src/proxy → src → repo root
# Post-SOTA layout: Python control plane lives under src/backend/.
# vault.py was inlined into the SDK; we encrypt directly here using the
# documented format from src/proxy/specs/01-vault-format.md.
BACKEND_SESSION_PY = REPO_ROOT / "src" / "backend" / "auth" / "session.py"


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ─── Vault writer (mirrors deleted v2-mvp/src/vault.py format) ──────────────
#
# Format per src/proxy/specs/01-vault-format.md:
#   {VAULT_DIR}/{user_id}/{upstream}.enc
#   bytes: salt[16] || nonce[12] || AES-256-GCM(key, nonce, plaintext)
#   key  : PBKDF2-HMAC-SHA256(password.utf8, salt, iters=100_000, dklen=32)


def _vault_store(vault_root: Path, user_id: str, upstream: str, api_key: str, password: str) -> None:
    import os as _os
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes

    user_dir = vault_root / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    try:
        _os.chmod(user_dir, 0o700)
    except OSError:
        pass

    salt = _os.urandom(16)
    nonce = _os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key = kdf.derive(password.encode())
    ct = AESGCM(key).encrypt(nonce, api_key.encode(), None)

    out = user_dir / f"{upstream}.enc"
    out.write_bytes(salt + nonce + ct)
    try:
        _os.chmod(out, 0o600)
    except OSError:
        pass


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
        _vault_store(vault_root, user_a["user_id"], entry["upstream"], entry["value"], user_a["password"])

    # session: create a fresh token per user. We re-import the module after
    # setting DB_PATH so the connection points at our scratch file.
    session = _load_module("backend_session_proxytest", BACKEND_SESSION_PY)
    session.DB_PATH = session_db

    user_a["token"] = session.create_token(user_a["user_id"], user_a["password"])
    user_b["token"] = session.create_token(user_b["user_id"], user_b["password"])

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
