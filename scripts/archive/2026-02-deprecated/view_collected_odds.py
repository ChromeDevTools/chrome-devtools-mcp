"""View collected overtime.ag odds data."""

import sys
from pathlib import Path

import pandas as pd

pd.set_option("display.max_columns", None)
pd.set_option("display.width", 120)


def main() -> None:
    """Display collected odds data."""
    data_dir = Path("data/overtime/basketball")

    if not data_dir.exists():
        print(f"[ERROR] Directory not found: {data_dir}")
        print(
            "Run the collection service first: uv run python scripts/overtime_collector_service.py"
        )
        sys.exit(1)

    # Find all Parquet files
    files = sorted(data_dir.glob("*.parquet"))

    if not files:
        print(f"[ERROR] No Parquet files found in {data_dir}")
        sys.exit(1)

    print("=" * 120)
    print("OVERTIME.AG COLLECTED ODDS")
    print("=" * 120)
    print(f"Collections found: {len(files)}")
    print(f"Directory: {data_dir.absolute()}")
    print()

    # Show most recent collection
    latest = files[-1]
    df = pd.read_parquet(latest)

    print(f"Latest collection: {latest.name}")
    print(f"Collected at: {df['collected_at'].iloc[0]}")
    print(f"Games: {len(df)}")
    print()

    # Group by period (show only full game, not halves/quarters)
    full_game = df[df["period_number"] == 0].copy()

    print("=" * 120)
    print("CURRENT ODDS (Full Game)")
    print("=" * 120)
    print()

    for _, game in full_game.iterrows():
        print(f"{game['team1_name']} @ {game['team2_name']}")
        print(f"  Game Time: {game['game_datetime']}")
        print(f"  Rotation: {game['team1_rot_num']} / {game['team2_rot_num']}")
        print()
        print(f"  Spread: {game['spread_points']} (Favored: {game['spread_favored_team']})")
        print(f"    {game['team1_name']}: {game['spread1_juice']}")
        print(f"    {game['team2_name']}: {game['spread2_juice']}")
        print()
        print(f"  Total: {game['total_points']}")
        print(f"    Over: {game['over_juice']}")
        print(f"    Under: {game['under_juice']}")
        print()
        print("  Moneyline:")
        print(f"    {game['team1_name']}: {game['moneyline1_american']}")
        print(f"    {game['team2_name']}: {game['moneyline2_american']}")
        print()
        print("  Team Totals:")
        print(f"    {game['team1_name']}: {game['team1_total_points']}")
        print(f"    {game['team2_name']}: {game['team2_total_points']}")
        print()
        print("-" * 120)
        print()

    # If multiple collections, show line movements
    if len(files) > 1:
        print("=" * 120)
        print("LINE MOVEMENTS")
        print("=" * 120)

        df_old = pd.read_parquet(files[-2])
        df_old = df_old[df_old["period_number"] == 0]

        comparison = pd.merge(
            df_old[["game_num", "team1_name", "spread_points", "total_points"]],
            full_game[["game_num", "spread_points", "total_points"]],
            on="game_num",
            suffixes=("_old", "_new"),
        )

        comparison["spread_movement"] = (
            comparison["spread_points_new"] - comparison["spread_points_old"]
        )
        comparison["total_movement"] = (
            comparison["total_points_new"] - comparison["total_points_old"]
        )

        movers = comparison[
            (comparison["spread_movement"] != 0) | (comparison["total_movement"] != 0)
        ]

        if len(movers) > 0:
            print(f"Games with line movement: {len(movers)}")
            print()
            for _, row in movers.iterrows():
                print(f"{row['team1_name']}")
                if row["spread_movement"] != 0:
                    spread_old = row["spread_points_old"]
                    spread_new = row["spread_points_new"]
                    spread_move = row["spread_movement"]
                    print(f"  Spread: {spread_old} -> {spread_new} ({spread_move:+.1f})")
                if row["total_movement"] != 0:
                    total_old = row["total_points_old"]
                    total_new = row["total_points_new"]
                    total_move = row["total_movement"]
                    print(f"  Total: {total_old} -> {total_new} ({total_move:+.1f})")
                print()
        else:
            print("No line movements detected")

    print("=" * 120)


if __name__ == "__main__":
    main()
