"""Auth domain — session management and passkey (WebAuthn) support."""

from src.backend.auth.session import (
    create_token, get, verify_token, delete,
    delete_all_for_user, mark_deleted, is_deleted, extend_token,
)
from src.backend.auth.session import _db as _session_db
from src.backend.auth.session import create  # backward compat alias
from src.backend.auth.passkey import (
    registration_options, registration_verify,
    authentication_options, authentication_verify,
    list_credentials, delete_credential,
    _PENDING_REGS, _PENDING_AUTHS, CHALLENGE_TTL,
    _init_db, _db, _b64url, _b64url_bytes,
    _credentials_for_user,
)

__all__ = [
    "create_token", "get", "verify_token", "delete",
    "delete_all_for_user", "mark_deleted", "is_deleted", "extend_token",
    "_db", "create",
    "registration_options", "registration_verify",
    "authentication_options", "authentication_verify",
    "list_credentials", "delete_credential",
    "_PENDING_REGS", "_PENDING_AUTHS", "CHALLENGE_TTL",
]
