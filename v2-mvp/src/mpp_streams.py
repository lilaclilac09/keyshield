"""
mpp_streams.py — Metered Payment Protocol streams (stub-on-chain mode).

Implements the server-side state machine for `/mpp/streams/*` so the
frontend's ActivitySection MPP UI works TODAY without waiting for the
on-chain ixs (Engineer β, ROADMAP §6a + spec 10.1/10.2).

Stub-on-chain mode:
  - All accounting (open / record / settle / close) lives in SQLite.
  - `settle_on_chain()` is a single-purpose seam — currently a no-op
    that returns 0. Phase 10.4-real swaps the body for a real
    `mpp_settle` ix CPI once #26 lands.
  - Per spec 10 §Q3, x402 and MPP debit the SAME PaymentStream USDC
    ATA on-chain. In stub mode we simulate that debit by booking
    `pending_micro_usdc → settled_micro_usdc` and emitting a `settle`
    event row.

Tables (created lazily on first call to `_db()`):
  - mpp_streams: one row per opened stream
  - mpp_events:  append-only audit log of open/record/settle/close

The DB lives at v2-mvp/data/mpp.db so resetting MPP state doesn't nuke
usage history. Same lifecycle pattern as `usage.DB_PATH`.
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "mpp.db"


# ─── DB setup ─────────────────────────────────────────────────────────────────


def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS mpp_streams (
            id                          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id                     TEXT    NOT NULL,
            agent_pubkey                TEXT    NOT NULL,
            agent_name                  TEXT,
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
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       TEXT    NOT NULL,
            stream_id     INTEGER NOT NULL,
            kind          TEXT    NOT NULL,
            calls         INTEGER NOT NULL DEFAULT 0,
            tokens        INTEGER NOT NULL DEFAULT 0,
            micro_usdc    INTEGER NOT NULL DEFAULT 0,
            cost_usd      REAL    NOT NULL DEFAULT 0.0,
            ts            INTEGER NOT NULL,
            upstream      TEXT    NOT NULL,
            agent_name    TEXT,
            agent_pubkey  TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_events_user_ts
            ON mpp_events (user_id, ts DESC);
        CREATE INDEX IF NOT EXISTS idx_mpp_events_stream
            ON mpp_events (stream_id, ts DESC);
    """)
    conn.commit()
    return conn


# ─── exceptions ──────────────────────────────────────────────────────────────


class StreamNotFound(Exception):
    """The (user_id, stream_id) pair does not exist."""


class StreamClosed(Exception):
    """Operation requires an open stream but the stream is closed."""


# ─── row → dict helpers ──────────────────────────────────────────────────────


_STREAM_COLS = (
    "id, user_id, agent_pubkey, agent_name, upstream, "
    "rate_per_call_micro_usdc, rate_per_token_micro_usdc, "
    "settlement_interval_secs, status, opened_at, last_settled_at, "
    "closed_at, total_calls, total_tokens, "
    "pending_micro_usdc, settled_micro_usdc"
)


def _row_to_stream(row: tuple) -> dict:
    return {
        "id":                         row[0],
        "user_id":                    row[1],
        "agent_pubkey":               row[2],
        "agent_name":                 row[3] or "",
        "upstream":                   row[4],
        "rate_per_call_micro_usdc":   row[5],
        "rate_per_token_micro_usdc":  row[6],
        "settlement_interval_secs":   row[7],
        "status":                     row[8],
        "opened_at":                  row[9],
        "last_settled_at":            row[10],
        "closed_at":                  row[11],
        "total_calls":                row[12],
        "total_tokens":               row[13],
        "pending_micro_usdc":         row[14],
        "settled_micro_usdc":         row[15],
    }


_EVENT_COLS = (
    "id, user_id, stream_id, kind, calls, tokens, micro_usdc, "
    "cost_usd, ts, upstream, agent_name, agent_pubkey"
)


def _row_to_event(row: tuple) -> dict:
    return {
        "id":           row[0],
        "user_id":      row[1],
        "stream_id":    row[2],
        "kind":         row[3],
        "calls":        row[4],
        "tokens":       row[5],
        "micro_usdc":   row[6],
        "cost_usd":     row[7],
        "ts":           row[8],
        "upstream":     row[9],
        "agent_name":   row[10] or "",
        "agent_pubkey": row[11],
    }


# ─── private helpers ─────────────────────────────────────────────────────────


def _get_owned_stream(conn: sqlite3.Connection, user_id: str, stream_id: int) -> dict:
    """Fetch a stream that belongs to user_id, else raise StreamNotFound.

    Owner-scoped lookup is the entire access-control surface for MPP —
    we never expose another user's stream by id, even if the id is
    guessed correctly.
    """
    row = conn.execute(
        f"SELECT {_STREAM_COLS} FROM mpp_streams WHERE id = ? AND user_id = ?",
        (stream_id, user_id),
    ).fetchone()
    if row is None:
        raise StreamNotFound(stream_id)
    return _row_to_stream(row)


def _emit_event(
    conn: sqlite3.Connection,
    *,
    user_id: str,
    stream: dict,
    kind: str,
    calls: int = 0,
    tokens: int = 0,
    micro_usdc: int = 0,
    ts: int | None = None,
) -> dict:
    """Append a row to mpp_events. Returns the row as a dict."""
    ts = ts if ts is not None else int(time.time())
    cost_usd = round(micro_usdc / 1_000_000, 6)
    cur = conn.execute(
        """
        INSERT INTO mpp_events
          (user_id, stream_id, kind, calls, tokens, micro_usdc,
           cost_usd, ts, upstream, agent_name, agent_pubkey)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            user_id,
            stream["id"],
            kind,
            calls,
            tokens,
            micro_usdc,
            cost_usd,
            ts,
            stream["upstream"],
            stream.get("agent_name") or "",
            stream["agent_pubkey"],
        ),
    )
    return {
        "id":           cur.lastrowid,
        "user_id":      user_id,
        "stream_id":    stream["id"],
        "kind":         kind,
        "calls":        calls,
        "tokens":       tokens,
        "micro_usdc":   micro_usdc,
        "cost_usd":     cost_usd,
        "ts":           ts,
        "upstream":     stream["upstream"],
        "agent_name":   stream.get("agent_name") or "",
        "agent_pubkey": stream["agent_pubkey"],
    }


# ─── stub vs real on-chain seam ──────────────────────────────────────────────


def settle_on_chain(stream_id: int, micro_usdc: int) -> int:
    """Submit a real `mpp_settle` ix to Solana, returning the on-chain
    debit amount in micro-USDC.

    STUB: returns 0 — we record settlement DB-side only.

    # TODO Phase 10.4-real: replace with mpp_settle ix CPI.
    # Per spec 10 §Q3:
    #   1. Build mpp_settle(stream_id, units_since_last_settle) ix
    #      with the server's mpp_settler keypair as signer
    #   2. Submit via Helius / vanilla RPC
    #   3. Wait `confirmed` commitment
    #   4. Return the actual debited amount (PaymentStream may cap it
    #      at max_total_micro_usdc; on-chain truth wins)
    # The DB row's `settled_micro_usdc` should reflect the on-chain
    # amount, which may be < the requested micro_usdc if the budget
    # ran out.
    """
    _ = (stream_id, micro_usdc)  # explicit: ignored in stub
    return 0


# ─── public API ──────────────────────────────────────────────────────────────


def open_stream(
    user_id:             str,
    agent_pubkey:        str,
    agent_name:          str,
    upstream:            str,
    rate_per_token:      int,
    rate_per_call:       int,
    settlement_interval: int,
) -> dict:
    """Open a new MPP stream for `user_id`. Returns the stream row +
    emits an 'open' event."""
    if not agent_pubkey:
        raise ValueError("agent_pubkey is required")
    if rate_per_token < 0 or rate_per_call < 0:
        raise ValueError("rates must be non-negative")
    if rate_per_token == 0 and rate_per_call == 0:
        raise ValueError("at least one of rate_per_token / rate_per_call must be > 0")
    if settlement_interval < 5 or settlement_interval > 3600:
        raise ValueError("settlement_interval must be in [5, 3600] seconds")

    now = int(time.time())
    conn = _db()
    try:
        cur = conn.execute(
            """
            INSERT INTO mpp_streams
              (user_id, agent_pubkey, agent_name, upstream,
               rate_per_call_micro_usdc, rate_per_token_micro_usdc,
               settlement_interval_secs, status, opened_at, last_settled_at)
            VALUES (?,?,?,?,?,?,?, 'open', ?, ?)
            """,
            (
                user_id, agent_pubkey, agent_name or "", upstream,
                int(rate_per_call), int(rate_per_token),
                int(settlement_interval), now, now,
            ),
        )
        stream_id = cur.lastrowid
        stream = _get_owned_stream(conn, user_id, stream_id)
        _emit_event(conn, user_id=user_id, stream=stream, kind="open", ts=now)
        conn.commit()
        return stream
    finally:
        conn.close()


def record_usage(
    user_id:    str,
    stream_id:  int,
    calls:      int,
    tokens:     int,
) -> dict:
    """Add `calls` + `tokens` to the stream's running totals; recompute
    `pending_micro_usdc`. Auto-settles when elapsed >= settlement_interval.

    Returns the (possibly post-settle) stream dict, with an extra
    `just_settled_micro_usdc` field (0 if no settlement happened this
    call). The frontend keys off that field to show the auto-settle
    toast.

    Raises StreamClosed if the stream is no longer open.
    """
    if calls < 0 or tokens < 0:
        raise ValueError("calls and tokens must be non-negative")
    now = int(time.time())
    conn = _db()
    try:
        stream = _get_owned_stream(conn, user_id, stream_id)
        if stream["status"] != "open":
            raise StreamClosed(stream_id)

        added = (
            int(tokens) * int(stream["rate_per_token_micro_usdc"])
            + int(calls) * int(stream["rate_per_call_micro_usdc"])
        )
        conn.execute(
            """
            UPDATE mpp_streams
               SET total_calls        = total_calls + ?,
                   total_tokens       = total_tokens + ?,
                   pending_micro_usdc = pending_micro_usdc + ?
             WHERE id = ? AND user_id = ?
            """,
            (int(calls), int(tokens), int(added), stream_id, user_id),
        )
        # Re-read to pick up the now-current pending balance.
        stream = _get_owned_stream(conn, user_id, stream_id)
        _emit_event(
            conn,
            user_id=user_id,
            stream=stream,
            kind="record",
            calls=int(calls),
            tokens=int(tokens),
            micro_usdc=int(added),
            ts=now,
        )

        just_settled = 0
        elapsed = now - stream["last_settled_at"]
        if (
            stream["pending_micro_usdc"] > 0
            and elapsed >= stream["settlement_interval_secs"]
        ):
            stream, just_settled = _settle_locked(conn, user_id, stream, now)

        conn.commit()
        stream["just_settled_micro_usdc"] = just_settled
        return stream
    finally:
        conn.close()


def _settle_locked(
    conn:    sqlite3.Connection,
    user_id: str,
    stream:  dict,
    now:     int,
) -> tuple[dict, int]:
    """Move pending → settled + emit a 'settle' event. Caller manages
    the commit boundary.

    Returns (post-settle stream, just_settled_micro_usdc).
    """
    pending = int(stream["pending_micro_usdc"])
    if pending <= 0:
        # Still update last_settled_at so the countdown UI resets cleanly.
        conn.execute(
            "UPDATE mpp_streams SET last_settled_at = ? WHERE id = ? AND user_id = ?",
            (now, stream["id"], user_id),
        )
        stream = _get_owned_stream(conn, user_id, stream["id"])
        _emit_event(
            conn, user_id=user_id, stream=stream,
            kind="settle", micro_usdc=0, ts=now,
        )
        return stream, 0

    # Stub-on-chain: settle_on_chain() is a no-op returning 0; we
    # always record `pending` as the settled amount so the UI can
    # show settled $ accumulating. Phase 10.4-real will replace
    # `settle_on_chain` with a real CPI; if the on-chain returns
    # < pending (budget cap), the difference must be retained as
    # remaining pending. For stub, full pending settles every time.
    _on_chain_amount = settle_on_chain(stream["id"], pending)
    _ = _on_chain_amount  # currently unused; reserved for 10.4-real

    conn.execute(
        """
        UPDATE mpp_streams
           SET pending_micro_usdc = 0,
               settled_micro_usdc = settled_micro_usdc + ?,
               last_settled_at    = ?
         WHERE id = ? AND user_id = ?
        """,
        (pending, now, stream["id"], user_id),
    )
    stream = _get_owned_stream(conn, user_id, stream["id"])
    _emit_event(
        conn, user_id=user_id, stream=stream,
        kind="settle", micro_usdc=pending, ts=now,
    )
    return stream, pending


def settle_stream(user_id: str, stream_id: int) -> dict:
    """Manual settlement. Moves pending → settled (stub: DB-only) and
    emits a 'settle' event. Returns the stream dict with
    `just_settled_micro_usdc` populated."""
    now = int(time.time())
    conn = _db()
    try:
        stream = _get_owned_stream(conn, user_id, stream_id)
        if stream["status"] != "open":
            # Closed streams have nothing pending — close_stream() drains.
            stream["just_settled_micro_usdc"] = 0
            return stream
        stream, just_settled = _settle_locked(conn, user_id, stream, now)
        conn.commit()
        stream["just_settled_micro_usdc"] = just_settled
        return stream
    finally:
        conn.close()


def close_stream(user_id: str, stream_id: int) -> dict:
    """Final settle (if pending) + status='closed' + closed_at=now.
    Idempotent: closing an already-closed stream returns the row
    unchanged with `just_settled_micro_usdc=0`."""
    now = int(time.time())
    conn = _db()
    try:
        stream = _get_owned_stream(conn, user_id, stream_id)
        if stream["status"] == "closed":
            stream["just_settled_micro_usdc"] = 0
            return stream

        just_settled = 0
        if stream["pending_micro_usdc"] > 0:
            stream, just_settled = _settle_locked(conn, user_id, stream, now)

        conn.execute(
            """
            UPDATE mpp_streams
               SET status = 'closed', closed_at = ?
             WHERE id = ? AND user_id = ?
            """,
            (now, stream_id, user_id),
        )
        stream = _get_owned_stream(conn, user_id, stream_id)
        _emit_event(
            conn, user_id=user_id, stream=stream, kind="close", ts=now,
        )
        conn.commit()
        stream["just_settled_micro_usdc"] = just_settled
        return stream
    finally:
        conn.close()


def list_streams(user_id: str) -> dict:
    """Return all streams for a user, newest first, plus a summary
    block matching the frontend's MppSummary shape."""
    conn = _db()
    try:
        rows = conn.execute(
            f"SELECT {_STREAM_COLS} FROM mpp_streams "
            f"WHERE user_id = ? ORDER BY opened_at DESC",
            (user_id,),
        ).fetchall()
        streams = [_row_to_stream(r) for r in rows]

        streams_total = len(streams)
        streams_open  = sum(1 for s in streams if s["status"] == "open")
        calls_total   = sum(s["total_calls"]  for s in streams)
        tokens_total  = sum(s["total_tokens"] for s in streams)
        settled_micro = sum(s["settled_micro_usdc"] for s in streams)
        pending_micro = sum(s["pending_micro_usdc"] for s in streams)

        # The frontend prints these via `.toFixed(6)` — so usd, not micro.
        summary = {
            "streams_total": streams_total,
            "streams_open":  streams_open,
            "calls_total":   calls_total,
            "tokens_total":  tokens_total,
            "settled_usd":   round(settled_micro / 1_000_000, 6),
            "pending_usd":   round(pending_micro / 1_000_000, 6),
        }
        return {"streams": streams, "summary": summary}
    finally:
        conn.close()


def list_events(user_id: str, limit: int = 20) -> dict:
    """Return the user's recent stream events, newest first."""
    limit = max(1, min(int(limit), 100))
    conn = _db()
    try:
        rows = conn.execute(
            f"SELECT {_EVENT_COLS} FROM mpp_events "
            f"WHERE user_id = ? ORDER BY ts DESC, id DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        return {"events": [_row_to_event(r) for r in rows]}
    finally:
        conn.close()
