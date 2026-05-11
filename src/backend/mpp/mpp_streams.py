"""
mpp_streams.py — Metered Payment Protocol streams.

Implements the server-side state machine for `/mpp/streams/*` so the
frontend's ActivitySection MPP UI works (ROADMAP §6a + spec 10.4).

On-chain mode (Phase 10.4-real, this file):
  - `settle_on_chain()` submits a real `mpp_settle` (ix #26) when env
    is configured (KS_MPP_SETTLER_KEY + KS_PLATFORM_USDC_ATA +
    KS_KEYSHIELD_PROGRAM_ID). Idempotency log lives in
    `mpp_settle_attempts`.
  - With env unset OR with the stream's PaymentStream PDA still
    DB-only (open_stream wiring is a P1 follow-up), `settle_on_chain`
    transparently falls back to the stub (returns 0) — DB-side
    settlement still happens so the UI keeps working.
  - Per spec 10 §Q3, x402 and MPP debit the SAME PaymentStream USDC
    ATA on-chain.

Tables (created lazily on first call to `_db()`):
  - mpp_streams:          one row per opened stream
  - mpp_events:           append-only audit log of open/record/settle/close
  - mpp_settle_attempts:  idempotency log for on-chain mpp_settle submissions

The DB lives at v2-mvp/data/mpp.db so resetting MPP state doesn't nuke
usage history. Same lifecycle pattern as `usage.DB_PATH`.
"""

from __future__ import annotations

import asyncio
import logging
import sqlite3
import time
from pathlib import Path

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "data" / "mpp.db"

# How long an in-flight (no recorded result yet) settle attempt is
# considered "pending" before a retry can take over. Keeps `settle`
# safe under concurrent record_usage calls without blocking forever
# if the previous attempt died mid-flight.
_PENDING_RECENCY_SECS = 60


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

        -- Spec 10 Phase 10.4-real idempotency log. Each row is one
        -- attempt at submitting an `mpp_settle` ix to Solana. The
        -- `tx_signature` column is the cluster-assigned sig once the
        -- ix lands; until then it stays NULL. `success`=1 means the
        -- caller observed a confirmed return; success=0 means the
        -- attempt errored (network down, BudgetExceeded, etc.).
        --
        -- Idempotency is by (stream_id, requested_micro_usdc, ts):
        -- a `record_usage` retry within the recency window finds the
        -- pending row and skips re-submission. The ts component
        -- prevents identical-amount settles across DIFFERENT
        -- intervals from colliding.
        CREATE TABLE IF NOT EXISTS mpp_settle_attempts (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            stream_id               INTEGER NOT NULL,
            requested_micro_usdc    INTEGER NOT NULL,
            tx_signature            TEXT,
            debited_micro_usdc      INTEGER NOT NULL DEFAULT 0,
            success                 INTEGER NOT NULL DEFAULT 0,
            error                   TEXT,
            ts                      INTEGER NOT NULL,
            UNIQUE (stream_id, requested_micro_usdc, ts)
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_settle_attempts_stream
            ON mpp_settle_attempts (stream_id, ts DESC);
    """)

    # Spec 10 Phase 10.5 wallet sign-off — idempotent column adds. Once
    # the frontend wallet adapter signs+sends the `open_payment_stream`
    # ix, it POSTs the resulting tx signature so the UI can switch from
    # the "Open on-chain stream" CTA to a green Solana-explorer link.
    # `withdraw_agent_wallet` sigs reuse the same column (withdraw is
    # terminal, so the open-sig is preserved separately in mpp_events).
    #
    # SQLite doesn't have `ADD COLUMN IF NOT EXISTS`, so we probe via
    # PRAGMA table_info and only ALTER on first run. This keeps `_db()`
    # safely callable on already-migrated databases (and on databases
    # that pre-date this column entirely).
    existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(mpp_streams)")}
    if "tx_signature" not in existing_cols:
        conn.execute("ALTER TABLE mpp_streams ADD COLUMN tx_signature TEXT")
    # On-chain stream PDA + USDC ATA — populated when the wallet adapter
    # signs `open_payment_stream` and posts back the addresses.
    # `_get_stream_pda_ata()` reads these to build the `mpp_settle` ix.
    if "stream_pda" not in existing_cols:
        conn.execute("ALTER TABLE mpp_streams ADD COLUMN stream_pda TEXT")
    if "stream_usdc_ata" not in existing_cols:
        conn.execute("ALTER TABLE mpp_streams ADD COLUMN stream_usdc_ata TEXT")

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
    "pending_micro_usdc, settled_micro_usdc, tx_signature"
)


def _row_to_stream(row: tuple) -> dict:
    # Note: the DB column is `tx_signature` but the frontend reads
    # `on_chain_signature` (Spec 10 Phase 10.5 wallet sign-off field
    # name). The dict carries both keys so legacy callers and the new
    # frontend banner both work without surprises.
    sig = row[16] if len(row) > 16 else None
    return {
        "id": row[0],
        "user_id": row[1],
        "agent_pubkey": row[2],
        "agent_name": row[3] or "",
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
        "on_chain_signature": sig,
    }


_EVENT_COLS = (
    "id, user_id, stream_id, kind, calls, tokens, micro_usdc, "
    "cost_usd, ts, upstream, agent_name, agent_pubkey"
)


def _row_to_event(row: tuple) -> dict:
    return {
        "id": row[0],
        "user_id": row[1],
        "stream_id": row[2],
        "kind": row[3],
        "calls": row[4],
        "tokens": row[5],
        "micro_usdc": row[6],
        "cost_usd": row[7],
        "ts": row[8],
        "upstream": row[9],
        "agent_name": row[10] or "",
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
        "id": cur.lastrowid,
        "user_id": user_id,
        "stream_id": stream["id"],
        "kind": kind,
        "calls": calls,
        "tokens": tokens,
        "micro_usdc": micro_usdc,
        "cost_usd": cost_usd,
        "ts": ts,
        "upstream": stream["upstream"],
        "agent_name": stream.get("agent_name") or "",
        "agent_pubkey": stream["agent_pubkey"],
    }


# ─── stub vs real on-chain seam ──────────────────────────────────────────────


def settle_on_chain(stream_id: int, micro_usdc: int) -> int:
    """Submit a real `mpp_settle` ix (#26) to Solana, returning the
    on-chain debit amount in micro-USDC.

    Phase 10.4-real implementation. Stub-fallback (return 0) still
    runs whenever:
      - any required env var (KS_MPP_SETTLER_KEY, KS_PLATFORM_USDC_ATA,
        KS_KEYSHIELD_PROGRAM_ID) is unset
      - the stream's PaymentStream PDA isn't yet opened on-chain
        (open_stream is still DB-only — see ROADMAP P0a follow-up)
      - the on-chain submission errors (network down, BudgetExceeded
        retry, etc.) — the caller treats this as "settle failed,
        pending stays in DB" so the next interval retries.

    Idempotency: each attempt is logged in `mpp_settle_attempts`. A
    second call with the same (stream_id, requested_micro_usdc,
    ts-bucket) within `_PENDING_RECENCY_SECS` returns the prior
    result instead of re-submitting.
    """
    if micro_usdc <= 0:
        return 0

    # Lazy import — avoids circular import / fails-soft if module not
    # importable (e.g. solders missing). The import itself can't fail
    # for stub-fallback because mpp_onchain.py imports softly.
    try:
        from . import mpp_onchain
    except ImportError:
        try:
            import mpp_onchain  # type: ignore[no-redef]
        except ImportError as e:
            logger.warning("mpp_onchain import failed: %s — stub-fallback", e)
            return 0

    config = mpp_onchain.load_mpp_config()
    if config is None:
        # load_mpp_config() already logged the warning once; just
        # fall through to stub.
        return 0

    # PDA + ATA are not stored in the mpp_streams schema today
    # (open_stream is still DB-only). Without them we can't build
    # the ix — return 0 with a one-line warning so operators see why
    # real settle isn't happening.
    pda, ata = _get_stream_pda_ata(stream_id)
    if not (pda and ata):
        if not _PDA_MISSING_WARNED.get(stream_id):
            logger.warning(
                "mpp_settle stream %s: PDA/ATA not opened on-chain "
                "(open_stream still DB-only) — stub-fallback returning 0",
                stream_id,
            )
            _PDA_MISSING_WARNED[stream_id] = True
        return 0

    # Idempotency check.
    now_ts = int(time.time())
    prior = _find_recent_attempt(stream_id, micro_usdc, now_ts)
    if prior is not None:
        # Either it succeeded → return the debited amount, or it
        # failed → return 0 (caller retries on the next interval).
        return int(prior.get("debited_micro_usdc") or 0)

    try:
        ix = mpp_onchain.build_mpp_settle_ix(config, pda, ata, micro_usdc)
    except Exception as e:  # noqa: BLE001
        # build_mpp_settle_ix raises if vault_pda is missing — same
        # stub-fallback behavior as PDA missing.
        logger.warning("mpp_settle build_ix failed for stream %s: %s", stream_id, e)
        _record_settle_attempt(
            stream_id,
            micro_usdc,
            now_ts,
            success=False,
            debited=0,
            error=str(e),
        )
        return 0

    # Pick the right way to run an async coroutine. If we're inside a
    # running event loop (FastAPI request handler called settle_on_chain
    # directly without a thread executor), asyncio.run() raises — fall
    # back to a fresh worker-thread loop. If we're at module top-level
    # (CLI scripts, tests), asyncio.run() is the simpler path.
    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None

    try:
        if running_loop is not None:
            debited, tx_sig = _run_async_in_thread(
                mpp_onchain.submit_mpp_settle(config, ix),
            )
        else:
            debited, tx_sig = asyncio.run(mpp_onchain.submit_mpp_settle(config, ix))
    except Exception as e:  # noqa: BLE001
        logger.warning("mpp_settle submit failed for stream %s: %s", stream_id, e)
        _record_settle_attempt(
            stream_id,
            micro_usdc,
            now_ts,
            success=False,
            debited=0,
            error=str(e),
        )
        return 0

    _record_settle_attempt(
        stream_id,
        micro_usdc,
        now_ts,
        success=True,
        debited=int(debited),
        error=None,
        tx_signature=tx_sig,
    )
    return int(debited)


# Per-stream "we've already complained about missing PDA" cache so
# the warning doesn't spam every settle interval.
_PDA_MISSING_WARNED: dict[int, bool] = {}


def _get_stream_pda_ata(stream_id: int) -> tuple[str | None, str | None]:
    """Look up the on-chain PDA + USDC ATA for a stream.

    Both values are written by `open_stream()` when the caller passes
    them in (the wallet adapter signs `open_payment_stream` on-chain
    and posts back the addresses via /mpp/streams). Returns (None, None)
    for legacy DB-only streams opened before this column existed.
    """
    conn = _db()
    try:
        row = conn.execute(
            "SELECT stream_pda, stream_usdc_ata FROM mpp_streams WHERE id = ?",
            (int(stream_id),),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return (None, None)
    return (row[0] or None, row[1] or None)


def _find_recent_attempt(
    stream_id: int,
    micro_usdc: int,
    now_ts: int,
) -> dict | None:
    """Return the most recent attempt row for this (stream, amount)
    within the recency window, or None."""
    cutoff = now_ts - _PENDING_RECENCY_SECS
    conn = _db()
    try:
        row = conn.execute(
            """
            SELECT id, tx_signature, debited_micro_usdc, success, error, ts
              FROM mpp_settle_attempts
             WHERE stream_id = ? AND requested_micro_usdc = ? AND ts >= ?
             ORDER BY ts DESC, id DESC
             LIMIT 1
            """,
            (int(stream_id), int(micro_usdc), cutoff),
        ).fetchone()
        if row is None:
            return None
        return {
            "id": row[0],
            "tx_signature": row[1],
            "debited_micro_usdc": row[2],
            "success": bool(row[3]),
            "error": row[4],
            "ts": row[5],
        }
    finally:
        conn.close()


def _record_settle_attempt(
    stream_id: int,
    requested_micro_usdc: int,
    ts: int,
    *,
    success: bool,
    debited: int,
    error: str | None = None,
    tx_signature: str | None = None,
) -> None:
    """Insert a row in `mpp_settle_attempts`. UNIQUE constraint on
    (stream_id, requested_micro_usdc, ts) means duplicate inserts at
    the same exact second are silently absorbed."""
    conn = _db()
    try:
        try:
            conn.execute(
                """
                INSERT INTO mpp_settle_attempts
                  (stream_id, requested_micro_usdc, tx_signature,
                   debited_micro_usdc, success, error, ts)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    int(stream_id),
                    int(requested_micro_usdc),
                    tx_signature,
                    int(debited),
                    1 if success else 0,
                    error,
                    int(ts),
                ),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            # Duplicate (same stream/amount/ts) — fine, the prior
            # row is the source of truth.
            pass
    finally:
        conn.close()


def _run_async_in_thread(coro):
    """Run an async coroutine on a fresh event loop in a worker
    thread and return the result. Used when settle_on_chain is
    invoked from inside a running event loop (FastAPI request
    handler) where asyncio.run() would raise."""
    import threading

    result: dict[str, object] = {}

    def runner() -> None:
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            result["v"] = loop.run_until_complete(coro)
        except Exception as e:  # noqa: BLE001
            result["e"] = e
        finally:
            loop.close()

    t = threading.Thread(target=runner, daemon=True)
    t.start()
    t.join(timeout=20.0)
    if "e" in result:
        raise result["e"]  # type: ignore[misc]
    if "v" not in result:
        raise TimeoutError("submit_mpp_settle did not finish in 20s")
    return result["v"]


# ─── public API ──────────────────────────────────────────────────────────────


def open_stream(
    user_id: str,
    agent_pubkey: str,
    agent_name: str,
    upstream: str,
    rate_per_token: int,
    rate_per_call: int,
    settlement_interval: int,
    stream_pda: str | None = None,
    stream_usdc_ata: str | None = None,
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
               settlement_interval_secs, status, opened_at, last_settled_at,
               stream_pda, stream_usdc_ata)
            VALUES (?,?,?,?,?,?,?, 'open', ?, ?, ?, ?)
            """,
            (
                user_id,
                agent_pubkey,
                agent_name or "",
                upstream,
                int(rate_per_call),
                int(rate_per_token),
                int(settlement_interval),
                now,
                now,
                stream_pda or None,
                stream_usdc_ata or None,
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
    user_id: str,
    stream_id: int,
    calls: int,
    tokens: int,
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

        added = int(tokens) * int(stream["rate_per_token_micro_usdc"]) + int(
            calls
        ) * int(stream["rate_per_call_micro_usdc"])
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
    conn: sqlite3.Connection,
    user_id: str,
    stream: dict,
    now: int,
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
            conn,
            user_id=user_id,
            stream=stream,
            kind="settle",
            micro_usdc=0,
            ts=now,
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
        conn,
        user_id=user_id,
        stream=stream,
        kind="settle",
        micro_usdc=pending,
        ts=now,
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
            conn,
            user_id=user_id,
            stream=stream,
            kind="close",
            ts=now,
        )
        conn.commit()
        stream["just_settled_micro_usdc"] = just_settled
        return stream
    finally:
        conn.close()


def record_tx_signature(
    user_id: str,
    stream_id: int,
    tx_signature: str,
    stream_pda: str | None = None,
    stream_usdc_ata: str | None = None,
) -> dict:
    """Persist the on-chain tx signature returned by the frontend wallet
    adapter after it signed+sent the `open_payment_stream` ix (or, later,
    `withdraw_agent_wallet`). Returns the updated stream row.

    Spec 10 Phase 10.5 wallet sign-off. The signature is opaque to us —
    we don't verify it against Solana RPC here (that's what
    /mpp/streams/{id}/settle does for settle ix's, and what x402
    payment-proof verification does for payments). The frontend already
    awaited `confirmTransaction(..., 'confirmed')` before calling this
    endpoint, so failing to land = failing to ever reach here.

    Idempotency: re-posting the same signature is a no-op. Posting a
    new signature for a stream that already has one OVERWRITES — see
    `_row_to_stream` docstring; withdraw is terminal so the open-sig
    is preserved in mpp_events anyway.

    Raises StreamNotFound if the stream id doesn't belong to user_id.
    """
    if not tx_signature or not tx_signature.strip():
        raise ValueError("tx_signature is required")
    sig = tx_signature.strip()
    conn = _db()
    try:
        # Owner check via _get_owned_stream — raises if foreign user_id.
        _get_owned_stream(conn, user_id, stream_id)
        # Build a dynamic UPDATE so callers who already wrote stream_pda /
        # stream_usdc_ata via open_stream don't clobber them with NULL.
        sets = ["tx_signature = ?"]
        vals: list = [sig]
        if stream_pda:
            sets.append("stream_pda = ?")
            vals.append(stream_pda.strip())
        if stream_usdc_ata:
            sets.append("stream_usdc_ata = ?")
            vals.append(stream_usdc_ata.strip())
        vals.extend([stream_id, user_id])
        conn.execute(
            f"UPDATE mpp_streams SET {', '.join(sets)} WHERE id = ? AND user_id = ?",
            tuple(vals),
        )
        stream = _get_owned_stream(conn, user_id, stream_id)
        conn.commit()
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
        streams_open = sum(1 for s in streams if s["status"] == "open")
        calls_total = sum(s["total_calls"] for s in streams)
        tokens_total = sum(s["total_tokens"] for s in streams)
        settled_micro = sum(s["settled_micro_usdc"] for s in streams)
        pending_micro = sum(s["pending_micro_usdc"] for s in streams)

        # The frontend prints these via `.toFixed(6)` — so usd, not micro.
        summary = {
            "streams_total": streams_total,
            "streams_open": streams_open,
            "calls_total": calls_total,
            "tokens_total": tokens_total,
            "settled_usd": round(settled_micro / 1_000_000, 6),
            "pending_usd": round(pending_micro / 1_000_000, 6),
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
