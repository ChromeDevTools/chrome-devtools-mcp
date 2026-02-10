"""Backfill scores using The Odds API scores endpoint.

This script uses the Odds API's /scores endpoint instead of ESPN,
which provides exact event ID matching (no team name matching required).

Usage:
    python scripts/backfill_odds_api_scores.py --days-from 3
    python scripts/backfill_odds_api_scores.py --days-from 2 --dry-run

Cost:
    2 API credits per request (daysFrom parameter)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sqlite3
from pathlib import Path
from typing import Any

from sports_betting_edge.adapters.odds_api import OddsAPIAdapter
from sports_betting_edge.config.logging import configure_logging

logger = logging.getLogger(__name__)


async def fetch_scores(adapter: OddsAPIAdapter, days_from: int = 3) -> list[dict[str, Any]]:
    """Fetch scores from Odds API.

    Args:
        adapter: Odds API adapter
        days_from: Number of days to look back (1-3)

    Returns:
        List of events with scores
    """
    logger.info(f"Fetching scores from Odds API (last {days_from} days)...")
    scores = await adapter.get_ncaab_scores(days_from=days_from)
    logger.info(f"  Received {len(scores)} events from Odds API")
    return scores


def update_scores_in_database(
    db_path: str, scores_data: list[dict[str, Any]], dry_run: bool = False
) -> dict[str, int]:
    """Update scores in database.

    Args:
        db_path: Path to SQLite database
        scores_data: List of score events from Odds API
        dry_run: If True, don't actually update database

    Returns:
        Dictionary with update statistics
    """
    stats = {
        "total_received": len(scores_data),
        "completed_games": 0,
        "in_progress_games": 0,
        "not_started": 0,
        "new_scores": 0,
        "updated_scores": 0,
        "events_not_in_db": 0,
    }

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for event in scores_data:
        event_id = event.get("id")
        completed = event.get("completed", False)
        scores = event.get("scores") or []  # Handle None case

        # Categorize event status
        if completed:
            stats["completed_games"] += 1
        elif len(scores) > 0:
            stats["in_progress_games"] += 1
        else:
            stats["not_started"] += 1

        # Only process completed games with scores
        if not completed or len(scores) == 0:
            continue

        # Extract scores
        home_score = None
        away_score = None
        for score in scores:
            team_name = score.get("name")
            team_score = score.get("score")

            if team_name == event.get("home_team"):
                home_score = team_score
            elif team_name == event.get("away_team"):
                away_score = team_score

        if home_score is None or away_score is None:
            logger.warning(
                f"  Event {event_id}: Incomplete scores (home={home_score}, away={away_score})"
            )
            continue

        # Check if event exists in our database
        cursor.execute("SELECT event_id FROM events WHERE event_id = ?", (event_id,))
        if cursor.fetchone() is None:
            stats["events_not_in_db"] += 1
            logger.debug(f"  Event {event_id}: Not in database (skipping)")
            continue

        # Check if score already exists
        cursor.execute("SELECT event_id FROM scores WHERE event_id = ?", (event_id,))
        existing = cursor.fetchone()

        if existing:
            # Update existing score
            if not dry_run:
                cursor.execute(
                    """
                    UPDATE scores
                    SET home_score = ?, away_score = ?, completed = 1,
                        last_update = ?, fetched_at = CURRENT_TIMESTAMP
                    WHERE event_id = ?
                """,
                    (home_score, away_score, event.get("last_update"), event_id),
                )
            stats["updated_scores"] += 1
            home_team = event.get("home_team", "")[:25]
            away_team = event.get("away_team", "")[:25]
            logger.info(
                f"  [UPDATE] {event_id}: {home_team} {home_score} - {away_score} {away_team}"
            )
        else:
            # Insert new score
            if not dry_run:
                cursor.execute(
                    """
                    INSERT INTO scores (
                        event_id, sport_key, completed,
                        home_score, away_score, last_update, fetched_at
                    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                    (
                        event_id,
                        event.get("sport_key", "basketball_ncaab"),
                        1,
                        home_score,
                        away_score,
                        event.get("last_update"),
                    ),
                )
            stats["new_scores"] += 1
            home_team = event.get("home_team", "")[:25]
            away_team = event.get("away_team", "")[:25]
            logger.info(f"  [NEW] {event_id}: {home_team} {home_score} - {away_score} {away_team}")

    if not dry_run:
        conn.commit()
        logger.info(
            f"  Committed {stats['new_scores'] + stats['updated_scores']} score updates to database"
        )
    else:
        logger.info(
            f"  [DRY RUN] Would have updated {stats['new_scores'] + stats['updated_scores']} scores"
        )

    conn.close()
    return stats


async def main() -> None:
    """Main backfill function."""
    parser = argparse.ArgumentParser(description="Backfill scores from Odds API")
    parser.add_argument(
        "--days-from",
        type=int,
        default=3,
        choices=[1, 2, 3],
        help="Days to look back (1-3, default: 3)",
    )
    parser.add_argument(
        "--db-path",
        default="data/odds_api/odds_api.sqlite3",
        help="Path to SQLite database",
    )
    parser.add_argument("--dry-run", action="store_true", help="Don't actually update database")
    args = parser.parse_args()

    logger.info("=" * 80)
    logger.info("ODDS API SCORES BACKFILL")
    logger.info("=" * 80)
    logger.info(f"Days from: {args.days_from}")
    logger.info(f"Database: {args.db_path}")
    logger.info(f"Dry run: {args.dry_run}")
    logger.info("=" * 80)

    # Verify database exists
    db_path = Path(args.db_path)
    if not db_path.exists():
        logger.error(f"Database not found: {db_path}")
        return

    # Initialize Odds API adapter
    adapter = OddsAPIAdapter()

    try:
        # Fetch scores
        scores_data = await fetch_scores(adapter, days_from=args.days_from)

        # Update database
        logger.info("\nUpdating scores in database...")
        stats = update_scores_in_database(str(db_path), scores_data, dry_run=args.dry_run)

        # Print summary
        logger.info("\n" + "=" * 80)
        logger.info("BACKFILL SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Total events received: {stats['total_received']}")
        logger.info(f"  Completed games: {stats['completed_games']}")
        logger.info(f"  In progress: {stats['in_progress_games']}")
        logger.info(f"  Not started: {stats['not_started']}")
        logger.info("\nScore updates:")
        logger.info(f"  New scores inserted: {stats['new_scores']}")
        logger.info(f"  Existing scores updated: {stats['updated_scores']}")
        logger.info(f"  Events not in database: {stats['events_not_in_db']}")
        logger.info(f"\nTotal scores updated: {stats['new_scores'] + stats['updated_scores']}")

        if args.dry_run:
            logger.info("\n[DRY RUN] No changes were made to the database")
        else:
            logger.info("\n[OK] Scores backfill complete!")

        # Check quota
        if adapter._quota_remaining is not None:
            logger.info(f"\nAPI Quota: {adapter._quota_remaining} requests remaining")

    finally:
        await adapter.close()


if __name__ == "__main__":
    configure_logging()
    asyncio.run(main())
