from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from odds_pipeline.config import load_settings
from odds_pipeline.db import connect
from odds_pipeline.util import now_utc


@dataclass(frozen=True)
class FreshnessResult:
    ok: bool
    details: dict[str, str]


def _max_collected_at(conn, table: str, *, cutoff: datetime | None = None) -> datetime | None:
    where = ""
    params: dict[str, object] = {}
    if cutoff is not None:
        where = "WHERE collected_at >= %(cutoff)s"
        params["cutoff"] = cutoff
    with conn.cursor() as cur:
        cur.execute(f"SELECT MAX(collected_at) FROM {table} {where}", params)
        row = cur.fetchone()
        return row[0] if row else None


def check_freshness(*, window_days: int | None = None) -> FreshnessResult:
    settings = load_settings()
    window = timedelta(days=window_days if window_days is not None else settings.window_days)
    cutoff = now_utc() - window

    details: dict[str, str] = {}
    ok = True

    with connect(settings.database_url) as conn:
        odds_max = _max_collected_at(conn, "raw_odds_snapshots", cutoff=cutoff)
        scores_max = _max_collected_at(conn, "raw_scores_snapshots", cutoff=cutoff)
        games_max = _max_collected_at(conn, "raw_games_snapshots", cutoff=cutoff)

    now = now_utc()

    if odds_max is None:
        ok = False
        details["odds"] = "missing"
    else:
        age = now - odds_max
        if age > settings.odds_stale_for:
            ok = False
            details["odds"] = f"stale age={age}"
        else:
            details["odds"] = f"ok age={age}"

    # Scores/schedules freshness can be satisfied by either the Odds API scores feed
    # or an external games feed (e.g. ESPN scoreboard).
    best_scores_max = scores_max
    if games_max is not None and (best_scores_max is None or games_max > best_scores_max):
        best_scores_max = games_max

    if best_scores_max is None:
        ok = False
        details["scores"] = "missing"
    else:
        age = now - best_scores_max
        if age > settings.scores_stale_for:
            ok = False
            details["scores"] = f"stale age={age}"
        else:
            details["scores"] = f"ok age={age}"

    # Debug detail: show source maxima without requiring them.
    details["scores_odds_api_max"] = scores_max.isoformat() if scores_max else "missing"
    details["scores_external_max"] = games_max.isoformat() if games_max else "missing"

    return FreshnessResult(ok=ok, details=details)

