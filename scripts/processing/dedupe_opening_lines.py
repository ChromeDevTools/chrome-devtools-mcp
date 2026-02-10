#!/usr/bin/env python3
"""Deduplicate opening lines CSV while preserving line movements.

Handles cases where same matchup appears in multiple categories:
1. Exact duplicates (same time, same values) → Keep one
2. Line movements (different values) → Keep all (these are valuable!)
3. Same matchup, different capture times → Keep earliest as "true opening"

Usage:
    uv run python scripts/dedupe_opening_lines.py \\
        data/ncaab_opening_line_20260206.csv
    uv run python scripts/dedupe_opening_lines.py \\
        data/ncaab_opening_line_20260206.csv --output data/deduped.csv
    uv run python scripts/dedupe_opening_lines.py \\
        data/ncaab_opening_line_20260206.csv --keep-movements
    uv run python scripts/dedupe_opening_lines.py \\
        data/ncaab_opening_line_20260206.csv --prefer-category "College Basketball"
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import write_csv

logger = logging.getLogger(__name__)


def has_line_movement(group: pd.DataFrame) -> bool:
    """Check if a matchup group has any line movements.

    Args:
        group: DataFrame rows for same matchup

    Returns:
        True if spread, total, or prices changed
    """
    if len(group) <= 1:
        return False

    # Check if any betting values changed
    spread_changed = group["spread_magnitude"].nunique() > 1
    total_changed = group["total_points"].nunique() > 1
    fav_price_changed = group["spread_favorite_price"].nunique() > 1
    dog_price_changed = group["spread_underdog_price"].nunique() > 1
    over_price_changed = group["total_over_price"].nunique() > 1
    under_price_changed = group["total_under_price"].nunique() > 1

    return (
        spread_changed
        or total_changed
        or fav_price_changed
        or dog_price_changed
        or over_price_changed
        or under_price_changed
    )


def dedupe_opening_lines(
    df: pd.DataFrame,
    keep_movements: bool = True,
    prefer_category: str | None = None,
) -> pd.DataFrame:
    """Deduplicate opening lines while preserving line movements.

    Args:
        df: Opening lines DataFrame
        keep_movements: If True, keep all rows where lines changed (default: True)
        prefer_category: When deduping exact duplicates, prefer this category
                        ("College Basketball" or "College Extra")

    Returns:
        Deduplicated DataFrame
    """
    df = df.copy()
    df["opened_at_dt"] = pd.to_datetime(df["opened_at"])
    df["matchup_key"] = df["away_team"] + " @ " + df["home_team"]

    # Track deduplication stats
    original_count = len(df)
    exact_duplicates_removed = 0
    movements_kept = 0

    result_rows = []

    for matchup, group in df.groupby("matchup_key"):
        if len(group) == 1:
            # No duplicates for this matchup
            result_rows.append(group.iloc[0])
            continue

        # Check for line movements
        if keep_movements and has_line_movement(group):
            # Keep all rows - these represent line movements over time
            result_rows.extend([row for _, row in group.iterrows()])
            movements_kept += len(group)
            logger.debug("Kept %d rows for %s (line movement detected)", len(group), matchup)
            continue

        # Exact duplicates - keep one based on strategy
        if prefer_category and prefer_category in group["category"].values:
            # Prefer specified category
            preferred = group[group["category"] == prefer_category].iloc[0]
            result_rows.append(preferred)
            exact_duplicates_removed += len(group) - 1
            logger.debug(
                "Kept %s category for %s (removed %d duplicates)",
                prefer_category,
                matchup,
                len(group) - 1,
            )
        else:
            # Keep earliest capture
            earliest = group.loc[group["opened_at_dt"].idxmin()]
            result_rows.append(earliest)
            exact_duplicates_removed += len(group) - 1
            logger.debug(
                "Kept earliest capture for %s (removed %d duplicates)",
                matchup,
                len(group) - 1,
            )

    result_df = pd.DataFrame(result_rows)
    result_df = result_df.drop(columns=["opened_at_dt", "matchup_key"])
    result_df = result_df.sort_values("opened_at", ascending=False).reset_index(drop=True)

    # Log summary
    final_count = len(result_df)
    logger.info("Deduplication complete:")
    logger.info("  Original rows: %d", original_count)
    logger.info("  Final rows: %d", final_count)
    logger.info("  Exact duplicates removed: %d", exact_duplicates_removed)
    if keep_movements:
        logger.info("  Line movements kept: %d rows", movements_kept)
    logger.info(
        "  Reduction: %d rows (%.1f%%)",
        original_count - final_count,
        100 * (original_count - final_count) / original_count,
    )

    return result_df


def print_dedup_summary(original_df: pd.DataFrame, deduped_df: pd.DataFrame) -> None:
    """Print summary of deduplication results.

    Args:
        original_df: Original DataFrame
        deduped_df: Deduplicated DataFrame
    """
    original_df["matchup_key"] = original_df["away_team"] + " @ " + original_df["home_team"]
    deduped_df["matchup_key"] = deduped_df["away_team"] + " @ " + deduped_df["home_team"]

    print("\n=== Deduplication Summary ===")
    print(f"Original rows: {len(original_df)}")
    print(f"Deduplicated rows: {len(deduped_df)}")
    print(f"Removed: {len(original_df) - len(deduped_df)} rows")
    print()
    print(f"Original unique matchups: {original_df['matchup_key'].nunique()}")
    print(f"Final unique matchups: {deduped_df['matchup_key'].nunique()}")
    print()

    # Find matchups with multiple rows in deduped (line movements)
    movements = deduped_df[deduped_df["matchup_key"].duplicated(keep=False)]
    if len(movements) > 0:
        print(f"Matchups with line movements preserved: {movements['matchup_key'].nunique()}")
        print("\nSample line movements:")
        print("-" * 80)
        for matchup in movements["matchup_key"].unique()[:3]:
            games = movements[movements["matchup_key"] == matchup].sort_values("opened_at")
            print(f"\n{matchup}")
            for _, row in games.iterrows():
                print(
                    f"  {row['opened_at']} | {row['category']:20s} | "
                    f"Spread: {row['spread_magnitude']:4.1f} | Total: {row['total_points']:5.1f}"
                )


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Deduplicate opening lines CSV while preserving line movements"
    )
    parser.add_argument("input_file", type=Path, help="Input CSV file path")
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Output CSV file path (default: input_file with _deduped suffix)",
    )
    parser.add_argument(
        "--keep-movements",
        action="store_true",
        default=True,
        help="Keep all rows where lines changed (default: True)",
    )
    parser.add_argument(
        "--no-keep-movements",
        action="store_false",
        dest="keep_movements",
        help="Remove all duplicates, even if lines changed",
    )
    parser.add_argument(
        "--prefer-category",
        choices=["College Basketball", "College Extra"],
        help="When deduping exact duplicates, prefer this category",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable debug logging")

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Read input
    if not args.input_file.exists():
        logger.error("Input file not found: %s", args.input_file)
        return

    df = pd.read_csv(args.input_file)
    logger.info("Loaded %d rows from %s", len(df), args.input_file)

    # Deduplicate
    deduped_df = dedupe_opening_lines(
        df,
        keep_movements=args.keep_movements,
        prefer_category=args.prefer_category,
    )

    # Determine output path
    if args.output:
        output_path = args.output
    else:
        stem = args.input_file.stem
        suffix = args.input_file.suffix
        output_path = args.input_file.parent / f"{stem}_deduped{suffix}"

    # Write output
    write_csv(deduped_df, output_path, index=False)
    logger.info("Wrote %d rows to %s", len(deduped_df), output_path)

    # Print summary
    print_dedup_summary(df, deduped_df)


if __name__ == "__main__":
    main()
