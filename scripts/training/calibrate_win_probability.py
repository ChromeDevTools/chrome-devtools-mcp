#!/usr/bin/env python3
"""Calibrate win probability formula by comparing to KenPom FanMatch predictions.

Uses KenPom's published win probabilities (HomeWP) to find the optimal constant
for converting efficiency margin to win probability.

Usage:
    uv run python scripts/calibrate_win_probability.py
    uv run python scripts/calibrate_win_probability.py --dates 2026-01-18 2026-01-25 2026-01-28
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pyarrow.parquet as pq

from sports_betting_edge.utils.team_matching import match_to_kenpom


def kenpom_win_probability(team_rating: float, opp_rating: float, constant: float) -> float:
    """Calculate win probability from efficiency ratings with adjustable constant.

    Args:
        team_rating: Team's AdjEM
        opp_rating: Opponent's AdjEM
        constant: Scaling constant for conversion

    Returns:
        Win probability (0-1)
    """
    diff = team_rating - opp_rating
    return 1 / (1 + 10 ** (-diff / constant))


def load_fanmatch_games(fanmatch_path: Path) -> list[dict]:
    """Load FanMatch games from parquet."""
    table = pq.read_table(fanmatch_path)
    return table.to_pylist()


def load_kenpom_ratings(ratings_path: Path) -> dict[str, float]:
    """Load KenPom ratings (AdjEM only)."""
    table = pq.read_table(ratings_path)
    ratings = {}
    for i in range(len(table)):
        team = table["TeamName"][i].as_py()
        ratings[team] = table["AdjEM"][i].as_py()
    return ratings


def calculate_errors(
    games: list[dict], ratings: dict[str, float], constant: float
) -> tuple[float, int]:
    """Calculate mean absolute error for a given constant.

    Args:
        games: List of FanMatch game dicts
        ratings: Dict of team ratings (AdjEM)
        constant: Constant to test

    Returns:
        Tuple of (mean_absolute_error, num_games_matched)
    """
    errors = []

    for game in games:
        visitor = game["Visitor"]
        home = game["Home"]

        # Match to ratings
        visitor_matched = match_to_kenpom(visitor, list(ratings.keys()))
        home_matched = match_to_kenpom(home, list(ratings.keys()))

        if not visitor_matched or not home_matched:
            continue

        visitor_rating = ratings[visitor_matched]
        home_rating = ratings[home_matched]

        # KenPom's published win probability (HomeWP is 0-100)
        kenpom_home_wp = game["HomeWP"] / 100.0

        # Our calculated win probability with this constant
        # Note: KenPom includes HCA in their ratings, so we don't add it here
        calculated_home_wp = kenpom_win_probability(home_rating, visitor_rating, constant)

        # Calculate error
        error = abs(kenpom_home_wp - calculated_home_wp)
        errors.append(error)

    if not errors:
        return float("inf"), 0

    return sum(errors) / len(errors), len(errors)


def test_constants(
    games: list[dict], ratings: dict[str, float], constants: list[float]
) -> list[tuple[float, float, int]]:
    """Test multiple constants and return results.

    Args:
        games: List of FanMatch games
        ratings: Dict of team ratings
        constants: List of constants to test

    Returns:
        List of (constant, mae, num_games) sorted by MAE
    """
    results = []

    for constant in constants:
        mae, num_games = calculate_errors(games, ratings, constant)
        results.append((constant, mae, num_games))

    results.sort(key=lambda x: x[1])
    return results


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Calibrate win probability formula using KenPom FanMatch data"
    )
    parser.add_argument(
        "--dates",
        nargs="+",
        default=["2026-01-28"],
        help="Dates to use for calibration (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--kenpom-dir",
        type=Path,
        default=Path("./data/kenpom"),
        help="KenPom data directory",
    )
    parser.add_argument(
        "--ratings-date",
        type=str,
        default="2026-01-31",
        help="Date of ratings file to use (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--min-constant",
        type=float,
        default=10.0,
        help="Minimum constant to test",
    )
    parser.add_argument(
        "--max-constant",
        type=float,
        default=30.0,
        help="Maximum constant to test",
    )
    parser.add_argument(
        "--step",
        type=float,
        default=0.5,
        help="Step size for testing constants",
    )

    args = parser.parse_args()

    try:
        # Load ratings
        ratings_path = args.kenpom_dir / "ratings" / f"{args.ratings_date}.parquet"
        print(f"[OK] Loading ratings from {ratings_path}")
        ratings = load_kenpom_ratings(ratings_path)
        print(f"[OK] Loaded {len(ratings)} team ratings")

        # Load FanMatch games
        all_games = []
        for date_str in args.dates:
            fanmatch_path = args.kenpom_dir / "fanmatch" / f"{date_str}.parquet"
            if not fanmatch_path.exists():
                print(f"[WARNING] FanMatch data not found for {date_str}, skipping")
                continue

            games = load_fanmatch_games(fanmatch_path)
            all_games.extend(games)
            print(f"[OK] Loaded {len(games)} games from {date_str}")

        if not all_games:
            print("[ERROR] No games loaded")
            return 1

        print(f"\n[OK] Total games: {len(all_games)}")

        # Test constants
        print(
            f"\n[OK] Testing constants from {args.min_constant} to "
            f"{args.max_constant} (step={args.step})..."
        )
        constants = [
            args.min_constant + i * args.step
            for i in range(int((args.max_constant - args.min_constant) / args.step) + 1)
        ]

        results = test_constants(all_games, ratings, constants)

        # Display results
        print("\n=== Top 10 Constants by Mean Absolute Error ===\n")
        print(f"{'Constant':<12} {'MAE':<12} {'Games Matched':<15}")
        print("-" * 40)

        for constant, mae, num_games in results[:10]:
            print(f"{constant:<12.1f} {mae:<12.6f} {num_games:<15}")

        # Best constant
        best_constant, best_mae, best_games = results[0]

        print("\n=== Optimal Constant ===")
        print(f"Constant: {best_constant:.1f}")
        print(f"Mean Absolute Error: {best_mae:.6f} ({best_mae * 100:.4f}%)")
        print(f"Games Matched: {best_games}/{len(all_games)}")

        print(f"\n[OK] Update kenpom_win_probability() with constant={best_constant}")
        print(
            f"    win_prob = 1 / (1 + 10 ** (-diff / {best_constant:.1f}))  "
            f"# Calibrated from KenPom FanMatch"
        )

        return 0

    except FileNotFoundError as e:
        print(f"[ERROR] {e}")
        return 1
    except Exception as e:
        print(f"[ERROR] Calibration failed: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    import sys

    sys.exit(main())
