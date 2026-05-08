"""
test_retention.py — tests for audit log retention policy.

Covers:
  - purge_old_logs() deletes rows older than retention_days
  - purge_old_logs() trims to max_rows (keeps most recent)
  - purge_old_logs() with empty table (no error)
  - get_retention_stats() returns correct total_rows and oldest_entry
  - GET /admin/retention-stats returns 200 with correct shape
  - GET /admin/retention-stats requires auth (401 without token)
"""

import time
from pathlib import Path

import pytest


# ── Fixture: isolated DB for every test ────────────────────────────────────────

@pytest.fixture(autouse=True)
def isolate_db(tmp_path, monkeypatch):
    from src import usage as usage_mod
    monkeypatch.setattr(usage_mod, "DB_PATH", Path(tmp_path / "data" / "usage.db"))
    yield


# ── Helper ─────────────────────────────────────────────────────────────────────

def _insert_rows(conn, n: int, ts_offset_seconds: int = 0):
    """Insert n rows into usage_log with ts = now + ts_offset_seconds."""
    ts = int(time.time()) + ts_offset_seconds
    for i in range(n):
        conn.execute(
            """INSERT INTO usage_log
               (user_id, upstream, key_type, method, path, tokens_in, tokens_out,
                cost_usd, latency_ms, status_code, ts)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            ("test-user", "openai", "self_custodian", "POST", f"/v{i}",
             0, 0, 0.0, 100.0, 200, ts + i),
        )
    conn.commit()


# ── purge_old_logs ─────────────────────────────────────────────────────────────

class TestPurgeOldLogs:
    def test_deletes_rows_older_than_retention_days(self):
        from src import usage

        conn = usage._db()
        # Insert 3 rows that are 100 days old
        old_ts = int(time.time()) - 100 * 86400
        for i in range(3):
            conn.execute(
                """INSERT INTO usage_log
                   (user_id, upstream, key_type, method, path, tokens_in, tokens_out,
                    cost_usd, latency_ms, status_code, ts)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                ("u", "openai", "self_custodian", "POST", "/old", 0, 0, 0.0, 0.0, 200, old_ts + i),
            )
        # Insert 2 fresh rows
        fresh_ts = int(time.time())
        for i in range(2):
            conn.execute(
                """INSERT INTO usage_log
                   (user_id, upstream, key_type, method, path, tokens_in, tokens_out,
                    cost_usd, latency_ms, status_code, ts)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                ("u", "openai", "self_custodian", "POST", "/new", 0, 0, 0.0, 0.0, 200, fresh_ts + i),
            )
        conn.commit()
        conn.close()

        result = usage.purge_old_logs(retention_days=90, max_rows=100000)
        assert result["deleted_by_age"] == 3
        assert result["deleted_by_cap"] == 0

        # Only 2 fresh rows remain
        conn2 = usage._db()
        count = conn2.execute("SELECT COUNT(*) FROM usage_log").fetchone()[0]
        conn2.close()
        assert count == 2

    def test_trims_to_max_rows_keeping_most_recent(self):
        from src import usage

        conn = usage._db()
        now = int(time.time())
        # Insert 10 rows at distinct timestamps
        for i in range(10):
            conn.execute(
                """INSERT INTO usage_log
                   (user_id, upstream, key_type, method, path, tokens_in, tokens_out,
                    cost_usd, latency_ms, status_code, ts)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                ("u", "openai", "self_custodian", "POST", f"/{i}", 0, 0, 0.0, 0.0, 200, now + i),
            )
        conn.commit()
        conn.close()

        result = usage.purge_old_logs(retention_days=9999, max_rows=5)
        assert result["deleted_by_age"] == 0
        assert result["deleted_by_cap"] == 5

        # Exactly 5 rows remain, and they should be the 5 most recent
        conn2 = usage._db()
        rows = conn2.execute(
            "SELECT ts FROM usage_log ORDER BY ts DESC"
        ).fetchall()
        conn2.close()
        assert len(rows) == 5
        # All remaining timestamps should be >= now + 5 (the 5 most recent)
        for r in rows:
            assert r[0] >= now + 5

    def test_empty_table_no_error(self):
        from src import usage

        # Ensure the table exists but is empty
        conn = usage._db()
        conn.close()

        result = usage.purge_old_logs(retention_days=30, max_rows=100)
        assert result["deleted_by_age"] == 0
        assert result["deleted_by_cap"] == 0

    def test_purge_both_age_and_cap_in_sequence(self):
        """Old rows get pruned first, then cap applied to remaining fresh rows."""
        from src import usage

        conn = usage._db()
        now = int(time.time())
        old_ts = now - 200 * 86400
        # 3 old rows + 6 fresh rows; cap to 4
        for i in range(3):
            conn.execute(
                """INSERT INTO usage_log
                   (user_id, upstream, key_type, method, path, tokens_in, tokens_out,
                    cost_usd, latency_ms, status_code, ts)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                ("u", "openai", "self_custodian", "POST", "/old", 0, 0, 0.0, 0.0, 200, old_ts + i),
            )
        for i in range(6):
            conn.execute(
                """INSERT INTO usage_log
                   (user_id, upstream, key_type, method, path, tokens_in, tokens_out,
                    cost_usd, latency_ms, status_code, ts)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                ("u", "openai", "self_custodian", "POST", "/new", 0, 0, 0.0, 0.0, 200, now + i),
            )
        conn.commit()
        conn.close()

        result = usage.purge_old_logs(retention_days=90, max_rows=4)
        assert result["deleted_by_age"] == 3
        assert result["deleted_by_cap"] == 2  # 6 fresh - 4 cap = 2

        conn2 = usage._db()
        count = conn2.execute("SELECT COUNT(*) FROM usage_log").fetchone()[0]
        conn2.close()
        assert count == 4


# ── get_retention_stats ────────────────────────────────────────────────────────

class TestGetRetentionStats:
    def test_returns_correct_total_rows(self):
        from src import usage

        usage.log_call("alice", "openai", "self_custodian", "POST", "/v1",
                       100, 50, 0.001, 200.0, 200)
        usage.log_call("alice", "openai", "self_custodian", "POST", "/v1",
                       50, 25, 0.001, 150.0, 200)

        stats = usage.get_retention_stats()
        assert stats["total_rows"] == 2
        assert stats["retention_days"] == usage._LOG_RETENTION_DAYS
        assert stats["max_rows"] == usage._LOG_RETENTION_MAX_ROWS
        assert stats["oldest_entry"] is not None
        # Should be a valid ISO 8601 string
        from datetime import datetime
        dt = datetime.fromisoformat(stats["oldest_entry"])
        assert dt is not None

    def test_empty_table_returns_none_oldest_entry(self):
        from src import usage

        stats = usage.get_retention_stats()
        assert stats["total_rows"] == 0
        assert stats["oldest_entry"] is None

    def test_oldest_entry_is_actually_oldest(self):
        from src import usage

        conn = usage._db()
        now = int(time.time())
        # Insert two rows at different timestamps
        for i, ts in enumerate([now - 1000, now - 500, now]):
            conn.execute(
                """INSERT INTO usage_log
                   (user_id, upstream, key_type, method, path, tokens_in, tokens_out,
                    cost_usd, latency_ms, status_code, ts)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                ("u", "openai", "self_custodian", "POST", f"/{i}", 0, 0, 0.0, 0.0, 200, ts),
            )
        conn.commit()
        conn.close()

        stats = usage.get_retention_stats()
        assert stats["total_rows"] == 3
        # Oldest entry timestamp should correspond to now - 1000
        from datetime import datetime, timezone
        oldest_dt = datetime.fromisoformat(stats["oldest_entry"])
        expected_ts = now - 1000
        assert abs(oldest_dt.timestamp() - expected_ts) < 2


# ── HTTP endpoint ──────────────────────────────────────────────────────────────

class TestAdminRetentionStatsEndpoint:
    def test_returns_200_with_correct_shape(self, client, login):
        r = client.get(
            "/admin/retention-stats",
            headers={"Authorization": f"Bearer {login}"},
        )
        assert r.status_code == 200
        data = r.json()
        assert "total_rows" in data
        assert "oldest_entry" in data
        assert "retention_days" in data
        assert "max_rows" in data
        assert isinstance(data["total_rows"], int)
        assert isinstance(data["retention_days"], int)
        assert isinstance(data["max_rows"], int)

    def test_requires_auth_returns_401_without_token(self, client):
        r = client.get("/admin/retention-stats")
        assert r.status_code == 401
