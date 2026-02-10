"""Daily odds and scores collection for NCAA Basketball.

Collects:
1. Current odds (spreads, totals, moneylines) from all bookmakers
2. Scores for recently completed games
3. Logs collection metrics

Designed to run once daily (or multiple times per day during game days).

Usage:
    # Collect current odds + scores from last 3 days
    uv run python scripts/collect_daily.py

    # Custom date range for scores
    uv run python scripts/collect_daily.py --scores-days 7

Environment:
    ODDS_API_KEY: Required - Your Odds API key
"""

import argparse
import logging
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx

# Ensure log directory exists
Path("data/logs").mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("data/logs/daily_collection.log"),
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


def collect_current_odds(api_key: str, db_path: Path) -> dict:
    """Collect current odds for all upcoming games.

    Args:
        api_key: Odds API key
        db_path: Path to SQLite database

    Returns:
        Collection metrics
    """
    from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

    logger.info("=" * 60)
    logger.info("COLLECTING CURRENT ODDS")
    logger.info("=" * 60)

    base_url = "https://api.the-odds-api.com/v4"
    sport = "basketball_ncaab"
    regions = "us,us2"
    markets = "h2h,spreads,totals"

    # Get upcoming games
    url = f"{base_url}/sports/{sport}/odds/"
    params = {
        "apiKey": api_key,
        "regions": regions,
        "markets": markets,
        "oddsFormat": "american",
    }

    logger.info(f"Fetching odds from {url}")
    logger.info(f"Regions: {regions}")
    logger.info(f"Markets: {markets}")

    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            response.raise_for_status()

            # Check quota
            remaining = response.headers.get("x-requests-remaining")
            used = response.headers.get("x-requests-used")
            logger.info(f"API Quota - Used: {used}, Remaining: {remaining}")

            odds_data = response.json()
            logger.info(f"Retrieved {len(odds_data)} events with odds")

            # Store in database
            if len(odds_data) > 0:
                db = OddsAPIDatabase(db_path)
                try:
                    # Store events and observations
                    events_stored = 0
                    observations_stored = 0
                    as_of = datetime.now().isoformat()

                    for event in odds_data:
                        event_id = event["id"]
                        home_team = event["home_team"]
                        away_team = event["away_team"]
                        commence_time = event["commence_time"]

                        # Store event
                        db.conn.execute(
                            """
                            INSERT OR REPLACE INTO events
                            (event_id, sport_key, home_team, away_team, commence_time, created_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                            """,
                            (event_id, sport, home_team, away_team, commence_time, as_of),
                        )
                        events_stored += 1

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
                                            event_id,
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
                    logger.info(f"[OK] Stored {events_stored} events")
                    logger.info(f"[OK] Stored {observations_stored} observations")

                    return {
                        "events": events_stored,
                        "observations": observations_stored,
                        "quota_remaining": remaining,
                    }
                finally:
                    db.close()
            else:
                logger.warning("No events retrieved from API")
                return {"events": 0, "observations": 0, "quota_remaining": remaining}

    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error: {e.response.status_code}")
        logger.error(f"Response: {e.response.text}")
        raise
    except httpx.RequestError as e:
        logger.error(f"Request error: {e}")
        raise


def collect_recent_scores(api_key: str, db_path: Path, days_back: int = 3) -> dict:
    """Collect scores for recently completed games.

    Args:
        api_key: Odds API key
        db_path: Path to SQLite database
        days_back: How many days back to collect scores

    Returns:
        Collection metrics
    """
    from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

    logger.info("=" * 60)
    logger.info(f"COLLECTING SCORES (LAST {days_back} DAYS)")
    logger.info("=" * 60)

    base_url = "https://api.the-odds-api.com/v4"
    sport = "basketball_ncaab"

    # Calculate date range
    end_date = date.today()
    start_date = end_date - timedelta(days=days_back)

    logger.info(f"Date range: {start_date} to {end_date}")

    scores_stored = 0
    db = OddsAPIDatabase(db_path)

    try:
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            url = f"{base_url}/sports/{sport}/scores/"

            params = {
                "apiKey": api_key,
                "daysFrom": 1,  # Just this specific date
                "dateFormat": "iso",
            }

            logger.info(f"Fetching scores for {date_str}")

            try:
                with httpx.Client(timeout=30.0) as client:
                    response = client.get(url, params=params)
                    response.raise_for_status()

                    # Check quota
                    remaining = response.headers.get("x-requests-remaining")
                    logger.info(f"API Quota Remaining: {remaining}")

                    scores_data = response.json()
                    completed_games = [g for g in scores_data if g.get("completed") is True]

                    logger.info(f"Found {len(completed_games)} completed games on {date_str}")

                    # Store scores
                    for game in completed_games:
                        event_id = game["id"]
                        home_team = game["home_team"]
                        away_team = game["away_team"]

                        # Get scores from the 'scores' field
                        scores = game.get("scores")
                        if not scores or len(scores) < 2:
                            continue

                        # Find home and away scores
                        home_score = None
                        away_score = None

                        for score in scores:
                            if score["name"] == home_team:
                                home_score = score.get("score")
                            elif score["name"] == away_team:
                                away_score = score.get("score")

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
                                    home_score,
                                    away_score,
                                    game.get("last_update", datetime.now().isoformat()),
                                    datetime.now().isoformat(),
                                ),
                            )
                            scores_stored += 1

                    db.conn.commit()

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    logger.info(f"No scores available for {date_str}")
                else:
                    logger.error(f"HTTP error for {date_str}: {e.response.status_code}")
            except httpx.RequestError as e:
                logger.error(f"Request error for {date_str}: {e}")

            current_date += timedelta(days=1)

        logger.info(f"[OK] Stored {scores_stored} total scores")
        return {"scores": scores_stored}

    finally:
        db.close()


def log_collection_summary(odds_metrics: dict, scores_metrics: dict) -> None:
    """Log summary of collection run.

    Args:
        odds_metrics: Metrics from odds collection
        scores_metrics: Metrics from scores collection
    """
    logger.info("=" * 60)
    logger.info("COLLECTION SUMMARY")
    logger.info("=" * 60)
    logger.info(f"Timestamp: {datetime.now().isoformat()}")
    logger.info("")
    logger.info("Odds Collection:")
    logger.info(f"  Events stored: {odds_metrics.get('events', 0)}")
    logger.info(f"  Observations stored: {odds_metrics.get('observations', 0)}")
    logger.info(f"  API quota remaining: {odds_metrics.get('quota_remaining', 'unknown')}")
    logger.info("")
    logger.info("Scores Collection:")
    logger.info(f"  Scores stored: {scores_metrics.get('scores', 0)}")
    logger.info("")
    logger.info("[OK] Daily collection complete!")
    logger.info("=" * 60)


def main() -> None:
    """Run daily collection."""
    parser = argparse.ArgumentParser(description="Daily odds and scores collection")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--scores-days",
        type=int,
        default=3,
        help="Days back to collect scores (default: 3)",
    )
    parser.add_argument(
        "--skip-odds",
        action="store_true",
        help="Skip odds collection (scores only)",
    )
    parser.add_argument(
        "--skip-scores",
        action="store_true",
        help="Skip scores collection (odds only)",
    )

    args = parser.parse_args()

    # Ensure log directory exists
    Path("data/logs").mkdir(parents=True, exist_ok=True)

    # Check API key
    api_key = check_api_key()

    logger.info("Starting daily collection...")
    logger.info(f"Database: {args.db}")

    try:
        # Collect current odds
        odds_metrics = {}
        if not args.skip_odds:
            odds_metrics = collect_current_odds(api_key, args.db)

        # Collect recent scores
        scores_metrics = {}
        if not args.skip_scores:
            scores_metrics = collect_recent_scores(api_key, args.db, args.scores_days)

        # Log summary
        log_collection_summary(odds_metrics, scores_metrics)

    except Exception as e:
        logger.error(f"Collection failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
