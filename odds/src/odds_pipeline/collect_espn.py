from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import requests

from odds_pipeline.config import load_settings
from odds_pipeline.db import connect
from odds_pipeline.util import now_utc


@dataclass(frozen=True)
class EspnConfig:
    base_url: str = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"


def _parse_dt(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _ymd(d: date) -> str:
    return d.strftime("%Y%m%d")


def collect_espn_scoreboard(*, start_date: date, end_date: date) -> int:
    """
    Collect ESPN scoreboard events between start_date and end_date inclusive.

    ESPN supports `dates=YYYYMMDD` and returns schedules + scores in `events`.
    """
    settings = load_settings()
    cfg = EspnConfig()

    inserted = 0
    collected_at = now_utc()

    with connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            d = start_date
            while d <= end_date:
                resp = requests.get(cfg.base_url, params={"dates": _ymd(d)}, timeout=60)
                resp.raise_for_status()
                payload: dict[str, Any] = resp.json()
                for event in payload.get("events", []) or []:
                    external_event_id = str(event.get("id"))
                    commence_time = _parse_dt(event.get("date"))
                    competitions = event.get("competitions", []) or []
                    comp = competitions[0] if competitions else {}
                    status = (
                        (comp.get("status") or {}).get("type") or {}
                    ).get("name")
                    competitors = comp.get("competitors", []) or []
                    home = next((c for c in competitors if c.get("homeAway") == "home"), None)
                    away = next((c for c in competitors if c.get("homeAway") == "away"), None)
                    home_team = (((home or {}).get("team") or {}).get("displayName"))
                    away_team = (((away or {}).get("team") or {}).get("displayName"))
                    home_score = (home or {}).get("score")
                    away_score = (away or {}).get("score")

                    cur.execute(
                        """
                        INSERT INTO raw_games_snapshots (
                          source, sport, external_event_id, commence_time,
                          home_team, away_team, status, home_score, away_score,
                          collected_at, raw
                        ) VALUES (
                          %(source)s, %(sport)s, %(external_event_id)s, %(commence_time)s,
                          %(home_team)s, %(away_team)s, %(status)s, %(home_score)s, %(away_score)s,
                          %(collected_at)s, %(raw)s
                        )
                        ON CONFLICT DO NOTHING
                        """,
                        {
                            "source": "espn",
                            "sport": "basketball_ncaab",
                            "external_event_id": external_event_id,
                            "commence_time": commence_time,
                            "home_team": home_team,
                            "away_team": away_team,
                            "status": status,
                            "home_score": int(home_score) if home_score not in (None, "") else None,
                            "away_score": int(away_score) if away_score not in (None, "") else None,
                            "collected_at": collected_at,
                            "raw": json.dumps(event),
                        },
                    )
                    inserted += cur.rowcount
                d = d + timedelta(days=1)

        conn.commit()

    return inserted


def collect_espn_last_days(*, lookback_days: int = 5) -> int:
    end = now_utc().date()
    start = end - timedelta(days=int(lookback_days))
    return collect_espn_scoreboard(start_date=start, end_date=end)

