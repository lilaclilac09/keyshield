"""X402 payment — Trust domain management + retry metadata."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
import sqlite3
from pathlib import Path

router = APIRouter()

# ─── Auth helper ────────────────────────────────────────────────────────────


def _auth(request: Request) -> dict | None:
    from ..auth import session as sess_mod

    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    return sess_mod.get(token[7:])


# ─── DB: X402 Trust domain list ─────────────────────────────────────────────

DB_PATH = Path(__file__).parent.parent / "data" / "x402_trust.db"


def _db() -> sqlite3.Connection:
    """Open + ensure-schema."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS x402_trust (
            user_id    TEXT NOT NULL,
            domain     TEXT NOT NULL,
            -- Maximum USDC per single 402 request for this domain (micro)
            max_micro  INTEGER NOT NULL DEFAULT 100000,  -- 0.10 USDC
            -- Global daily cap for this domain (micro)
            daily_cap  INTEGER NOT NULL DEFAULT 10000000,  -- 10.00 USDC
            -- Enabled = auto-pay for this domain; disabled = manual approval required
            enabled    INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, domain)
        );
        CREATE TABLE IF NOT EXISTS x402_spend_tracker (
            user_id    TEXT NOT NULL,
            domain     TEXT NOT NULL,
            -- ISO format date (YYYY-MM-DD)
            date       TEXT NOT NULL,
            spent_micro INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, domain, date)
        );
    """)
    return conn


# ─── GET /x402/trust ────────────────────────────────────────────────────────


@router.get("/x402/trust")
async def list_x402_trust(request: Request):
    """
    GET /x402/trust
    Returns the user's trusted domain list for auto-pay.
    """
    sess = _auth(request)
    if not sess:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    user_id = sess.get("user_id", "")
    if not user_id:
        return JSONResponse({"error": "Missing user_id in session"}, status_code=400)

    conn = _db()
    try:
        cursor = conn.execute(
            "SELECT domain, max_micro, daily_cap, enabled, created_at, updated_at "
            "FROM x402_trust WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        rows = [dict(row) for row in cursor.fetchall()]
        return JSONResponse({"trust_list": rows})
    finally:
        conn.close()


# ─── POST /x402/trust ───────────────────────────────────────────────────────


@router.post("/x402/trust")
async def add_x402_trust(request: Request):
    """
    POST /x402/trust
    Body:
      {
        "domain": "api.example.com",
        "max_micro": 100000,      # optional, default 0.10 USDC
        "daily_cap": 10000000,    # optional, default 10.00 USDC
        "enabled": true           # optional, default true
      }
    """
    sess = _auth(request)
    if not sess:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    user_id = sess.get("user_id", "")
    body = await request.json()
    domain = body.get("domain", "").strip()

    if not domain:
        return JSONResponse({"error": "Missing domain"}, status_code=400)

    max_micro = int(body.get("max_micro", 100_000))
    daily_cap = int(body.get("daily_cap", 10_000_000))
    enabled = int(body.get("enabled", True))

    conn = _db()
    try:
        conn.execute(
            """
            INSERT INTO x402_trust (user_id, domain, max_micro, daily_cap, enabled)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, domain) DO UPDATE SET
              max_micro = excluded.max_micro,
              daily_cap = excluded.daily_cap,
              enabled = excluded.enabled,
              updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, domain, max_micro, daily_cap, enabled),
        )
        conn.commit()
        return JSONResponse(
            {
                "domain": domain,
                "max_micro": max_micro,
                "daily_cap": daily_cap,
                "enabled": enabled,
            },
            status_code=201,
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        conn.close()


# ─── PUT /x402/trust/{domain} ───────────────────────────────────────────────


@router.put("/x402/trust/{domain}")
async def update_x402_trust(request: Request, domain: str):
    """
    PUT /x402/trust/{domain}
    Update trust settings for a domain (limits, enable/disable).
    Body:
      {
        "max_micro": 200000,
        "daily_cap": 20000000,
        "enabled": false
      }
    """
    sess = _auth(request)
    if not sess:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    user_id = sess.get("user_id", "")
    body = await request.json()

    conn = _db()
    try:
        # Check if domain exists for this user
        cursor = conn.execute(
            "SELECT 1 FROM x402_trust WHERE user_id = ? AND domain = ?",
            (user_id, domain),
        )
        if not cursor.fetchone():
            return JSONResponse(
                {"error": f"Domain {domain} not in trust list"}, status_code=404
            )

        updates = []
        params = []
        if "max_micro" in body:
            updates.append("max_micro = ?")
            params.append(int(body["max_micro"]))
        if "daily_cap" in body:
            updates.append("daily_cap = ?")
            params.append(int(body["daily_cap"]))
        if "enabled" in body:
            updates.append("enabled = ?")
            params.append(int(body["enabled"]))

        if not updates:
            return JSONResponse({"error": "No fields to update"}, status_code=400)

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.extend([user_id, domain])

        sql = f"UPDATE x402_trust SET {', '.join(updates)} WHERE user_id = ? AND domain = ?"
        conn.execute(sql, params)
        conn.commit()

        # Return updated row
        cursor = conn.execute(
            "SELECT domain, max_micro, daily_cap, enabled, updated_at FROM x402_trust WHERE user_id = ? AND domain = ?",
            (user_id, domain),
        )
        row = cursor.fetchone()
        return JSONResponse(dict(row))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        conn.close()


# ─── DELETE /x402/trust/{domain} ────────────────────────────────────────────


@router.delete("/x402/trust/{domain}")
async def delete_x402_trust(request: Request, domain: str):
    """
    DELETE /x402/trust/{domain}
    Remove a domain from the trust list.
    """
    sess = _auth(request)
    if not sess:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    user_id = sess.get("user_id", "")

    conn = _db()
    try:
        cursor = conn.execute(
            "DELETE FROM x402_trust WHERE user_id = ? AND domain = ?",
            (user_id, domain),
        )
        if cursor.rowcount == 0:
            return JSONResponse(
                {"error": f"Domain {domain} not found"}, status_code=404
            )

        conn.commit()
        return JSONResponse({"deleted": domain})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        conn.close()


# ─── GET /x402/spend/{domain} ───────────────────────────────────────────────


@router.get("/x402/spend/{domain}")
async def get_x402_spend(request: Request, domain: str):
    """
    GET /x402/spend/{domain}?date=2026-05-11
    Get daily spend for a domain (for UI to display remaining daily cap).
    """
    sess = _auth(request)
    if not sess:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    user_id = sess.get("user_id", "")
    query_date = request.query_params.get("date")

    conn = _db()
    try:
        if query_date:
            # Get spend for a specific date
            cursor = conn.execute(
                "SELECT spent_micro FROM x402_spend_tracker WHERE user_id = ? AND domain = ? AND date = ?",
                (user_id, domain, query_date),
            )
            row = cursor.fetchone()
            spent = dict(row)["spent_micro"] if row else 0
            return JSONResponse({"date": query_date, "spent_micro": spent})
        else:
            # Get spend for today
            from datetime import date

            today = str(date.today())
            cursor = conn.execute(
                "SELECT spent_micro FROM x402_spend_tracker WHERE user_id = ? AND domain = ? AND date = ?",
                (user_id, domain, today),
            )
            row = cursor.fetchone()
            spent = dict(row)["spent_micro"] if row else 0
            return JSONResponse({"date": today, "spent_micro": spent})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        conn.close()


# ─── Record 402 spend (internal helper) ──────────────────────────────────────


def record_x402_spend(user_id: str, domain: str, amount_micro: int) -> None:
    """
    Internal helper: record a 402 payment to the spend tracker.
    Called from x402_interceptor.py after successful payment.
    """
    from datetime import date

    today = str(date.today())
    conn = _db()
    try:
        conn.execute(
            """
            INSERT INTO x402_spend_tracker (user_id, domain, date, spent_micro)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, domain, date) DO UPDATE SET
              spent_micro = spent_micro + excluded.spent_micro
            """,
            (user_id, domain, today, amount_micro),
        )
        conn.commit()
    finally:
        conn.close()
