"""Backfill missing scores from ESPN scoreboard API.

Uses ESPN's public scoreboard API to fill gaps in score collection where
The Odds API historical data is unavailable (beyond 3-day limit).

Usage:
    # Auto-detect missing scores and backfill from ESPN
    uv run python scripts/backfill_espn_scores.py --auto-detect

    # Backfill specific date range
    uv run python scripts/backfill_espn_scores.py \
        --start 2025-12-28 \
        --end 2026-01-23

    # Dry run (show what would be fetched without storing)
    uv run python scripts/backfill_espn_scores.py \
        --start 2025-12-28 \
        --end 2026-01-23 \
        --dry-run

Notes:
    - Matches ESPN games to Odds API events using team mapper
    - Only fills scores for events that exist in our database
    - Stores in same format as Odds API scores
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from sports_betting_edge.adapters.espn import (
    ESPNClient,
    parse_espn_score,
)
from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.core.team_mapper import TeamMapper

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("data/logs/backfill_espn_scores.log"),
    ],
)
logger = logging.getLogger(__name__)


def detect_missing_date_range(db_path: Path) -> tuple[date, date] | None:
    """Detect date range with missing scores.

    Args:
        db_path: Path to SQLite database

    Returns:
        (start_date, end_date) tuple if gaps found, None otherwise
    """
    db = OddsAPIDatabase(str(db_path))

    try:
        query = """
            WITH event_dates AS (
                SELECT MIN(DATE(commence_time)) as earliest_event,
                       MAX(DATE(commence_time)) as latest_event
                FROM events
                WHERE DATE(commence_time) < DATE('now')
            ),
            score_dates AS (
                SELECT MIN(DATE(e.commence_time)) as earliest_score
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
            return (
                datetime.fromisoformat(earliest_event).date(),
                datetime.fromisoformat(latest_event).date(),
            )

        earliest_event_date = datetime.fromisoformat(earliest_event).date()
        earliest_score_date = datetime.fromisoformat(earliest_score).date()

        if earliest_event_date < earliest_score_date:
            # Also check for missing scores in recent dates
            gap_end = min(earliest_score_date - timedelta(days=1), date.today())
            logger.info(
                f"Gap detected: {earliest_event_date} to {gap_end} "
                f"(scores start at {earliest_score_date})"
            )
            return (earliest_event_date, gap_end)

        logger.info("[OK] No gaps detected in score collection")
        return None

    finally:
        db.close()


def store_espn_scores(
    espn_events: list[dict[str, Any]],
    db: OddsAPIDatabase,
    team_mapper: TeamMapper,
    target_date: date,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Parse and store scores from pre-fetched ESPN events.

    Args:
        espn_events: Raw event dicts from ESPN scoreboard API.
        db: Database adapter.
        team_mapper: Team name mapper.
        target_date: Date these events belong to (for logging/event creation).
        dry_run: If True, log what would be stored without making changes.

    Returns:
        Dictionary with collection metrics.
    """
    logger.info(
        "Processing %d ESPN events for %s...",
        len(espn_events),
        target_date,
    )

    if not espn_events:
        return {"scores_stored": 0, "scores_updated": 0, "no_games": True}

    # Get our events for this date from database
    our_events = pd.read_sql_query(
        """
        SELECT event_id, home_team, away_team, commence_time
        FROM events
        WHERE DATE(commence_time) = ?
        """,
        db.conn,
        params=(target_date.strftime("%Y-%m-%d"),),
    )

    logger.info(
        "  We have %d events in database for %s",
        len(our_events),
        target_date,
    )

    scores_stored = 0
    scores_updated = 0
    scores_skipped = 0
    events_created = 0
    match_failures: list[str] = []

    for espn_event in espn_events:
        score = parse_espn_score(espn_event)
        if score is None:
            continue

        if not score["completed"]:
            continue

        espn_home_team = score["espn_home_team"]
        espn_away_team = score["espn_away_team"]
        home_score = score["home_score"]
        away_score = score["away_score"]

        # Convert ESPN team names to Odds API names
        odds_home_team = team_mapper.get_odds_api_name(
            team_mapper.get_kenpom_name(espn_home_team, source="espn")
        )
        odds_away_team = team_mapper.get_odds_api_name(
            team_mapper.get_kenpom_name(espn_away_team, source="espn")
        )

        # Find matching event in our database
        matching_event = our_events[
            (
                (our_events["home_team"] == odds_home_team)
                & (our_events["away_team"] == odds_away_team)
            )
            | (
                (our_events["home_team"] == espn_home_team)
                & (our_events["away_team"] == espn_away_team)
            )
        ]

        # If no matching event exists, create one
        if len(matching_event) == 0:
            import hashlib

            espn_id = score["game_id"]
            event_id = (
                espn_id
                if espn_id
                else hashlib.md5(
                    f"{odds_away_team}@{odds_home_team}_{target_date}".encode()
                ).hexdigest()
            )

            commence_time = score["game_date"] if score["game_date"] else f"{target_date}T12:00:00Z"

            if dry_run:
                logger.info(
                    "  [DRY RUN] Would create event: %s @ %s (event_id: %s)",
                    espn_away_team,
                    espn_home_team,
                    event_id,
                )
            else:
                try:
                    db.conn.execute(
                        """
                        INSERT INTO events
                        (event_id, home_team, away_team,
                         commence_time, sport_key, created_at,
                         has_odds)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            event_id,
                            odds_home_team,
                            odds_away_team,
                            commence_time,
                            "basketball_ncaab",
                            datetime.now().isoformat(),
                            0,
                        ),
                    )
                    events_created += 1
                    logger.info(
                        "  Created event: %s @ %s (event_id: %s)",
                        odds_away_team,
                        odds_home_team,
                        event_id,
                    )
                except Exception as e:
                    logger.debug("  Event creation failed (may exist): %s", e)
        else:
            event_id = matching_event.iloc[0]["event_id"]

        if dry_run:
            logger.info(
                "  [DRY RUN] Would store: %s %s @ %s %s (event_id: %s)",
                espn_away_team,
                away_score,
                espn_home_team,
                home_score,
                event_id,
            )
            scores_stored += 1
            continue

        # Check if score already exists
        existing = db.conn.execute(
            "SELECT event_id FROM scores WHERE event_id = ?",
            (event_id,),
        ).fetchone()

        now_iso = datetime.now().isoformat()
        if existing:
            db.conn.execute(
                """
                UPDATE scores
                SET sport_key = ?, completed = ?,
                    home_score = ?, away_score = ?,
                    last_update = ?, fetched_at = ?
                WHERE event_id = ?
                """,
                (
                    "basketball_ncaab",
                    1,
                    int(home_score),
                    int(away_score),
                    now_iso,
                    now_iso,
                    event_id,
                ),
            )
            scores_updated += 1
        else:
            db.conn.execute(
                """
                INSERT INTO scores
                (event_id, sport_key, completed,
                 home_score, away_score,
                 last_update, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    "basketball_ncaab",
                    1,
                    int(home_score),
                    int(away_score),
                    now_iso,
                    now_iso,
                ),
            )
            scores_stored += 1

    if not dry_run:
        db.conn.commit()

    if events_created > 0:
        logger.info("  [OK] Created %d new events from ESPN", events_created)
    if scores_stored > 0:
        logger.info("  [OK] Stored %d new scores from ESPN", scores_stored)
    if scores_updated > 0:
        logger.info(
            "  [OK] Updated %d existing scores from ESPN",
            scores_updated,
        )
    if match_failures:
        logger.warning(
            "  Could not match %d ESPN games to our events:",
            len(match_failures),
        )
        for failure in match_failures[:10]:
            logger.warning("    - %s", failure)

    return {
        "events_created": events_created,
        "scores_stored": scores_stored,
        "scores_updated": scores_updated,
        "scores_skipped": scores_skipped,
        "match_failures": len(match_failures),
    }


async def backfill_date_range(
    db_path: Path,
    team_mapping_path: Path,
    start_date: date,
    end_date: date,
    dry_run: bool = False,
) -> None:
    """Backfill scores from ESPN for a date range.

    Args:
        db_path: Path to SQLite database
        team_mapping_path: Path to team mapping file
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
        dry_run: If True, show what would be fetched without storing
    """
    if start_date > end_date:
        logger.error(f"Invalid date range: {start_date} > {end_date}")
        sys.exit(1)

    if end_date > date.today():
        logger.warning(f"End date {end_date} is in the future, limiting to today")
        end_date = date.today()

    num_days = (end_date - start_date).days + 1

    logger.info("=" * 80)
    logger.info("ESPN SCORES BACKFILL")
    logger.info("=" * 80)
    logger.info(f"Date range: {start_date} to {end_date}")
    logger.info(f"Total days: {num_days}")
    logger.info(f"Dry run: {dry_run}")
    logger.info("=" * 80)

    if dry_run:
        logger.info("\n[DRY RUN] No changes will be made to database\n")

    # Load team mapper
    try:
        mapping_df = read_parquet_df(team_mapping_path)
        team_mapper = TeamMapper(mapping_df)
        logger.info(f"Loaded team mapping: {len(mapping_df)} teams")
    except FileNotFoundError:
        logger.error(f"Team mapping not found: {team_mapping_path}")
        logger.error("Run scripts/create_team_mapping.py first")
        sys.exit(1)

    # Initialize database
    db = OddsAPIDatabase(db_path)

    try:
        # Bulk fetch all events using date-range chunks
        logger.info("Fetching all ESPN events in bulk (7-day chunks)...")
        async with ESPNClient() as espn:
            all_events = await espn.fetch_scoreboard_range(start_date, end_date)
        logger.info("Total ESPN events fetched: %d", len(all_events))

        # Group events by date for per-date database matching
        from collections import defaultdict

        events_by_date: dict[date, list[dict[str, Any]]] = defaultdict(list)
        for event in all_events:
            event_date_str = event.get("date", "")
            if event_date_str:
                try:
                    event_date = datetime.fromisoformat(
                        event_date_str.replace("Z", "+00:00")
                    ).date()
                    events_by_date[event_date].append(event)
                except (ValueError, TypeError):
                    continue

        total_events_created = 0
        total_stored = 0
        total_updated = 0
        total_match_failures = 0

        current_date = start_date
        while current_date <= end_date:
            date_events = events_by_date.get(current_date, [])
            if date_events:
                metrics = store_espn_scores(
                    date_events,
                    db,
                    team_mapper,
                    current_date,
                    dry_run,
                )
                total_events_created += metrics.get("events_created", 0)
                total_stored += metrics.get("scores_stored", 0)
                total_updated += metrics.get("scores_updated", 0)
                total_match_failures += metrics.get("match_failures", 0)
            current_date += timedelta(days=1)

        logger.info("\n" + "=" * 80)
        logger.info("ESPN BACKFILL SUMMARY")
        logger.info("=" * 80)
        logger.info("Date range: %s to %s", start_date, end_date)
        logger.info("Days processed: %d", num_days)
        logger.info("Events created: %d", total_events_created)
        logger.info("New scores stored: %d", total_stored)
        logger.info("Existing scores updated: %d", total_updated)
        logger.info("Total scores: %d", total_stored + total_updated)
        logger.info("Match failures: %d", total_match_failures)

        if total_match_failures > 0:
            logger.warning(
                "\n[WARNING] %d ESPN games could not be matched "
                "to our events (likely team name mapping issues)",
                total_match_failures,
            )

        if not dry_run:
            logger.info("\n[OK] ESPN backfill complete!")
        else:
            logger.info("\n[DRY RUN] Complete (no changes made)")

    finally:
        db.close()


def main() -> None:
    """Run ESPN scores backfill."""
    parser = argparse.ArgumentParser(description="Backfill historical scores from ESPN")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--team-mapping",
        type=Path,
        default=Path("data/staging/mappings/team_mapping.parquet"),
        help="Path to team mapping file",
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
        help="Show what would be fetched without making changes",
    )

    args = parser.parse_args()

    # Ensure log directory exists
    Path("data/logs").mkdir(parents=True, exist_ok=True)

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
        asyncio.run(
            backfill_date_range(
                args.db,
                args.team_mapping,
                start_date,
                end_date,
                args.dry_run,
            )
        )
    except Exception as e:
        logger.error(f"Backfill failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
