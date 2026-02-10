from __future__ import annotations

from odds_pipeline.collect_odds import collect_odds
from odds_pipeline.collect_scores import collect_scores
from odds_pipeline.normalize import normalize_window


def backfill(
    *,
    sport: str,
    lookback_days: int = 5,
    regions: str = "us",
    markets: str = "h2h,spreads,totals",
) -> dict[str, int]:
    """
    Bounded backfill for the rolling window.

    Notes:
    - Scores support a historical lookback via daysFrom.
    - Odds endpoints are typically current/upcoming; backfill here re-collects the latest
      and then re-normalizes to restore canonical tables.
    """
    out: dict[str, int] = {}
    out["scores_inserted"] = collect_scores(sport=sport, days_from=lookback_days)
    out["odds_inserted"] = collect_odds(sport=sport, regions=regions, markets=markets)
    counts = normalize_window(window_days=lookback_days)
    out.update({f"canonical_{k}": v for k, v in counts.items()})
    return out

