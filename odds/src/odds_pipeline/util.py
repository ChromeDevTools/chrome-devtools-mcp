from __future__ import annotations

from datetime import datetime, timezone


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def american_to_implied_prob(odds: int) -> float:
    if odds == 0:
        raise ValueError("American odds cannot be 0")
    if odds < 0:
        return abs(odds) / (abs(odds) + 100.0)
    return 100.0 / (odds + 100.0)

