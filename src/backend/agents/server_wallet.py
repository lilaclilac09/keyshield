"""
server_wallet.py — Server-held agent wallets (encrypted at rest).

This is the **server-held** counterpart to `agent_wallet.py`'s on-chain
`CreateEphemeralSigner` flow. Unlike the on-chain ephemeral signer
(spec 10 §Q7, ix #23) where the user pre-authorizes a per-agent keypair
on-chain, here the server *generates and holds* the keypair entirely
off-chain — it is never sent to the user, never appears on-chain.

The agent identifies itself with an owner-scoped string label
("trading-bot-v1"). The server returns only the base58-encoded public
key. The 32-byte ed25519 secret seed is encrypted with AES-256-GCM using
the same `SERVER_SECRET`-derived key as `auth/session.py` (so a single
secret rotation invalidates both session blobs and stored wallet seeds).

Used by the EphemeralWalletsSection to let the agent sign x402
micropayments without the user re-signing each call.

Wire layout (encrypted column):
    [0..12)   nonce  (12 random bytes per AES-GCM standard)
    [12..)    AESGCM(seed_32) ciphertext + 16-byte auth tag

Table: server_wallets
    id, owner_wallet, agent_id, pubkey_b58, enc_seed (BLOB), created_at
    UNIQUE(owner_wallet, agent_id)
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
import time
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from nacl.signing import SigningKey

DB_PATH = Path(__file__).parent.parent / "data" / "server_wallets.db"


# ─── base58 (mirrors keyshield_sdk._b58encode to avoid a stray import) ────

_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def _b58encode(data: bytes) -> str:
    n = int.from_bytes(data, "big")
    res = ""
    while n:
        n, r = divmod(n, 58)
        res = _B58[r] + res
    pad = len(data) - len(data.lstrip(b"\x00"))
    return "1" * pad + res


# ─── AES-256-GCM at rest ──────────────────────────────────────────────────


_DEFAULT_SECRET = "CHANGE-ME-IN-PROD-32-BYTES-MIN!!"


def _server_secret() -> bytes:
    """Same derivation as auth/session.py — single secret rotation
    invalidates both session blobs and server wallet seeds."""
    raw = os.getenv("SERVER_SECRET", "")
    if not raw:
        import logging
        import warnings

        warnings.warn(
            "SERVER_SECRET is not set — server wallet seeds are encrypted "
            "with an insecure default key. Set SERVER_SECRET in production.",
            stacklevel=2,
        )
        logging.getLogger(__name__).warning(
            "SERVER_SECRET not set — wallet seeds encrypted with insecure default"
        )
        raw = _DEFAULT_SECRET
    return hashlib.sha256(raw.encode()).digest()


def _encrypt_seed(seed: bytes) -> bytes:
    """AES-256-GCM encrypt 32-byte ed25519 seed. Returns nonce||ct."""
    nonce = os.urandom(12)
    ct = AESGCM(_server_secret()).encrypt(nonce, seed, None)
    return nonce + ct


def _decrypt_seed(blob: bytes) -> bytes:
    nonce, ct = blob[:12], blob[12:]
    return AESGCM(_server_secret()).decrypt(nonce, ct, None)


# ─── DB ───────────────────────────────────────────────────────────────────


def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS server_wallets (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_wallet TEXT    NOT NULL,
            agent_id     TEXT    NOT NULL,
            pubkey_b58   TEXT    NOT NULL,
            enc_seed     BLOB    NOT NULL,
            created_at   INTEGER NOT NULL,
            UNIQUE(owner_wallet, agent_id)
        );

        CREATE INDEX IF NOT EXISTS idx_server_wallets_owner
            ON server_wallets(owner_wallet);
        """
    )
    conn.commit()
    return conn


# ─── Public API ───────────────────────────────────────────────────────────


def create_server_wallet(owner_id: str, agent_id: str) -> tuple[str, str]:
    """Generate (or return existing) server-held ed25519 keypair.

    Idempotent: if (owner_id, agent_id) already has a wallet, returns the
    existing pubkey instead of overwriting the seed (overwriting would
    silently invalidate any signatures tied to the old pubkey).

    Returns (agent_id, pubkey_b58).
    """
    if not owner_id or not agent_id:
        raise ValueError("owner_id and agent_id are required")

    conn = _db()
    try:
        existing = conn.execute(
            "SELECT pubkey_b58 FROM server_wallets WHERE owner_wallet = ? AND agent_id = ?",
            (owner_id, agent_id),
        ).fetchone()
        if existing:
            return (agent_id, existing[0])

        sk = SigningKey.generate()
        seed = sk.encode()
        pubkey_b58 = _b58encode(bytes(sk.verify_key))
        enc_seed = _encrypt_seed(seed)

        conn.execute(
            "INSERT INTO server_wallets "
            "(owner_wallet, agent_id, pubkey_b58, enc_seed, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (owner_id, agent_id[:128], pubkey_b58, enc_seed, int(time.time())),
        )
        conn.commit()
        return (agent_id, pubkey_b58)
    finally:
        conn.close()


def delete_server_wallet(owner_id: str, agent_id: str) -> bool:
    """Permanently delete the server-held wallet row.

    Returns True if a row was deleted. Idempotent — deleting a non-
    existent wallet is not an error (returns False).
    """
    conn = _db()
    try:
        cur = conn.execute(
            "DELETE FROM server_wallets WHERE owner_wallet = ? AND agent_id = ?",
            (owner_id, agent_id),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def list_server_wallets(owner_id: str) -> list[dict]:
    """Return [{agent_id, pubkey}, ...] for this owner. No secret material."""
    conn = _db()
    try:
        rows = conn.execute(
            "SELECT agent_id, pubkey_b58 FROM server_wallets "
            "WHERE owner_wallet = ? ORDER BY created_at DESC",
            (owner_id,),
        ).fetchall()
        return [{"agent_id": r[0], "pubkey": r[1]} for r in rows]
    finally:
        conn.close()


def get_signing_key(owner_id: str, agent_id: str) -> SigningKey | None:
    """Reconstruct the ed25519 SigningKey for signing operations.

    Reserved for future signing endpoints (e.g. x402 payment signing).
    Not exposed via HTTP — internal callers only.
    """
    conn = _db()
    try:
        row = conn.execute(
            "SELECT enc_seed FROM server_wallets WHERE owner_wallet = ? AND agent_id = ?",
            (owner_id, agent_id),
        ).fetchone()
        if not row:
            return None
        seed = _decrypt_seed(row[0])
        return SigningKey(seed)
    finally:
        conn.close()
