"""Backfill historical events and scores from ESPN.

Populates the database with comprehensive event coverage from ESPN,
ensuring 100% score coverage for all past games.

Usage:
    # Backfill from start of season to today
    uv run python scripts/backfill_espn_events.py --start 2025-12-28

    # Backfill specific date range
    uv run python scripts/backfill_espn_events.py --start 2025-12-28 --end 2026-01-31

    # Dry run (show what would be added)
    uv run python scripts/backfill_espn_events.py --start 2025-12-28 --dry-run
"""

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

# Ensure log directory exists
Path("data/logs").mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("data/logs/backfill_espn_events.log"),
    ],
)
logger = logging.getLogger(__name__)


async def backfill_espn_events(
    db_path: Path,
    start_date: date,
    end_date: date,
    dry_run: bool = False,
) -> None:
    """Backfill events and scores from ESPN.

    Args:
        db_path: Path to SQLite database
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
        dry_run: If True, show what would be added without storing
    """
    from sports_betting_edge.adapters.espn import fetch_scoreboard
    from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
    from sports_betting_edge.core.event_id import generate_event_id
    from sports_betting_edge.core.team_mapper import TeamMapper

    logger.info("=" * 80)
    logger.info("ESPN EVENTS BACKFILL")
    logger.info("=" * 80)
    logger.info(f"Date range: {start_date} to {end_date}")
    logger.info(f"Dry run: {dry_run}")
    logger.info("=" * 80)

    # Load team mapper
    try:
        mapper = TeamMapper()
    except FileNotFoundError:
        logger.error("Team mapping not found. Run scripts/create_team_mapping.py first")
        sys.exit(1)

    db = OddsAPIDatabase(db_path) if not dry_run else None

    events_stored = 0
    events_updated = 0
    scores_stored = 0
    scores_updated = 0

    try:
        current_date = start_date

        while current_date <= end_date:
            logger.info(f"Processing {current_date}...")

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

                    if dry_run:
                        logger.info(f"  [DRY RUN] Would add: {odds_away} @ {odds_home}")
                        events_stored += 1
                    else:
                        # Check if event exists
                        existing = db.conn.execute(
                            "SELECT event_id, source FROM events WHERE event_id = ?",
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
                                    0,  # Will be updated if odds added later
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
                                # Check if score exists
                                existing_score = db.conn.execute(
                                    "SELECT event_id FROM scores WHERE event_id = ?",
                                    (event_id,),
                                ).fetchone()

                                if existing_score:
                                    # Update score
                                    db.conn.execute(
                                        """
                                        UPDATE scores
                                        SET home_score = ?, away_score = ?,
                                            last_update = ?, fetched_at = ?
                                        WHERE event_id = ?
                                        """,
                                        (
                                            int(home_score),
                                            int(away_score),
                                            datetime.now().isoformat(),
                                            datetime.now().isoformat(),
                                            event_id,
                                        ),
                                    )
                                    scores_updated += 1
                                else:
                                    # Insert score
                                    db.conn.execute(
                                        """
                                        INSERT INTO scores
                                        (event_id, sport_key, completed, home_score,
                                         away_score, last_update, fetched_at)
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
                                    scores_stored += 1

                        if not dry_run:
                            db.conn.commit()

            except Exception as e:
                logger.error(f"Error processing {current_date}: {e}")

            # Rate limit
            await asyncio.sleep(0.5)
            current_date += timedelta(days=1)

        logger.info("")
        logger.info("=" * 80)
        logger.info("BACKFILL SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Date range: {start_date} to {end_date}")
        logger.info(f"New events: {events_stored}")
        logger.info(f"Updated events: {events_updated}")
        logger.info(f"New scores: {scores_stored}")
        logger.info(f"Updated scores: {scores_updated}")
        logger.info(f"Total events: {events_stored + events_updated}")
        logger.info(f"Total scores: {scores_stored + scores_updated}")

        if not dry_run:
            logger.info("")
            logger.info("[OK] Backfill complete!")
        else:
            logger.info("")
            logger.info("[DRY RUN] Complete (no changes made)")

    finally:
        if db:
            db.close()


def main() -> None:
    """Run ESPN events backfill."""
    parser = argparse.ArgumentParser(description="Backfill events and scores from ESPN")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--start",
        type=lambda s: datetime.fromisoformat(s).date(),
        required=True,
        help="Start date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end",
        type=lambda s: datetime.fromisoformat(s).date(),
        default=date.today(),
        help="End date (YYYY-MM-DD, default: today)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be added without storing",
    )

    args = parser.parse_args()

    try:
        asyncio.run(backfill_espn_events(args.db, args.start, args.end, args.dry_run))
    except Exception as e:
        logger.error(f"Backfill failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
