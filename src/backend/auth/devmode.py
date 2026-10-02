"""Local-dev opt-in. Never honour X-Dev-Mode unless KS_DEV_MODE is on."""

from __future__ import annotations

import os


def dev_mode_enabled() -> bool:
    v = os.getenv("KS_DEV_MODE", "").strip().lower()
    return v in ("1", "true", "yes", "on")
