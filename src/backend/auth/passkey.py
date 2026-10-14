"""
v2-mvp/src/passkey.py — WebAuthn / Passkey support (migrated from python-legacy)

SQLite table: passkey_credentials
  id          TEXT PRIMARY KEY   (credential_id, base64url)
  user_id     TEXT NOT NULL      (wallet address or login userId)
  public_key  BLOB NOT NULL      (COSE-encoded public key bytes)
  sign_count  INTEGER NOT NULL   (monotonic counter, replay protection)
  created_at  INTEGER NOT NULL   (unix timestamp)
  name        TEXT               (friendly name set by user)

Pending challenges live in SQLite (`passkey_challenges`) so a Railway
restart or a second uvicorn worker can still verify Face ID. The
in-memory maps are a cache only.
"""

import base64
import json
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

import webauthn
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from ..db_paths import backend_db_path


def _default_db_path() -> Path:
    env = (os.getenv("KS_DB_PATH") or "").strip()
    if env:
        return Path(env)
    data_dir = (os.getenv("KS_DATA_DIR") or "").strip()
    if data_dir:
        return Path(data_dir) / "keyshield.db"
    # Railway historically wrote ./keyshield.db in WORKDIR=/app. Keep using
    # that file when it already has rows so a deploy does not strand Face ID.
    legacy = Path("keyshield.db")
    canonical = backend_db_path("keyshield.db")
    if legacy.exists() and not canonical.exists():
        return legacy
    return canonical


DB_PATH = _default_db_path()
RP_ID = os.getenv("KS_RP_ID", "localhost")
RP_NAME = os.getenv("KS_RP_NAME", "KeyShield")

# KS_ORIGIN accepts a single URL or a comma-separated list. webauthn 2.x
# accepts list[str] for expected_origin and matches if any entry matches.
_origin_env = os.getenv(
    "KS_ORIGIN",
    "http://localhost:3000,http://localhost:3001,http://127.0.0.1:5173,"
    "https://app.ks.aileena.xyz,https://ks.aileena.xyz",
)
ORIGIN: list[str] = [o.strip() for o in _origin_env.split(",") if o.strip()]

# In-memory pending challenge stores (keyed by user_id) — cache in front of SQLite.
_PENDING_REGS: dict[str, dict] = {}
_PENDING_AUTHS: dict[str, dict] = {}

CHALLENGE_TTL = 120  # seconds

_NO_PASSKEY = "no_passkey"
_CHALLENGE_GONE = "challenge_expired"
_UNKNOWN_CRED = "unknown_credential"


class PasskeyError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# ─── DB ───────────────────────────────────────────────────────────────────────


def _ensure_schema(conn: sqlite3.Connection) -> None:
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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS passkey_challenges (
            user_id    TEXT    NOT NULL,
            kind       TEXT    NOT NULL,
            challenge  TEXT    NOT NULL,
            rp_id      TEXT    DEFAULT '',
            origins    TEXT    DEFAULT '[]',
            expires    REAL    NOT NULL,
            PRIMARY KEY (user_id, kind)
        )
    """)


@contextmanager
def _db():
    path = DB_PATH if isinstance(DB_PATH, Path) else Path(str(DB_PATH))
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        _ensure_schema(conn)
        yield conn
        conn.commit()
    finally:
        conn.close()


def _init_db() -> None:
    with _db():
        pass


_init_db()


# ─── helpers ──────────────────────────────────────────────────────────────────


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_bytes(s: str) -> bytes:
    pad = 4 - len(s) % 4
    if pad != 4:
        s += "=" * pad
    return base64.urlsafe_b64decode(s)


def _normalize_cred_id(value: str) -> str:
    text = (value or "").strip().replace("+", "-").replace("/", "_")
    return text.rstrip("=")


def _cred_id_candidates(credential: dict) -> list[str]:
    raw = [credential.get("id") or "", credential.get("rawId") or ""]
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not item or item in seen:
            continue
        seen.add(item)
        out.append(item)
        norm = _normalize_cred_id(item)
        if norm and norm not in seen:
            seen.add(norm)
            out.append(norm)
        if norm:
            padded = norm + ("=" * ((4 - len(norm) % 4) % 4))
            if padded not in seen:
                seen.add(padded)
                out.append(padded)
    return out


def _credentials_for_user(user_id: str) -> list[PublicKeyCredentialDescriptor]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT id FROM passkey_credentials WHERE user_id = ?", (user_id,)
        ).fetchall()
    creds: list[PublicKeyCredentialDescriptor] = []
    for row in rows:
        try:
            creds.append(PublicKeyCredentialDescriptor(id=_b64url_bytes(row["id"])))
        except Exception:
            continue
    return creds


def _stash_challenge(
    user_id: str,
    kind: str,
    challenge: str,
    rp_id: str | None,
    origins: list[str] | None,
) -> None:
    rec = {
        "challenge": challenge,
        "rp_id": rp_id or "",
        "origins": list(origins or []),
        "expires": time.time() + CHALLENGE_TTL,
    }
    store = _PENDING_REGS if kind == "reg" else _PENDING_AUTHS
    store[user_id] = rec
    with _db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO passkey_challenges
               (user_id, kind, challenge, rp_id, origins, expires)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                kind,
                challenge,
                rec["rp_id"],
                json.dumps(rec["origins"]),
                rec["expires"],
            ),
        )


def _pop_challenge(user_id: str, kind: str) -> dict | None:
    store = _PENDING_REGS if kind == "reg" else _PENDING_AUTHS
    store.pop(user_id, None)
    with _db() as conn:
        row = conn.execute(
            "SELECT challenge, rp_id, origins, expires FROM passkey_challenges "
            "WHERE user_id = ? AND kind = ?",
            (user_id, kind),
        ).fetchone()
        conn.execute(
            "DELETE FROM passkey_challenges WHERE user_id = ? AND kind = ?",
            (user_id, kind),
        )
    if not row:
        return None
    try:
        origins = json.loads(row["origins"] or "[]")
    except json.JSONDecodeError:
        origins = []
    rec = {
        "challenge": row["challenge"],
        "rp_id": row["rp_id"] or "",
        "origins": origins if isinstance(origins, list) else [],
        "expires": row["expires"],
    }
    if rec["expires"] < time.time():
        return None
    return rec


def _lookup_credential(user_id: str, credential: dict):
    candidates = _cred_id_candidates(credential)
    with _db() as conn:
        for cred_id in candidates:
            row = conn.execute(
                "SELECT * FROM passkey_credentials WHERE id = ? AND user_id = ?",
                (cred_id, user_id),
            ).fetchone()
            if row:
                return row
        for cred_id in candidates:
            row = conn.execute(
                "SELECT * FROM passkey_credentials WHERE id = ?",
                (cred_id,),
            ).fetchone()
            if row:
                return row
    return None


# ─── registration ─────────────────────────────────────────────────────────────


def registration_options(
    user_id: str,
    display_name: str,
    rp_id: str | None = None,
    expected_origin: list[str] | None = None,
    kind: str = "reg",
) -> dict:
    """Generate WebAuthn registration options and stash the challenge.

    rp_id should match the page origin's hostname (e.g.
    'keyshield-sync-worker.vercel.app' for Vercel, 'localhost' for dev).
    Falls back to the KS_RP_ID env var.
    """
    effective_rp = rp_id or RP_ID
    opts = webauthn.generate_registration_options(
        rp_id=effective_rp,
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
    _stash_challenge(user_id, kind, challenge_b64, effective_rp, expected_origin)
    return json.loads(webauthn.options_to_json(opts))


def registration_verify(
    user_id: str,
    credential: dict,
    name: str = "Passkey",
    rp_id: str | None = None,
    expected_origin: list[str] | None = None,
    kind: str = "reg",
) -> dict:
    """Verify the credential from the browser and store it."""
    pending = _pop_challenge(user_id, kind)
    if not pending:
        raise PasskeyError(_CHALLENGE_GONE, "registration challenge expired or not found")

    verification = webauthn.verify_registration_response(
        credential=credential,
        expected_challenge=_b64url_bytes(pending["challenge"]),
        expected_rp_id=pending.get("rp_id") or rp_id or RP_ID,
        expected_origin=expected_origin or pending.get("origins") or ORIGIN,
        require_user_verification=False,
    )

    cred_id = _b64url(verification.credential_id)
    with _db() as conn:
        owner = conn.execute(
            "SELECT user_id FROM passkey_credentials WHERE id = ?", (cred_id,)
        ).fetchone()
        if owner and owner["user_id"] != user_id:
            # Never let a registration move another account's credential row.
            raise PasskeyError("credential_taken", "this passkey belongs to another account")
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


# ─── authentication ───────────────────────────────────────────────────────────


def authentication_options(
    user_id: str,
    rp_id: str | None = None,
    expected_origin: list[str] | None = None,
) -> dict:
    """Generate WebAuthn authentication options and stash the challenge."""
    allow = _credentials_for_user(user_id)
    if not allow:
        raise PasskeyError(
            _NO_PASSKEY,
            "no passkey enrolled on the server for this account",
        )
    effective_rp = rp_id or RP_ID
    opts = webauthn.generate_authentication_options(
        rp_id=effective_rp,
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.PREFERRED,
        timeout=60_000,
    )
    challenge_b64 = _b64url(opts.challenge)
    _stash_challenge(user_id, "auth", challenge_b64, effective_rp, expected_origin)
    return json.loads(webauthn.options_to_json(opts))


def authentication_verify(
    user_id: str,
    credential: dict,
    rp_id: str | None = None,
    expected_origin: list[str] | None = None,
) -> dict:
    """Verify the assertion from the browser and return the credential id."""
    pending = _pop_challenge(user_id, "auth")
    if not pending:
        raise PasskeyError(
            _CHALLENGE_GONE,
            "authentication challenge expired or not found",
        )

    row = _lookup_credential(user_id, credential)
    if not row:
        raise PasskeyError(_UNKNOWN_CRED, "unknown credential")

    cred_id_b64 = row["id"]
    verification = webauthn.verify_authentication_response(
        credential=credential,
        expected_challenge=_b64url_bytes(pending["challenge"]),
        expected_rp_id=pending.get("rp_id") or rp_id or RP_ID,
        expected_origin=expected_origin or pending.get("origins") or ORIGIN,
        credential_public_key=bytes(row["public_key"]),
        credential_current_sign_count=row["sign_count"],
        require_user_verification=False,
    )

    with _db() as conn:
        conn.execute(
            "UPDATE passkey_credentials SET sign_count = ? WHERE id = ?",
            (verification.new_sign_count, cred_id_b64),
        )

    return {
        "credentialId": cred_id_b64,
        "signCount": verification.new_sign_count,
        "userId": row["user_id"],
    }


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
