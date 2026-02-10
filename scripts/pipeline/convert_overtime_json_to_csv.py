"""Convert Overtime JSON odds data to structured CSV format.

Usage:
    uv run python scripts/convert_overtime_json_to_csv.py
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import write_csv


def convert_overtime_json_to_csv(
    json_path: Path,
    output_path: Path,
) -> None:
    """Convert Overtime JSON odds to CSV format.

    Args:
        json_path: Path to input JSON file
        output_path: Path to output CSV file
    """
    # Read JSON file
    with open(json_path) as f:
        data = json.load(f)

    # Extract games list
    games = data.get("games", [])

    if not games:
        raise ValueError("No games found in JSON file")

    # Convert to DataFrame
    df = pd.DataFrame(games)

    # Add metadata columns
    df["captured_at"] = data.get("captured_at")
    df["sport"] = data.get("sport")

    # Reorder columns for better readability
    column_order = [
        "game_date_str",
        "game_time_str",
        "category",
        "away_team",
        "home_team",
        "favorite_team",
        "spread_magnitude",
        "spread_favorite_price",
        "spread_underdog_price",
        "total_points",
        "total_over_price",
        "total_under_price",
        "away_rotation",
        "home_rotation",
        "away_spread_raw",
        "home_spread_raw",
        "total_over_raw",
        "total_under_raw",
        "raw_matchup",
        "captured_at",
        "sport",
    ]

    # Use only columns that exist
    df = df[[col for col in column_order if col in df.columns]]

    # Write to CSV using filesystem adapter
    write_csv(df, str(output_path), index=False)

    print(f"[OK] Converted {len(df)} games to CSV")
    print(f"     Input:  {json_path}")
    print(f"     Output: {output_path}")
    print(f"\nColumns: {', '.join(df.columns)}")
    print("Games by category:")
    print(df["category"].value_counts().to_string())


def main() -> None:
    """Main entry point."""
    json_path = Path("data/overtime/temp_odds.json")
    output_path = Path("data/overtime/temp_odds.csv")

    if not json_path.exists():
        raise FileNotFoundError(f"JSON file not found: {json_path}")

    convert_overtime_json_to_csv(json_path, output_path)


if __name__ == "__main__":
    main()
