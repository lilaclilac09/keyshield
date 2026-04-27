"""
agents.py — agent delegation

An "agent" is a programmatic identity with its own ed25519 keypair.
The vault owner registers the agent's public key once.
The agent then self-authenticates by signing a server challenge — no human
interaction required — and receives a session token scoped to the owner's vault.

Table: agent_keys
  id           INTEGER PK AUTOINCREMENT
  owner_wallet TEXT NOT NULL    -- Solana wallet that granted access
  pubkey_b58   TEXT NOT NULL    -- agent's ed25519 public key (base58)
  name         TEXT NOT NULL    -- human label: "trading-bot-v1", "research-agent"
  scopes       TEXT DEFAULT '*' -- comma-separated: proxy,manage,read  (* = all)
  created_at   INTEGER NOT NULL
  last_used_at INTEGER          -- NULL until first use
  UNIQUE(owner_wallet, pubkey_b58)
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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_keys (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_wallet TEXT    NOT NULL,
            pubkey_b58   TEXT    NOT NULL,
            name         TEXT    NOT NULL DEFAULT 'agent',
            scopes       TEXT    NOT NULL DEFAULT '*',
            created_at   INTEGER NOT NULL,
            last_used_at INTEGER,
            UNIQUE(owner_wallet, pubkey_b58)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_agents_pubkey ON agent_keys(pubkey_b58)")
    conn.commit()
    return conn


# ── Public API ─────────────────────────────────────────────────────────────────

def register(
    owner_wallet: str,
    pubkey_b58:   str,
    name:         str  = "agent",
    scopes:       str  = "*",
) -> int:
    """
    Register an agent pubkey under an owner wallet.
    Returns the new agent id.
    Raises ValueError if pubkey already registered for this owner.
    """
    conn = _db()
    try:
        cur = conn.execute("""
            INSERT INTO agent_keys (owner_wallet, pubkey_b58, name, scopes, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (owner_wallet, pubkey_b58, name[:64], scopes, int(time.time())))
        conn.commit()
        return cur.lastrowid  # type: ignore[return-value]
    except sqlite3.IntegrityError:
        raise ValueError(f"Agent pubkey {pubkey_b58[:16]}… already registered for this wallet")
    finally:
        conn.close()


def list_agents(owner_wallet: str) -> list[dict]:
    """Return all agents registered by an owner."""
    conn = _db()
    try:
        rows = conn.execute("""
            SELECT id, pubkey_b58, name, scopes, created_at, last_used_at
            FROM agent_keys
            WHERE owner_wallet = ?
            ORDER BY created_at DESC
        """, (owner_wallet,)).fetchall()
        return [
            {
                "id":           r[0],
                "pubkey_b58":   r[1],
                "name":         r[2],
                "scopes":       r[3],
                "created_at":   r[4],
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
        cur = conn.execute(
            "DELETE FROM agent_keys WHERE id = ? AND owner_wallet = ?",
            (agent_id, owner_wallet),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def lookup_owner(pubkey_b58: str) -> dict | None:
    """
    Given an agent pubkey, return its owner info or None if not registered.
    Used by agent-login to verify delegation before creating a session.
    """
    conn = _db()
    try:
        row = conn.execute("""
            SELECT id, owner_wallet, name, scopes
            FROM agent_keys
            WHERE pubkey_b58 = ?
            LIMIT 1
        """, (pubkey_b58,)).fetchone()
        if not row:
            return None
        return {
            "agent_id":     row[0],
            "owner_wallet": row[1],
            "name":         row[2],
            "scopes":       row[3],
        }
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
