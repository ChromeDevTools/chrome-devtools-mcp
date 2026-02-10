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
    # Odds API uses ISO timestamps with Z.
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def collect_odds(
    *,
    sport: str,
    regions: str,
    markets: str,
    odds_format: str = "american",
    date_format: str = "iso",
) -> int:
    """
    Collect odds snapshots and append to raw_odds_snapshots.

    Notes:
    - This collector is intentionally simple and idempotent by UNIQUE constraint.
    - Requires ODDS_API_KEY and DATABASE_URL.
    """
    settings = load_settings()
    if not settings.odds_api_key:
        raise RuntimeError("ODDS_API_KEY is required for collect_odds")

    cfg = OddsApiConfig()
    url = f"{cfg.base_url}/sports/{sport}/odds"
    params = {
        "apiKey": settings.odds_api_key,
        "regions": regions,
        "markets": markets,
        "oddsFormat": odds_format,
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
                for bookmaker in event.get("bookmakers", []) or []:
                    bookmaker_key = bookmaker.get("key")
                    for market in bookmaker.get("markets", []) or []:
                        market_key = market.get("key")
                        for outcome in market.get("outcomes", []) or []:
                            outcome_name = outcome.get("name")
                            price = outcome.get("price")
                            point = outcome.get("point")
                            raw = {
                                "event": event,
                                "bookmaker": bookmaker_key,
                                "market": market_key,
                                "outcome": outcome,
                            }
                            cur.execute(
                                """
                                INSERT INTO raw_odds_snapshots (
                                  source, sport, event_id, commence_time, home_team, away_team,
                                  bookmaker_key, market_key, outcome_name, price, point, collected_at, raw
                                ) VALUES (
                                  %(source)s, %(sport)s, %(event_id)s, %(commence_time)s, %(home_team)s, %(away_team)s,
                                  %(bookmaker_key)s, %(market_key)s, %(outcome_name)s, %(price)s, %(point)s, %(collected_at)s, %(raw)s
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
                                    "bookmaker_key": bookmaker_key,
                                    "market_key": market_key,
                                    "outcome_name": outcome_name,
                                    "price": int(price) if price is not None else None,
                                    "point": float(point) if point is not None else None,
                                    "collected_at": collected_at,
                                    "raw": json.dumps(raw),
                                },
                            )
                            inserted += cur.rowcount
        conn.commit()

    return inserted


if __name__ == "__main__":
    # Basic manual test; prefer running via cli.py in workflows.
    raise SystemExit(
        "Run via `python -m odds_pipeline.cli collect-odds --sport ...`"
    )

