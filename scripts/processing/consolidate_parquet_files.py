"""Consolidate daily parquet files into season-level files with temporal columns.

This script consolidates small daily parquet files into larger season files
to improve storage efficiency and query performance. Original daily files are
archived after consolidation.

Usage:
    uv run python scripts/processing/consolidate_parquet_files.py --category espn
    uv run python scripts/processing/consolidate_parquet_files.py \
        --category kenpom --kenpom-type four-factors
    uv run python scripts/processing/consolidate_parquet_files.py --all
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)


def consolidate_espn_schedule(season: int = 2026, dry_run: bool = False) -> None:
    """Consolidate ESPN schedule files into one season file.

    Args:
        season: Season year to consolidate
        dry_run: If True, only show what would be done without making changes
    """
    schedule_dir = Path("data/espn/schedule")
    if not schedule_dir.exists():
        logger.error(f"ESPN schedule directory not found: {schedule_dir}")
        return

    daily_files = sorted(schedule_dir.glob(f"{season}-*.parquet"))

    if not daily_files:
        logger.warning(f"No daily files found for season {season}")
        return

    logger.info(f"Found {len(daily_files)} daily files to consolidate")

    if dry_run:
        logger.info("[DRY RUN] Would consolidate the following files:")
        for file in daily_files:
            logger.info(f"  - {file.name}")
        return

    # Read all daily files
    dfs = []
    for file in daily_files:
        try:
            df = pd.read_parquet(file)
            dfs.append(df)
            logger.debug(f"Read {file.name}: {len(df)} rows")
        except Exception as e:
            logger.error(f"Failed to read {file}: {e}")
            continue

    if not dfs:
        logger.error("No data files could be read")
        return

    # Concatenate all dataframes
    combined = pd.concat(dfs, ignore_index=True)
    logger.info(f"Combined data: {len(combined)} total rows")

    # Remove duplicates, keeping latest capture
    # Group by game_id and game_date, keep row with most recent captured_at
    combined = combined.sort_values("captured_at", ascending=False)
    combined = combined.drop_duplicates(subset=["game_id", "game_date"], keep="first")
    logger.info(f"After deduplication: {len(combined)} unique games")

    # Sort by game_date for better compression and readability
    combined = combined.sort_values(["game_date", "captured_at"])

    # Write consolidated file
    output = schedule_dir / f"espn_schedule_{season}.parquet"
    combined.to_parquet(output, index=False)
    logger.info(f"Wrote consolidated file: {output} ({len(combined)} rows)")

    # Archive old daily files
    archive_dir = schedule_dir / "archive" / "daily"
    archive_dir.mkdir(parents=True, exist_ok=True)

    for file in daily_files:
        archive_path = archive_dir / file.name
        file.rename(archive_path)
        logger.debug(f"Archived {file.name} -> {archive_path}")

    logger.info(f"Archived {len(daily_files)} daily files to {archive_dir}")


def consolidate_kenpom_category(category: str, season: int = 2026, dry_run: bool = False) -> None:
    """Consolidate KenPom daily files into one historical file.

    Args:
        category: KenPom category (e.g., 'four-factors', 'efficiency')
        season: Season year to consolidate
        dry_run: If True, only show what would be done without making changes
    """
    daily_dir = Path(f"data/kenpom/{category}/daily")
    if not daily_dir.exists():
        logger.warning(f"KenPom daily directory not found: {daily_dir}")
        return

    # Match files like "four-factors_2026-02-06.parquet"
    daily_files = sorted(daily_dir.glob(f"{category}_{season}-*.parquet"))

    if not daily_files:
        logger.warning(f"No daily files found for {category} season {season}")
        return

    logger.info(f"Found {len(daily_files)} daily files to consolidate for {category}")

    if dry_run:
        logger.info(f"[DRY RUN] Would consolidate {category} files:")
        for file in daily_files:
            logger.info(f"  - {file.name}")
        return

    # Read all daily files
    dfs = []
    for file in daily_files:
        try:
            df = pd.read_parquet(file)

            # Normalize temporal column names: captured_at -> fetched_at
            if "captured_at" in df.columns and "fetched_at" not in df.columns:
                df = df.rename(columns={"captured_at": "fetched_at"})
                logger.debug("Renamed captured_at -> fetched_at")

            # Ensure temporal column exists
            if "fetched_at" not in df.columns and "DataThrough" not in df.columns:
                # Extract date from filename (e.g., "four-factors_2026-02-06.parquet")
                date_str = file.stem.split("_")[-1]  # "2026-02-06"
                df["fetched_at"] = pd.to_datetime(date_str)
                logger.debug(f"Added fetched_at column from filename: {date_str}")

            dfs.append(df)
            logger.debug(f"Read {file.name}: {len(df)} rows")
        except Exception as e:
            logger.error(f"Failed to read {file}: {e}")
            continue

    if not dfs:
        logger.error(f"No data files could be read for {category}")
        return

    # Check schema consistency before concatenating
    if len(dfs) > 1:
        first_columns = set(dfs[0].columns)
        for i, df in enumerate(dfs[1:], start=2):
            if set(df.columns) != first_columns:
                logger.error(f"Schema mismatch in {category}: File {i} has different columns")
                logger.error(f"  First file: {sorted(first_columns)}")
                logger.error(f"  File {i}: {sorted(df.columns)}")
                logger.error(f"Skipping {category} consolidation - manual intervention needed")
                return

    # Concatenate all dataframes
    combined = pd.concat(dfs, ignore_index=True)
    logger.info(f"Combined {category} data: {len(combined)} total rows")

    # Note: We don't deduplicate KenPom data because each snapshot is valuable
    # for tracking how ratings changed over time

    # Create historical directory
    hist_dir = daily_dir.parent / "historical"
    hist_dir.mkdir(exist_ok=True)

    # Write consolidated file
    output = hist_dir / f"{category}_{season}_daily.parquet"
    combined.to_parquet(output, index=False)
    logger.info(f"Wrote consolidated file: {output} ({len(combined)} rows)")

    # Archive old daily files
    archive_dir = daily_dir.parent / "archive" / "daily"
    archive_dir.mkdir(parents=True, exist_ok=True)

    for file in daily_files:
        archive_path = archive_dir / file.name
        file.rename(archive_path)
        logger.debug(f"Archived {file.name} -> {archive_path}")

    logger.info(f"Archived {len(daily_files)} daily files to {archive_dir}")


def main() -> None:
    """Main consolidation orchestrator."""
    parser = argparse.ArgumentParser(
        description="Consolidate daily parquet files into season files"
    )
    parser.add_argument(
        "--category",
        choices=["espn", "kenpom"],
        help="Category to consolidate (espn or kenpom)",
    )
    parser.add_argument(
        "--kenpom-type",
        help="KenPom category type (e.g., four-factors, efficiency, ratings)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Consolidate all categories",
    )
    parser.add_argument(
        "--season",
        type=int,
        default=2026,
        help="Season year (default: 2026)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    if args.dry_run:
        logger.info("=== DRY RUN MODE ===")

    if args.all:
        # Consolidate ESPN
        logger.info("=== Consolidating ESPN Schedule ===")
        consolidate_espn_schedule(season=args.season, dry_run=args.dry_run)

        # Consolidate all KenPom categories
        kenpom_categories = [
            "four-factors",
            "efficiency",
            "fanmatch",
            "ratings",
            "conf-ratings",
        ]

        for category in kenpom_categories:
            logger.info(f"=== Consolidating KenPom {category} ===")
            consolidate_kenpom_category(category=category, season=args.season, dry_run=args.dry_run)

    elif args.category == "espn":
        logger.info("=== Consolidating ESPN Schedule ===")
        consolidate_espn_schedule(season=args.season, dry_run=args.dry_run)

    elif args.category == "kenpom":
        if not args.kenpom_type:
            logger.error("--kenpom-type required when --category=kenpom")
            return

        logger.info(f"=== Consolidating KenPom {args.kenpom_type} ===")
        consolidate_kenpom_category(
            category=args.kenpom_type, season=args.season, dry_run=args.dry_run
        )

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
