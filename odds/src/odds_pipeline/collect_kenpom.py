from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date

from odds_pipeline.config import load_settings
from odds_pipeline.db import connect
from odds_pipeline.util import now_utc


@dataclass(frozen=True)
class KenPomAuth:
    email: str
    password: str


def _require_auth() -> KenPomAuth:
    import os

    email = os.getenv("KENPOM_EMAIL")
    password = os.getenv("KENPOM_PASSWORD")
    if not email or not password:
        raise RuntimeError("KENPOM_EMAIL and KENPOM_PASSWORD are required for kenpompy scraping")
    return KenPomAuth(email=email, password=password)


def collect_kenpom_team_metrics(*, season: int, metric_type: str) -> int:
    """
    Collect KenPom metrics via kenpompy scraping.

    metric_type supported:
    - pomeroy_ratings
    - efficiency
    - four_factors
    """
    settings = load_settings()
    auth = _require_auth()

    # Import locally so dependency is optional outside this pipeline.
    from kenpompy.utils import login
    from kenpompy import misc, summary

    browser = login(auth.email, auth.password)

    if metric_type == "pomeroy_ratings":
        df = misc.get_pomeroy_ratings(browser, season=str(season))
    elif metric_type == "efficiency":
        df = summary.get_efficiency(browser, season=str(season))
    elif metric_type == "four_factors":
        df = summary.get_fourfactors(browser, season=str(season))
    else:
        raise ValueError(f"Unsupported metric_type: {metric_type}")

    collected_at = now_utc()
    inserted = 0

    # Store one JSON row per team (best-effort: locate a likely team column).
    records = df.to_dict(orient="records")
    team_key = None
    for candidate in ("Team", "team", "TEAM"):
        if records and candidate in records[0]:
            team_key = candidate
            break
    if team_key is None:
        # Fall back: store as a single blob under team='__all__'
        records = [{"__all__": True, "rows": records}]
        team_key = "__all__"

    with connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            for r in records:
                team = str(r.get(team_key) or "__unknown__")
                cur.execute(
                    """
                    INSERT INTO raw_kenpom_team_metrics (
                      season, team, metric_type, collected_at, raw
                    ) VALUES (
                      %(season)s, %(team)s, %(metric_type)s, %(collected_at)s, %(raw)s
                    )
                    ON CONFLICT DO NOTHING
                    """,
                    {
                        "season": int(season),
                        "team": team,
                        "metric_type": metric_type,
                        "collected_at": collected_at,
                        "raw": json.dumps(r),
                    },
                )
                inserted += cur.rowcount
        conn.commit()

    return inserted


def collect_kenpom_fanmatch(*, game_date: date) -> int:
    """
    Collect KenPom FanMatch predictions for a given date via kenpompy.
    """
    settings = load_settings()
    auth = _require_auth()

    from kenpompy.utils import login
    from kenpompy.FanMatch import FanMatch

    browser = login(auth.email, auth.password)
    fm = FanMatch(browser, date=game_date.isoformat())
    df = fm.fm_df
    if df is None:
        return 0

    collected_at = now_utc()
    inserted = 0
    records = df.to_dict(orient="records")

    with connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            for r in records:
                # FanMatch rows may have matchup/team columns; store under team='__fanmatch__'
                cur.execute(
                    """
                    INSERT INTO raw_kenpom_team_metrics (
                      season, team, metric_type, collected_at, raw
                    ) VALUES (
                      %(season)s, %(team)s, %(metric_type)s, %(collected_at)s, %(raw)s
                    )
                    ON CONFLICT DO NOTHING
                    """,
                    {
                        "season": int(game_date.year),
                        "team": "__fanmatch__",
                        "metric_type": "fanmatch",
                        "collected_at": collected_at,
                        "raw": json.dumps(r),
                    },
                )
                inserted += cur.rowcount
        conn.commit()

    return inserted

