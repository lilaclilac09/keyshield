"""Auth domain — session management and passkey (WebAuthn) support."""

from .session import (
    create_token,
    get,
    verify_token,
    delete,
    delete_all_for_user,
    mark_deleted,
    is_deleted,
    extend_token,
)
from .session import _db as _session_db
from .session import create  # backward compat alias
from .passkey import (
    registration_options,
    registration_verify,
    authentication_options,
    authentication_verify,
    list_credentials,
    delete_credential,
)
from .passkey import (
    _PENDING_REGS,
    _PENDING_AUTHS,
    CHALLENGE_TTL,
)

__all__ = [
    "create_token",
    "get",
    "verify_token",
    "delete",
    "delete_all_for_user",
    "mark_deleted",
    "is_deleted",
    "extend_token",
    "_db",
    "create",
    "registration_options",
    "registration_verify",
    "authentication_options",
    "authentication_verify",
    "list_credentials",
    "delete_credential",
    "_PENDING_REGS",
    "_PENDING_AUTHS",
    "CHALLENGE_TTL",
]
