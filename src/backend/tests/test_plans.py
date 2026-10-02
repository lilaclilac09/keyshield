"""Subscription plans and the monthly cost breakdown."""

from __future__ import annotations

from src.backend.billing import plans, usage


def _use(tmp_path, monkeypatch):
    monkeypatch.setattr(usage, "DB_PATH", tmp_path / "usage.db")
    usage._SCHEMA_READY = False  # noqa: SLF001


def test_catalog_has_three_plans_and_operate_is_the_middle():
    rows = plans.catalog()
    assert [row["id"] for row in rows] == ["personal", "operate", "floor"]
    assert [row["monthly_usd"] for row in rows] == [29, 89, 240]
    assert [row["recommended"] for row in rows] == [False, True, False]
    assert rows[2]["agents"] is None


def test_choose_plan_persists(tmp_path, monkeypatch):
    _use(tmp_path, monkeypatch)
    assert plans.current_plan("ada")["selected"] is False
    chosen = plans.set_plan("ada", "operate")
    assert chosen["id"] == "operate"
    assert chosen["selected"] is True
    assert plans.current_plan("ada")["id"] == "operate"


def test_unknown_plan_is_rejected(tmp_path, monkeypatch):
    _use(tmp_path, monkeypatch)
    try:
        plans.set_plan("ada", "metered")
    except ValueError as exc:
        assert "unknown plan" in str(exc)
    else:
        raise AssertionError("unknown plan should be rejected")


def test_breakdown_covers_platform_calls_and_leaves_own_keys_out(tmp_path, monkeypatch):
    _use(tmp_path, monkeypatch)
    plans.set_plan("ada", "personal")
    usage.log_call("ada", "helius", "platform", cost_usd=1.5)
    usage.log_call("ada", "helius", "platform", cost_usd=0.5)
    usage.log_call("ada", "openai", "platform", cost_usd=0.25)
    usage.log_call("ada", "openai", "self_custodian", cost_usd=9.0)

    body = plans.breakdown("ada")
    assert body["plan"]["id"] == "personal"
    assert body["allowance"]["used_calls"] == 3
    assert body["allowance"]["included_calls"] == 40_000
    assert body["allowance"]["covered"] is True
    assert body["settlement"]["headline"] == "This month is included in Personal"
    assert body["settlement"]["monthly_usd"] == 29
    assert body["settlement"]["calls_outside_plan"] == 0
    assert body["own_keys"]["calls"] == 1
    assert body["by_upstream"][0] == {"upstream": "helius", "calls": 2, "share_pct": 66.7}
    assert body["by_upstream"][1]["upstream"] == "openai"
    assert body["audit"]["recorded_platform_usd"] == 2.25


def test_over_allowance_points_at_the_plan_that_covers_it(tmp_path, monkeypatch):
    _use(tmp_path, monkeypatch)
    plans.set_plan("ada", "personal")
    now = 1_800_000_000
    start, _end, _period = plans.month_bounds(now)
    conn = usage._db()
    try:
        conn.executemany(
            """
            INSERT INTO usage_log
              (user_id, upstream, key_type, method, path,
               tokens_in, tokens_out, cost_usd, latency_ms, status_code, ts)
            VALUES ('ada', 'helius', 'platform', 'POST', '/', 0, 0, 0, 0, 200, ?)
            """,
            [(start + 10,)] * 40_001,
        )
        conn.commit()
    finally:
        conn.close()

    body = plans.breakdown("ada", now=now)
    assert body["allowance"]["covered"] is False
    assert body["settlement"]["covers_with"] == "operate"
    assert body["settlement"]["headline"] == "Operate includes this month's volume"
