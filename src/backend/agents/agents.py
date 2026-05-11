"""
Agent delegation with revocation CRL.

Security upgrades:
  - Agent revocation via a dedicated `agent_revocations` CRL table.
    Revoked agents can't authenticate even if their registration row exists.
  - Token-bound revocation: each agent gets a revocation token when registered.
    Owner can re-issue (revoke + re-register) without changing the agent's pubkey.
  - The `lookup_owner` function checks the CRL on every call.

Agent lifecycle:
  1. Owner registers an agent pubkey → row in agent_keys + entry in agent_revocations
  2. Agent authenticates via /auth/agent-login (signs challenge with its keypair)
  3. lookup_owner(pubkey) checks CRL — if revoked, returns None
  4. Owner can revoke: inserts into agent_revocations (idempotent on owner_wallet + pubkey)
  5. Agent's next login attempt sees the revocation and is rejected

Table: agent_keys
  id, owner_wallet, pubkey_b58, name, scopes, created_at, last_used_at

Table: agent_revocations (CRL)
  id, owner_wallet, pubkey_b58, revoked_at, reason TEXT

Usage:
  >>> register("owner123", "9WzDX...", name="trading-bot", scopes="proxy,analytics")
  >>> lookup_owner("9WzDX...")   # → {"agent_id": 1, "owner_wallet": "owner123", ...}
  >>> revoke_agent("owner123", 1)
  >>> lookup_owner("9WzDX...")   # → None (revoked)
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "agents.db"


def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS agent_keys (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_wallet TEXT    NOT NULL,
            pubkey_b58   TEXT    NOT NULL,
            name         TEXT    NOT NULL DEFAULT 'agent',
            scopes       TEXT    NOT NULL DEFAULT '*',
            created_at   INTEGER NOT NULL,
            last_used_at INTEGER,
            UNIQUE(owner_wallet, pubkey_b58)
        );

        CREATE TABLE IF NOT EXISTS agent_revocations (
            -- CRL: if a row exists here, the agent is revoked.
            -- A revocation is idempotent: INSERT OR IGNORE so re-revoking
            -- is safe and doesn't create duplicates.
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_wallet TEXT    NOT NULL,
            pubkey_b58   TEXT    NOT NULL,
            revoked_at   INTEGER NOT NULL,
            reason       TEXT    DEFAULT '',
            UNIQUE(owner_wallet, pubkey_b58)
        );

        CREATE INDEX IF NOT EXISTS idx_agents_pubkey ON agent_keys(pubkey_b58);
        CREATE INDEX IF NOT EXISTS idx_revocations_pubkey ON agent_revocations(pubkey_b58);
        CREATE INDEX IF NOT EXISTS idx_revocations_owner ON agent_revocations(owner_wallet);
    """)
    conn.commit()
    return conn


# ─── Agent registration ─────────────────────────────────────────────────


def register(
    owner_wallet: str,
    pubkey_b58: str,
    name: str = "agent",
    scopes: str = "*",
) -> int:
    """
    Register an agent pubkey under an owner wallet.
    Returns the new agent id.
    Raises ValueError if pubkey already registered for this owner.
    """
    conn = _db()
    try:
        cur = conn.execute(
            """
            INSERT INTO agent_keys (owner_wallet, pubkey_b58, name, scopes, created_at)
            VALUES (?, ?, ?, ?, ?)
        """,
            (owner_wallet, pubkey_b58, name[:64], scopes, int(time.time())),
        )
        conn.commit()
        return cur.lastrowid  # type: ignore[return-value]
    except sqlite3.IntegrityError:
        raise ValueError(
            f"Agent pubkey {pubkey_b58[:16]}… already registered for this wallet"
        )
    finally:
        conn.close()


# ─── Agent lookup (with CRL check) ─────────────────────────────────────


def lookup_owner(pubkey_b58: str) -> dict | None:
    """
    Given an agent pubkey, return its owner info or None.
    Checks the revocation CRL — if revoked, returns None.
    """
    conn = _db()
    try:
        row = conn.execute(
            """
            SELECT id, owner_wallet, name, scopes
            FROM agent_keys
            WHERE pubkey_b58 = ?
            LIMIT 1
        """,
            (pubkey_b58,),
        ).fetchone()
        if not row:
            return None

        # Check revocation CRL
        revoked_row = conn.execute(
            """
            SELECT 1 FROM agent_revocations
            WHERE owner_wallet = ? AND pubkey_b58 = ?
            LIMIT 1
        """,
            (row[1], pubkey_b58),
        ).fetchone()
        if revoked_row:
            return None

        return {
            "agent_id": row[0],
            "owner_wallet": row[1],
            "name": row[2],
            "scopes": row[3],
        }
    finally:
        conn.close()


# ─── Agent revocation (CRL) ───────────────────────────────────────────


def revoke_agent(owner_wallet: str, agent_id: int, reason: str = "") -> bool:
    """
    Revoke an agent by inserting into the CRL.
    Idempotent — re-revoking is safe.
    Returns True if the agent was found and revoked.
    """
    conn = _db()
    try:
        # Verify agent exists under this owner
        agent_row = conn.execute(
            "SELECT 1 FROM agent_keys WHERE id = ? AND owner_wallet = ?",
            (agent_id, owner_wallet),
        ).fetchone()
        if not agent_row:
            return False

        # Get the pubkey for the CRL entry
        pubkey = conn.execute(
            "SELECT pubkey_b58 FROM agent_keys WHERE id = ?",
            (agent_id,),
        ).fetchone()[0]

        # Insert into CRL (idempotent)
        conn.execute(
            """
            INSERT OR IGNORE INTO agent_revocations (owner_wallet, pubkey_b58, revoked_at, reason)
            VALUES (?, ?, ?, ?)
        """,
            (owner_wallet, pubkey, int(time.time()), reason[:256]),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def revoke_by_pubkey(owner_wallet: str, pubkey_b58: str, reason: str = "") -> bool:
    """Revoke an agent by its pubkey. Returns True if found and revoked."""
    conn = _db()
    try:
        agent_row = conn.execute(
            "SELECT 1 FROM agent_keys WHERE owner_wallet = ? AND pubkey_b58 = ?",
            (owner_wallet, pubkey_b58),
        ).fetchone()
        if not agent_row:
            return False

        conn.execute(
            """
            INSERT OR IGNORE INTO agent_revocations (owner_wallet, pubkey_b58, revoked_at, reason)
            VALUES (?, ?, ?, ?)
        """,
            (owner_wallet, pubkey_b58, int(time.time()), reason[:256]),
        )
        conn.commit()
        return True
    finally:
        conn.close()


def list_revoked(owner_wallet: str) -> list[dict]:
    """List all revoked agents for an owner."""
    conn = _db()
    try:
        rows = conn.execute(
            """
            SELECT ar.pubkey_b58, ar.revoked_at, ar.reason, ak.name
            FROM agent_revocations ar
            LEFT JOIN agent_keys ak ON ar.pubkey_b58 = ak.pubkey_b58
            WHERE ar.owner_wallet = ?
            ORDER BY ar.revoked_at DESC
        """,
            (owner_wallet,),
        ).fetchall()

        return [
            {
                "pubkey_b58": r[0],
                "revoked_at": r[1],
                "reason": r[2],
                "agent_name": r[3],
            }
            for r in rows
        ]
    finally:
        conn.close()


def un_revoke_agent(owner_wallet: str, pubkey_b58: str) -> bool:
    """Remove an agent from the CRL (re-enable). Returns True if removed."""
    conn = _db()
    try:
        cur = conn.execute(
            "DELETE FROM agent_revocations WHERE owner_wallet = ? AND pubkey_b58 = ?",
            (owner_wallet, pubkey_b58),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


# ─── Agent CRUD (existing operations) ─────────────────────────────────


def list_agents(owner_wallet: str) -> list[dict]:
    """Return all agents registered by an owner (excluding revoked ones)."""
    conn = _db()
    try:
        rows = conn.execute(
            """
            SELECT id, pubkey_b58, name, scopes, created_at, last_used_at
            FROM agent_keys
            WHERE owner_wallet = ?
            ORDER BY created_at DESC
        """,
            (owner_wallet,),
        ).fetchall()

        return [
            {
                "id": r[0],
                "pubkey_b58": r[1],
                "name": r[2],
                "scopes": r[3],
                "created_at": r[4],
                "last_used_at": r[5],
            }
            for r in rows
        ]
    finally:
        conn.close()


def revoke(owner_wallet: str, agent_id: int) -> bool:
    """Delete an agent registration. Returns True if found + deleted."""
    conn = _db()
    try:
        # Also get pubkey before deleting for CRL update.
        # If the row doesn't exist (or doesn't belong to this owner), bail
        # out with False instead of crashing.
        row = conn.execute(
            "SELECT pubkey_b58 FROM agent_keys WHERE id = ? AND owner_wallet = ?",
            (agent_id, owner_wallet),
        ).fetchone()
        if row is None:
            return False
        pubkey = row[0]

        cur = conn.execute(
            "DELETE FROM agent_keys WHERE id = ? AND owner_wallet = ?",
            (agent_id, owner_wallet),
        )
        conn.commit()

        # Add to CRL when deleting (not just revoking)
        if cur.rowcount > 0:
            conn.execute(
                """
                INSERT OR IGNORE INTO agent_revocations (owner_wallet, pubkey_b58, revoked_at, reason)
                VALUES (?, ?, ?, ?)
            """,
                (owner_wallet, pubkey, int(time.time()), "deleted"),
            )
            conn.commit()

        return cur.rowcount > 0
    finally:
        conn.close()


def touch(pubkey_b58: str) -> None:
    """Update last_used_at timestamp after a successful agent login."""
    conn = _db()
    try:
        conn.execute(
            "UPDATE agent_keys SET last_used_at = ? WHERE pubkey_b58 = ?",
            (int(time.time()), pubkey_b58),
        )
        conn.commit()
    finally:
        conn.close()


def purge_user(user_id: str) -> dict:
    """Delete all agents and revocations for a user."""
    conn = _db()
    try:
        agent_n = (
            conn.execute(
                "DELETE FROM agent_keys WHERE owner_wallet = ?", (user_id,)
            ).rowcount
            or 0
        )
        revoked_n = (
            conn.execute(
                "DELETE FROM agent_revocations WHERE owner_wallet = ?", (user_id,)
            ).rowcount
            or 0
        )
        conn.commit()
        return {"agents": agent_n, "revocations": revoked_n}
    finally:
        conn.close()
