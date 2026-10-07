"""
Counts recent failed attempts (wrong passwords, wrong passcodes) per key, to stop
guessing: after too many failures in a time window, further tries are refused for a while.

Called by: auth_service (key: the account's email) and participant_service (key: the
meeting). One limiter of each kind lives on app.state, created in main.py.

Kept in memory, like the live rooms, because there is one server process (D-057). A
restart forgets the counts, which only hands a guesser one more small allowance.
"""

import threading
import time
from collections import deque
from collections.abc import Callable
from math import ceil

from app.services.errors import TooManyRequestsError

SECONDS_PER_MINUTE = 60


class AttemptLimiter:
    def __init__(
        self,
        *,
        max_failures: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._clock = clock  # replaceable, so tests can move time forward
        self._failures: dict[str, deque[float]] = {}
        # Sync routes run in a pool of threads, so two requests can update the counts
        # at the same moment. The lock makes each update happen one at a time.
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Raise TooManyRequestsError if `key` failed too often in the recent window."""
        with self._lock:
            failures = self._recent_failures(key)
            if len(failures) < self.max_failures:
                return
            seconds_left = failures[0] + self.window_seconds - self._clock()
        minutes_left = max(1, ceil(seconds_left / SECONDS_PER_MINUTE))
        raise TooManyRequestsError(f"Too many failed attempts. Try again in {minutes_left} min.")

    def record_failure(self, key: str) -> None:
        with self._lock:
            failures = self._recent_failures(key)
            failures.append(self._clock())

    def clear(self, key: str) -> None:
        """Forget `key`'s failures (after a success)."""
        with self._lock:
            self._failures.pop(key, None)

    def _recent_failures(self, key: str) -> deque[float]:
        """`key`'s failures inside the window, oldest first (older ones are dropped)."""
        failures = self._failures.setdefault(key, deque())
        cutoff = self._clock() - self.window_seconds
        while failures and failures[0] <= cutoff:
            failures.popleft()
        return failures
