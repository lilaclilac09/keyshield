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
import sqlite3
import time
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
    user_id:       str,
    upstream:      str,
    key_type:      str,
    method:        str,
    path:          str,
    tokens_in:     int,
    tokens_out:    int,
    cost_usd:      float,
    latency_ms:    float,
    status_code:   int,
    force_debit:   bool = False,
    debit_user_id: str | None = None,
) -> None:
    """
    Record one proxy call. The audit row always lives under `user_id`
    (the vault owner) so the dashboard can show "calls against my key".
    The debit hits `debit_user_id` when given — that's how an agent
    pays for a call against the owner's vault without touching the
    owner's balance. Defaults to debiting `user_id` when None.

    Deducts from balance when:
      - key_type == 'platform' (legacy: KeyShield-supplied key, user pays us), OR
      - force_debit (caller has signalled "owner opted into pricing for this call").

    `force_debit` lets the proxy debit even on self-custodian calls when the
    owner has set a per-upstream price — the cost passed in already reflects
    that price, no re-derivation needed.
    """
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

        debits = (key_type == "platform") or force_debit
        if debits and cost_usd > 0:
            payer = debit_user_id or user_id
            _ensure_balance(conn, payer)
            conn.execute("""
                UPDATE user_balance
                SET balance_usd = balance_usd - ?,
                    updated_at  = ?
                WHERE user_id = ?
            """, (cost_usd, int(time.time()), payer))
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
