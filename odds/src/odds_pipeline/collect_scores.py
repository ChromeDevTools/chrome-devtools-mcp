from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import requests

from odds_pipeline.config import load_settings
from odds_pipeline.db import connect
from odds_pipeline.util import now_utc


@dataclass(frozen=True)
class OddsApiConfig:
    base_url: str = "https://api.the-odds-api.com/v4"


def _parse_dt(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def collect_scores(*, sport: str, days_from: int = 5, date_format: str = "iso") -> int:
    """
    Collect completed/updated scores and append to raw_scores_snapshots.

    The Odds API scores endpoint typically supports rolling windows; we default to 5 days.
    """
    settings = load_settings()
    if not settings.odds_api_key:
        raise RuntimeError("ODDS_API_KEY is required for collect_scores")

    cfg = OddsApiConfig()
    url = f"{cfg.base_url}/sports/{sport}/scores"
    params = {
        "apiKey": settings.odds_api_key,
        "daysFrom": int(days_from),
        "dateFormat": date_format,
    }

    resp = requests.get(url, params=params, timeout=60)
    resp.raise_for_status()
    payload: list[dict[str, Any]] = resp.json()

    collected_at = now_utc()
    inserted = 0

    with connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            for event in payload:
                event_id = str(event.get("id"))
                commence_time = _parse_dt(event.get("commence_time"))
                home_team = event.get("home_team")
                away_team = event.get("away_team")
                completed = event.get("completed")
                last_update = _parse_dt(event.get("last_update"))

                home_score = None
                away_score = None
                for score in event.get("scores", []) or []:
                    name = score.get("name")
                    value = score.get("score")
                    if value is None:
                        continue
                    if name == home_team:
                        home_score = int(value)
                    elif name == away_team:
                        away_score = int(value)

                cur.execute(
                    """
                    INSERT INTO raw_scores_snapshots (
                      source, sport, event_id, commence_time, home_team, away_team,
                      completed, home_score, away_score, last_update, collected_at, raw
                    ) VALUES (
                      %(source)s, %(sport)s, %(event_id)s, %(commence_time)s, %(home_team)s, %(away_team)s,
                      %(completed)s, %(home_score)s, %(away_score)s, %(last_update)s, %(collected_at)s, %(raw)s
                    )
                    ON CONFLICT DO NOTHING
                    """,
                    {
                        "source": "the_odds_api",
                        "sport": sport,
                        "event_id": event_id,
                        "commence_time": commence_time,
                        "home_team": home_team,
                        "away_team": away_team,
                        "completed": bool(completed) if completed is not None else None,
                        "home_score": home_score,
                        "away_score": away_score,
                        "last_update": last_update,
                        "collected_at": collected_at,
                        "raw": json.dumps(event),
                    },
                )
                inserted += cur.rowcount
        conn.commit()

    return inserted


if __name__ == "__main__":
    raise SystemExit("Run via `python -m odds_pipeline.cli collect-scores --sport ...`")

