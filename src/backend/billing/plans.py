"""Three monthly plans.

A plan is the price the user decides on. Platform calls draw down the
calls included in that plan. Calls made with the user's own key are
outside the plan. The breakdown reports where this month's platform
calls went, as a share of the month, so the team can see the work
without a price on each call.

Numbers here are the product. `docs/SUBSCRIPTION.md` matches them.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

PLANS: tuple[dict, ...] = (
    {
        "id": "personal",
        "name": "Personal",
        "monthly_usd": 29,
        "included_calls": 40_000,
        "agents": 1,
        "recommended": False,
        "includes": [
            "Your own API keys, unmetered",
            "40,000 platform calls included",
            "One agent",
        ],
    },
    {
        "id": "operate",
        "name": "Operate",
        "monthly_usd": 89,
        "included_calls": 200_000,
        "agents": 8,
        "recommended": True,
        "includes": [
            "Your own API keys, unmetered",
            "200,000 platform calls included",
            "Eight agents",
            "MPP streams included",
            "Monthly breakdown for the team",
        ],
    },
    {
        "id": "floor",
        "name": "Floor",
        "monthly_usd": 240,
        "included_calls": 1_000_000,
        "agents": None,
        "recommended": False,
        "includes": [
            "Your own API keys, unmetered",
            "1,000,000 platform calls included",
            "Agents without a cap",
            "MPP streams and Tempo settlement included",
            "Monthly breakdown for the desk",
        ],
    },
)

_DEFAULT_PLAN_ID = "personal"


def catalog() -> list[dict]:
    return [_public(plan) for plan in PLANS]


def plan_by_id(plan_id: str) -> dict | None:
    for plan in PLANS:
        if plan["id"] == plan_id:
            return plan
    return None


def _public(plan: dict, *, selected: bool | None = None) -> dict:
    body = {
        "id": plan["id"],
        "name": plan["name"],
        "monthly_usd": plan["monthly_usd"],
        "included_calls": plan["included_calls"],
        "agents": plan["agents"],
        "recommended": plan["recommended"],
        "includes": list(plan["includes"]),
    }
    if selected is not None:
        body["selected"] = selected
    return body


def _conn():
    from . import usage

    conn = usage._db()  # noqa: SLF001
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS subscriptions (
            user_id    TEXT PRIMARY KEY,
            plan_id    TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    return conn


def current_plan(user_id: str) -> dict:
    """The chosen plan, or Personal when the account has not chosen one."""
    conn = _conn()
    try:
        row = conn.execute(
            "SELECT plan_id FROM subscriptions WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    finally:
        conn.close()
    if row and (plan := plan_by_id(row[0])):
        return _public(plan, selected=True)
    return _public(plan_by_id(_DEFAULT_PLAN_ID), selected=False)  # type: ignore[arg-type]


def set_plan(user_id: str, plan_id: str) -> dict:
    plan = plan_by_id(plan_id)
    if plan is None:
        raise ValueError("unknown plan")
    now = int(time.time())
    conn = _conn()
    try:
        conn.execute(
            """
            INSERT INTO subscriptions (user_id, plan_id, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                plan_id = excluded.plan_id,
                updated_at = excluded.updated_at
            """,
            (user_id, plan_id, now),
        )
        conn.commit()
    finally:
        conn.close()
    return current_plan(user_id)


def month_bounds(now: int) -> tuple[int, int, str]:
    dt = datetime.fromtimestamp(now, timezone.utc)
    start = datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)
    if dt.month == 12:
        end = datetime(dt.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(dt.year, dt.month + 1, 1, tzinfo=timezone.utc)
    return int(start.timestamp()), int(end.timestamp()), f"{dt.year:04d}-{dt.month:02d}"


def _covering_upgrade(used_calls: int, plan_id: str) -> dict | None:
    seen = False
    for plan in PLANS:
        if plan["id"] == plan_id:
            seen = True
            continue
        if seen and used_calls <= plan["included_calls"]:
            return plan
    return None


def breakdown(user_id: str, now: int | None = None) -> dict:
    """Where this month's calls went, against the plan that covers them."""
    moment = int(time.time()) if now is None else int(now)
    start, end, period = month_bounds(moment)
    plan = current_plan(user_id)
    included = int(plan["included_calls"])

    from . import usage

    conn = usage._db()  # noqa: SLF001
    try:
        rows = conn.execute(
            """
            SELECT upstream, key_type, COUNT(*), COALESCE(SUM(cost_usd), 0)
            FROM usage_log
            WHERE user_id = ? AND ts >= ? AND ts < ?
            GROUP BY upstream, key_type
            """,
            (user_id, start, end),
        ).fetchall()
    finally:
        conn.close()

    platform_calls = 0
    own_calls = 0
    recorded_platform_usd = 0.0
    by_upstream: dict[str, int] = {}
    for upstream, key_type, calls, cost in rows:
        calls = int(calls or 0)
        if key_type == "platform":
            platform_calls += calls
            recorded_platform_usd += float(cost or 0)
            by_upstream[upstream] = by_upstream.get(upstream, 0) + calls
        else:
            own_calls += calls

    outside = max(0, platform_calls - included)
    inside = platform_calls - outside
    upgrade = _covering_upgrade(platform_calls, plan["id"]) if outside else None
    if outside == 0:
        headline = f"This month is included in {plan['name']}"
    elif upgrade is not None:
        headline = f"{upgrade['name']} includes this month's volume"
    else:
        headline = f"This month ran past the calls included in {plan['name']}"

    shares = []
    for upstream, calls in sorted(by_upstream.items(), key=lambda item: (-item[1], item[0])):
        share = round(100.0 * calls / platform_calls, 1) if platform_calls else 0.0
        shares.append(
            {
                "upstream": upstream,
                "calls": calls,
                "share_pct": share,
            }
        )

    return {
        "plan": plan,
        "period": period,
        "allowance": {
            "used_calls": platform_calls,
            "included_calls": included,
            "remaining_calls": max(0, included - platform_calls),
            "used_pct": round(100.0 * min(platform_calls, included) / included, 2) if included else 0.0,
            "covered": outside == 0,
        },
        "by_upstream": shares,
        "own_keys": {
            "calls": own_calls,
            "headline": "Your own keys sit outside the plan",
        },
        "settlement": {
            "monthly_usd": plan["monthly_usd"],
            "headline": headline,
            "calls_inside_plan": inside,
            "calls_outside_plan": outside,
            "covers_with": None if upgrade is None else upgrade["id"],
        },
        "audit": {
            "recorded_platform_usd": round(recorded_platform_usd, 6),
            "note": "Recorded upstream cost. The monthly plan already covers calls inside the allowance.",
        },
        "plans": catalog(),
    }
