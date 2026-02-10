"""Migrate orphaned scores to canonical event IDs.

After deduplication, some scores may still point to deleted event_ids.
This script finds those orphaned scores and migrates them to the canonical
event_id by matching on (home_team, away_team, game_date).
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def normalize_team_name(name: str) -> str:
    """Normalize team name for matching."""
    mapping_path = Path("data/staging/mappings/team_mapping.parquet")
    if mapping_path.exists():
        try:
            mapping_df = read_parquet_df(str(mapping_path))
            for col in ["odds_api_name", "espn_name", "kenpom_name"]:
                if col in mapping_df.columns:
                    match = mapping_df[mapping_df[col] == name]
                    if len(match) > 0:
                        return str(match.iloc[0]["odds_api_name"])
        except Exception:
            pass
    return name.strip()


def find_matching_event(
    home_team: str, away_team: str, game_date: str, db: OddsAPIDatabase
) -> str | None:
    """Find matching event in events table.

    Args:
        home_team: Home team name
        away_team: Away team name
        game_date: Game date (YYYY-MM-DD)
        db: Database connection

    Returns:
        Event ID if found, None otherwise
    """
    # Normalize team names
    home_norm = normalize_team_name(home_team)
    away_norm = normalize_team_name(away_team)

    # Try exact match first
    query = """
    SELECT event_id
    FROM events
    WHERE home_team = ? AND away_team = ? AND DATE(commence_time) = ?
    LIMIT 1
    """
    result = db.conn.execute(query, (home_norm, away_norm, game_date)).fetchone()

    if result:
        return result[0]

    # Try with original names
    result = db.conn.execute(query, (home_team, away_team, game_date)).fetchone()

    if result:
        return result[0]

    # Try swapping home/away (rare but possible)
    result = db.conn.execute(query, (away_norm, home_norm, game_date)).fetchone()

    if result:
        logger.warning(f"Found match with swapped home/away: {home_team} @ {away_team}")
        return result[0]

    return None


def migrate_orphaned_scores(db: OddsAPIDatabase, dry_run: bool = False) -> None:
    """Migrate orphaned scores to canonical event IDs.

    Args:
        db: Database connection
        dry_run: If True, only show what would be done
    """
    logger.info("Finding orphaned scores...")

    # Find scores that don't have a matching event
    query = """
    SELECT
        s.event_id,
        s.home_score,
        s.away_score
    FROM scores s
    LEFT JOIN events e ON s.event_id = e.event_id
    WHERE e.event_id IS NULL
    """

    orphaned_scores = pd.read_sql_query(query, db.conn)
    logger.info(f"Found {len(orphaned_scores)} orphaned scores")

    if len(orphaned_scores) == 0:
        logger.info("No orphaned scores to migrate!")
        return

    # Get event details for orphaned scores from ESPN scores table
    migrated = 0
    not_found = 0

    for _, score_row in orphaned_scores.iterrows():
        old_event_id = score_row["event_id"]

        # Try to get event details from ESPN scores
        espn_query = """
        SELECT
            home_team,
            away_team,
            game_date
        FROM espn_scores
        WHERE espn_event_id = ?
        """
        espn_result = db.conn.execute(espn_query, (old_event_id,)).fetchone()

        if not espn_result:
            # Try extracting from scores table metadata (if available)
            # For now, skip if we can't find event details
            logger.warning(f"Could not find ESPN data for orphaned score: {old_event_id}")
            not_found += 1
            continue

        home_team, away_team, game_date = espn_result

        # Find matching canonical event
        canonical_id = find_matching_event(home_team, away_team, game_date, db)

        if canonical_id:
            logger.info(f"Found match: {old_event_id} -> {canonical_id}")

            if dry_run:
                logger.info(f"  [DRY RUN] Would migrate score to {canonical_id}")
            else:
                # Check if canonical already has score
                check_query = "SELECT COUNT(*) FROM scores WHERE event_id = ?"
                has_score = db.conn.execute(check_query, (canonical_id,)).fetchone()[0] > 0

                if not has_score:
                    # Migrate score
                    update_query = """
                    UPDATE scores
                    SET event_id = ?
                    WHERE event_id = ?
                    """
                    db.conn.execute(update_query, (canonical_id, old_event_id))
                    logger.info(f"  Migrated score to {canonical_id}")
                    migrated += 1
                else:
                    # Delete duplicate
                    delete_query = "DELETE FROM scores WHERE event_id = ?"
                    db.conn.execute(delete_query, (old_event_id,))
                    logger.info("  Deleted duplicate score (canonical already has one)")

                db.conn.commit()
        else:
            logger.warning(
                f"Could not find matching event for: {home_team} @ {away_team} on {game_date}"
            )
            not_found += 1

    logger.info("\n=== SUMMARY ===")
    logger.info(f"Orphaned scores found: {len(orphaned_scores)}")
    logger.info(f"Scores migrated: {migrated}")
    logger.info(f"Not found: {not_found}")

    if not dry_run and migrated > 0:
        logger.info("[OK] Score migration complete!")


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Migrate orphaned scores")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default="data/odds_api/odds_api.sqlite3",
        help="Path to SQLite database",
    )

    args = parser.parse_args()

    db = OddsAPIDatabase(args.db_path)
    migrate_orphaned_scores(db, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
