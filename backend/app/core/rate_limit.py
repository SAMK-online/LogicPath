"""Small in-process sliding-window rate limiter.

Good enough for a single Uvicorn process (the SQLite deployment model). With several
workers/instances each keeps its own counters; move to Redis if that becomes a need.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import AppError


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window: float) -> float | None:
        """Return None if allowed, otherwise seconds until the next slot frees up."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - window:
                q.popleft()
            if len(q) >= limit:
                return max(q[0] + window - now, 0.0)
            q.append(now)
            if len(self._hits) > 10_000:  # bound memory
                for k in [k for k, v in self._hits.items() if not v or v[-1] <= now - window]:
                    self._hits.pop(k, None)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def _parse(spec: str) -> tuple[int, float]:
    count, window = spec.split("/")
    return int(count), float(window)


def rate_limit(scope: str, setting: str, key_fn: Callable[[Request], str] | None = None):
    """FastAPI dependency factory. `setting` names a Settings attribute like 'auth_rate_limit'."""

    def dependency(request: Request) -> None:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return
        limit, window = _parse(getattr(settings, setting))
        ident = key_fn(request) if key_fn else (request.client.host if request.client else "unknown")
        retry = limiter.check(f"{scope}:{ident}", limit, window)
        if retry is not None:
            raise AppError(429, "rate_limited", "Too many requests. Please slow down and try again shortly.",
                           headers={"Retry-After": str(int(retry) + 1)})

    return dependency
