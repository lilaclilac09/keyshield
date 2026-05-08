"""Vault domain — AES-256-GCM encrypted key storage."""

from .vault import (
    store, delete, list_keys, load, migrate_all_to_argon2,
    _derive_key, _encrypt, _decrypt, _verify_password,
)
from .vault import (
    VAULT_DIR, SALT_LEN, NONCE_LEN, KDF_ITERS,
)
from . import vault as _vault
from . import vault_new

__all__ = [
    "store", "delete", "list_keys", "load", "migrate_all_to_argon2",
    "_derive_key", "_encrypt", "_decrypt", "_verify_password",
    "VAULT_DIR", "SALT_LEN", "NONCE_LEN", "KDF_ITERS",
    "vault", "vault_new",
]
