"""Keep unit tests off the gitignored owner keystore."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _isolate_owner_keystore(tmp_path_factory, monkeypatch):
    isolated = tmp_path_factory.mktemp("owner-keystore")
    monkeypatch.setenv("KS_MPP_OWNER_KEY_FILE", str(isolated / "missing.enc"))
    monkeypatch.setenv("KS_MPP_OWNER_WRAP_FILE", str(isolated / "missing.wrap"))
    monkeypatch.delenv("KS_MPP_OWNER_WRAP_KEY", raising=False)
