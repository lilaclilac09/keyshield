"""
mpp.py — Micro-Payment Protocol (MPP) stream management

Tables:
  mpp_streams  — one row per payment stream between an agent and an upstream
  mpp_events   — append-only audit log (open/record/settle/close)

All monetary amounts are in micro-USDC (integer). 1 USDC = 1_000_000 µUSDC.

Public API (called from server.py router):
  open_stream(user_id, agent_pubkey, agent_name, upstream,
              rate_per_token_micro_usdc, rate_per_call_micro_usdc,
              settlement_interval_secs) → stream dict
  record(stream_id, user_id, tokens, calls) → (stream dict, just_settled_micro_usdc | None)
  settle(stream_id, user_id) → (stream dict, just_settled_micro_usdc)
  close(stream_id, user_id) → stream dict
  list_streams(user_id) → (streams list, summary dict)
  list_events(user_id, limit) → events list
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "mpp.db"

MICRO_USDC_PER_USDC = 1_000_000


# ── DB setup ───────────────────────────────────────────────────────────────────


def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS mpp_streams (
            id                          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id                     TEXT    NOT NULL,
            agent_pubkey                TEXT    NOT NULL,
            agent_name                  TEXT    NOT NULL DEFAULT '',
            upstream                    TEXT    NOT NULL,
            rate_per_call_micro_usdc    INTEGER NOT NULL DEFAULT 0,
            rate_per_token_micro_usdc   INTEGER NOT NULL DEFAULT 0,
            settlement_interval_secs    INTEGER NOT NULL DEFAULT 60,
            status                      TEXT    NOT NULL DEFAULT 'open',
            opened_at                   INTEGER NOT NULL,
            last_settled_at             INTEGER NOT NULL,
            closed_at                   INTEGER,
            total_calls                 INTEGER NOT NULL DEFAULT 0,
            total_tokens                INTEGER NOT NULL DEFAULT 0,
            pending_micro_usdc          INTEGER NOT NULL DEFAULT 0,
            settled_micro_usdc          INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_streams_user
            ON mpp_streams (user_id, opened_at DESC);

        CREATE TABLE IF NOT EXISTS mpp_events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            stream_id    INTEGER NOT NULL,
            user_id      TEXT    NOT NULL,
            kind         TEXT    NOT NULL,
            calls        INTEGER NOT NULL DEFAULT 0,
            tokens       INTEGER NOT NULL DEFAULT 0,
            micro_usdc   INTEGER NOT NULL DEFAULT 0,
            ts           INTEGER NOT NULL,
            upstream     TEXT    NOT NULL DEFAULT '',
            agent_name   TEXT    NOT NULL DEFAULT '',
            agent_pubkey TEXT    NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_events_user_ts
            ON mpp_events (user_id, ts DESC);
    """)
    conn.commit()
    return conn


# ── Row serialisation ─────────────────────────────────────────────────────────


def _stream_row_to_dict(row: tuple) -> dict:
    return {
        "id": row[0],
        "user_id": row[1],
        "agent_pubkey": row[2],
        "agent_name": row[3],
        "upstream": row[4],
        "rate_per_call_micro_usdc": row[5],
        "rate_per_token_micro_usdc": row[6],
        "settlement_interval_secs": row[7],
        "status": row[8],
        "opened_at": row[9],
        "last_settled_at": row[10],
        "closed_at": row[11],
        "total_calls": row[12],
        "total_tokens": row[13],
        "pending_micro_usdc": row[14],
        "settled_micro_usdc": row[15],
    }


_STREAM_COLS = (
    "id, user_id, agent_pubkey, agent_name, upstream, "
    "rate_per_call_micro_usdc, rate_per_token_micro_usdc, "
    "settlement_interval_secs, status, opened_at, last_settled_at, "
    "closed_at, total_calls, total_tokens, pending_micro_usdc, settled_micro_usdc"
)


def _event_row_to_dict(row: tuple) -> dict:
    cost_usd = row[6] / MICRO_USDC_PER_USDC
    return {
        "id": row[0],
        "stream_id": row[1],
        "kind": row[3],
        "calls": row[4],
        "tokens": row[5],
        "micro_usdc": row[6],
        "cost_usd": round(cost_usd, 6),
        "ts": row[7],
        "upstream": row[8],
        "agent_name": row[9],
        "agent_pubkey": row[10],
    }


# ── Helper: compute pending amount from rates ─────────────────────────────────


def _compute_pending(stream: dict) -> int:
    """Re-derive pending_micro_usdc from totals and rates."""
    gross = (
        stream["total_tokens"] * stream["rate_per_token_micro_usdc"]
        + stream["total_calls"] * stream["rate_per_call_micro_usdc"]
    )
    return max(0, gross - stream["settled_micro_usdc"])


# ── Helper: write a settlement into the DB (reusable) ─────────────────────────


def _do_settle(
    conn: sqlite3.Connection,
    stream: dict,
    now: int,
) -> int:
    """
    Settle the pending balance. Returns the amount settled (µUSDC).
    Mutates the DB. Does NOT commit — caller must commit.
    """
    pending = _compute_pending(stream)
    if pending <= 0:
        return 0

    conn.execute(
        """
        UPDATE mpp_streams
        SET settled_micro_usdc = settled_micro_usdc + ?,
            pending_micro_usdc = 0,
            last_settled_at    = ?
        WHERE id = ?
    """,
        (pending, now, stream["id"]),
    )

    conn.execute(
        """
        INSERT INTO mpp_events
          (stream_id, user_id, kind, calls, tokens, micro_usdc, ts,
           upstream, agent_name, agent_pubkey)
        VALUES (?, ?, 'settle', 0, 0, ?, ?, ?, ?, ?)
    """,
        (
            stream["id"],
            stream["user_id"],
            pending,
            now,
            stream["upstream"],
            stream["agent_name"],
            stream["agent_pubkey"],
        ),
    )
    return pending


# ── Public API ─────────────────────────────────────────────────────────────────


def open_stream(
    user_id: str,
    agent_pubkey: str,
    agent_name: str,
    upstream: str,
    rate_per_token_micro_usdc: int,
    rate_per_call_micro_usdc: int,
    settlement_interval_secs: int,
) -> dict:
    """Open a new MPP stream. Returns the stream dict."""
    now = int(time.time())
    conn = _db()
    try:
        cur = conn.execute(
            """
            INSERT INTO mpp_streams
              (user_id, agent_pubkey, agent_name, upstream,
               rate_per_call_micro_usdc, rate_per_token_micro_usdc,
               settlement_interval_secs, status, opened_at, last_settled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
        """,
            (
                user_id,
                agent_pubkey,
                agent_name[:64],
                upstream,
                rate_per_call_micro_usdc,
                rate_per_token_micro_usdc,
                settlement_interval_secs,
                now,
                now,
            ),
        )
        stream_id = cur.lastrowid

        conn.execute(
            """
            INSERT INTO mpp_events
              (stream_id, user_id, kind, calls, tokens, micro_usdc, ts,
               upstream, agent_name, agent_pubkey)
            VALUES (?, ?, 'open', 0, 0, 0, ?, ?, ?, ?)
        """,
            (stream_id, user_id, now, upstream, agent_name[:64], agent_pubkey),
        )

        conn.commit()

        row = conn.execute(
            f"SELECT {_STREAM_COLS} FROM mpp_streams WHERE id = ?", (stream_id,)
        ).fetchone()
        return _stream_row_to_dict(row)
    finally:
        conn.close()


def record(
    stream_id: int,
    user_id: str,
    tokens: int,
    calls: int,
) -> tuple[dict, int | None]:
    """
    Record token/call usage on a stream. Auto-settles if interval has elapsed.
    Returns (stream_dict, just_settled_micro_usdc | None).
    just_settled_micro_usdc is only non-None when auto-settle fires.
    """
    now = int(time.time())
    conn = _db()
    try:
        row = conn.execute(
            f"SELECT {_STREAM_COLS} FROM mpp_streams WHERE id = ? AND user_id = ?",
            (stream_id, user_id),
        ).fetchone()
        if row is None:
            raise LookupError(f"stream {stream_id} not found")
        stream = _stream_row_to_dict(row)
        if stream["status"] != "open":
            raise ValueError("stream is not open")

        new_tokens = stream["total_tokens"] + tokens
        new_calls = stream["total_calls"] + calls
        gross_pending = (
            new_tokens * stream["rate_per_token_micro_usdc"]
            + new_calls * stream["rate_per_call_micro_usdc"]
            - stream["settled_micro_usdc"]
        )
        new_pending = max(0, gross_pending)

        conn.execute(
            """
            UPDATE mpp_streams
            SET total_tokens       = ?,
                total_calls        = ?,
                pending_micro_usdc = ?
            WHERE id = ?
        """,
            (new_tokens, new_calls, new_pending, stream_id),
        )

        conn.execute(
            """
            INSERT INTO mpp_events
              (stream_id, user_id, kind, calls, tokens, micro_usdc, ts,
               upstream, agent_name, agent_pubkey)
            VALUES (?, ?, 'record', ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                stream_id,
                user_id,
                calls,
                tokens,
                new_pending - _compute_pending(stream),  # delta this record added
                now,
                stream["upstream"],
                stream["agent_name"],
                stream["agent_pubkey"],
            ),
        )

        # Reload stream dict with updated totals for settle calculation.
        stream["total_tokens"] = new_tokens
        stream["total_calls"] = new_calls
        stream["pending_micro_usdc"] = new_pending

        # Auto-settle if interval elapsed.
        just_settled: int | None = None
        elapsed = now - stream["last_settled_at"]
        if elapsed >= stream["settlement_interval_secs"]:
            settled = _do_settle(conn, stream, now)
            if settled > 0:
                just_settled = settled

        conn.commit()

        row2 = conn.execute(
            f"SELECT {_STREAM_COLS} FROM mpp_streams WHERE id = ?", (stream_id,)
        ).fetchone()
        return _stream_row_to_dict(row2), just_settled
    finally:
        conn.close()


def settle(stream_id: int, user_id: str) -> tuple[dict, int]:
    """
    Manually settle a stream's pending balance.
    Returns (stream_dict, just_settled_micro_usdc).
    """
    now = int(time.time())
    conn = _db()
    try:
        row = conn.execute(
            f"SELECT {_STREAM_COLS} FROM mpp_streams WHERE id = ? AND user_id = ?",
            (stream_id, user_id),
        ).fetchone()
        if row is None:
            raise LookupError(f"stream {stream_id} not found")
        stream = _stream_row_to_dict(row)
        if stream["status"] != "open":
            raise ValueError("stream is not open")

        # Recalculate pending from source of truth (rates × totals).
        stream["pending_micro_usdc"] = _compute_pending(stream)
        just_settled = _do_settle(conn, stream, now)
        conn.commit()

        row2 = conn.execute(
            f"SELECT {_STREAM_COLS} FROM mpp_streams WHERE id = ?", (stream_id,)
        ).fetchone()
        return _stream_row_to_dict(row2), just_settled
    finally:
        conn.close()


def close_stream(stream_id: int, user_id: str) -> dict:
    """
    Close a stream. Settles any pending balance first, then marks closed.
    Returns the final stream dict.
    """
    now = int(time.time())
    conn = _db()
    try:
        row = conn.execute(
            f"SELECT {_STREAM_COLS} FROM mpp_streams WHERE id = ? AND user_id = ?",
            (stream_id, user_id),
        ).fetchone()
        if row is None:
            raise LookupError(f"stream {stream_id} not found")
        stream = _stream_row_to_dict(row)
        if stream["status"] != "open":
            raise ValueError("stream is already closed")

        # Final settle before closing.
        stream["pending_micro_usdc"] = _compute_pending(stream)
        _do_settle(conn, stream, now)

        conn.execute(
            """
            UPDATE mpp_streams
            SET status    = 'closed',
                closed_at = ?
            WHERE id = ?
        """,
            (now, stream_id),
        )

        conn.execute(
            """
            INSERT INTO mpp_events
              (stream_id, user_id, kind, calls, tokens, micro_usdc, ts,
               upstream, agent_name, agent_pubkey)
            VALUES (?, ?, 'close', 0, 0, 0, ?, ?, ?, ?)
        """,
            (
                stream_id,
                user_id,
                now,
                stream["upstream"],
                stream["agent_name"],
                stream["agent_pubkey"],
            ),
        )

        conn.commit()

        row2 = conn.execute(
            f"SELECT {_STREAM_COLS} FROM mpp_streams WHERE id = ?", (stream_id,)
        ).fetchone()
        return _stream_row_to_dict(row2)
    finally:
        conn.close()


def list_streams(user_id: str) -> tuple[list[dict], dict]:
    """
    Return (streams, summary) for a user.
    streams: all streams newest-first.
    summary: aggregate counts and amounts.
    """
    conn = _db()
    try:
        rows = conn.execute(
            f"SELECT {_STREAM_COLS} FROM mpp_streams WHERE user_id = ? ORDER BY opened_at DESC",
            (user_id,),
        ).fetchall()
        streams = [_stream_row_to_dict(r) for r in rows]

        streams_open = sum(1 for s in streams if s["status"] == "open")
        tokens_total = sum(s["total_tokens"] for s in streams)
        calls_total = sum(s["total_calls"] for s in streams)
        settled_usdc = (
            sum(s["settled_micro_usdc"] for s in streams) / MICRO_USDC_PER_USDC
        )
        pending_usdc = sum(_compute_pending(s) for s in streams) / MICRO_USDC_PER_USDC

        summary = {
            "streams_total": len(streams),
            "streams_open": streams_open,
            "tokens_total": tokens_total,
            "calls_total": calls_total,
            "settled_usd": round(settled_usdc, 6),
            "pending_usd": round(pending_usdc, 6),
        }
        return streams, summary
    finally:
        conn.close()


def list_events(user_id: str, limit: int = 20) -> list[dict]:
    """Return recent MPP events for a user, newest-first."""
    conn = _db()
    try:
        rows = conn.execute(
            """
            SELECT id, stream_id, user_id, kind, calls, tokens, micro_usdc, ts,
                   upstream, agent_name, agent_pubkey
            FROM mpp_events
            WHERE user_id = ?
            ORDER BY ts DESC
            LIMIT ?
        """,
            (user_id, min(limit, 200)),
        ).fetchall()
        return [_event_row_to_dict(r) for r in rows]
    finally:
        conn.close()
