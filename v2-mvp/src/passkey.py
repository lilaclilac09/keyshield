"""
KeyShield — WebAuthn / Passkey support

SQLite table: passkey_credentials
  id          TEXT PRIMARY KEY   (credential_id, base64url)
  user_id     TEXT NOT NULL      (wallet address or login userId)
  public_key  BLOB NOT NULL      (COSE-encoded public key bytes)
  sign_count  INTEGER NOT NULL   (monotonic counter, replay protection)
  created_at  INTEGER NOT NULL   (unix timestamp)
  name        TEXT               (friendly name set by user)

Pending challenge table (in-memory; process restarts invalidate challenges, which is fine):
  _PENDING_REGS  : {user_id: {challenge_b64url, ...options}}
  _PENDING_AUTHS : {user_id: {challenge_b64url, ...options}}
"""

import base64
import json
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import webauthn
from webauthn.helpers.structs import (
    AuthenticationCredential,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    RegistrationCredential,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)
from webauthn.helpers.exceptions import InvalidCBORData, InvalidAuthenticatorDataStructure

DB_PATH   = Path(os.getenv("KS_DB_PATH", "keyshield.db"))
RP_ID     = os.getenv("KS_RP_ID", "localhost")
RP_NAME   = os.getenv("KS_RP_NAME", "KeyShield")
ORIGIN    = os.getenv("KS_ORIGIN", "http://localhost:3001")

# In-memory pending challenge stores (keyed by user_id)
_PENDING_REGS:  dict[str, dict] = {}
_PENDING_AUTHS: dict[str, dict] = {}

CHALLENGE_TTL = 120  # seconds


# ─── DB ───────────────────────────────────────────────────────────────────────

@contextmanager
def _db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _init_db() -> None:
    with _db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS passkey_credentials (
                id          TEXT    PRIMARY KEY,
                user_id     TEXT    NOT NULL,
                public_key  BLOB    NOT NULL,
                sign_count  INTEGER NOT NULL DEFAULT 0,
                created_at  INTEGER NOT NULL,
                name        TEXT    DEFAULT 'Passkey'
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS pk_user ON passkey_credentials(user_id)")


_init_db()


# ─── helpers ──────────────────────────────────────────────────────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_bytes(s: str) -> bytes:
    pad = 4 - len(s) % 4
    if pad != 4:
        s += "=" * pad
    return base64.urlsafe_b64decode(s)


def _credentials_for_user(user_id: str) -> list[PublicKeyCredentialDescriptor]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT id FROM passkey_credentials WHERE user_id = ?", (user_id,)
        ).fetchall()
    return [
        PublicKeyCredentialDescriptor(id=_b64url_bytes(row["id"]))
        for row in rows
    ]


# ─── registration ─────────────────────────────────────────────────────────────

def registration_options(user_id: str, display_name: str) -> dict:
    """Generate WebAuthn registration options and stash the challenge."""
    opts = webauthn.generate_registration_options(
        rp_id=RP_ID,
        rp_name=RP_NAME,
        user_id=user_id.encode(),
        user_name=user_id,
        user_display_name=display_name or user_id,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        exclude_credentials=_credentials_for_user(user_id),
        timeout=60_000,
    )
    challenge_b64 = _b64url(opts.challenge)
    _PENDING_REGS[user_id] = {
        "challenge": challenge_b64,
        "expires": time.time() + CHALLENGE_TTL,
    }
    return json.loads(webauthn.options_to_json(opts))


def registration_verify(user_id: str, credential: dict, name: str = "Passkey") -> dict:
    """Verify the credential from the browser and store it."""
    pending = _PENDING_REGS.pop(user_id, None)
    if not pending or pending["expires"] < time.time():
        raise ValueError("registration challenge expired or not found")

    reg_cred = RegistrationCredential.parse_raw(json.dumps(credential))
    verification = webauthn.verify_registration_response(
        credential=reg_cred,
        expected_challenge=_b64url_bytes(pending["challenge"]),
        expected_rp_id=RP_ID,
        expected_origin=ORIGIN,
        require_user_verification=False,
    )

    cred_id = _b64url(verification.credential_id)
    with _db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO passkey_credentials
               (id, user_id, public_key, sign_count, created_at, name)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                cred_id,
                user_id,
                bytes(verification.credential_public_key),
                verification.sign_count,
                int(time.time()),
                name,
            ),
        )
    return {"credentialId": cred_id, "name": name}


# ─── authentication ────────────────────────────────────────────────────────────

def authentication_options(user_id: str) -> dict:
    """Generate WebAuthn authentication options and stash the challenge."""
    opts = webauthn.generate_authentication_options(
        rp_id=RP_ID,
        allow_credentials=_credentials_for_user(user_id),
        user_verification=UserVerificationRequirement.PREFERRED,
        timeout=60_000,
    )
    challenge_b64 = _b64url(opts.challenge)
    _PENDING_AUTHS[user_id] = {
        "challenge": challenge_b64,
        "expires": time.time() + CHALLENGE_TTL,
    }
    return json.loads(webauthn.options_to_json(opts))


def authentication_verify(user_id: str, credential: dict) -> dict:
    """Verify the assertion from the browser and return the credential id."""
    pending = _PENDING_AUTHS.pop(user_id, None)
    if not pending or pending["expires"] < time.time():
        raise ValueError("authentication challenge expired or not found")

    with _db() as conn:
        # Find the matching stored credential
        cred_id_b64 = credential.get("id", "")
        row = conn.execute(
            "SELECT * FROM passkey_credentials WHERE id = ? AND user_id = ?",
            (cred_id_b64, user_id),
        ).fetchone()
        if not row:
            raise ValueError("unknown credential")

        auth_cred = AuthenticationCredential.parse_raw(json.dumps(credential))
        verification = webauthn.verify_authentication_response(
            credential=auth_cred,
            expected_challenge=_b64url_bytes(pending["challenge"]),
            expected_rp_id=RP_ID,
            expected_origin=ORIGIN,
            credential_public_key=bytes(row["public_key"]),
            credential_current_sign_count=row["sign_count"],
            require_user_verification=False,
        )

        # Update sign count (replay protection)
        conn.execute(
            "UPDATE passkey_credentials SET sign_count = ? WHERE id = ?",
            (verification.new_sign_count, cred_id_b64),
        )

    return {"credentialId": cred_id_b64, "signCount": verification.new_sign_count}


# ─── list / delete ─────────────────────────────────────────────────────────────

def list_credentials(user_id: str) -> list[dict]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT id, name, created_at FROM passkey_credentials WHERE user_id = ? ORDER BY created_at",
            (user_id,),
        ).fetchall()
    return [{"id": r["id"], "name": r["name"], "createdAt": r["created_at"]} for r in rows]


def delete_credential(user_id: str, cred_id: str) -> None:
    with _db() as conn:
        conn.execute(
            "DELETE FROM passkey_credentials WHERE id = ? AND user_id = ?",
            (cred_id, user_id),
        )
