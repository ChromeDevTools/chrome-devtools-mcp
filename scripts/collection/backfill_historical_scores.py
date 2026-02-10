"""Backfill historical scores from The Odds API.

Fills gaps in score collection for past games where we have odds but no outcomes.

Usage:
    # Backfill specific date range
    uv run python scripts/backfill_historical_scores.py \
        --start 2025-12-28 \
        --end 2026-01-23

    # Dry run (show what would be fetched without making API calls)
    uv run python scripts/backfill_historical_scores.py \
        --start 2025-12-28 \
        --end 2026-01-23 \
        --dry-run

    # Auto-detect gaps and backfill
    uv run python scripts/backfill_historical_scores.py --auto-detect

Environment:
    ODDS_API_KEY: Required - Your Odds API key
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("data/logs/backfill_scores.log"),
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


def detect_missing_date_range(db_path: Path) -> tuple[date, date] | None:
    """Detect date range with missing scores.

    Args:
        db_path: Path to SQLite database

    Returns:
        (start_date, end_date) tuple if gaps found, None otherwise
    """
    db = OddsAPIDatabase(str(db_path))

    try:
        # Find earliest event and earliest score
        query = """
            WITH event_dates AS (
                SELECT MIN(DATE(commence_time)) as earliest_event,
                       MAX(DATE(commence_time)) as latest_event
                FROM events
                WHERE DATE(commence_time) < DATE('now')
            ),
            score_dates AS (
                SELECT MIN(DATE(e.commence_time)) as earliest_score,
                       MAX(DATE(e.commence_time)) as latest_score
                FROM scores s
                INNER JOIN events e ON s.event_id = e.event_id
                WHERE s.completed = 1
            )
            SELECT
                event_dates.earliest_event,
                score_dates.earliest_score,
                event_dates.latest_event
            FROM event_dates, score_dates
        """

        result = db.conn.execute(query).fetchone()

        if not result:
            logger.warning("No events found in database")
            return None

        earliest_event, earliest_score, latest_event = result

        if earliest_score is None:
            # No scores at all
            logger.info(f"No scores found. Need to backfill: {earliest_event} to {latest_event}")
            return (
                datetime.fromisoformat(earliest_event).date(),
                datetime.fromisoformat(latest_event).date(),
            )

        # Check if there's a gap
        earliest_event_date = datetime.fromisoformat(earliest_event).date()
        earliest_score_date = datetime.fromisoformat(earliest_score).date()

        if earliest_event_date < earliest_score_date:
            # Gap detected
            gap_end = earliest_score_date - timedelta(days=1)
            logger.info(
                f"Gap detected: {earliest_event_date} to {gap_end} "
                f"(scores start at {earliest_score_date})"
            )
            return (earliest_event_date, gap_end)

        logger.info("[OK] No gaps detected in score collection")
        return None

    finally:
        db.close()


def backfill_scores_for_date(
    api_key: str,
    db: OddsAPIDatabase,
    target_date: date,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Fetch and store scores for a specific date.

    Args:
        api_key: Odds API key
        db: Database adapter
        target_date: Date to fetch scores for
        dry_run: If True, log what would be fetched without making API calls

    Returns:
        Dictionary with collection metrics
    """
    base_url = "https://api.the-odds-api.com/v4"
    sport = "basketball_ncaab"

    # The Odds API uses daysFrom parameter to fetch historical scores
    # IMPORTANT: The API has a limit on historical data (typically 3 days)
    # We need to calculate days from today to target_date
    days_ago = (date.today() - target_date).days

    if days_ago < 0:
        logger.warning(f"Cannot fetch future date: {target_date}")
        return {"scores": 0, "skipped": True}

    # Check if date is beyond API's historical limit
    MAX_DAYS_BACK = 3  # Odds API typically only keeps last 3 days
    if days_ago > MAX_DAYS_BACK:
        logger.warning(
            f"Cannot fetch {target_date} ({days_ago} days ago): "
            f"Odds API only provides last {MAX_DAYS_BACK} days of scores"
        )
        return {"scores": 0, "too_old": True, "days_ago": days_ago}

    url = f"{base_url}/sports/{sport}/scores/"
    params: dict[str, str | int] = {
        "apiKey": api_key,
        "daysFrom": days_ago,
        "dateFormat": "iso",
    }

    logger.info(f"Fetching scores for {target_date} (daysFrom={days_ago})...")

    if dry_run:
        logger.info(f"[DRY RUN] Would fetch: {url}")
        logger.info(f"[DRY RUN] Parameters: {params}")
        return {"scores": 0, "dry_run": True}

    try:
        import httpx

        with httpx.Client(timeout=30.0) as client:
            response = client.get(url, params=params)
            response.raise_for_status()

            # Check quota
            remaining = response.headers.get("x-requests-remaining")
            used = response.headers.get("x-requests-used")
            logger.info(f"API Quota - Used: {used}, Remaining: {remaining}")

            scores_data = response.json()

            # Filter for completed games on target date
            completed_games = [
                g
                for g in scores_data
                if g.get("completed") is True
                and datetime.fromisoformat(g["commence_time"].replace("Z", "+00:00")).date()
                == target_date
            ]

            logger.info(f"Found {len(completed_games)} completed games on {target_date}")

            # Store scores
            scores_stored = 0
            scores_updated = 0
            scores_skipped = 0

            for game in completed_games:
                event_id = game["id"]
                home_team = game["home_team"]
                away_team = game["away_team"]

                # Get scores from the 'scores' field
                scores = game.get("scores")
                if not scores or len(scores) < 2:
                    logger.debug(f"Skipping {event_id}: incomplete scores")
                    scores_skipped += 1
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
                    # Check if score already exists
                    existing = db.conn.execute(
                        "SELECT event_id FROM scores WHERE event_id = ?",
                        (event_id,),
                    ).fetchone()

                    if existing:
                        # Update existing score
                        db.conn.execute(
                            """
                            UPDATE scores
                            SET sport_key = ?,
                                completed = ?,
                                home_score = ?,
                                away_score = ?,
                                last_update = ?,
                                fetched_at = ?
                            WHERE event_id = ?
                            """,
                            (
                                "basketball_ncaab",
                                1,
                                home_score,
                                away_score,
                                game.get("last_update", datetime.now().isoformat()),
                                datetime.now().isoformat(),
                                event_id,
                            ),
                        )
                        scores_updated += 1
                    else:
                        # Insert new score
                        db.conn.execute(
                            """
                            INSERT INTO scores
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

            if scores_stored > 0:
                logger.info(f"[OK] Stored {scores_stored} new scores for {target_date}")
            if scores_updated > 0:
                logger.info(f"[OK] Updated {scores_updated} existing scores for {target_date}")
            if scores_skipped > 0:
                logger.debug(f"Skipped {scores_skipped} incomplete scores")

            return {
                "scores_stored": scores_stored,
                "scores_updated": scores_updated,
                "scores_skipped": scores_skipped,
                "quota_remaining": remaining,
            }

    except Exception as e:
        import httpx

        if isinstance(e, httpx.HTTPStatusError):
            if e.response.status_code == 404:
                logger.info(f"No scores available for {target_date}")
                return {"scores_stored": 0, "not_found": True}
            else:
                logger.error(f"HTTP error for {target_date}: {e.response.status_code}")
                logger.error(f"Response: {e.response.text}")
                raise
        elif isinstance(e, httpx.RequestError):
            logger.error(f"Request error for {target_date}: {e}")
            raise
        else:
            raise


def backfill_date_range(
    api_key: str,
    db_path: Path,
    start_date: date,
    end_date: date,
    dry_run: bool = False,
) -> None:
    """Backfill scores for a date range.

    Args:
        api_key: Odds API key
        db_path: Path to SQLite database
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
        dry_run: If True, show what would be fetched without making API calls
    """
    # Validate date range
    if start_date > end_date:
        logger.error(f"Invalid date range: {start_date} > {end_date}")
        sys.exit(1)

    if end_date > date.today():
        logger.warning(f"End date {end_date} is in the future, limiting to today")
        end_date = date.today()

    num_days = (end_date - start_date).days + 1

    logger.info("=" * 80)
    logger.info("HISTORICAL SCORES BACKFILL")
    logger.info("=" * 80)
    logger.info(f"Date range: {start_date} to {end_date}")
    logger.info(f"Total days: {num_days}")
    logger.info(f"Dry run: {dry_run}")
    logger.info("=" * 80)

    if dry_run:
        logger.info("\n[DRY RUN] No API calls will be made\n")

    # Initialize database
    db = OddsAPIDatabase(db_path)

    try:
        current_date = start_date
        total_stored = 0
        total_updated = 0
        total_skipped = 0
        total_too_old = 0

        while current_date <= end_date:
            metrics = backfill_scores_for_date(api_key, db, current_date, dry_run)

            total_stored += metrics.get("scores_stored", 0)
            total_updated += metrics.get("scores_updated", 0)
            total_skipped += metrics.get("scores_skipped", 0)
            if metrics.get("too_old"):
                total_too_old += 1

            current_date += timedelta(days=1)

        logger.info("\n" + "=" * 80)
        logger.info("BACKFILL SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Date range: {start_date} to {end_date}")
        logger.info(f"Days processed: {num_days}")
        logger.info(f"New scores stored: {total_stored}")
        logger.info(f"Existing scores updated: {total_updated}")
        logger.info(f"Incomplete scores skipped: {total_skipped}")
        logger.info(f"Days beyond API limit: {total_too_old}")
        logger.info(f"Total scores: {total_stored + total_updated}")

        if total_too_old > 0:
            logger.warning(
                f"\n[WARNING] Could not backfill {total_too_old} days "
                f"(beyond Odds API's 3-day historical limit)"
            )

        if not dry_run:
            logger.info("\n[OK] Backfill complete!")
        else:
            logger.info("\n[DRY RUN] Complete (no changes made)")

    finally:
        db.close()


def main() -> None:
    """Run historical scores backfill."""
    parser = argparse.ArgumentParser(description="Backfill historical scores from Odds API")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--start",
        type=lambda s: datetime.fromisoformat(s).date(),
        help="Start date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end",
        type=lambda s: datetime.fromisoformat(s).date(),
        help="End date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--auto-detect",
        action="store_true",
        help="Auto-detect missing date range and backfill",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be fetched without making API calls",
    )

    args = parser.parse_args()

    # Ensure log directory exists
    Path("data/logs").mkdir(parents=True, exist_ok=True)

    # Check API key
    api_key = check_api_key()

    # Determine date range
    if args.auto_detect:
        logger.info("Auto-detecting missing date range...")
        date_range = detect_missing_date_range(args.db)

        if date_range is None:
            logger.info("[OK] No backfill needed!")
            return

        start_date, end_date = date_range
        logger.info(f"Detected gap: {start_date} to {end_date}")

    elif args.start and args.end:
        start_date = args.start
        end_date = args.end

    else:
        logger.error("Must specify either --auto-detect or both --start and --end")
        parser.print_help()
        sys.exit(1)

    # Run backfill
    try:
        backfill_date_range(api_key, args.db, start_date, end_date, args.dry_run)
    except Exception as e:
        logger.error(f"Backfill failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
