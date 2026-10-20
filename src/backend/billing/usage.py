"""
v2-mvp/src/usage.py — Per-call usage logging + balance tracking (migrated from python-legacy)

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
    "openai": (0.003, 0.012),
    "anthropic": (0.003, 0.015),
    "groq": (0.0006, 0.0008),
    "mistral": (0.0002, 0.0006),
    "cohere": (0.001, 0.002),
    # Non-AI: no per-token cost — tiny flat rate per call when using platform key
    "helius": (0.0, 0.0),
    "0x": (0.0, 0.0),
    "titan": (0.0, 0.0),
    "pyth": (0.0, 0.0),
    "alchemy": (0.0, 0.0),
    "openrouter": (0.0, 0.0),
    "ollama": (0.0, 0.0),
}

# Flat per-call cost for non-AI upstreams when platform key is used
FLAT_COST_PER_CALL: dict[str, float] = {
    "helius": 0.00001,  # $0.01 per 1000 RPC calls
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
            key_type    TEXT    NOT NULL DEFAULT 'platform',
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
    _migrate_attribution(conn)
    conn.commit()
    return conn


# Columns added for per-agent attribution. Older rows keep the defaults and
# show up as "unattributed" in /usage/agents.
_ATTRIBUTION_COLUMNS = {
    "actor": "TEXT NOT NULL DEFAULT ''",  # owner | agent | token | anonymous ('' = before tracking)
    "agent_id": "INTEGER",
    "token_ref": "TEXT NOT NULL DEFAULT ''",  # last 8 chars, same id the Sessions page shows
    "model": "TEXT NOT NULL DEFAULT ''",
}


def _migrate_attribution(conn: sqlite3.Connection) -> None:
    have = {r[1] for r in conn.execute("PRAGMA table_info(usage_log)").fetchall()}
    for name, decl in _ATTRIBUTION_COLUMNS.items():
        if name not in have:
            conn.execute(f"ALTER TABLE usage_log ADD COLUMN {name} {decl}")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_usage_user_actor_ts ON usage_log (user_id, actor, agent_id, ts DESC)"
    )


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
        tok_in = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
        tok_out = usage.get("completion_tokens") or usage.get("output_tokens") or 0

    in_rate, out_rate = COST_PER_1K.get(upstream, (0.0, 0.0))
    cost = tok_in / 1000 * in_rate + tok_out / 1000 * out_rate

    if cost == 0.0:
        cost = _flat_cost(upstream)

    return tok_in, tok_out, cost


def _flat_cost(upstream: str) -> float:
    return FLAT_COST_PER_CALL.get(upstream, 0.0)


# ── Core functions ────────────────────────────────────────────────────────────


def log_call(
    user_id: str,
    upstream: str,
    key_type: str,
    method: str = "",
    path: str = "",
    tokens_in: int = 0,
    tokens_out: int = 0,
    cost_usd: float = 0.0,
    latency_ms: float = 0.0,
    status_code: int = 0,
    actor: str = "",
    agent_id: int | None = None,
    token_ref: str = "",
    model: str = "",
) -> None:
    """Record one proxy call. Also deducts from balance when platform key is used.

    actor / agent_id / token_ref say who made the call (see attribution()).
    """
    conn = _db()
    try:
        conn.execute(
            """
            INSERT INTO usage_log
              (user_id, upstream, key_type, method, path,
               tokens_in, tokens_out, cost_usd, latency_ms, status_code, ts,
               actor, agent_id, token_ref, model)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
            (
                user_id,
                upstream,
                key_type,
                method,
                path,
                tokens_in,
                tokens_out,
                cost_usd,
                latency_ms,
                status_code,
                int(time.time()),
                actor or "",
                agent_id,
                (token_ref or "")[-8:],
                (model or "")[:120],
            ),
        )
        conn.commit()

        # Deduct from prepaid balance when using platform key
        if key_type == "platform" and cost_usd > 0:
            _ensure_balance(conn, user_id)
            conn.execute(
                """
                UPDATE user_balance
                SET balance_usd = balance_usd - ?,
                    updated_at  = ?
                WHERE user_id = ?
            """,
                (cost_usd, int(time.time()), user_id),
            )
            conn.commit()
    finally:
        conn.close()


def get_stats(user_id: str) -> dict:
    """Per-upstream usage aggregates for the dashboard."""
    conn = _db()
    try:
        rows = conn.execute(
            """
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
        """,
            (user_id,),
        ).fetchall()

        return {
            "stats": [
                {
                    "upstream": r[0],
                    "key_type": r[1],
                    "calls": r[2],
                    "tokens_in": r[3] or 0,
                    "tokens_out": r[4] or 0,
                    "cost_usd": round(r[5] or 0, 6),
                    "avg_latency": r[6] or 0,
                    "last_used": r[7],
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
        rows = conn.execute(
            """
            SELECT id, upstream, key_type, method, path,
                   tokens_in, tokens_out, cost_usd, latency_ms, status_code, ts
            FROM usage_log
            WHERE user_id = ?
            ORDER BY ts DESC
            LIMIT ?
        """,
            (user_id, limit),
        ).fetchall()

        return [
            {
                "id": r[0],
                "upstream": r[1],
                "key_type": r[2],
                "method": r[3],
                "path": r[4],
                "tokens_in": r[5],
                "tokens_out": r[6],
                "cost_usd": round(r[7], 6),
                "latency_ms": round(r[8], 1),
                "status_code": r[9],
                "ts": r[10],
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
        conn.execute(
            """
            UPDATE user_balance
            SET balance_usd = balance_usd + ?,
                updated_at  = ?
            WHERE user_id = ?
        """,
            (amount_usd, int(time.time()), user_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT balance_usd FROM user_balance WHERE user_id = ?", (user_id,)
        ).fetchone()
        return round(row[0], 6) if row else 0.0
    finally:
        conn.close()


def _ensure_balance(conn: sqlite3.Connection, user_id: str) -> None:
    conn.execute(
        """
        INSERT OR IGNORE INTO user_balance (user_id, balance_usd, updated_at)
        VALUES (?, ?, ?)
    """,
        (user_id, FREE_CREDIT_USD, int(time.time())),
    )
    conn.commit()


# ── Solana topup with idempotency ────────────────────────────────────────────


class TopupAlreadyCredited(Exception):
    """Raised when the same tx_signature is submitted twice."""


def credit_solana_topup(
    user_id: str,
    tx_signature: str,
    asset: str = "SOL",  # 'SOL' or 'USDC'
    amount_atoms: int = 0,
    amount_usd: float = 0.0,
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
            conn.execute(
                """
                INSERT INTO topup_tx
                  (tx_signature, user_id, chain, asset, amount_atoms,
                   amount_usd, credited_at)
                VALUES (?, ?, 'solana', ?, ?, ?, ?)
            """,
                (
                    tx_signature,
                    user_id,
                    asset,
                    amount_atoms,
                    amount_usd,
                    int(time.time()),
                ),
            )
            conn.execute(
                """
                UPDATE user_balance
                SET balance_usd = balance_usd + ?,
                    updated_at  = ?
                WHERE user_id = ?
            """,
                (amount_usd, int(time.time()), user_id),
            )
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
    """
    conn = _db()
    try:
        usage_n = (
            conn.execute("DELETE FROM usage_log    WHERE user_id = ?", (user_id,)).rowcount or 0
        )
        balance_n = (
            conn.execute("DELETE FROM user_balance WHERE user_id = ?", (user_id,)).rowcount or 0
        )
        topup_n = (
            conn.execute("DELETE FROM topup_tx     WHERE user_id = ?", (user_id,)).rowcount or 0
        )
        conn.commit()
        return {"usage_log": usage_n, "user_balance": balance_n, "topup_tx": topup_n}
    finally:
        conn.close()


def list_topups(user_id: str, limit: int = 20) -> list[dict]:
    """User's recent Solana topups, newest first."""
    conn = _db()
    try:
        rows = conn.execute(
            """
            SELECT tx_signature, chain, asset, amount_atoms, amount_usd, credited_at
            FROM topup_tx
            WHERE user_id = ?
            ORDER BY credited_at DESC
            LIMIT ?
        """,
            (user_id, limit),
        ).fetchall()
        return [
            {
                "tx_signature": r[0],
                "chain": r[1],
                "asset": r[2],
                "amount_atoms": r[3],
                "amount_usd": round(r[4], 6),
                "credited_at": r[5],
            }
            for r in rows
        ]
    finally:
        conn.close()


# ── Attribution + per-agent views ─────────────────────────────────────────────


def attribution(sess: dict | None, token: str | None) -> dict:
    """Who made a proxy call, from the validated session. Never the token itself."""
    if not sess:
        return {"actor": "anonymous", "agent_id": None, "token_ref": ""}
    ref = (token or "")[-8:]
    agent_id = sess.get("agent_id")
    if agent_id is not None:
        return {"actor": "agent", "agent_id": int(agent_id), "token_ref": ref}
    if sess.get("scope") == "proxy":
        return {"actor": "token", "agent_id": None, "token_ref": ref}
    return {"actor": "owner", "agent_id": None, "token_ref": ref}


def extract_model(request_body: bytes, content: bytes | None = None) -> str:
    """Model name from the request JSON (or the response JSON as a fallback)."""
    for raw in (request_body, content):
        if not raw or len(raw) > 2_000_000:
            continue
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
            continue
        if isinstance(data, dict) and isinstance(data.get("model"), str):
            return data["model"][:120]
    return ""


_DAY = 86400


def _bucket_where(bucket: str) -> tuple[str, list]:
    """SQL filter for one bucket: agent:<id> | token:<ref> | tokens | owner | unattributed | all."""
    if bucket.startswith("agent:"):
        try:
            return "actor = 'agent' AND agent_id = ?", [int(bucket[6:])]
        except ValueError:
            return "0", []
    if bucket.startswith("token:"):
        return "actor = 'token' AND token_ref = ?", [bucket[6:][-8:]]
    if bucket == "tokens":
        return "actor = 'token'", []
    if bucket == "owner":
        return "actor IN ('owner', 'anonymous')", []
    if bucket == "unattributed":
        return "actor = ''", []
    return "1", []


def agent_usage(user_id: str, agents: list[dict], days: int = 30, now: int | None = None) -> dict:
    """Per-agent (and per other caller) calls, errors, cost, last call, daily series."""
    now = int(now or time.time())
    days = max(1, min(int(days), 90))
    since = (now // _DAY - days + 1) * _DAY
    conn = _db()
    try:
        rows = conn.execute(
            """
            SELECT actor, agent_id, token_ref,
                   COUNT(*), SUM(CASE WHEN status_code >= 400 OR status_code = 0 THEN 1 ELSE 0 END),
                   SUM(cost_usd), MAX(ts), ROUND(AVG(latency_ms), 1)
            FROM usage_log WHERE user_id = ?
            GROUP BY actor, agent_id, token_ref
        """,
            (user_id,),
        ).fetchall()
        daily = conn.execute(
            """
            SELECT actor, agent_id, token_ref, ts / ? AS d, COUNT(*), SUM(cost_usd)
            FROM usage_log WHERE user_id = ? AND ts >= ?
            GROUP BY actor, agent_id, token_ref, d
        """,
            (_DAY, user_id, since),
        ).fetchall()
        first_attr = conn.execute(
            "SELECT MIN(ts) FROM usage_log WHERE user_id = ? AND actor != ''", (user_id,)
        ).fetchone()[0]
    finally:
        conn.close()

    def key_of(actor, agent_id, token_ref):
        if actor == "agent":
            return f"agent:{agent_id}"
        if actor == "token":
            return f"token:{token_ref}"
        if actor in ("owner", "anonymous"):
            return "owner"
        return "unattributed"

    buckets: dict[str, dict] = {}

    def bucket(key: str, **meta) -> dict:
        b = buckets.get(key)
        if b is None:
            b = buckets[key] = {
                "key": key,
                "calls": 0,
                "errors": 0,
                "cost_usd": 0.0,
                "last_ts": None,
                "avg_latency_ms": None,
                "daily": {},
                **meta,
            }
        return b

    for a in agents:
        bucket(
            f"agent:{a['id']}",
            kind="agent",
            agent_id=a["id"],
            name=a.get("name") or "agent",
            pubkey_b58=a.get("pubkey_b58"),
            created_at=a.get("created_at"),
            registered=True,
        )
    for actor, agent_id, token_ref, calls, errors, cost, last_ts, avg_lat in rows:
        key = key_of(actor, agent_id, token_ref)
        if key.startswith("agent:"):
            b = bucket(
                key, kind="agent", agent_id=agent_id, name=f"agent {agent_id}", registered=False
            )
        elif key.startswith("token:"):
            b = bucket(key, kind="token", name=f"token …{token_ref}", token_ref=token_ref)
        elif key == "owner":
            b = bucket(key, kind="owner", name="You (owner sessions)")
        else:
            b = bucket(key, kind="unattributed", name="Before per-agent tracking")
        prev_calls = b["calls"]
        b["calls"] += int(calls or 0)
        b["errors"] += int(errors or 0)
        b["cost_usd"] += float(cost or 0)
        b["last_ts"] = max(b["last_ts"] or 0, int(last_ts or 0)) or None
        if avg_lat is not None and calls:
            if b["avg_latency_ms"] is None or not prev_calls:
                b["avg_latency_ms"] = float(avg_lat)
            else:
                b["avg_latency_ms"] = round(
                    (b["avg_latency_ms"] * prev_calls + float(avg_lat) * calls)
                    / (prev_calls + calls),
                    1,
                )
    for actor, agent_id, token_ref, d, calls, cost in daily:
        b = buckets.get(key_of(actor, agent_id, token_ref))
        if b is None:
            continue
        slot = b["daily"].setdefault(int(d), [0, 0.0])
        slot[0] += int(calls or 0)
        slot[1] += float(cost or 0)

    first_day = since // _DAY
    out = []
    for b in buckets.values():
        series = b.pop("daily")
        b["cost_usd"] = round(b["cost_usd"], 6)
        b["daily"] = [
            {
                "day": time.strftime("%Y-%m-%d", time.gmtime((first_day + i) * _DAY)),
                "calls": series.get(first_day + i, [0, 0.0])[0],
                "cost_usd": round(series.get(first_day + i, [0, 0.0])[1], 6),
            }
            for i in range(days)
        ]
        out.append(b)
    order = {"agent": 0, "token": 1, "owner": 2, "unattributed": 3}
    out.sort(key=lambda b: (order.get(b["kind"], 9), -(b["last_ts"] or 0), str(b.get("name"))))
    return {"days": days, "since_ts": since, "tracking_since_ts": first_attr, "callers": out}


def list_calls(
    user_id: str,
    bucket: str = "all",
    upstream: str = "",
    status: str = "",
    since_ts: int | None = None,
    until_ts: int | None = None,
    before_id: int | None = None,
    limit: int = 50,
) -> dict:
    """One page of calls, newest first, keyset-paginated by id."""
    limit = max(1, min(int(limit), 200))
    where, args = _bucket_where(bucket)
    clauses = ["user_id = ?", f"({where})"]
    params: list = [user_id, *args]
    if upstream:
        clauses.append("upstream = ?")
        params.append(upstream)
    if status == "ok":
        clauses.append("status_code BETWEEN 200 AND 399")
    elif status == "error":
        clauses.append("(status_code >= 400 OR status_code = 0)")
    if since_ts:
        clauses.append("ts >= ?")
        params.append(int(since_ts))
    if until_ts:
        clauses.append("ts < ?")
        params.append(int(until_ts))
    sql_where = " AND ".join(clauses)
    conn = _db()
    try:
        total = conn.execute(
            f"SELECT COUNT(*) FROM usage_log WHERE {sql_where}", params
        ).fetchone()[0]
        page_where = sql_where + (" AND id < ?" if before_id else "")
        page_params = params + ([int(before_id)] if before_id else [])
        rows = conn.execute(
            f"""
            SELECT id, ts, upstream, model, method, path, status_code, latency_ms,
                   cost_usd, tokens_in, tokens_out, key_type, actor, agent_id, token_ref
            FROM usage_log WHERE {page_where}
            ORDER BY id DESC LIMIT ?
        """,
            page_params + [limit + 1],
        ).fetchall()
        upstreams = [
            r[0]
            for r in conn.execute(
                f"SELECT DISTINCT upstream FROM usage_log WHERE user_id = ? AND ({where}) ORDER BY upstream",
                [user_id, *args],
            ).fetchall()
        ]
    finally:
        conn.close()
    more = len(rows) > limit
    rows = rows[:limit]
    calls = [
        {
            "id": r[0],
            "ts": r[1],
            "upstream": r[2],
            "model": r[3] or None,
            "method": r[4],
            "path": r[5],
            "status_code": r[6],
            "latency_ms": round(r[7] or 0, 1),
            "cost_usd": round(r[8] or 0, 6),
            "tokens_in": r[9],
            "tokens_out": r[10],
            "key_type": r[11],
            "actor": r[12] or None,
            "agent_id": r[13],
            "token_ref": r[14] or None,
        }
        for r in rows
    ]
    return {
        "calls": calls,
        "total": total,
        "next_before_id": calls[-1]["id"] if more and calls else None,
        "upstreams": upstreams,
    }
