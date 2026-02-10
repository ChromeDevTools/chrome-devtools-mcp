#!/usr/bin/env python3
"""Analyze KenPom ratings vs Overtime odds to identify betting edges.

Loads KenPom efficiency data and Overtime betting lines. Compares KenPom win
probability (P(win game)) to market win probability derived from the spread
magnitude (spread_to_win_prob). Both sides are win probabilities; do not use
spread-cover implied prob (from juice), which would be invalid to compare.

Output is written to data/analysis/ by default:
    data/analysis/analysis_YYYY-MM-DD.csv

Usage:
    uv run python scripts/analyze_kenpom_vs_odds.py
    uv run python scripts/analyze_kenpom_vs_odds.py --min-edge 3.0
    uv run python scripts/analyze_kenpom_vs_odds.py --output \\
        data/analysis/analysis_2026-01-31_calibrated.csv
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import pyarrow.parquet as pq

from sports_betting_edge.utils.team_matching import match_to_kenpom


def american_to_implied_prob(odds: int) -> float:
    """Convert American odds to implied probability.

    Args:
        odds: American odds (e.g., -110, +150)

    Returns:
        Implied probability as decimal (0-1)
    """
    if odds < 0:
        return abs(odds) / (abs(odds) + 100)
    else:
        return 100 / (odds + 100)


def spread_to_win_prob(spread: float, is_favorite: bool) -> float:
    """Rough conversion of spread to win probability using historical data.

    Uses empirical relationship: P(win) ≈ 0.5 + (spread / 25) for favorites.

    Args:
        spread: Spread magnitude (always positive)
        is_favorite: True if team is favorite

    Returns:
        Estimated win probability (0-1)
    """
    if is_favorite:
        return 0.50 + (spread / 25)
    else:
        return 0.50 - (spread / 25)


def kenpom_win_probability(team_rating: float, opp_rating: float) -> float:
    """Calculate win probability from KenPom efficiency ratings.

    Uses log5 method based on efficiency margin.

    Args:
        team_rating: Team's adjusted efficiency margin (AdjEM)
        opp_rating: Opponent's adjusted efficiency margin (AdjEM)

    Returns:
        Win probability (0-1)
    """
    # Convert efficiency margins to win probability via pythagorean expectation
    # Simplified: higher efficiency margin = better team
    diff = team_rating - opp_rating

    # Log5 approximation: P = 1 / (1 + 10^(-diff/19.5))
    # Constant 19.5 calibrated from KenPom FanMatch data (MAE: 9.32%)
    win_prob = 1 / (1 + 10 ** (-diff / 19.5))
    return win_prob


def load_kenpom_ratings(kenpom_dir: Path, date_str: str) -> dict[str, dict[str, float]]:
    """Load KenPom ratings for specified date.

    Args:
        kenpom_dir: Directory containing KenPom parquet files
        date_str: Date string (YYYY-MM-DD)

    Returns:
        Dict mapping team name to ratings: {team: {AdjEM, AdjO, AdjD}}
    """
    parquet_path = kenpom_dir / "ratings" / f"{date_str}.parquet"
    if not parquet_path.exists():
        raise FileNotFoundError(f"KenPom ratings not found: {parquet_path}")

    table = pq.read_table(parquet_path)
    ratings = {}

    for i in range(len(table)):
        team = table["TeamName"][i].as_py()
        ratings[team] = {
            "AdjEM": table["AdjEM"][i].as_py(),
            "AdjOE": table["AdjOE"][i].as_py(),
            "AdjDE": table["AdjDE"][i].as_py(),
        }

    return ratings


def load_overtime_odds(overtime_dir: Path, date_str: str) -> list[dict]:
    """Load Overtime odds for specified date.

    Args:
        overtime_dir: Directory containing Overtime parquet files
        date_str: Date string (YYYY-MM-DD)

    Returns:
        List of game line dicts
    """
    parquet_path = overtime_dir / f"{date_str}.parquet"
    if not parquet_path.exists():
        raise FileNotFoundError(f"Overtime odds not found: {parquet_path}")

    table = pq.read_table(parquet_path)
    return table.to_pylist()


def fuzzy_match_team(team_name: str, kenpom_ratings: dict[str, dict]) -> str | None:
    """Match Overtime team name to KenPom team name.

    Uses manual mappings and fuzzy matching via team_matching utility.

    Args:
        team_name: Team name from Overtime (e.g., "Texas Tech", "Massachusetts")
        kenpom_ratings: Dict of KenPom ratings keyed by team name

    Returns:
        Matched KenPom team name or None
    """
    kenpom_teams = list(kenpom_ratings.keys())
    return match_to_kenpom(team_name, kenpom_teams, threshold=0.85)


def analyze_edges(
    kenpom_ratings: dict[str, dict[str, float]],
    overtime_odds: list[dict],
    min_edge: float = 2.0,
) -> list[dict]:
    """Analyze betting edges by comparing KenPom vs market odds.

    Args:
        kenpom_ratings: Dict of KenPom ratings keyed by team name
        overtime_odds: List of game line dicts
        min_edge: Minimum edge threshold (%) to report

    Returns:
        List of dicts with edge analysis, sorted by best_edge descending
    """
    results = []

    for game in overtime_odds:
        away_team = game["away_team"]
        home_team = game["home_team"]

        # Match teams to KenPom
        away_kenpom = fuzzy_match_team(away_team, kenpom_ratings)
        home_kenpom = fuzzy_match_team(home_team, kenpom_ratings)

        if not away_kenpom or not home_kenpom:
            continue

        # Get KenPom ratings
        away_rating = kenpom_ratings[away_kenpom]["AdjEM"]
        home_rating = kenpom_ratings[home_kenpom]["AdjEM"]

        # Calculate KenPom win probabilities (home court advantage ~3.5 points)
        hca_adjustment = 3.5  # Home court advantage in efficiency points
        away_kenpom_prob = kenpom_win_probability(away_rating, home_rating + hca_adjustment)
        home_kenpom_prob = kenpom_win_probability(home_rating + hca_adjustment, away_rating)

        # Get spread and derive market *win* probability (not cover probability)
        spread_mag = game.get("spread_magnitude")
        favorite_team = game.get("favorite_team")

        if spread_mag is not None and favorite_team:
            is_away_fav = favorite_team == away_team

            # Market win probability from spread magnitude (P(win), not P(cover)).
            # Spread prices (juice) imply P(cover) ~50% each; comparing those to
            # KenPom P(win) would be invalid (e.g. 17-pt dog has ~5% P(win) but ~50% P(cover)).
            away_market_prob = spread_to_win_prob(spread_mag, is_away_fav)
            home_market_prob = spread_to_win_prob(spread_mag, not is_away_fav)

            # Calculate edges (KenPom win prob - market win prob from spread)
            away_edge = (away_kenpom_prob - away_market_prob) * 100
            home_edge = (home_kenpom_prob - home_market_prob) * 100

            # Report games with significant edges
            if abs(away_edge) >= min_edge or abs(home_edge) >= min_edge:
                results.append(
                    {
                        "away_team": away_team,
                        "home_team": home_team,
                        "game_time": game.get("game_time_str", ""),
                        "spread": f"{'-' if is_away_fav else '+'}{spread_mag}",
                        "favorite": favorite_team,
                        "away_kenpom_rating": round(away_rating, 2),
                        "home_kenpom_rating": round(home_rating, 2),
                        "away_kenpom_prob": round(away_kenpom_prob * 100, 1),
                        "home_kenpom_prob": round(home_kenpom_prob * 100, 1),
                        "away_market_prob": round(away_market_prob * 100, 1),
                        "home_market_prob": round(home_market_prob * 100, 1),
                        "away_edge": round(away_edge, 1),
                        "home_edge": round(home_edge, 1),
                        "best_bet": away_team if away_edge > home_edge else home_team,
                        "best_edge": round(max(away_edge, home_edge), 1),
                    }
                )

    # Sort by best_edge descending
    results.sort(key=lambda x: x["best_edge"], reverse=True)
    return results


def format_table(edges: list[dict]) -> str:
    """Format edges list as a simple table."""
    if not edges:
        return ""

    # Define columns and widths
    cols = [
        ("away_team", 25),
        ("home_team", 25),
        ("game_time", 10),
        ("spread", 8),
        ("best_bet", 25),
        ("best_edge", 10),
        ("away_edge", 10),
        ("home_edge", 10),
    ]

    # Build header
    header = " ".join(f"{col[0]:{col[1]}}" for col in cols)
    separator = "-" * len(header)

    # Build rows
    rows = []
    for edge in edges:
        row = " ".join(f"{str(edge.get(col[0], '')):{col[1]}}"[: col[1]] for col in cols)
        rows.append(row)

    return f"{header}\n{separator}\n" + "\n".join(rows)


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Analyze KenPom ratings vs Overtime odds for betting edges"
    )
    parser.add_argument(
        "--date",
        type=str,
        default=date.today().isoformat(),
        help="Date to analyze (YYYY-MM-DD, default: today)",
    )
    parser.add_argument(
        "--kenpom-dir",
        type=Path,
        default=Path("./data/kenpom"),
        help="KenPom data directory",
    )
    parser.add_argument(
        "--overtime-dir",
        type=Path,
        default=Path("./data/overtime"),
        help="Overtime data directory",
    )
    parser.add_argument(
        "--min-edge",
        type=float,
        default=2.0,
        help="Minimum edge threshold (percentage points)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output CSV path (default: data/analysis/analysis_<date>.csv)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./data/analysis"),
        help="Output directory for analysis CSV (default: data/analysis)",
    )

    args = parser.parse_args()

    # Default output path when --output not provided
    output_path = args.output or (args.output_dir / f"analysis_{args.date}.csv")

    try:
        print(f"\n[OK] Loading data for {args.date}...")

        kenpom_ratings = load_kenpom_ratings(args.kenpom_dir, args.date)
        print(f"[OK] Loaded {len(kenpom_ratings)} KenPom team ratings")

        overtime_odds = load_overtime_odds(args.overtime_dir, args.date)
        print(f"[OK] Loaded {len(overtime_odds)} Overtime game lines")

        print(f"\n[OK] Analyzing edges (min threshold: {args.min_edge}%)...\n")
        edges = analyze_edges(kenpom_ratings, overtime_odds, args.min_edge)

        if not edges:
            print(f"[WARNING] No games found with edge >= {args.min_edge}%")
            return 0

        print(f"[OK] Found {len(edges)} games with significant edges:\n")
        print(format_table(edges))

        # Always write to standardized output path
        import csv

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=edges[0].keys())
            writer.writeheader()
            writer.writerows(edges)
        print(f"\n[OK] Saved analysis to {output_path}")

        # Summary statistics
        print("\n--- Summary ---")
        print(f"Total games analyzed: {len(overtime_odds)}")
        print(f"Games with edges >= {args.min_edge}%: {len(edges)}")
        avg_edge = sum(e["best_edge"] for e in edges) / len(edges)
        max_edge = max(e["best_edge"] for e in edges)
        print(f"Average edge: {avg_edge:.1f}%")
        print(f"Max edge: {max_edge:.1f}%")

        return 0

    except FileNotFoundError as e:
        print(f"[ERROR] {e}")
        return 1
    except Exception as e:
        print(f"[ERROR] Analysis failed: {e}")
        import traceback

        traceback.print_exc()
        return 1


if __name__ == "__main__":
    import sys

    sys.exit(main())
