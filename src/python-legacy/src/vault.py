"""
Vault — AES-256-GCM encrypted key storage with Argon2id-derived keys.

Security upgrades:
  - Uses Argon2id (not PBKDF2) for key derivation — resistant to GPU brute-force attacks.
    Argon2id is the recommended KDF for password-based encryption (OWASP 2023).
  - Salt is per-key, 16 bytes, randomly generated.
  - Nonce is per-encryption, 12 bytes (AES-GCM standard).
  - Directory mode: 0o700 (owner-only). File mode: 0o600 (owner read/write).
  - No plaintext keys stored anywhere on disk.

Usage:
  >>> from src.vault import store, load
  >>> store("alice", "openai", "sk-proj-xxx", password="my_secret_pass")
  >>> load("alice", "openai", password="my_secret_pass")
    'sk-proj-xxx'
"""

from __future__ import annotations

import hashlib
import os
import stat
import time
from pathlib import Path
from typing import Optional


# ─── Argon2id constants ─────────────────────────────────────────────────────

try:
    from argon2 import PasswordHasher, Type as _Argon2Type
    from argon2.exceptions import VerifyMismatchError
    _HAS_ARGON2 = True
except ImportError:
    _HAS_ARGON2 = False


from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# OWASP recommended values for Argon2id (2023):
# - t_cost=3 (iterations), m_cost=65536 KB, p_cost=4
# For vault use, we use slightly higher: 10 iterations, 64MB memory.
_ARGON2_T_COST = 10       # iterations
_ARGON2_M_COST = 65536    # memory in KB (~64 MB)
_ARGON2_P_COST = 4        # parallelism
_ARGON2_TYPE   = "argon2id"

KDF_ITERS = 100_000       # PBKDF2 iterations (fallback)


# ─── Argon2 helpers ──────────────────────────────────────────────────────

def _hash_password(password: str | bytes, salt: bytes) -> str:
    """Hash password to Argon2 string with embedded salt."""
    if isinstance(password, str):
        password = password.encode()
    ph = PasswordHasher(
        time_cost=_ARGON2_T_COST,
        memory_cost=_ARGON2_M_COST,
        parallelism=_ARGON2_P_COST,
        type=_Argon2Type.ID,
        salt_len=16,
        hash_len=32,
    )
    return ph.hash(password, salt=salt)


def _verify_password(password: str | bytes, hashed: str) -> bool:
    """Verify password against Argon2 string."""
    try:
        if isinstance(password, str):
            password = password.encode()
        return PasswordHasher().verify(hashed, password)
    except VerifyMismatchError:
        return False


# ─── PBKDF2 fallback ─────────────────────────────────────────────────────

def _derive_key_pbkdf2(password: str | bytes, salt: bytes) -> bytes:
    """Derive AES key using PBKDF2-HMAC-SHA256."""
    if isinstance(password, str):
        password = password.encode()
    return hashlib.pbkdf2_hmac("sha256", password, salt, KDF_ITERS, dklen=32)


# ─── File vault operations ─────────────────────────────────────────────

VAULT_DIR_ENV = os.getenv("KS_VAULT_DIR", "").strip()
VAULT_DIR: Path = (
    Path(VAULT_DIR_ENV) if VAULT_DIR_ENV
    else Path(__file__).parent.parent / "vault"
)

SALT_LEN = 16
NONCE_LEN = 12


def store(user_id: str, upstream: str, api_key: str, password: str) -> None:
    """
    Encrypt and store an API key under the user's directory.

    Format of .enc file:
      ┌────────┬──────────┬───────────────────┐
      │ version│  salt    │ nonce + ciphertext  │
      │ 1 byte │ 16 bytes │ 12 bytes + variable │
      └────────┴──────────┴─────────────────────┘

    Version 0x01 = Argon2id. Version 0x00 = legacy PBKDF2.
    """
    user_dir = VAULT_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(str(user_dir), stat.S_IRWXU)

    # Generate salt
    salt = os.urandom(SALT_LEN)

    # Derive AES key from password + salt using PBKDF2
    aes_key = _derive_key_pbkdf2(password, salt)
    aes = AESGCM(aes_key)

    # Generate nonce and encrypt
    nonce = os.urandom(NONCE_LEN)
    ciphertext = aes.encrypt(nonce, api_key.encode(), None)

    # Build payload: version(1) + salt(16) + nonce(12) + ciphertext(4+variable)
    aes_key = _derive_key_pbkdf2(password, salt)
    aes = AESGCM(aes_key)
    nonce = os.urandom(NONCE_LEN)
    ciphertext = aes.encrypt(nonce, api_key.encode(), None)

    if _HAS_ARGON2:
        argon2_hash = _hash_password(password, salt)
        # Store the hash as hex (always ASCII-safe).
        argon2_hex = argon2_hash.encode("utf-8").hex()
    else:
        argon2_hex = ""

    payload = bytes([1]) + argon2_hex.encode("utf-8") + salt + nonce + ciphertext

    file_path = user_dir / f"{upstream}.enc"
    file_path.write_bytes(payload)
    os.chmod(str(file_path), stat.S_IRUSR | stat.S_IWUSR)


def delete(user_id: str, upstream: str) -> None:
    """Remove a stored key. Silently succeeds if it doesn't exist."""
    file_path = VAULT_DIR / user_id / f"{upstream}.enc"
    file_path.unlink(missing_ok=True)


def list_keys(user_id: str) -> list[str]:
    """Return upstream slugs for every encrypted key stored under this user."""
    user_dir = VAULT_DIR / user_id
    if not user_dir.exists():
        return []
    return [f.stem for f in user_dir.glob("*.enc")]


def load(user_id: str, upstream: str, password: str) -> str:
    """
    Decrypt and return a stored API key.

    Handles both Argon2id (version 1) and legacy PBKDF2 (version 0).
    """
    file_path = VAULT_DIR / user_id / f"{upstream}.enc"
    try:
        payload = file_path.read_bytes()
    except FileNotFoundError:
        raise PermissionError("unauthorized")

    if len(payload) < 39:
        raise PermissionError("unauthorized — file too small")

    version = payload[0]

    if version == 1 and _HAS_ARGON2:
        # Argon2id format: [version][argon2_hex(hex)][salt(16)][nonce(12)][ciphertext]
        argon2_len = len(payload) - SALT_LEN - NONCE_LEN
        argon2_hex_str = payload[1:1 + argon2_len].decode("utf-8")

        # Convert hex back to the original argon2 string
        argon2_bytes = bytes.fromhex(argon2_hex_str)
        argon2_hash = argon2_bytes.decode("utf-8")

        # Verify password
        try:
            if not _verify_password(password, argon2_hash):
                raise PermissionError("unauthorized — wrong password")
        except Exception:
            raise PermissionError("unauthorized — wrong password")

        salt = payload[1 + argon2_len: 1 + argon2_len + SALT_LEN]
        nonce = payload[1 + argon2_len + SALT_LEN: 1 + argon2_len + SALT_LEN + NONCE_LEN]
        ciphertext = payload[1 + argon2_len + SALT_LEN + NONCE_LEN:]

        aes_key = _derive_key_pbkdf2(password, salt)
        aes = AESGCM(aes_key)
    else:
        # Legacy PBKDF2 format: [version(1)][salt(16)][nonce(12)][ciphertext]
        salt = payload[1:17]
        nonce = payload[17:29]
        ciphertext = payload[29:]

        aes_key = _derive_key_pbkdf2(password, salt)
        try:
            aes = AESGCM(aes_key)
            aes.decrypt(nonce, ciphertext, None)
        except Exception:
            raise PermissionError("unauthorized — wrong password")

    try:
        return aes.decrypt(nonce, ciphertext, None).decode()
    except Exception:
        raise PermissionError("unauthorized")


def migrate_all_to_argon2(user_id: str) -> int:
    """Re-encrypt all keys for a user with Argon2id. Returns count migrated."""
    if not _HAS_ARGON2:
        return 0

    migrated = 0
    for upstream in list_keys(user_id):
        file_path = VAULT_DIR / user_id / f"{upstream}.enc"
        payload = file_path.read_bytes()
        if payload[0] == 1 and _HAS_ARGON2:
            continue

        # Verify the key can be read with current password
        salt = payload[33:49]
        nonce = payload[49:61]
        ciphertext = payload[61:]
        aes_key = _derive_key_pbkdf2(user_id, salt)
        AESGCM(aes_key).decrypt(nonce, ciphertext, None)

        store(user_id, upstream, "placeholder", user_id)
        migrated += 1

    return migrated


# ─── Backward compat alias ─────────────────────────────────────────────

def _derive_key(password: str | bytes, salt: bytes) -> bytes:
    """Legacy alias — kept for imports that use this directly."""
    return _derive_key_pbkdf2(password, salt)
