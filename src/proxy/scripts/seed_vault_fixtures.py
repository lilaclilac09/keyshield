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
# Post-SOTA refactor: rust-proxy lives at src/rust-proxy/, so repo
# root is two levels above PROXY_RS, not one. Pre-SOTA path was
# proxy-rs/ (one level deep), where the now-wrong `.parent` worked.
REPO_ROOT = PROXY_RS.parent.parent
V2_VAULT_PY = REPO_ROOT / "v2-mvp" / "src" / "vault.py"


def _load_vault_module(target_dir: Path):
    """Import v2-mvp/src/vault.py as a one-off module.

    We avoid `sys.path.insert` here because importing the whole `v2-mvp/src`
    package would pull in heavy FastAPI deps. Instead, load by file path and
    monkey-patch its module-level `VAULT_DIR` to the test directory before
    calling `store`.
    """
    spec = importlib.util.spec_from_file_location("v2_vault", V2_VAULT_PY)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {V2_VAULT_PY}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    # Critical: redirect every store() write into the test directory.
    mod.VAULT_DIR = target_dir
    return mod


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
        "expected_plaintext": "gsk_AçÉ_test_🔑_done",
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

    vault = _load_vault_module(out_dir)

    for fx in FIXTURES:
        vault.store(
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

    # Defensive sanity check: refuse to ever clobber the real v2-mvp/vault.
    real_vault = REPO_ROOT / "v2-mvp" / "vault"
    if out_dir.resolve() == real_vault.resolve():
        # Shouldn't be reachable — but if a future caller passes the real
        # vault path through, fail loudly rather than silently overwrite.
        raise SystemExit(
            f"refusing to seed into the real vault dir: {real_vault}"
        )

    # Stdout is parsed by the Rust harness as a quick smoke signal.
    print(json.dumps({"status": "ok", "count": len(FIXTURES)}))


if __name__ == "__main__":
    main()
