"""Per-key fixed-window limiter for unauthenticated auth routes.

No reusable windowed limiter exists in the backend (proxy/velocity.py is a
per-session 1s/60s spend governor; trading/risk.py is a daily trade counter),
so this is a minimal in-process one. A restart clears it.
"""

from __future__ import annotations

import threading
import time

from fastapi import Request

MAX_KEYS = 10_000


class WindowLimiter:
    def __init__(self, limits: list[tuple[int, float]]):
        self.limits = limits  # (max_hits, window_seconds)
        self._lock = threading.Lock()
        self._hits: dict[str, list[float]] = {}

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        longest = max(w for _, w in self.limits)
        with self._lock:
            hits = [t for t in self._hits.get(key, []) if now - t < longest]
            for max_hits, window in self.limits:
                if sum(1 for t in hits if now - t < window) >= max_hits:
                    self._hits[key] = hits
                    return False
            hits.append(now)
            self._hits[key] = hits
            if len(self._hits) > MAX_KEYS:
                for k in [k for k, v in self._hits.items() if not v or now - v[-1] >= longest]:
                    del self._hits[k]
                while len(self._hits) > MAX_KEYS:
                    self._hits.pop(next(iter(self._hits)))
            return True


def client_ip(request: Request) -> str:
    """Rightmost X-Forwarded-For hop (added by the edge proxy); the leftmost
    entry is client-supplied and would let a caller rotate keys at will."""
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        parts = [p.strip() for p in fwd.split(",") if p.strip()]
        if parts:
            return parts[-1]
    return request.client.host if request.client else "unknown"


# S1: passkey signup — 10/min and 50/day per IP, shared by options + verify.
signup_limiter = WindowLimiter([(10, 60.0), (50, 86_400.0)])
