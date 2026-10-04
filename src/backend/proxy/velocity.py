"""In-memory session velocity caps and the anomaly freeze.

Counters live in this process. A restart clears them. The proxy calls
`admit` before an upstream request and `observe` after the body
returns. A rejected admit is not added to the window.
"""

from __future__ import annotations

import os
import threading
import time


class VelocityLimited(Exception):
    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class SessionSuspended(Exception):
    def __init__(self) -> None:
        super().__init__("Suspended")
        self.detail = "Suspended"


class _Session:
    def __init__(self) -> None:
        self.requests: list[float] = []
        self.tokens: list[tuple[float, int]] = []
        self.spend: list[tuple[float, int]] = []
        self.fail_streak = 0
        self.suspended = False


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


def session_key(bearer: str | None, user_id: str | None) -> str:
    if bearer:
        return bearer
    return f"anon:{user_id or 'anonymous'}"


def _body_empty(body) -> bool:
    if body is None:
        return True
    if isinstance(body, (bytes, bytearray, memoryview)):
        return len(body) == 0
    if isinstance(body, str):
        return body == ""
    return False


class VelocityLimiter:
    def __init__(
        self,
        max_requests_per_sec: int | None = None,
        max_tokens_per_sec: int | None = None,
        max_micro_usdc_per_min: int | None = None,
        fail_streak: int = 3,
    ) -> None:
        self.max_requests_per_sec = (
            _env_int("KS_VELOCITY_MAX_REQUESTS_PER_SEC", 25)
            if max_requests_per_sec is None
            else max_requests_per_sec
        )
        self.max_tokens_per_sec = (
            _env_int("KS_VELOCITY_MAX_TOKENS_PER_SEC", 8000)
            if max_tokens_per_sec is None
            else max_tokens_per_sec
        )
        self.max_micro_usdc_per_min = (
            _env_int("KS_VELOCITY_MAX_MICRO_USDC_PER_MIN", 1_000_000)
            if max_micro_usdc_per_min is None
            else max_micro_usdc_per_min
        )
        self.fail_streak = fail_streak
        self._lock = threading.Lock()
        self._sessions: dict[str, _Session] = {}

    def reset(self) -> None:
        with self._lock:
            self._sessions.clear()

    def _get(self, key: str) -> _Session:
        row = self._sessions.get(key)
        if row is None:
            row = _Session()
            self._sessions[key] = row
        return row

    def _prune(self, row: _Session, now: float) -> None:
        row.requests = [ts for ts in row.requests if now - ts < 1.0]
        row.tokens = [(ts, n) for ts, n in row.tokens if now - ts < 1.0]
        row.spend = [(ts, n) for ts, n in row.spend if now - ts < 60.0]

    def is_suspended(self, key: str) -> bool:
        with self._lock:
            row = self._sessions.get(key)
            return bool(row and row.suspended)

    def admit(
        self,
        key: str,
        est_micro: int = 0,
        est_tokens: int = 0,
        now: float | None = None,
    ) -> None:
        """Count one request and the spend estimate. Tokens are checked, not stored."""
        now = time.monotonic() if now is None else now
        est_micro = max(0, int(est_micro or 0))
        est_tokens = max(0, int(est_tokens or 0))
        with self._lock:
            row = self._get(key)
            if row.suspended:
                raise SessionSuspended()
            self._prune(row, now)
            if len(row.requests) >= self.max_requests_per_sec:
                raise VelocityLimited("max_requests_per_second")
            token_sum = sum(n for _, n in row.tokens)
            if token_sum + est_tokens > self.max_tokens_per_sec:
                raise VelocityLimited("max_tokens_per_second")
            spend_sum = sum(n for _, n in row.spend)
            if spend_sum + est_micro > self.max_micro_usdc_per_min:
                raise VelocityLimited("max_spend_per_minute")
            row.requests.append(now)
            if est_micro:
                row.spend.append((now, est_micro))

    def observe(
        self,
        key: str,
        status: int,
        body,
        tokens: int = 0,
        now: float | None = None,
    ) -> None:
        """Record the upstream result. Three empty bodies or HTTP 5xx freeze the key."""
        now = time.monotonic() if now is None else now
        bad = int(status) >= 500 or _body_empty(body)
        with self._lock:
            row = self._get(key)
            if row.suspended:
                return
            if bad:
                row.fail_streak += 1
                if row.fail_streak >= self.fail_streak:
                    row.suspended = True
                return
            row.fail_streak = 0
            tokens = int(tokens or 0)
            if tokens > 0:
                row.tokens.append((now, tokens))


limiter = VelocityLimiter()
