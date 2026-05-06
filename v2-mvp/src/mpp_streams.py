from __future__ import annotations
import asyncio
import logging
import sqlite3
import time
from pathlib import Path
import threading

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "data" / "mpp.db"

# How long an in-flight settle attempt is considered "pending"
_PENDING_RECENCY_SECS = 60

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
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            agent_pubkey TEXT NOT NULL,
            agent_name TEXT NOT NULL DEFAULT '',
            upstream TEXT NOT NULL,
            rate_per_token_micro_usdc INTEGER NOT NULL DEFAULT 0,
            rate_per_call_micro_usdc INTEGER NOT NULL DEFAULT 0,
            settlement_interval_secs INTEGER NOT NULL DEFAULT 60,
            status TEXT NOT NULL DEFAULT 'open',
            opened_at INTEGER NOT NULL,
            last_settled_at INTEGER NOT NULL,
            closed_at INTEGER,
            total_calls INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            pending_micro_usdc INTEGER NOT NULL DEFAULT 0,
            settled_micro_usdc INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_streams_user ON mpp_streams (user_id, opened_at DESC);
        CREATE INDEX IF NOT EXISTS idx_mpp_streams_status ON mpp_streams (user_id, status);

        CREATE TABLE IF NOT EXISTS mpp_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            stream_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            calls INTEGER NOT NULL DEFAULT 0,
            tokens INTEGER NOT NULL DEFAULT 0,
            micro_usdc INTEGER NOT NULL DEFAULT 0,
            cost_usd REAL NOT NULL DEFAULT 0.0,
            ts INTEGER NOT NULL,
            upstream TEXT NOT NULL,
            agent_name TEXT NOT NULL,
            agent_pubkey TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_events_user ON mpp_events (user_id, ts DESC);
        CREATE INDEX IF NOT EXISTS idx_mpp_events_stream ON mpp_events (stream_id, ts DESC);

        -- Spec 10 Phase 10.4-real idempotency log
        CREATE TABLE IF NOT EXISTS mpp_settle_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stream_id INTEGER NOT NULL,
            requested_micro_usdc INTEGER NOT NULL,
            tx_signature TEXT,
            debited_micro_usdc INTEGER NOT NULL DEFAULT 0,
            success INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            ts INTEGER NOT NULL,
            UNIQUE (stream_id, requested_micro_usdc, ts)
        );
        CREATE INDEX IF NOT EXISTS idx_mpp_settle_attempts_stream ON mpp_settle_attempts (stream_id, ts DESC);
    """)
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
            user_id, stream_id, kind, int(calls), int(tokens),
            int(micro_usdc), cost_usd, int(time.time()),
            upstream, agent_name, agent_pubkey
        ),
    )


# ─── On-chain settle logic (spec 10.4-real) ─────────────────────────────────
_PDA_MISSING_WARNED: dict[int, bool] = {}


def settle_on_chain(stream_id: int, micro_usdc: int) -> int:
    """Submit real mpp_settle ix to Solana, with graceful stub fallback."""
    if micro_usdc <= 0:
        return 0

    try:
        from . import mpp_onchain
    except ImportError:
        try:
            import mpp_onchain  # type: ignore
        except ImportError as e:
            logger.warning("mpp_onchain import failed: %s — using stub", e)
            return 0

    config = mpp_onchain.load_mpp_config()
    if config is None:
        return 0

    pda, ata = _get_stream_pda_ata(stream_id)
    if not (pda and ata):
        if not _PDA_MISSING_WARNED.get(stream_id):
            logger.warning(
                "mpp_settle stream %s: PDA/ATA not opened on-chain yet — stub fallback",
                stream_id
            )
            _PDA_MISSING_WARNED[stream_id] = True
        return 0

    # Idempotency
    now_ts = int(time.time())
    prior = _find_recent_attempt(stream_id, micro_usdc, now_ts)
    if prior is not None:
        return int(prior.get("debited_micro_usdc") or 0)

    try:
        ix = mpp_onchain.build_mpp_settle_ix(config, pda, ata, micro_usdc)
    except Exception as e:
        logger.warning("build_mpp_settle_ix failed: %s", e)
        _record_settle_attempt(stream_id, micro_usdc, now_ts, success=False, debited=0, error=str(e))
        return 0

    # Run async submit
    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None

    try:
        if running_loop is not None:
            debited = _run_async_in_thread(mpp_onchain.submit_mpp_settle(config, ix))
        else:
            debited = asyncio.run(mpp_onchain.submit_mpp_settle(config, ix))
    except Exception as e:
        logger.warning("submit_mpp_settle failed: %s", e)
        _record_settle_attempt(stream_id, micro_usdc, now_ts, success=False, debited=0, error=str(e))
        return 0

    _record_settle_attempt(stream_id, micro_usdc, now_ts, success=True, debited=int(debited))
    return int(debited)


def _get_stream_pda_ata(stream_id: int) -> tuple[str | None, str | None]:
    """TODO: 后面接上 on-chain open_stream 后在这里查询 PDA/ATA"""
    return (None, None)  # 当前仍为 DB-only 模式


def _find_recent_attempt(stream_id: int, micro_usdc: int, now_ts: int) -> dict | None:
    cutoff = now_ts - _PENDING_RECENCY_SECS
    conn = _db()
    try:
        row = conn.execute(
            """
            SELECT id, tx_signature, debited_micro_usdc, success, error, ts
            FROM mpp_settle_attempts
            WHERE stream_id = ? AND requested_micro_usdc = ? AND ts >= ?
            ORDER BY ts DESC, id DESC LIMIT 1
            """,
            (stream_id, micro_usdc, cutoff)
        ).fetchone()
        if not row:
            return None
        return {
            "id": row[0], "tx_signature": row[1], "debited_micro_usdc": row[2],
            "success": bool(row[3]), "error": row[4], "ts": row[5]
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
    conn = _db()
    try:
        conn.execute(
            """
            INSERT INTO mpp_settle_attempts
              (stream_id, requested_micro_usdc, tx_signature,
               debited_micro_usdc, success, error, ts)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (stream_id, requested_micro_usdc, tx_signature,
             debited, 1 if success else 0, error, ts)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        pass  # duplicate idempotency key is fine
    finally:
        conn.close()


def _run_async_in_thread(coro):
    """在 FastAPI 同步上下文里运行 async 函数"""
    result: dict = {}
    def runner():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result["v"] = loop.run_until_complete(coro)
        except Exception as e:
            result["e"] = e
        finally:
            loop.close()
    t = threading.Thread(target=runner, daemon=True)
    t.start()
    t.join(timeout=20.0)
    if "e" in result:
        raise result["e"]
    return result["v"]


# ─── Public APIs ─────────────────────────────────────────────────────────────
def _summary(streams: list[dict]) -> dict:
    return {
        "streams_total": len(streams),
        "streams_open": sum(1 for s in streams if s["status"] == "open"),
        "tokens_total": sum(s["total_tokens"] for s in streams),
        "calls_total": sum(s["total_calls"] for s in streams),
        "settled_usd": round(sum(s["settled_micro_usdc"] for s in streams) / 1_000_000, 6),
        "pending_usd": round(sum(s["pending_micro_usdc"] for s in streams) / 1_000_000, 6),
    }


def open_stream(...) -> dict:          # 保持你原来的实现
    ...  # （把你原来的 open_stream 函数粘贴进来）

def get_stream(...) -> dict:          # 保持原来实现
    ...

def list_streams(...) -> dict:
    ...

def list_events(...) -> dict:
    ...

def record_usage(...) -> tuple[dict, int]:
    ...  # 保持原来逻辑（里面已经会调用 settle_on_chain 如果需要）

def settle_stream(...) -> tuple[dict, int]:
    ...

def close_stream(...) -> tuple[dict, int]:
    ...