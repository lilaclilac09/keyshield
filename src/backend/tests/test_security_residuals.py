"""Security residuals on PR #110: DB challenge purge and fail-closed prod detection."""

from __future__ import annotations

import time

import pytest

from src.backend import demo
from src.backend.auth import passkey as pk_mod

_VARS = ("RAILWAY_ENVIRONMENT_NAME", "RAILWAY_ENVIRONMENT", "KS_ENV")


def test_stash_deletes_expired_db_challenges(tmp_path, monkeypatch):
    monkeypatch.setattr(pk_mod, "DB_PATH", tmp_path / "keyshield.db")
    pk_mod._init_db()
    with pk_mod._db() as conn:
        conn.execute(
            "INSERT INTO passkey_challenges (user_id, kind, challenge, rp_id, origins, expires)"
            " VALUES ('pk_old', 'signup', 'c', '', '[]', ?)",
            (time.time() - 10,),
        )
    pk_mod._stash_challenge("pk_new", "signup", "c2", None, None)
    with pk_mod._db() as conn:
        ids = {r[0] for r in conn.execute("SELECT user_id FROM passkey_challenges")}
    assert ids == {"pk_new"}


@pytest.fixture
def clean_env(monkeypatch):
    for v in _VARS:
        monkeypatch.delenv(v, raising=False)
    return monkeypatch


def test_no_env_vars_is_not_prod(clean_env):
    assert demo.is_production() is False


@pytest.mark.parametrize("name", ["production", "prod", "prod-eu", "Live", "main"])
@pytest.mark.parametrize("var", ["RAILWAY_ENVIRONMENT_NAME", "RAILWAY_ENVIRONMENT"])
def test_unlisted_railway_env_is_prod(clean_env, var, name):
    clean_env.setenv(var, name)
    assert demo.is_production() is True


@pytest.mark.parametrize(
    "name", ["development", "dev", "staging", "preview", "test", "local", "pr-123", "PR-7"]
)
def test_allow_listed_railway_env_is_not_prod(clean_env, name):
    clean_env.setenv("RAILWAY_ENVIRONMENT_NAME", name)
    assert demo.is_production() is False


def test_ks_env_still_respected(clean_env):
    clean_env.setenv("KS_ENV", "prod")
    assert demo.is_production() is True
    clean_env.setenv("KS_ENV", "dev")
    assert demo.is_production() is False


def test_demo_mode_refused_in_prod_eu(clean_env):
    clean_env.setenv("KS_DEMO_MODE", "1")
    clean_env.setenv("RAILWAY_ENVIRONMENT_NAME", "prod-eu")
    with pytest.raises(RuntimeError):
        demo.assert_safe_for_env()
