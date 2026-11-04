"""Cache TTL em memória com deduplicação simples.

Para múltiplos workers/produção, troque por Redis mantendo a interface.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from typing import Any, TypeVar

T = TypeVar("T")


class TTLCache:
    def __init__(self, max_entries: int = 512) -> None:
        self._data: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()
        self._max_entries = max_entries

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at < time.monotonic():
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        if ttl_seconds <= 0:
            return
        with self._lock:
            if len(self._data) >= self._max_entries:
                # Descarta as 10% entradas mais antigas por expiração
                for old_key, _ in sorted(self._data.items(), key=lambda i: i[1][0])[
                    : max(1, self._max_entries // 10)
                ]:
                    self._data.pop(old_key, None)
            self._data[key] = (time.monotonic() + ttl_seconds, value)

    def get_or_set(self, key: str, ttl_seconds: float, factory: Callable[[], T]) -> T:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = factory()
        self.set(key, value, ttl_seconds)
        return value

    def invalidate(self, prefix: str | None = None) -> None:
        with self._lock:
            if prefix is None:
                self._data.clear()
            else:
                for key in [k for k in self._data if k.startswith(prefix)]:
                    self._data.pop(key, None)

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {"entries": len(self._data), "max_entries": self._max_entries}
