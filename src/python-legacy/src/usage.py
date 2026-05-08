"""
usage.py — per-proxy-call usage logging + balance tracking

Table: usage_log
  id, user_id, upstream, key_type, method, path,
  tokens_in, tokens_out, cost_usd, latency_ms, status_code, ts

Table: user_balance
  user_id, balance_usd, updated_at

key_type: 'self_custodian' | 'platform'
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "usage.db"

# Cost per 1k tokens by upstream (USD, conservative averages)
COST_PER_1K: dict[str, tuple[float, float]] = {
    # (input_per_1k, output_per_1k)
    "openai":    (0.003,    0.012),
    "anthropic": (0.003,    0.015),
    "groq":      (0.0006,   0.0008),
    "mistral":   (0.0002,   0.0006),
    "cohere":    (0.001,    0.002),
    # Non-AI: no per-token cost — tiny flat rate per call when using platform key
    "helius":    (0.0,      0.0),
    "0x":        (0.0,      0.0),
    "titan":     (0.0,      0.0),
    "pyth":      (0.0,      0.0),
    "alchemy":   (0.0,      0.0),
}

# Flat per-call cost for non-AI upstreams when platform key is used
FLAT_COST_PER_CALL: dict[str, float] = {
    "helius":  0.00001,   # $0.01 per 1000 RPC calls
    "alchemy": 0.00001,
}

# Free credit for new users
FREE_CREDIT_USD = 0.10

# ── Retention policy (env-configurable) ──────────────────────────────────────
_LOG_RETENTION_DAYS = int(os.getenv("KS_LOG_RETENTION_DAYS", "90"))
_LOG_RETENTION_MAX_ROWS = int(os.getenv("KS_LOG_RETENTION_MAX_ROWS", "100000"))


# ── DB setup ──────────────────────────────────────────────────────────────────

def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS usage_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT    NOT NULL,
            upstream    TEXT    NOT NULL,
            key_type    TEXT    NOT NULL,
            method      TEXT    NOT NULL DEFAULT '',
            path        TEXT    NOT NULL DEFAULT '',
            tokens_in   INTEGER NOT NULL DEFAULT 0,
            tokens_out  INTEGER NOT NULL DEFAULT 0,
            cost_usd    REAL    NOT NULL DEFAULT 0.0,
            latency_ms  REAL    NOT NULL DEFAULT 0.0,
            status_code INTEGER NOT NULL DEFAULT 0,
            ts          INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_user_ts ON usage_log (user_id, ts DESC);

        CREATE TABLE IF NOT EXISTS user_balance (
            user_id     TEXT PRIMARY KEY,
            balance_usd REAL    NOT NULL DEFAULT 0.0,
            updated_at  INTEGER NOT NULL
        );
        -- One row per credited Solana payment. tx_signature is the
        -- on-chain identifier and PRIMARY KEY enforces idempotency:
        -- a second /billing/topup-solana with the same signature
        -- raises IntegrityError, which the route maps to 409.
        CREATE TABLE IF NOT EXISTS topup_tx (
            tx_signature TEXT    PRIMARY KEY,
            user_id      TEXT    NOT NULL,
            chain        TEXT    NOT NULL,
            asset        TEXT    NOT NULL,
            amount_atoms INTEGER NOT NULL,
            amount_usd   REAL    NOT NULL,
            credited_at  INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_topup_user
            ON topup_tx (user_id, credited_at DESC);
    """)
    conn.commit()
    return conn


# ── Token extraction ──────────────────────────────────────────────────────────

def extract_token_usage(upstream: str, content: bytes) -> tuple[int, int, float]:
    """
    Parse proxy response body → (tokens_in, tokens_out, cost_usd).
    Handles OpenAI-compat (prompt_tokens / completion_tokens)
    and Anthropic (input_tokens / output_tokens).
    """
    if not content:
        return 0, 0, _flat_cost(upstream)

    try:
        data = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return 0, 0, _flat_cost(upstream)

    tok_in, tok_out = 0, 0
    usage = data.get("usage") if isinstance(data, dict) else None
    if isinstance(usage, dict):
        tok_in  = (usage.get("prompt_tokens")  or usage.get("input_tokens")  or 0)
        tok_out = (usage.get("completion_tokens") or usage.get("output_tokens") or 0)

    in_rate, out_rate = COST_PER_1K.get(upstream, (0.0, 0.0))
    cost = tok_in / 1000 * in_rate + tok_out / 1000 * out_rate

    if cost == 0.0:
        cost = _flat_cost(upstream)

    return tok_in, tok_out, cost


def _flat_cost(upstream: str) -> float:
    return FLAT_COST_PER_CALL.get(upstream, 0.0)


# ── Core functions ────────────────────────────────────────────────────────────

def log_call(
    user_id:     str,
    upstream:    str,
    key_type:    str,
    method:      str,
    path:        str,
    tokens_in:   int,
    tokens_out:  int,
    cost_usd:    float,
    latency_ms:  float,
    status_code: int,
) -> None:
    """Record one proxy call. Also deducts from balance when platform key is used."""
    conn = _db()
    try:
        conn.execute("""
            INSERT INTO usage_log
              (user_id, upstream, key_type, method, path,
               tokens_in, tokens_out, cost_usd, latency_ms, status_code, ts)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """, (user_id, upstream, key_type, method, path,
              tokens_in, tokens_out, cost_usd, latency_ms, status_code,
              int(time.time())))
        conn.commit()

        # Deduct from prepaid balance when using platform key
        if key_type == "platform" and cost_usd > 0:
            _ensure_balance(conn, user_id)
            conn.execute("""
                UPDATE user_balance
                SET balance_usd = balance_usd - ?,
                    updated_at  = ?
                WHERE user_id = ?
            """, (cost_usd, int(time.time()), user_id))
            conn.commit()
    finally:
        conn.close()


def get_stats(user_id: str) -> dict:
    """Per-upstream usage aggregates for the dashboard."""
    conn = _db()
    try:
        rows = conn.execute("""
            SELECT
                upstream,
                key_type,
                COUNT(*)          AS calls,
                SUM(tokens_in)    AS total_in,
                SUM(tokens_out)   AS total_out,
                SUM(cost_usd)     AS total_cost,
                ROUND(AVG(latency_ms), 1) AS avg_latency,
                MAX(ts)           AS last_ts
            FROM usage_log
            WHERE user_id = ?
            GROUP BY upstream, key_type
            ORDER BY last_ts DESC
        """, (user_id,)).fetchall()

        return {
            "stats": [
                {
                    "upstream":    r[0],
                    "key_type":    r[1],
                    "calls":       r[2],
                    "tokens_in":   r[3] or 0,
                    "tokens_out":  r[4] or 0,
                    "cost_usd":    round(r[5] or 0, 6),
                    "avg_latency": r[6] or 0,
                    "last_used":   r[7],
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


def get_history(user_id: str, limit: int = 50) -> list[dict]:
    """Recent proxy calls for the Activity feed."""
    conn = _db()
    try:
        rows = conn.execute("""
            SELECT id, upstream, key_type, method, path,
                   tokens_in, tokens_out, cost_usd, latency_ms, status_code, ts
            FROM usage_log
            WHERE user_id = ?
            ORDER BY ts DESC
            LIMIT ?
        """, (user_id, limit)).fetchall()

        return [
            {
                "id":          r[0],
                "upstream":    r[1],
                "key_type":    r[2],
                "method":      r[3],
                "path":        r[4],
                "tokens_in":   r[5],
                "tokens_out":  r[6],
                "cost_usd":    round(r[7], 6),
                "latency_ms":  round(r[8], 1),
                "status_code": r[9],
                "ts":          r[10],
            }
            for r in rows
        ]
    finally:
        conn.close()


def get_balance(user_id: str) -> float:
    """Return user's prepaid credit balance in USD."""
    conn = _db()
    try:
        _ensure_balance(conn, user_id)
        row = conn.execute(
            "SELECT balance_usd FROM user_balance WHERE user_id = ?", (user_id,)
        ).fetchone()
        return round(row[0], 6) if row else FREE_CREDIT_USD
    finally:
        conn.close()


def topup(user_id: str, amount_usd: float) -> float:
    """Add prepaid credit. Returns new balance."""
    conn = _db()
    try:
        _ensure_balance(conn, user_id)
        conn.execute("""
            UPDATE user_balance
            SET balance_usd = balance_usd + ?,
                updated_at  = ?
            WHERE user_id = ?
        """, (amount_usd, int(time.time()), user_id))
        conn.commit()
        row = conn.execute(
            "SELECT balance_usd FROM user_balance WHERE user_id = ?", (user_id,)
        ).fetchone()
        return round(row[0], 6) if row else 0.0
    finally:
        conn.close()


def _ensure_balance(conn: sqlite3.Connection, user_id: str) -> None:
    conn.execute("""
        INSERT OR IGNORE INTO user_balance (user_id, balance_usd, updated_at)
        VALUES (?, ?, ?)
    """, (user_id, FREE_CREDIT_USD, int(time.time())))
    conn.commit()


# ── Solana topup with idempotency ────────────────────────────────────────────


class TopupAlreadyCredited(Exception):
    """Raised when the same tx_signature is submitted twice."""


def credit_solana_topup(
    user_id:      str,
    tx_signature: str,
    asset:        str,           # 'SOL' or 'USDC'
    amount_atoms: int,
    amount_usd:   float,
) -> float:
    """Insert into topup_tx (idempotent on PRIMARY KEY) AND credit the
    user's balance, in one transaction. Returns the new balance.

    Raises TopupAlreadyCredited if the tx_signature was already used.
    """
    if amount_usd <= 0:
        raise ValueError("amount_usd must be > 0")

    conn = _db()
    try:
        _ensure_balance(conn, user_id)
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute("""
                INSERT INTO topup_tx
                  (tx_signature, user_id, chain, asset, amount_atoms,
                   amount_usd, credited_at)
                VALUES (?, ?, 'solana', ?, ?, ?, ?)
            """, (
                tx_signature, user_id, asset, amount_atoms, amount_usd,
                int(time.time()),
            ))
            conn.execute("""
                UPDATE user_balance
                SET balance_usd = balance_usd + ?,
                    updated_at  = ?
                WHERE user_id = ?
            """, (amount_usd, int(time.time()), user_id))
            conn.commit()
        except sqlite3.IntegrityError:
            conn.rollback()
            raise TopupAlreadyCredited(tx_signature)

        row = conn.execute(
            "SELECT balance_usd FROM user_balance WHERE user_id = ?", (user_id,)
        ).fetchone()
        return round(row[0], 6) if row else 0.0
    finally:
        conn.close()


def purge_user(user_id: str) -> dict:
    """
    Delete all usage history, balance row, and topup_tx rows for a user.
    Used by /auth/delete-account during cascade.

    Returns counts so callers can assert / log how much was wiped.
    NOTE: topup_tx is also wiped; this is intentional. The PRIMARY KEY on
    tx_signature was a soft replay guard for credit, but the auth-level
    soft-delete on the user row (in session.py) is the durable replay
    guard now.
    """
    conn = _db()
    try:
        usage_n  = conn.execute("DELETE FROM usage_log    WHERE user_id = ?", (user_id,)).rowcount or 0
        balance_n = conn.execute("DELETE FROM user_balance WHERE user_id = ?", (user_id,)).rowcount or 0
        topup_n  = conn.execute("DELETE FROM topup_tx     WHERE user_id = ?", (user_id,)).rowcount or 0
        conn.commit()
        return {"usage_log": usage_n, "user_balance": balance_n, "topup_tx": topup_n}
    finally:
        conn.close()


def list_topups(user_id: str, limit: int = 20) -> list[dict]:
    """User's recent Solana topups, newest first."""
    conn = _db()
    try:
        rows = conn.execute("""
            SELECT tx_signature, chain, asset, amount_atoms, amount_usd, credited_at
            FROM topup_tx
            WHERE user_id = ?
            ORDER BY credited_at DESC
            LIMIT ?
        """, (user_id, limit)).fetchall()
        return [
            {
                "tx_signature": r[0],
                "chain":        r[1],
                "asset":        r[2],
                "amount_atoms": r[3],
                "amount_usd":   round(r[4], 6),
                "credited_at":  r[5],
            }
            for r in rows
        ]
    finally:
        conn.close()


# ── Retention policy ──────────────────────────────────────────────────────────

def purge_old_logs(
    *,
    retention_days: int = _LOG_RETENTION_DAYS,
    max_rows: int = _LOG_RETENTION_MAX_ROWS,
) -> dict:
    """
    Delete usage_log rows older than retention_days AND trim to max_rows
    (keeping the most recent). Returns {"deleted_by_age": N, "deleted_by_cap": M}.
    Run periodically — called from the FastAPI lifespan background task.
    """
    conn = _db()
    try:
        cutoff_ts = int(time.time()) - retention_days * 86400
        age_result = conn.execute(
            "DELETE FROM usage_log WHERE ts < ?", (cutoff_ts,)
        )
        deleted_by_age = age_result.rowcount or 0
        conn.commit()

        cap_result = conn.execute("""
            DELETE FROM usage_log
            WHERE id NOT IN (
                SELECT id FROM usage_log ORDER BY ts DESC LIMIT ?
            )
        """, (max_rows,))
        deleted_by_cap = cap_result.rowcount or 0
        conn.commit()

        return {"deleted_by_age": deleted_by_age, "deleted_by_cap": deleted_by_cap}
    finally:
        conn.close()


def get_retention_stats() -> dict:
    """Return {"total_rows": N, "oldest_entry": ISO8601 | None, "retention_days": N, "max_rows": N}"""
    conn = _db()
    try:
        row = conn.execute(
            "SELECT COUNT(*), MIN(ts) FROM usage_log"
        ).fetchone()
        total_rows = row[0] or 0
        min_ts = row[1]
        oldest_entry: str | None = None
        if min_ts is not None:
            oldest_entry = datetime.fromtimestamp(min_ts, tz=timezone.utc).isoformat()
        return {
            "total_rows":    total_rows,
            "oldest_entry":  oldest_entry,
            "retention_days": _LOG_RETENTION_DAYS,
            "max_rows":      _LOG_RETENTION_MAX_ROWS,
        }
    finally:
        conn.close()
