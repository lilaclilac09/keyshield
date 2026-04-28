"""
pricing.py — owner-set per-upstream price for shared keys.

Where this fits: the existing `usage.COST_PER_1K` table is the
*platform's* cost model — what KeyShield charges when a user calls
through one of OUR keys. This module is different: it lets a vault
*owner* declare "here is what I want to charge an agent that uses my
key for this upstream, per call". Default behaviour stays $0 / no
charge unless the owner opts in.

Schema: one row per (user_id, upstream). Absence == not enabled ==
no charge. Owners can change or remove the price at any time; the
proxy reads the current value at debit time.

This module is intentionally additive — it doesn't yet hook into
the proxy debit path (that needs the agent-vs-owner session split,
landing next). Shipping the data model and the owner-facing API
first lets the UI / CLI start collecting prices today.
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "pricing.db"


def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS key_pricing (
            user_id    TEXT    NOT NULL,
            upstream   TEXT    NOT NULL,
            price_usd  REAL    NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, upstream)
        )
    """)
    conn.commit()
    return conn


# ── Public API ────────────────────────────────────────────────────────────────


def set_price(user_id: str, upstream: str, price_usd: float) -> None:
    """
    Upsert a per-call price. ValueError if price is negative — $0 is
    accepted but means "explicitly free" (distinct from "not set" =
    no row at all). Use `clear_price` to remove the row entirely.
    """
    if price_usd < 0:
        raise ValueError("price_usd must be >= 0")
    conn = _db()
    try:
        conn.execute("""
            INSERT INTO key_pricing (user_id, upstream, price_usd, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, upstream) DO UPDATE SET
                price_usd  = excluded.price_usd,
                updated_at = excluded.updated_at
        """, (user_id, upstream, float(price_usd), int(time.time())))
        conn.commit()
    finally:
        conn.close()


def clear_price(user_id: str, upstream: str) -> bool:
    """
    Remove the price row, reverting to "not enabled" / no charge.
    Returns True iff a row was deleted.
    """
    conn = _db()
    try:
        cur = conn.execute(
            "DELETE FROM key_pricing WHERE user_id = ? AND upstream = ?",
            (user_id, upstream),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def get_price(user_id: str, upstream: str) -> float | None:
    """
    Returns the per-call price the owner has set, or None if billing
    is not enabled for this (user, upstream). The proxy treats None
    as "no charge" — same as before this module landed.
    """
    conn = _db()
    try:
        row = conn.execute(
            "SELECT price_usd FROM key_pricing WHERE user_id = ? AND upstream = ?",
            (user_id, upstream),
        ).fetchone()
        return float(row[0]) if row else None
    finally:
        conn.close()


def list_prices(user_id: str) -> list[dict]:
    """All per-upstream prices for one owner. Empty list if none set."""
    conn = _db()
    try:
        rows = conn.execute("""
            SELECT upstream, price_usd, updated_at
            FROM key_pricing
            WHERE user_id = ?
            ORDER BY upstream
        """, (user_id,)).fetchall()
        return [
            {"upstream": r[0], "price_usd": round(r[1], 6), "updated_at": r[2]}
            for r in rows
        ]
    finally:
        conn.close()
