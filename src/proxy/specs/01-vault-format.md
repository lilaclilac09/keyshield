# 01 — Vault file format

> **2026-05-10 status:** this spec describes **Path B** only — the
> legacy server-side encrypted file vault. After the 2026-05-09 Path A
> merge, the default user flow stores ciphertext in a Cloudflare Worker
> + R2, with the master key derived from a WebAuthn-PRF passkey on the
> user's device. The server never sees that plaintext. For Path A see
> [`SYNC_VAULT_ARCHITECTURE.md`](../../../docs/technical/SYNC_VAULT_ARCHITECTURE.md).
>
> Path B remains useful for service-to-service flows where no human is
> at a passkey. The Rust hot-path's `ks-vault` crate reads it.

## Source of truth

`src/backend/__init__.py` (was `v2-mvp/src/vault.py`) — `KeyShield.store /
load / delete`. This spec is descriptive; Python is authoritative.

## On-disk layout

One file per (user, upstream) tuple at:

    {VAULT_DIR}/{user_id}/{upstream}.enc

Where `VAULT_DIR = v2-mvp/vault/` by default.

Bytes:

```
offset  len  field
   0    16   salt
  16    12   nonce
  28    n    ciphertext (n = plaintext_len + 16, last 16 bytes are GCM tag)
```

`upstream` for API keys must be in the configured `UPSTREAMS` set (see spec
04). User-defined secrets use a slug prefix: `pw__`, `note__`, `env__`,
`ssh__`. Rust read path treats them all the same — the slug check belongs to
the write path, which stays in Python.

File mode: directory `0700`, file `0600`. Rust must not change perms.

## KDF

```
key = PBKDF2-HMAC-SHA256(password.utf8, salt, iters=100_000, dklen=32)
```

## Cipher

```
plaintext = AES-256-GCM-Decrypt(key, nonce, ciphertext, aad=empty)
```

## Rust API

```rust
pub struct VaultPath { pub root: PathBuf }

#[derive(thiserror::Error, Debug)]
pub enum VaultError {
    #[error("vault entry not found")]
    NotFound,
    #[error("decrypt failed (wrong password or corrupted file)")]
    BadPassword,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("malformed vault file")]
    Malformed,
}

pub fn load(
    vault: &VaultPath,
    user_id: &str,
    upstream: &str,
    password: &str,
) -> Result<String, VaultError>;
```

## Mapping to Python errors

| Python                            | Rust              |
|-----------------------------------|-------------------|
| `FileNotFoundError`               | `NotFound`        |
| AES-GCM decrypt fails             | `BadPassword`     |
| File too short to contain headers | `Malformed`       |
| Other IO                          | `Io`              |

Python collapses `FileNotFoundError` and decrypt failure into a single
`PermissionError("unauthorized")`. Rust distinguishes them internally so
`ks-proxy` can decide platform-key fallback vs hard 401 — Python's outer
handler `_resolve_key` already does this distinction by catching only
`PermissionError`, so the Rust wrapper that mimics `_resolve_key` should
collapse `NotFound | BadPassword` to "fall back to platform key" and propagate
`Io | Malformed` as 500.

## Test plan (Python as oracle)

Bring up Python with a known vault. For each test user/upstream pair:

1. Read the bytes of `{VAULT_DIR}/{user}/{upstream}.enc` directly.
2. Call `vault.load(user, upstream, password)` and capture plaintext.
3. Call Rust `ks_vault::load(...)` on the same bytes + password.
4. Assert plaintext bytes equal.

Edge cases the test plan must cover:
- 32-byte and 1024-byte plaintexts (typical API key sizes)
- File missing → `NotFound` in Rust, `PermissionError` in Python (verify
  Rust's mapping wrapper produces the same outer behavior in `ks-proxy`)
- Truncated file (drop last byte) → `Malformed` or `BadPassword` (the GCM
  tag check fails); document which it actually is and pin in test
- Wrong password → `BadPassword`
- 1 GiB file → bounded read; spec says reject >1 MiB plaintext. (Add a
  reasonable upper bound on file size at read time, e.g. 1 MiB.)
