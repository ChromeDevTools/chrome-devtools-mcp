from __future__ import annotations

from datetime import timedelta

from odds_pipeline.config import load_settings
from odds_pipeline.db import connect
from odds_pipeline.util import american_to_implied_prob, now_utc


def normalize_window(*, window_days: int | None = None) -> dict[str, int]:
    """
    Normalize raw snapshots into canonical tables for the last N days.

    This implementation is SQL-first for determinism and idempotency:
    - canonical tables use UNIQUE constraints + ON CONFLICT DO NOTHING
    - reruns are safe and will not create duplicates
    """
    settings = load_settings()
    window = timedelta(days=window_days if window_days is not None else settings.window_days)
    cutoff = now_utc() - window

    counts: dict[str, int] = {"spreads": 0, "totals": 0, "moneylines": 0}

    with connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            # Spreads (non-pick'em): favorite row (point < 0) paired with underdog row (point > 0).
            cur.execute(
                """
                WITH fav AS (
                  SELECT
                    sport, event_id, commence_time, bookmaker_key, collected_at,
                    outcome_name AS favorite_team,
                    ABS(point)::numeric AS spread_magnitude,
                    price AS favorite_price
                  FROM raw_odds_snapshots
                  WHERE market_key = 'spreads'
                    AND point < 0
                    AND collected_at >= %(cutoff)s
                ),
                dog AS (
                  SELECT
                    sport, event_id, commence_time, bookmaker_key, collected_at,
                    outcome_name AS underdog_team,
                    price AS underdog_price
                  FROM raw_odds_snapshots
                  WHERE market_key = 'spreads'
                    AND point > 0
                    AND collected_at >= %(cutoff)s
                )
                INSERT INTO canonical_spreads (
                  sport, event_id, commence_time, bookmaker_key,
                  favorite_team, underdog_team, spread_magnitude,
                  favorite_price, underdog_price, collected_at
                )
                SELECT
                  fav.sport, fav.event_id, fav.commence_time, fav.bookmaker_key,
                  fav.favorite_team, dog.underdog_team, fav.spread_magnitude,
                  fav.favorite_price, dog.underdog_price, fav.collected_at
                FROM fav
                JOIN dog
                  ON dog.sport = fav.sport
                 AND dog.event_id = fav.event_id
                 AND dog.bookmaker_key = fav.bookmaker_key
                 AND dog.collected_at = fav.collected_at
                 AND dog.commence_time IS NOT DISTINCT FROM fav.commence_time
                ON CONFLICT DO NOTHING
                """,
                {"cutoff": cutoff},
            )
            counts["spreads"] = cur.rowcount

            # Spreads (pick'em, point = 0): treat home team as "favorite" for canonicalization
            # so PK games are preserved with spread_magnitude = 0.
            cur.execute(
                """
                WITH pk AS (
                  SELECT
                    sport,
                    event_id,
                    commence_time,
                    bookmaker_key,
                    collected_at,
                    MAX(home_team) AS home_team,
                    MAX(away_team) AS away_team,
                    MAX(CASE WHEN outcome_name = home_team THEN price END) AS home_price,
                    MAX(CASE WHEN outcome_name = away_team THEN price END) AS away_price
                  FROM raw_odds_snapshots
                  WHERE market_key = 'spreads'
                    AND point = 0
                    AND collected_at >= %(cutoff)s
                  GROUP BY sport, event_id, commence_time, bookmaker_key, collected_at
                )
                INSERT INTO canonical_spreads (
                  sport, event_id, commence_time, bookmaker_key,
                  favorite_team, underdog_team, spread_magnitude,
                  favorite_price, underdog_price, collected_at
                )
                SELECT
                  sport,
                  event_id,
                  commence_time,
                  bookmaker_key,
                  home_team AS favorite_team,
                  away_team AS underdog_team,
                  0::numeric AS spread_magnitude,
                  home_price AS favorite_price,
                  away_price AS underdog_price,
                  collected_at
                FROM pk
                ON CONFLICT DO NOTHING
                """,
                {"cutoff": cutoff},
            )
            counts["spreads"] += cur.rowcount

            # Totals: one canonical total per event/book/collected_at using over+under prices on the same number.
            cur.execute(
                """
                WITH over AS (
                  SELECT
                    sport, event_id, commence_time, bookmaker_key, collected_at,
                    point::numeric AS total,
                    price AS over_price
                  FROM raw_odds_snapshots
                  WHERE market_key = 'totals'
                    AND outcome_name ILIKE 'over%'
                    AND collected_at >= %(cutoff)s
                ),
                under AS (
                  SELECT
                    sport, event_id, commence_time, bookmaker_key, collected_at,
                    point::numeric AS total,
                    price AS under_price
                  FROM raw_odds_snapshots
                  WHERE market_key = 'totals'
                    AND outcome_name ILIKE 'under%'
                    AND collected_at >= %(cutoff)s
                )
                INSERT INTO canonical_totals (
                  sport, event_id, commence_time, bookmaker_key,
                  total, over_price, under_price, collected_at
                )
                SELECT
                  over.sport, over.event_id, over.commence_time, over.bookmaker_key,
                  over.total, over.over_price, under.under_price, over.collected_at
                FROM over
                JOIN under
                  ON under.sport = over.sport
                 AND under.event_id = over.event_id
                 AND under.bookmaker_key = over.bookmaker_key
                 AND under.collected_at = over.collected_at
                 AND under.total = over.total
                 AND under.commence_time IS NOT DISTINCT FROM over.commence_time
                ON CONFLICT DO NOTHING
                """,
                {"cutoff": cutoff},
            )
            counts["totals"] = cur.rowcount

            # Moneylines: keep prices and compute implied probs in Python for correctness.
            cur.execute(
                """
                SELECT sport, event_id, commence_time, bookmaker_key, collected_at,
                       home_team, away_team,
                       MAX(CASE WHEN outcome_name = home_team THEN price END) AS home_price,
                       MAX(CASE WHEN outcome_name = away_team THEN price END) AS away_price
                FROM raw_odds_snapshots
                WHERE market_key = 'h2h'
                  AND collected_at >= %(cutoff)s
                GROUP BY sport, event_id, commence_time, bookmaker_key, collected_at, home_team, away_team
                """,
                {"cutoff": cutoff},
            )
            rows = cur.fetchall()
            for (
                sport,
                event_id,
                commence_time,
                bookmaker_key,
                collected_at,
                home_team,
                away_team,
                home_price,
                away_price,
            ) in rows:
                home_prob = american_to_implied_prob(int(home_price)) if home_price is not None else None
                away_prob = american_to_implied_prob(int(away_price)) if away_price is not None else None
                cur.execute(
                    """
                    INSERT INTO canonical_moneylines (
                      sport, event_id, commence_time, bookmaker_key,
                      home_team, away_team, home_price, away_price,
                      home_implied_prob, away_implied_prob, collected_at
                    ) VALUES (
                      %(sport)s, %(event_id)s, %(commence_time)s, %(bookmaker_key)s,
                      %(home_team)s, %(away_team)s, %(home_price)s, %(away_price)s,
                      %(home_prob)s, %(away_prob)s, %(collected_at)s
                    )
                    ON CONFLICT DO NOTHING
                    """,
                    {
                        "sport": sport,
                        "event_id": event_id,
                        "commence_time": commence_time,
                        "bookmaker_key": bookmaker_key,
                        "home_team": home_team,
                        "away_team": away_team,
                        "home_price": int(home_price) if home_price is not None else None,
                        "away_price": int(away_price) if away_price is not None else None,
                        "home_prob": home_prob,
                        "away_prob": away_prob,
                        "collected_at": collected_at,
                    },
                )
                counts["moneylines"] += cur.rowcount

        conn.commit()

    return counts

