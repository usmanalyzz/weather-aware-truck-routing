"""Client-side budget for Open-Meteo, which counts every location in a request toward its free limit
(600 per minute). Batches wait briefly for room in a sliding 60 s window instead of being rejected
upstream; if the wait would be too long the request fails fast with a clear "busy" error.

The budget is per process. Production runs a single gunicorn process (see render.yaml).
"""

import threading
import time
from collections import deque
from collections.abc import Callable

WINDOW_S = 60.0


class BudgetExceeded(Exception):
    """Waiting for budget would take longer than allowed."""


class LocationBudget:
    def __init__(
        self,
        per_minute: int,
        max_wait_s: float,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.per_minute = per_minute
        self.max_wait_s = max_wait_s
        self._clock = clock
        self._sleep = sleep
        self._used: deque[tuple[float, int]] = deque()
        self._lock = threading.Lock()

    def _prune(self, now: float) -> int:
        while self._used and now - self._used[0][0] >= WINDOW_S:
            self._used.popleft()
        return sum(n for _, n in self._used)

    def used(self) -> int:
        with self._lock:
            return self._prune(self._clock())

    def acquire(self, n: int, max_wait_s: float | None = None) -> None:
        """Reserve `n` locations, waiting up to `max_wait_s` (default: the budget's) for room."""
        n = min(n, self.per_minute)  # a single oversized batch may use the whole window
        deadline = self._clock() + (self.max_wait_s if max_wait_s is None else max_wait_s)
        while True:
            with self._lock:
                now = self._clock()
                used = self._prune(now)
                if used + n <= self.per_minute:
                    self._used.append((now, n))
                    return
                # Time until enough old entries leave the window.
                freed, wait = 0, WINDOW_S
                for ts, count in self._used:
                    freed += count
                    if used - freed + n <= self.per_minute:
                        wait = ts + WINDOW_S - now
                        break
            if now + wait > deadline:
                raise BudgetExceeded(f"need {n} locations, {used}/{self.per_minute} used in the last minute")
            self._sleep(max(wait, 0.05))
