"""Deduplicate events table and consolidate observations.

This script fixes the event duplication issue where the same game exists
under multiple event_ids due to:
1. Team name variations across data sources
2. Multiple collection sources (ESPN, Odds API)
3. Datetime format inconsistencies

Strategy:
1. Group events by normalized (home_team, away_team, game_date)
2. Select canonical event_id (prefer ones with observations)
3. Migrate observations to canonical event_id
4. Delete duplicate events
5. Update foreign keys in related tables

Usage:
    uv run python scripts/processing/deduplicate_events.py --dry-run
    uv run python scripts/processing/deduplicate_events.py  # Execute
"""

from __future__ import annotations

import argparse
import hashlib
import logging
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def normalize_team_name(name: str) -> str:
    """Normalize team name for consistent matching.

    Args:
        name: Raw team name from any source

    Returns:
        Normalized team name
    """
    # Load team mapping if available
    mapping_path = Path("data/staging/mappings/team_mapping.parquet")
    if mapping_path.exists():
        try:
            mapping_df = read_parquet_df(str(mapping_path))
            # Try to find this team in any column
            for col in ["odds_api_name", "espn_name", "kenpom_name"]:
                if col in mapping_df.columns:
                    match = mapping_df[mapping_df[col] == name]
                    if len(match) > 0:
                        # Return canonical name (odds_api_name)
                        return str(match.iloc[0]["odds_api_name"])
        except Exception as e:
            logger.warning(f"Could not load team mapping: {e}")

    # Fallback: Basic normalization
    return name.strip()


def normalize_datetime(dt_str: str) -> str:
    """Normalize datetime string to consistent format.

    Args:
        dt_str: Datetime string in any format (ISO8601, etc.)

    Returns:
        Normalized datetime string: YYYY-MM-DD HH:MM:SS
    """
    # Remove T and Z
    dt_str = dt_str.replace("T", " ").replace("Z", "").strip()

    # Parse and reformat
    try:
        dt = datetime.fromisoformat(dt_str)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        # If parsing fails, return as-is
        return dt_str


def generate_canonical_key(home_team: str, away_team: str, commence_time: str) -> str:
    """Generate canonical key for grouping duplicate events.

    Args:
        home_team: Home team name
        away_team: Away team name
        commence_time: Game start time

    Returns:
        Canonical key (hash of normalized values)
    """
    # Normalize teams
    home_norm = normalize_team_name(home_team)
    away_norm = normalize_team_name(away_team)

    # Normalize datetime to date only (games on same day are same game)
    dt_norm = normalize_datetime(commence_time)
    game_date = dt_norm.split(" ")[0]  # Extract date part

    # Sort teams alphabetically (home/away designation might differ)
    teams_sorted = tuple(sorted([home_norm, away_norm]))

    # Create canonical key
    key_str = f"{teams_sorted[0]}|{teams_sorted[1]}|{game_date}"
    return hashlib.sha256(key_str.encode()).hexdigest()[:16]


def find_duplicates(db: OddsAPIDatabase) -> dict[str, list[str]]:
    """Find duplicate events grouped by canonical key.

    Args:
        db: Database connection

    Returns:
        Dict mapping canonical_key -> list of event_ids
    """
    query = """
    SELECT
        event_id,
        home_team,
        away_team,
        commence_time,
        source
    FROM events
    """

    events_df = pd.read_sql_query(query, db.conn)
    logger.info(f"Loaded {len(events_df)} total events")

    # Group by canonical key
    groups: dict[str, list[str]] = defaultdict(list)

    for _, row in events_df.iterrows():
        canonical_key = generate_canonical_key(
            row["home_team"], row["away_team"], row["commence_time"]
        )
        groups[canonical_key].append(row["event_id"])

    # Filter to only duplicates
    duplicates = {k: v for k, v in groups.items() if len(v) > 1}

    logger.info(f"Found {len(duplicates)} duplicate event groups")
    logger.info(f"Total duplicate events: {sum(len(v) for v in duplicates.values())}")

    return duplicates


def select_canonical_event(event_ids: list[str], db: OddsAPIDatabase) -> str:
    """Select the canonical event_id from a group of duplicates.

    Priority:
    1. Event with most observations
    2. Event with source='odds_api' (UUID format)
    3. Event with source='espn'
    4. Alphabetically first

    Args:
        event_ids: List of duplicate event IDs
        db: Database connection

    Returns:
        Canonical event_id
    """
    # Get observation counts
    obs_counts = {}
    for eid in event_ids:
        query = f"SELECT COUNT(*) as cnt FROM observations WHERE event_id = '{eid}'"
        result = pd.read_sql_query(query, db.conn)
        obs_counts[eid] = result.iloc[0]["cnt"]

    # Select event with most observations
    if max(obs_counts.values()) > 0:
        canonical = max(obs_counts, key=obs_counts.get)  # type: ignore
        logger.debug(f"Selected {canonical} (has {obs_counts[canonical]} observations)")
        return canonical

    # Fallback: prefer odds_api source, then espn, then alphabetically
    query = f"""
    SELECT event_id, source
    FROM events
    WHERE event_id IN ({",".join(["?"] * len(event_ids))})
    """
    events_df = pd.read_sql_query(query, db.conn, params=event_ids)

    # Prefer odds_api
    odds_api_events = events_df[events_df["source"] == "odds_api"]["event_id"].tolist()
    if odds_api_events:
        return odds_api_events[0]

    # Prefer espn
    espn_events = events_df[events_df["source"] == "espn"]["event_id"].tolist()
    if espn_events:
        return espn_events[0]

    # Fallback: alphabetically first
    return sorted(event_ids)[0]


def deduplicate_events(db: OddsAPIDatabase, dry_run: bool = False) -> None:
    """Deduplicate events and consolidate observations.

    Args:
        db: Database connection
        dry_run: If True, only show what would be done
    """
    logger.info("Starting event deduplication...")

    # Find duplicates
    duplicates = find_duplicates(db)

    if len(duplicates) == 0:
        logger.info("No duplicates found!")
        return

    # Process each group
    total_merged = 0
    total_deleted = 0

    for canonical_key, event_ids in duplicates.items():
        # Select canonical event
        canonical_id = select_canonical_event(event_ids, db)
        other_ids = [eid for eid in event_ids if eid != canonical_id]

        logger.info(f"\nCanonical key: {canonical_key}")
        logger.info(f"  Canonical event: {canonical_id}")
        logger.info(f"  Duplicate events: {other_ids}")

        if dry_run:
            logger.info("  [DRY RUN] Would merge observations and delete duplicates")
            continue

        # Migrate observations from duplicates to canonical
        for dup_id in other_ids:
            query = """
            UPDATE observations
            SET event_id = ?
            WHERE event_id = ?
            """
            db.conn.execute(query, (canonical_id, dup_id))
            logger.info(f"  Migrated observations from {dup_id} to {canonical_id}")

        # Migrate scores from duplicates to canonical
        for dup_id in other_ids:
            # Check if canonical already has scores
            check_query = "SELECT COUNT(*) FROM scores WHERE event_id = ?"
            has_scores = db.conn.execute(check_query, (canonical_id,)).fetchone()[0] > 0

            if not has_scores:
                # Migrate scores from duplicate
                query = """
                UPDATE scores
                SET event_id = ?
                WHERE event_id = ?
                """
                db.conn.execute(query, (canonical_id, dup_id))
                logger.info(f"  Migrated scores from {dup_id} to {canonical_id}")
            else:
                # Delete duplicate scores (canonical already has them)
                query = "DELETE FROM scores WHERE event_id = ?"
                db.conn.execute(query, (dup_id,))
                logger.info(f"  Deleted duplicate scores for {dup_id}")

        # Delete duplicate events
        for dup_id in other_ids:
            query = "DELETE FROM events WHERE event_id = ?"
            db.conn.execute(query, (dup_id,))
            total_deleted += 1

        db.conn.commit()
        total_merged += len(other_ids)

    logger.info("\n=== SUMMARY ===")
    logger.info(f"Duplicate groups processed: {len(duplicates)}")
    logger.info(f"Events merged: {total_merged}")
    logger.info(f"Events deleted: {total_deleted}")

    if not dry_run:
        # Vacuum to reclaim space
        logger.info("Running VACUUM to reclaim space...")
        db.conn.execute("VACUUM")
        logger.info("[OK] Deduplication complete!")


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Deduplicate events table")
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

    # Connect to database
    db = OddsAPIDatabase(args.db_path)

    # Run deduplication
    deduplicate_events(db, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
