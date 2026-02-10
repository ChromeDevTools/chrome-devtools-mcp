"""Hybrid ESPN + Odds API collection for comprehensive event coverage.

Collection Strategy:
1. Fetch ALL games from ESPN (comprehensive, free)
2. Fetch odds from The Odds API (limited to games with betting lines)
3. Match odds to ESPN events where available
4. Store all events with source tracking

Result: 100% event coverage + scores, partial odds coverage

Usage:
    # Collect all upcoming games and recent scores
    uv run python scripts/collect_hybrid.py

    # Collect specific date range from ESPN
    uv run python scripts/collect_hybrid.py --espn-days 7

Environment:
    ODDS_API_KEY: Required - Your Odds API key
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

# Ensure log directory exists
Path("data/logs").mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("data/logs/hybrid_collection.log"),
    ],
)
logger = logging.getLogger(__name__)


def check_api_key() -> str:
    """Check that ODDS_API_KEY environment variable is set.

    Returns:
        API key

    Raises:
        SystemExit: If API key not found
    """
    api_key = os.getenv("ODDS_API_KEY")
    if not api_key:
        logger.error("ODDS_API_KEY environment variable not set!")
        logger.error("Set it with: export ODDS_API_KEY='your_key_here'")
        sys.exit(1)
    return api_key


async def collect_espn_events(db_path: Path, days_forward: int = 7) -> dict[str, Any]:
    """Collect comprehensive event list from ESPN.

    Args:
        db_path: Path to SQLite database
        days_forward: Days forward to collect (default: 7)

    Returns:
        Collection metrics
    """
    from sports_betting_edge.adapters.espn import fetch_scoreboard
    from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
    from sports_betting_edge.core.event_id import generate_event_id
    from sports_betting_edge.core.team_mapper import TeamMapper

    logger.info("=" * 80)
    logger.info("STEP 1: COLLECTING EVENTS FROM ESPN (COMPREHENSIVE)")
    logger.info("=" * 80)

    # Load team mapper
    try:
        mapper = TeamMapper()
    except FileNotFoundError:
        logger.error("Team mapping not found. Run scripts/create_team_mapping.py first")
        return {"events_stored": 0, "error": "No team mapping"}

    db = OddsAPIDatabase(db_path)
    events_stored = 0
    events_updated = 0

    try:
        # Collect upcoming games
        today = date.today()
        end_date = today + timedelta(days=days_forward)

        current_date = today
        while current_date <= end_date:
            logger.info(f"Fetching ESPN games for {current_date}...")

            try:
                scoreboard = await fetch_scoreboard(current_date)
                espn_games = scoreboard.get("events", [])

                logger.info(f"  Found {len(espn_games)} games on ESPN")

                for espn_event in espn_games:
                    # Extract game details
                    competitions = espn_event.get("competitions", [])
                    if not competitions:
                        continue

                    competition = competitions[0]
                    competitors = competition.get("competitors", [])
                    if len(competitors) != 2:
                        continue

                    home_comp = next((c for c in competitors if c.get("homeAway") == "home"), None)
                    away_comp = next((c for c in competitors if c.get("homeAway") == "away"), None)

                    if not home_comp or not away_comp:
                        continue

                    # Get team names
                    espn_home = home_comp.get("team", {}).get("displayName", "")
                    espn_away = away_comp.get("team", {}).get("displayName", "")

                    # Map to Odds API team names
                    kenpom_home = mapper.get_kenpom_name(espn_home, source="espn")
                    kenpom_away = mapper.get_kenpom_name(espn_away, source="espn")
                    odds_home = mapper.get_odds_api_name(kenpom_home)
                    odds_away = mapper.get_odds_api_name(kenpom_away)

                    # Get commence time
                    game_date = espn_event.get("date", "")
                    if not game_date:
                        continue

                    # Generate deterministic event ID
                    event_id = generate_event_id(odds_home, odds_away, game_date, source="espn")

                    # Check if event exists
                    existing = db.conn.execute(
                        "SELECT event_id FROM events WHERE event_id = ?",
                        (event_id,),
                    ).fetchone()

                    if existing:
                        # Update existing event
                        db.conn.execute(
                            """
                            UPDATE events
                            SET home_team = ?, away_team = ?, commence_time = ?
                            WHERE event_id = ?
                            """,
                            (odds_home, odds_away, game_date, event_id),
                        )
                        events_updated += 1
                    else:
                        # Insert new event
                        db.conn.execute(
                            """
                            INSERT INTO events
                            (event_id, sport_key, home_team, away_team, commence_time,
                             created_at, source, has_odds)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                event_id,
                                "basketball_ncaab",
                                odds_home,
                                odds_away,
                                game_date,
                                datetime.now().isoformat(),
                                "espn",
                                0,  # Will be updated if odds found
                            ),
                        )
                        events_stored += 1

                    # Check for scores (completed games)
                    status = espn_event.get("status", {})
                    status_type = status.get("type", {})
                    completed = status_type.get("completed", False)

                    if completed:
                        home_score = home_comp.get("score")
                        away_score = away_comp.get("score")

                        if home_score is not None and away_score is not None:
                            db.conn.execute(
                                """
                                INSERT OR REPLACE INTO scores
                                (event_id, sport_key, completed, home_score, away_score,
                                 last_update, fetched_at)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                                """,
                                (
                                    event_id,
                                    "basketball_ncaab",
                                    1,
                                    int(home_score),
                                    int(away_score),
                                    datetime.now().isoformat(),
                                    datetime.now().isoformat(),
                                ),
                            )

                db.conn.commit()

            except Exception as e:
                logger.error(f"Error fetching ESPN games for {current_date}: {e}")

            # Rate limit
            await asyncio.sleep(0.5)
            current_date += timedelta(days=1)

        logger.info("[OK] ESPN collection complete")
        logger.info(f"  New events: {events_stored}")
        logger.info(f"  Updated events: {events_updated}")

        return {
            "events_stored": events_stored,
            "events_updated": events_updated,
        }

    finally:
        db.close()


def collect_odds_api_odds(api_key: str, db_path: Path) -> dict[str, Any]:
    """Collect odds from The Odds API and match to existing events.

    Args:
        api_key: Odds API key
        db_path: Path to SQLite database

    Returns:
        Collection metrics
    """
    from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
    from sports_betting_edge.core.event_id import generate_event_id

    logger.info("=" * 80)
    logger.info("STEP 2: COLLECTING ODDS FROM ODDS API (WHERE AVAILABLE)")
    logger.info("=" * 80)

    base_url = "https://api.the-odds-api.com/v4"
    sport = "basketball_ncaab"
    regions = "us,us2"
    markets = "h2h,spreads,totals"

    url = f"{base_url}/sports/{sport}/odds/"
    params = {
        "apiKey": api_key,
        "regions": regions,
        "markets": markets,
        "oddsFormat": "american",
    }

    logger.info(f"Fetching odds from {url}")

    try:
        import httpx

        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            response.raise_for_status()

            remaining = response.headers.get("x-requests-remaining")
            used = response.headers.get("x-requests-used")
            logger.info(f"API Quota - Used: {used}, Remaining: {remaining}")

            odds_data = response.json()
            logger.info(f"Retrieved {len(odds_data)} events with odds")

            if len(odds_data) == 0:
                return {
                    "odds_api_events": 0,
                    "matched_events": 0,
                    "new_events": 0,
                    "observations": 0,
                    "quota_remaining": remaining,
                }

            db = OddsAPIDatabase(db_path)
            try:
                odds_api_events = 0
                matched_events = 0
                new_events = 0
                observations_stored = 0
                as_of = datetime.now().isoformat()

                for event in odds_data:
                    odds_api_event_id = event["id"]
                    home_team = event["home_team"]
                    away_team = event["away_team"]
                    commence_time = event["commence_time"]

                    # Generate ESPN-style event ID for matching
                    espn_event_id = generate_event_id(
                        home_team, away_team, commence_time, source="espn"
                    )

                    # Check if we have this event from ESPN
                    existing_espn = db.conn.execute(
                        "SELECT event_id FROM events WHERE event_id = ?",
                        (espn_event_id,),
                    ).fetchone()

                    # Check if we have this event from Odds API
                    existing_odds_api = db.conn.execute(
                        "SELECT event_id FROM events WHERE event_id = ?",
                        (odds_api_event_id,),
                    ).fetchone()

                    # Determine which event ID to use
                    if existing_espn:
                        # Use ESPN event ID (preferred - comprehensive coverage)
                        final_event_id = espn_event_id
                        matched_events += 1

                        # Update has_odds flag
                        db.conn.execute(
                            "UPDATE events SET has_odds = 1 WHERE event_id = ?",
                            (final_event_id,),
                        )
                    elif existing_odds_api:
                        # Already have this Odds API event
                        final_event_id = odds_api_event_id
                        matched_events += 1
                    else:
                        # New event not in ESPN data (shouldn't happen often)
                        final_event_id = odds_api_event_id
                        new_events += 1

                        # Store new event
                        db.conn.execute(
                            """
                            INSERT INTO events
                            (event_id, sport_key, home_team, away_team, commence_time,
                             created_at, source, has_odds)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                final_event_id,
                                sport,
                                home_team,
                                away_team,
                                commence_time,
                                as_of,
                                "odds_api",
                                1,
                            ),
                        )

                    odds_api_events += 1

                    # Store odds observations
                    for bookmaker in event.get("bookmakers", []):
                        book_key = bookmaker["key"]

                        for market in bookmaker.get("markets", []):
                            market_key = market["key"]

                            for outcome in market.get("outcomes", []):
                                outcome_name = outcome["name"]
                                price = outcome.get("price")
                                point = outcome.get("point")

                                db.conn.execute(
                                    """
                                    INSERT INTO observations
                                    (event_id, book_key, market_key, outcome_name,
                                     price_american, point, as_of, fetched_at, sport_key)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """,
                                    (
                                        final_event_id,
                                        book_key,
                                        market_key,
                                        outcome_name,
                                        price,
                                        point,
                                        as_of,
                                        as_of,
                                        sport,
                                    ),
                                )
                                observations_stored += 1

                db.conn.commit()

                logger.info("[OK] Odds API collection complete")
                logger.info(f"  Odds API events: {odds_api_events}")
                logger.info(f"  Matched to ESPN: {matched_events}")
                logger.info(f"  New events: {new_events}")
                logger.info(f"  Observations stored: {observations_stored}")

                return {
                    "odds_api_events": odds_api_events,
                    "matched_events": matched_events,
                    "new_events": new_events,
                    "observations": observations_stored,
                    "quota_remaining": remaining,
                }

            finally:
                db.close()

    except Exception as e:
        import httpx

        if isinstance(e, httpx.HTTPStatusError):
            logger.error(f"HTTP error: {e.response.status_code}")
            logger.error(f"Response: {e.response.text}")
        elif isinstance(e, httpx.RequestError):
            logger.error(f"Request error: {e}")
        raise


async def main_async(args: argparse.Namespace) -> None:
    """Run hybrid collection (async main).

    Args:
        args: Command line arguments
    """
    # Step 1: Collect comprehensive event list from ESPN
    espn_metrics = await collect_espn_events(args.db, args.espn_days)

    # Step 2: Collect odds from The Odds API (where available)
    if not args.skip_odds:
        api_key = check_api_key()
        odds_metrics = collect_odds_api_odds(api_key, args.db)
    else:
        odds_metrics = {"odds_api_events": 0, "observations": 0}

    # Summary
    logger.info("")
    logger.info("=" * 80)
    logger.info("HYBRID COLLECTION SUMMARY")
    logger.info("=" * 80)
    logger.info(f"Timestamp: {datetime.now().isoformat()}")
    logger.info("")
    logger.info("ESPN (Comprehensive Event Coverage):")
    logger.info(f"  New events: {espn_metrics.get('events_stored', 0)}")
    logger.info(f"  Updated events: {espn_metrics.get('events_updated', 0)}")
    logger.info("")
    logger.info("Odds API (Betting Lines):")
    logger.info(f"  Events with odds: {odds_metrics.get('odds_api_events', 0)}")
    logger.info(f"  Matched to ESPN events: {odds_metrics.get('matched_events', 0)}")
    logger.info(f"  Observations stored: {odds_metrics.get('observations', 0)}")
    logger.info(f"  API quota remaining: {odds_metrics.get('quota_remaining', 'unknown')}")
    logger.info("")
    logger.info("[OK] Hybrid collection complete!")
    logger.info("=" * 80)


def main() -> None:
    """Run hybrid collection (sync wrapper)."""
    parser = argparse.ArgumentParser(
        description="Hybrid ESPN + Odds API collection for comprehensive coverage"
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--espn-days",
        type=int,
        default=7,
        help="Days forward to collect from ESPN (default: 7)",
    )
    parser.add_argument(
        "--skip-odds",
        action="store_true",
        help="Skip odds collection (ESPN events only)",
    )

    args = parser.parse_args()

    logger.info("Starting hybrid collection...")
    logger.info(f"Database: {args.db}")
    logger.info("")

    try:
        asyncio.run(main_async(args))
    except Exception as e:
        logger.error(f"Collection failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
