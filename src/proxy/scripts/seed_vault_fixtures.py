#!/usr/bin/env python3
"""Seed AES-256-GCM vault fixtures for the ks-vault oracle tests.

This script monkey-patches the v2-mvp `vault.VAULT_DIR` so test runs never
write into the real `v2-mvp/vault/` tree. Output layout matches the on-disk
layout `ks_vault::load` reads:

    {out_dir}/
        manifest.json       # inputs + expected plaintexts (for the test)
        {user_id}/{upstream}.enc

Usage (invoked by the Rust oracle test, also runnable by hand):

    python3 proxy-rs/scripts/seed_vault_fixtures.py /tmp/some_dir

Manifest schema (the JSON shape ks-vault's tests parse):

    {
        "fixtures": [
            {"user_id": "...", "upstream": "...", "password": "...",
             "expected_plaintext": "..."},
            ...
        ],
        "vault_root": "/tmp/some_dir"
    }
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROXY_RS = SCRIPT_DIR.parent
# Post-SOTA refactor: rust-proxy lives at src/proxy/, so repo root is two
# levels above PROXY_RS. The original v2-mvp/src/vault.py was deleted in
# the consolidation; we inline its on-disk format here (same approach as
# seed_proxy_fixtures.py — keep the test fixture self-contained instead
# of resurrecting a deleted module).
REPO_ROOT = PROXY_RS.parent.parent


# ─── Vault writer (mirrors deleted v2-mvp/src/vault.py format) ──────────────
#
# Format per src/proxy/specs/01-vault-format.md:
#   {VAULT_DIR}/{user_id}/{upstream}.enc
#   bytes: salt[16] || nonce[12] || AES-256-GCM(key, nonce, plaintext)
#   key  : PBKDF2-HMAC-SHA256(password.utf8, salt, iters=100_000, dklen=32)
def _vault_store(vault_root: Path, user_id: str, upstream: str, api_key: str, password: str) -> None:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes

    user_dir = vault_root / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(user_dir, 0o700)
    except OSError:
        pass

    salt = os.urandom(16)
    nonce = os.urandom(12)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    key = kdf.derive(password.encode())
    ct = AESGCM(key).encrypt(nonce, api_key.encode(), None)

    out = user_dir / f"{upstream}.enc"
    out.write_bytes(salt + nonce + ct)
    try:
        os.chmod(out, 0o600)
    except OSError:
        pass


# Five happy-path fixtures, varied to cover:
# - short ASCII (the typical openai/anthropic key shape)
# - mixed-case with hyphens (Helius UUID)
# - long string (~1 KiB) — the spec called this out as a sanity case
# - non-ASCII / multi-byte UTF-8 (round-trip through bytes)
# - prefix slug (e.g. user-defined password) — read path treats them all the same
FIXTURES = [
    {
        "user_id": "alice",
        "upstream": "openai",
        "password": "correct-horse-battery-staple",
        "expected_plaintext": "sk-test-12345",
    },
    {
        "user_id": "bob",
        "upstream": "helius",
        "password": "hunter2",
        "expected_plaintext": "11111111-2222-3333-4444-555555555555",
    },
    {
        "user_id": "carol",
        "upstream": "anthropic",
        "password": "long pass with spaces!",
        # ~1 KiB of plaintext to exercise the larger ciphertext path.
        "expected_plaintext": "k" + ("0123456789abcdef" * 64),
    },
    {
        "user_id": "dave",
        "upstream": "groq",
        "password": "пароль-с-юникодом",
        "expected_plaintext": "gsk_AçÉ_测试_🔑_done",
    },
    {
        "user_id": "erin",
        "upstream": "pw__github",
        "password": "vault-master-pw",
        "expected_plaintext": "ghp_9XYZ_secret_token",
    },
]


def main() -> None:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <out_dir>", file=sys.stderr)
        sys.exit(2)
    out_dir = Path(sys.argv[1]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    for fx in FIXTURES:
        _vault_store(
            out_dir,
            fx["user_id"],
            fx["upstream"],
            fx["expected_plaintext"],
            fx["password"],
        )

    manifest = {
        "fixtures": FIXTURES,
        "vault_root": str(out_dir),
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False)
    )

    # Defensive sanity check: refuse to ever clobber a real production vault dir.
    for guard in (REPO_ROOT / "vault", REPO_ROOT / "src" / "backend" / "vault"):
        if out_dir.resolve() == guard.resolve():
            raise SystemExit(
                f"refusing to seed into a production vault dir: {guard}"
            )

    # Stdout is parsed by the Rust harness as a quick smoke signal.
    print(json.dumps({"status": "ok", "count": len(FIXTURES)}))


if __name__ == "__main__":
    main()
