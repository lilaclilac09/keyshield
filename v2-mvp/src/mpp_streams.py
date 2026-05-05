"""
MPP streams — lightweight, local accounting for metered usage.

Tables:
  mpp_streams
  mpp_events
"""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "mpp.db"


class StreamNotFound(Exception):
    pass


class StreamClosed(Exception):
    pass


def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS mpp_streams (
            id                          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id                     TEXT    NOT NULL,
            agent_pubkey                TEXT    NOT NULL,
            agent_name                  TEXT    NOT NULL DEFAULT '',
            upstream                    TEXT    NOT NULL,
            rate_per_token_micro_usdc   INTEGER NOT NULL DEFAULT 0,
            rate_per_call_micro_usdc    INTEGER NOT NULL DEFAULT 0,
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
        CREATE INDEX IF NOT EXISTS idx_mpp_streams_status
            ON mpp_streams (user_id, status);

        CREATE TABLE IF NOT EXISTS mpp_events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      TEXT    NOT NULL,
            stream_id    INTEGER NOT NULL,
            kind         TEXT    NOT NULL,
            calls        INTEGER NOT NULL DEFAULT 0,
            tokens       INTEGER NOT NULL DEFAULT 0,
            micro_usdc   INTEGER NOT NULL DEFAULT 0,
            cost_usd     REAL    NOT NULL DEFAULT 0.0,
            ts           INTEGER NOT NULL,
            upstream     TEXT    NOT NULL,
            agent_name   TEXT    NOT NULL,
            agent_pubkey TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_events_user
            ON mpp_events (user_id, ts DESC);
        CREATE INDEX IF NOT EXISTS idx_mpp_events_stream
            ON mpp_events (stream_id, ts DESC);
        """
    )
    conn.commit()
    return conn


def _stream_row(row: tuple) -> dict:
    return {
        "id": row[0],
        "agent_pubkey": row[1],
        "agent_name": row[2],
        "upstream": row[3],
        "rate_per_token_micro_usdc": row[4],
        "rate_per_call_micro_usdc": row[5],
        "settlement_interval_secs": row[6],
        "status": row[7],
        "opened_at": row[8],
        "last_settled_at": row[9],
        "closed_at": row[10],
        "total_calls": row[11],
        "total_tokens": row[12],
        "pending_micro_usdc": row[13],
        "settled_micro_usdc": row[14],
    }


def _event_row(row: tuple) -> dict:
    return {
        "id": row[0],
        "stream_id": row[1],
        "kind": row[2],
        "calls": row[3],
        "tokens": row[4],
        "micro_usdc": row[5],
        "cost_usd": row[6],
        "ts": row[7],
        "upstream": row[8],
        "agent_name": row[9],
        "agent_pubkey": row[10],
    }


def _insert_event(
    conn: sqlite3.Connection,
    user_id: str,
    stream_id: int,
    kind: str,
    calls: int,
    tokens: int,
    micro_usdc: int,
    upstream: str,
    agent_name: str,
    agent_pubkey: str,
) -> None:
    cost_usd = round(micro_usdc / 1_000_000, 6)
    conn.execute(
        """
        INSERT INTO mpp_events
            (user_id, stream_id, kind, calls, tokens, micro_usdc, cost_usd,
             ts, upstream, agent_name, agent_pubkey)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            user_id,
            stream_id,
            kind,
            int(calls),
            int(tokens),
            int(micro_usdc),
            cost_usd,
            int(time.time()),
            upstream,
            agent_name,
            agent_pubkey,
        ),
    )


def _summary(streams: list[dict]) -> dict:
    streams_total = len(streams)
    streams_open = sum(1 for s in streams if s["status"] == "open")
    tokens_total = sum(s["total_tokens"] for s in streams)
    calls_total = sum(s["total_calls"] for s in streams)
    settled_micro = sum(s["settled_micro_usdc"] for s in streams)
    pending_micro = sum(s["pending_micro_usdc"] for s in streams)
    return {
        "streams_total": streams_total,
        "streams_open": streams_open,
        "tokens_total": tokens_total,
        "calls_total": calls_total,
        "settled_usd": round(settled_micro / 1_000_000, 6),
        "pending_usd": round(pending_micro / 1_000_000, 6),
    }


def open_stream(
    user_id: str,
    agent_pubkey: str,
    agent_name: str,
    upstream: str,
    rate_per_token_micro_usdc: int,
    rate_per_call_micro_usdc: int,
    settlement_interval_secs: int,
) -> dict:
    now = int(time.time())
    conn = _db()
    try:
        cur = conn.execute(
            """
            INSERT INTO mpp_streams
                (user_id, agent_pubkey, agent_name, upstream,
                 rate_per_token_micro_usdc, rate_per_call_micro_usdc,
                 settlement_interval_secs, status, opened_at, last_settled_at,
                 total_calls, total_tokens, pending_micro_usdc, settled_micro_usdc)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                user_id,
                agent_pubkey,
                agent_name,
                upstream,
                int(rate_per_token_micro_usdc),
                int(rate_per_call_micro_usdc),
                int(settlement_interval_secs),
                "open",
                now,
                now,
                0,
                0,
                0,
                0,
            ),
        )
        stream_id = cur.lastrowid  # type: ignore[assignment]
        _insert_event(
            conn,
            user_id,
            stream_id,
            "open",
            0,
            0,
            0,
            upstream,
            agent_name,
            agent_pubkey,
        )
        conn.commit()
        stream = get_stream(user_id, int(stream_id), conn=conn)
        return stream
    finally:
        conn.close()


def get_stream(user_id: str, stream_id: int, conn: sqlite3.Connection | None = None) -> dict:
    close_conn = False
    if conn is None:
        conn = _db()
        close_conn = True
    try:
        row = conn.execute(
            """
            SELECT
                id, agent_pubkey, agent_name, upstream,
                rate_per_token_micro_usdc, rate_per_call_micro_usdc,
                settlement_interval_secs, status, opened_at, last_settled_at,
                closed_at, total_calls, total_tokens, pending_micro_usdc, settled_micro_usdc
            FROM mpp_streams
            WHERE id = ? AND user_id = ?
            LIMIT 1
            """,
            (int(stream_id), user_id),
        ).fetchone()
        if not row:
            raise StreamNotFound()
        return _stream_row(row)
    finally:
        if close_conn:
            conn.close()


def list_streams(user_id: str) -> dict:
    conn = _db()
    try:
        rows = conn.execute(
            """
            SELECT
                id, agent_pubkey, agent_name, upstream,
                rate_per_token_micro_usdc, rate_per_call_micro_usdc,
                settlement_interval_secs, status, opened_at, last_settled_at,
                closed_at, total_calls, total_tokens, pending_micro_usdc, settled_micro_usdc
            FROM mpp_streams
            WHERE user_id = ?
            ORDER BY opened_at DESC
            """,
            (user_id,),
        ).fetchall()
        streams = [_stream_row(r) for r in rows]
        return {"streams": streams, "summary": _summary(streams)}
    finally:
        conn.close()


def list_events(user_id: str, limit: int = 50) -> dict:
    conn = _db()
    try:
        rows = conn.execute(
            """
            SELECT
                id, stream_id, kind, calls, tokens, micro_usdc, cost_usd,
                ts, upstream, agent_name, agent_pubkey
            FROM mpp_events
            WHERE user_id = ?
            ORDER BY ts DESC
            LIMIT ?
            """,
            (user_id, int(limit)),
        ).fetchall()
        return {"events": [_event_row(r) for r in rows]}
    finally:
        conn.close()


def record_usage(user_id: str, stream_id: int, tokens: int, calls: int) -> tuple[dict, int]:
    conn = _db()
    try:
        stream = get_stream(user_id, stream_id, conn=conn)
        if stream["status"] != "open":
            raise StreamClosed()

        tokens = max(0, int(tokens))
        calls = max(0, int(calls))
        micro_usdc = tokens * int(stream["rate_per_token_micro_usdc"]) + calls * int(
            stream["rate_per_call_micro_usdc"]
        )

        conn.execute(
            """
            UPDATE mpp_streams
            SET total_calls = total_calls + ?,
                total_tokens = total_tokens + ?,
                pending_micro_usdc = pending_micro_usdc + ?
            WHERE id = ? AND user_id = ?
            """,
            (calls, tokens, micro_usdc, int(stream_id), user_id),
        )

        _insert_event(
            conn,
            user_id,
            int(stream_id),
            "record",
            calls,
            tokens,
            micro_usdc,
            stream["upstream"],
            stream["agent_name"],
            stream["agent_pubkey"],
        )

        just_settled = 0
        now = int(time.time())
        stream = get_stream(user_id, stream_id, conn=conn)
        if (
            stream["settlement_interval_secs"] > 0
            and now - int(stream["last_settled_at"]) >= int(stream["settlement_interval_secs"])
            and stream["pending_micro_usdc"] > 0
        ):
            just_settled = int(stream["pending_micro_usdc"])
            conn.execute(
                """
                UPDATE mpp_streams
                SET pending_micro_usdc = 0,
                    settled_micro_usdc = settled_micro_usdc + ?,
                    last_settled_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (just_settled, now, int(stream_id), user_id),
            )
            _insert_event(
                conn,
                user_id,
                int(stream_id),
                "settle",
                0,
                0,
                just_settled,
                stream["upstream"],
                stream["agent_name"],
                stream["agent_pubkey"],
            )

        conn.commit()
        stream = get_stream(user_id, stream_id, conn=conn)
        return stream, just_settled
    finally:
        conn.close()


def settle_stream(user_id: str, stream_id: int) -> tuple[dict, int]:
    conn = _db()
    try:
        stream = get_stream(user_id, stream_id, conn=conn)
        if stream["status"] != "open":
            raise StreamClosed()

        just_settled = int(stream["pending_micro_usdc"])
        if just_settled > 0:
            now = int(time.time())
            conn.execute(
                """
                UPDATE mpp_streams
                SET pending_micro_usdc = 0,
                    settled_micro_usdc = settled_micro_usdc + ?,
                    last_settled_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (just_settled, now, int(stream_id), user_id),
            )
            _insert_event(
                conn,
                user_id,
                int(stream_id),
                "settle",
                0,
                0,
                just_settled,
                stream["upstream"],
                stream["agent_name"],
                stream["agent_pubkey"],
            )

        conn.commit()
        stream = get_stream(user_id, stream_id, conn=conn)
        return stream, just_settled
    finally:
        conn.close()


def close_stream(user_id: str, stream_id: int) -> tuple[dict, int]:
    conn = _db()
    try:
        stream = get_stream(user_id, stream_id, conn=conn)
        if stream["status"] != "open":
            raise StreamClosed()

        just_settled = int(stream["pending_micro_usdc"])
        now = int(time.time())
        if just_settled > 0:
            conn.execute(
                """
                UPDATE mpp_streams
                SET pending_micro_usdc = 0,
                    settled_micro_usdc = settled_micro_usdc + ?,
                    last_settled_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (just_settled, now, int(stream_id), user_id),
            )
            _insert_event(
                conn,
                user_id,
                int(stream_id),
                "settle",
                0,
                0,
                just_settled,
                stream["upstream"],
                stream["agent_name"],
                stream["agent_pubkey"],
            )

        conn.execute(
            """
            UPDATE mpp_streams
            SET status = 'closed',
                closed_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (now, int(stream_id), user_id),
        )
        _insert_event(
            conn,
            user_id,
            int(stream_id),
            "close",
            0,
            0,
            0,
            stream["upstream"],
            stream["agent_name"],
            stream["agent_pubkey"],
        )

        conn.commit()
        stream = get_stream(user_id, stream_id, conn=conn)
        return stream, just_settled
    finally:
        conn.close()
