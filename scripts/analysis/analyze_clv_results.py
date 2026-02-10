#!/usr/bin/env python3
"""Analyze Closing Line Value (CLV) results against actual game outcomes.

Compares opening/closing lines to final scores to determine:
- If line movements were "sharp" (moved toward eventual winner)
- CLV for betting opening vs. closing lines
- Which side (favorites/underdogs, overs/unders) performed better

Usage:
    uv run python scripts/analysis/analyze_clv_results.py \\
        data/feb5_line_movements_corrected.csv
    uv run python scripts/analysis/analyze_clv_results.py \\
        data/feb5_line_movements_corrected.csv --output data/clv_results.csv
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

logger = logging.getLogger(__name__)


def load_scores(db_path: str) -> pd.DataFrame:
    """Load scores from database.

    Args:
        db_path: Path to SQLite database

    Returns:
        DataFrame with scores
    """
    db = OddsAPIDatabase(db_path)

    query = """
        SELECT
            e.home_team,
            e.away_team,
            e.commence_time,
            s.home_score,
            s.away_score,
            s.completed
        FROM scores s
        JOIN events e ON s.event_id = e.event_id
        WHERE s.completed = 1
        AND s.home_score IS NOT NULL
        AND s.away_score IS NOT NULL
    """

    scores_df = pd.read_sql_query(query, db.conn)
    logger.info("Loaded %d completed games with scores", len(scores_df))
    return scores_df


def calculate_clv_metrics(movements: pd.DataFrame, scores: pd.DataFrame) -> pd.DataFrame:
    """Calculate CLV metrics by matching line movements to scores.

    Args:
        movements: Line movements DataFrame
        scores: Scores DataFrame

    Returns:
        DataFrame with CLV analysis
    """
    # Merge on team names
    merged = movements.merge(
        scores,
        on=["home_team", "away_team"],
        how="left",
        suffixes=("", "_score"),
    )

    results = []

    for _, row in merged.iterrows():
        if pd.isna(row["home_score"]) or pd.isna(row["away_score"]):
            # No score available
            continue

        # Calculate actual margin (home team perspective)
        actual_margin = row["home_score"] - row["away_score"]
        actual_total = row["home_score"] + row["away_score"]

        # Determine favorite/underdog
        if row["close_favorite"] == row["home_team"]:
            # Home is favorite
            fav_is_home = True
            close_spread = row["close_spread"]  # Negative for favorite
        else:
            # Away is favorite
            fav_is_home = False
            close_spread = -row["close_spread"]  # Make negative for away fav

        # Calculate spread result vs. closing line
        if fav_is_home:
            spread_margin = actual_margin
            fav_covers = spread_margin > close_spread
        else:
            spread_margin = -actual_margin
            fav_covers = spread_margin > close_spread

        # Calculate total result vs. closing line
        over_covers = actual_total > row["close_total"]

        # Analyze line movement accuracy (did sharp money call it right?)
        spread_moved_to_fav = row["spread_movement"] > 0
        spread_move_correct = (spread_moved_to_fav and fav_covers) or (
            not spread_moved_to_fav and not fav_covers
        )

        total_moved_up = row["total_movement"] > 0
        total_move_correct = (total_moved_up and over_covers) or (
            not total_moved_up and not over_covers
        )

        results.append(
            {
                "game_id": row["game_id"],
                "away_team": row["away_team"],
                "home_team": row["home_team"],
                "away_score": row["away_score"],
                "home_score": row["home_score"],
                "actual_margin": actual_margin,
                "actual_total": actual_total,
                # Lines
                "open_spread": row["open_spread"],
                "close_spread": row["close_spread"],
                "spread_movement": row["spread_movement"],
                "open_total": row["open_total"],
                "close_total": row["close_total"],
                "total_movement": row["total_movement"],
                # Results
                "favorite": row["close_favorite"],
                "fav_covers_close": fav_covers,
                "over_covers_close": over_covers,
                # Sharp money analysis
                "spread_move_correct": spread_move_correct,
                "total_move_correct": total_move_correct,
                "spread_moved_to_fav": spread_moved_to_fav,
                "total_moved_up": total_moved_up,
            }
        )

    return pd.DataFrame(results)


def print_clv_summary(results: pd.DataFrame) -> None:
    """Print CLV analysis summary.

    Args:
        results: Results DataFrame
    """
    if len(results) == 0:
        print("\n[WARNING] No games with scores available for CLV analysis")
        return

    print("\n=== CLOSING LINE VALUE (CLV) ANALYSIS ===")
    print(f"Games analyzed: {len(results)}")
    print()

    # Spread analysis
    print("SPREAD PERFORMANCE:")
    print("-" * 80)
    fav_covers = results["fav_covers_close"].sum()
    dog_covers = len(results) - fav_covers
    fav_pct = 100 * fav_covers / len(results)
    dog_pct = 100 * dog_covers / len(results)
    print(f"  Favorites covered: {fav_covers} / {len(results)} ({fav_pct:.1f}%)")
    print(f"  Underdogs covered: {dog_covers} / {len(results)} ({dog_pct:.1f}%)")
    print()

    # Total analysis
    print("TOTAL PERFORMANCE:")
    print("-" * 80)
    overs = results["over_covers_close"].sum()
    unders = len(results) - overs
    print(f"  Overs hit: {overs} / {len(results)} ({100 * overs / len(results):.1f}%)")
    print(f"  Unders hit: {unders} / {len(results)} ({100 * unders / len(results):.1f}%)")
    print()

    # Line movement accuracy
    moved_spreads = results[results["spread_movement"] != 0]
    if len(moved_spreads) > 0:
        correct_spread_moves = moved_spreads["spread_move_correct"].sum()
        print("SHARP MONEY ACCURACY (Spread):")
        print("-" * 80)
        move_pct = 100 * len(moved_spreads) / len(results)
        correct_pct = 100 * correct_spread_moves / len(moved_spreads)
        games_moved = f"{len(moved_spreads)} / {len(results)}"
        print(f"  Games with line movement: {games_moved} ({move_pct:.1f}%)")
        sharp_correct = f"{correct_spread_moves} / {len(moved_spreads)}"
        print(f"  Sharp money correct: {sharp_correct} ({correct_pct:.1f}%)")
        print()

    moved_totals = results[results["total_movement"] != 0]
    if len(moved_totals) > 0:
        correct_total_moves = moved_totals["total_move_correct"].sum()
        print("SHARP MONEY ACCURACY (Total):")
        print("-" * 80)
        move_pct = 100 * len(moved_totals) / len(results)
        correct_pct = 100 * correct_total_moves / len(moved_totals)
        games_moved = f"{len(moved_totals)} / {len(results)}"
        print(f"  Games with line movement: {games_moved} ({move_pct:.1f}%)")
        sharp_correct = f"{correct_total_moves} / {len(moved_totals)}"
        print(f"  Sharp money correct: {sharp_correct} ({correct_pct:.1f}%)")
        print()

    # Biggest wins/losses
    print("BIGGEST SPREAD COVERS:")
    print("-" * 80)
    results["spread_cover_margin"] = abs(results["actual_margin"] - results["close_spread"])
    top_covers = results.nlargest(5, "spread_cover_margin")
    for _, row in top_covers.iterrows():
        print(
            f"  {row['away_team']:30s} {row['away_score']:3.0f} @ "
            f"{row['home_team']:30s} {row['home_score']:3.0f}"
        )
        print(f"    Closing line: {row['favorite']:30s} -{row['close_spread']:.1f}")
        print(f"    Actual margin: {row['actual_margin']:+.0f}")
        print(f"    Cover margin: {row['spread_cover_margin']:.1f} points")
        print()


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Analyze CLV results against actual game outcomes")
    parser.add_argument(
        "movements_file",
        type=Path,
        help="Line movements CSV file from compare_opening_closing_lines.py",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to SQLite database with scores (default: data/odds_api/odds_api.sqlite3)",
    )
    parser.add_argument(
        "--output", "-o", type=Path, help="Output CSV file path (default: print summary only)"
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable debug logging")

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Load line movements
    movements = pd.read_csv(args.movements_file)
    logger.info("Loaded %d line movements from %s", len(movements), args.movements_file)

    # Load scores
    scores = load_scores(str(args.db))

    if len(scores) == 0:
        logger.warning("No scores available in database")
        print("\n[WARNING] No completed games found in database")
        print("Run score collection first:")
        print("  uv run python scripts/backfill_espn_scores.py --start 2026-02-05 --end 2026-02-05")
        return

    # Calculate CLV metrics
    results = calculate_clv_metrics(movements, scores)

    if len(results) == 0:
        logger.warning("No matching games with scores found")
        print("\n[WARNING] Could not match line movements to scores")
        print(f"Line movements: {len(movements)} games")
        print(f"Scores available: {len(scores)} games")
        print("Team names may not match - check team mapping")
        return

    # Output results
    if args.output:
        results.to_csv(args.output, index=False)
        logger.info("Wrote %d CLV results to %s", len(results), args.output)

    # Print summary
    print_clv_summary(results)


if __name__ == "__main__":
    main()
