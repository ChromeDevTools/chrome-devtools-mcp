"""Archive daily snapshot of current odds observations.

This script should run daily (e.g., 11 PM Pacific) to preserve odds state
for historical analysis and walk-forward validation.

Usage:
    # Archive current odds state
    python scripts/collection/archive_daily_odds.py

    # Archive with specific date (for manual backfill)
    python scripts/collection/archive_daily_odds.py --date 2026-02-07

    # Dry run (show what would be archived)
    python scripts/collection/archive_daily_odds.py --dry-run
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.config.logging import configure_logging

configure_logging()
logger = logging.getLogger(__name__)

PST = ZoneInfo("America/Los_Angeles")


def archive_odds(
    db_path: Path,
    snapshot_date: date,
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    """Archive current odds observations as a snapshot.

    Args:
        db_path: Path to SQLite database
        snapshot_date: Date for this snapshot
        dry_run: If True, don't actually create snapshots

    Returns:
        Dict with count of observations archived
    """
    logger.info(f"[OK] === Archiving Odds Snapshot for {snapshot_date} ===\n")

    db = OddsAPIDatabase(db_path)

    # Get current timestamp in Pacific time
    snapshot_time = datetime.now(PST).isoformat()

    # Query all current observations from the database
    query = """
    SELECT
        obs_id as observation_id,
        event_id,
        book_key,
        market_key,
        outcome_name,
        price_american,
        price_decimal,
        point,
        book_last_update as last_update
    FROM observations
    """

    observations_df = pd.read_sql_query(query, db.conn)

    if len(observations_df) == 0:
        logger.warning("No observations found to archive")
        return {"total": 0, "spreads": 0, "totals": 0, "moneylines": 0}

    logger.info(f"Found {len(observations_df)} observations to archive")

    # Count by market type
    market_counts = observations_df["market_key"].value_counts().to_dict()
    logger.info(f"  Spreads: {market_counts.get('spreads', 0)}")
    logger.info(f"  Totals: {market_counts.get('totals', 0)}")
    logger.info(f"  Moneylines: {market_counts.get('h2h', 0)}")

    if dry_run:
        logger.info("\n[DRY RUN] No snapshots created\n")
        return {
            "total": len(observations_df),
            "spreads": market_counts.get("spreads", 0),
            "totals": market_counts.get("totals", 0),
            "moneylines": market_counts.get("h2h", 0),
        }

    # Convert DataFrame to list of dicts for create_snapshot
    observations_list = observations_df.to_dict("records")

    # Create snapshot records
    count = db.create_snapshot(
        snapshot_date=snapshot_date,
        snapshot_time=snapshot_time,
        observations=observations_list,
    )

    logger.info(f"\n[OK] Created {count} snapshot records")

    # Show snapshot stats
    stats = db.get_snapshot_stats()
    logger.info("\n=== Snapshot Database Stats ===")
    logger.info(f"  Total snapshots: {stats['total_snapshots']:,}")
    logger.info(f"  Unique events: {stats['unique_events']}")
    logger.info(f"  Unique dates: {stats['unique_dates']}")
    logger.info(f"  Date range: {stats['earliest_date']} to {stats['latest_date']}")
    logger.info(f"  Unique bookmakers: {stats['unique_books']}")

    return {
        "total": count,
        "spreads": market_counts.get("spreads", 0),
        "totals": market_counts.get("totals", 0),
        "moneylines": market_counts.get("h2h", 0),
    }


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Archive daily odds snapshot",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--date",
        type=str,
        help="Snapshot date (YYYY-MM-DD, default: today in Pacific time)",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be archived without creating snapshots",
    )

    args = parser.parse_args()

    # Determine snapshot date
    if args.date:
        snapshot_date = datetime.fromisoformat(args.date).date()
    else:
        # Default to today in Pacific time
        snapshot_date = datetime.now(PST).date()

    try:
        result = archive_odds(
            db_path=args.db_path,
            snapshot_date=snapshot_date,
            dry_run=args.dry_run,
        )

        logger.info("\n[OK] Archive complete!")
        logger.info(f"  Date: {snapshot_date}")
        logger.info(f"  Total observations: {result['total']}")

        sys.exit(0)

    except Exception as e:
        logger.error(f"[ERROR] Archive failed: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
