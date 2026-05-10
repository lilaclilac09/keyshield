"""Sharing domain — vault-share registry (grant/revoke/transfer)."""

from .sharing import (
    grant,
    revoke,
    list_outgoing,
    list_incoming,
    purge_user,
)
from .sharing import DB_PATH, CRYPTO_REWRAP_AVAILABLE

__all__ = ["grant", "revoke", "list_outgoing", "list_incoming", "purge_user", "DB_PATH"]
