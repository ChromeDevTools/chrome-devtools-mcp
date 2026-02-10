#!/usr/bin/env python3
"""Compare opening lines vs closing lines for line movement analysis.

Calculates CLV (Closing Line Value) metrics:
- Spread movement (opening to closing)
- Total movement (opening to closing)
- Juice changes
- Steam moves (significant line movements)

Usage:
    uv run python scripts/compare_opening_closing_lines.py --date 2026-02-05
    uv run python scripts/compare_opening_closing_lines.py --date 2026-02-05 \\
        --output data/clv_analysis.csv
    uv run python scripts/compare_opening_closing_lines.py --date 2026-02-05 \\
        --min-movement 1.0
"""

from __future__ import annotations

import argparse
import logging
from datetime import datetime
from pathlib import Path

import pandas as pd
from sqlalchemy import select

from sports_betting_edge.adapters.database import (
    OvertimeLineSnapshotDB,
    OvertimeOpeningLineDB,
    create_database_engine,
    make_session_factory,
)
from sports_betting_edge.adapters.filesystem import write_csv

logger = logging.getLogger(__name__)

DEFAULT_DB_PATH = Path("data/source/overtime/overtime_lines.db")


def get_opening_lines_for_date(
    session, target_date: str
) -> list[tuple[str, OvertimeOpeningLineDB]]:
    """Get opening lines for games on a specific date.

    Args:
        session: SQLAlchemy session
        target_date: Date string in format 'YYYY-MM-DD' or 'Thu Feb 5'

    Returns:
        List of (game_id, opening_line) tuples
    """
    # Convert various date formats to search pattern
    # Examples: '2026-02-05', 'Thu Feb 5', 'Feb 5'
    if len(target_date) == 10 and target_date.count("-") == 2:
        # Format: YYYY-MM-DD -> convert to 'Mon DD' or 'Mon DD'
        dt = datetime.strptime(target_date, "%Y-%m-%d")
        # Remove leading zero from day (Windows compatible)
        day = str(dt.day)  # e.g., '5' not '05'
        month = dt.strftime("%b")  # e.g., 'Feb'
        date_pattern = f"%{month} {day}%"  # e.g., 'Feb 5'
    else:
        date_pattern = f"%{target_date}%"

    stmt = select(OvertimeOpeningLineDB).where(
        OvertimeOpeningLineDB.game_date_str.like(date_pattern)
    )
    openings = session.execute(stmt).scalars().all()

    return [(opening.game_id, opening) for opening in openings]


def get_latest_snapshot(
    session, game_id: str, spread_threshold: float = 20.0, total_threshold: float = 100.0
) -> OvertimeLineSnapshotDB | None:
    """Get the most recent PRE-GAME snapshot (closing line) for a game.

    Filters out post-game live betting lines which have unrealistic values
    (e.g., spreads < 20, totals < 100 indicate live in-game lines).

    Args:
        session: SQLAlchemy session
        game_id: Unique game identifier
        spread_threshold: Min spread to consider valid pre-game line (default: 20.0)
        total_threshold: Min total to consider valid pre-game line (default: 100.0)

    Returns:
        Latest pre-game snapshot or None if no valid snapshots exist
    """
    # Get all snapshots ordered by most recent first
    stmt = (
        select(OvertimeLineSnapshotDB)
        .where(OvertimeLineSnapshotDB.game_id == game_id)
        .order_by(OvertimeLineSnapshotDB.captured_at.desc())
    )
    snapshots = session.execute(stmt).scalars().all()

    # Find first snapshot with realistic pre-game values
    # Live betting lines typically have very low spreads/totals as game progresses
    for snapshot in snapshots:
        # Check if this looks like a pre-game line (not live betting)
        spread_ok = (
            snapshot.spread_magnitude is None or snapshot.spread_magnitude >= 0.5
        )  # Allow any spread >= 0.5
        total_ok = snapshot.total_points is None or snapshot.total_points >= total_threshold

        if spread_ok and total_ok:
            return snapshot

    # If no valid snapshots, return None
    return None


def calculate_line_movement(
    opening: OvertimeOpeningLineDB, closing: OvertimeLineSnapshotDB | None
) -> dict:
    """Calculate line movement from opening to closing.

    Args:
        opening: Opening line
        closing: Closing line (latest snapshot) or None

    Returns:
        Dict with movement metrics
    """
    if closing is None:
        return {
            "game_id": opening.game_id,
            "category": opening.category,
            "away_team": opening.away_team,
            "home_team": opening.home_team,
            "game_date": opening.game_date_str,
            "game_time": opening.game_time_str,
            # Opening lines
            "open_spread": opening.spread_magnitude,
            "open_favorite": opening.favorite_team,
            "open_fav_price": opening.spread_favorite_price,
            "open_dog_price": opening.spread_underdog_price,
            "open_total": opening.total_points,
            "open_over_price": opening.total_over_price,
            "open_under_price": opening.total_under_price,
            # Closing lines
            "close_spread": None,
            "close_favorite": None,
            "close_fav_price": None,
            "close_dog_price": None,
            "close_total": None,
            "close_over_price": None,
            "close_under_price": None,
            # Movement
            "spread_movement": None,
            "total_movement": None,
            "fav_juice_change": None,
            "dog_juice_change": None,
            "has_snapshots": False,
            "opened_at": opening.opened_at,
            "closed_at": None,
        }

    # Calculate movements
    spread_move = None
    if opening.spread_magnitude and closing.spread_magnitude:
        spread_move = closing.spread_magnitude - opening.spread_magnitude

    total_move = None
    if opening.total_points and closing.total_points:
        total_move = closing.total_points - opening.total_points

    fav_juice_change = None
    if opening.spread_favorite_price and closing.spread_favorite_price:
        fav_juice_change = closing.spread_favorite_price - opening.spread_favorite_price

    dog_juice_change = None
    if opening.spread_underdog_price and closing.spread_underdog_price:
        dog_juice_change = closing.spread_underdog_price - opening.spread_underdog_price

    return {
        "game_id": opening.game_id,
        "category": opening.category,
        "away_team": opening.away_team,
        "home_team": opening.home_team,
        "game_date": opening.game_date_str,
        "game_time": opening.game_time_str,
        # Opening lines
        "open_spread": opening.spread_magnitude,
        "open_favorite": opening.favorite_team,
        "open_fav_price": opening.spread_favorite_price,
        "open_dog_price": opening.spread_underdog_price,
        "open_total": opening.total_points,
        "open_over_price": opening.total_over_price,
        "open_under_price": opening.total_under_price,
        # Closing lines
        "close_spread": closing.spread_magnitude,
        "close_favorite": closing.favorite_team,
        "close_fav_price": closing.spread_favorite_price,
        "close_dog_price": closing.spread_underdog_price,
        "close_total": closing.total_points,
        "close_over_price": closing.total_over_price,
        "close_under_price": closing.total_under_price,
        # Movement
        "spread_movement": spread_move,
        "total_movement": total_move,
        "fav_juice_change": fav_juice_change,
        "dog_juice_change": dog_juice_change,
        "has_snapshots": True,
        "opened_at": opening.opened_at,
        "closed_at": closing.captured_at,
    }


def compare_lines(db_path: Path | str, target_date: str, min_movement: float = 0.0) -> pd.DataFrame:
    """Compare opening vs closing lines for a specific date.

    Args:
        db_path: Path to SQLite database
        target_date: Date string (e.g., '2026-02-05' or 'Thu Feb 5')
        min_movement: Minimum spread/total movement to include (default: 0.0 = all)

    Returns:
        DataFrame with line movement analysis
    """
    db_url = f"sqlite:///{db_path}"
    engine = create_database_engine(db_url)
    SessionFactory = make_session_factory(engine)

    with SessionFactory() as session:
        # Get all opening lines for the date
        openings = get_opening_lines_for_date(session, target_date)
        logger.info("Found %d opening lines for %s", len(openings), target_date)

        if len(openings) == 0:
            logger.warning("No opening lines found for date: %s", target_date)
            return pd.DataFrame()

        # Compare each opening to its closing line
        movements = []
        for game_id, opening in openings:
            closing = get_latest_snapshot(session, game_id)
            movement = calculate_line_movement(opening, closing)
            movements.append(movement)

        df = pd.DataFrame(movements)

        # Filter by minimum movement if specified
        if min_movement > 0:
            df = df[
                (df["spread_movement"].abs() >= min_movement)
                | (df["total_movement"].abs() >= min_movement)
            ].copy()

        # Sort by biggest movements
        df["total_abs_movement"] = (
            df["spread_movement"].fillna(0).abs() + df["total_movement"].fillna(0).abs()
        )
        df = df.sort_values("total_abs_movement", ascending=False)
        df = df.drop(columns=["total_abs_movement"])

        logger.info("Calculated line movements for %d games", len(df))
        return df


def print_movement_summary(df: pd.DataFrame) -> None:
    """Print summary statistics for line movements.

    Args:
        df: DataFrame with line movement data
    """
    if len(df) == 0:
        print("\n[WARNING] No line movements to analyze")
        return

    print("\n=== Line Movement Summary ===")
    print(f"Total games analyzed: {len(df)}")
    print()

    # Games with/without snapshots
    has_snapshots = df["has_snapshots"].sum()
    no_snapshots = len(df) - has_snapshots
    print(f"Games with closing lines: {has_snapshots}")
    print(f"Games without closing lines: {no_snapshots}")
    print()

    if has_snapshots == 0:
        print("[WARNING] No closing lines available for comparison")
        return

    # Filter to games with snapshots for stats
    moved = df[df["has_snapshots"]].copy()

    # Spread movement stats
    spread_moves = moved[moved["spread_movement"].notna()]
    if len(spread_moves) > 0:
        print("Spread Movement:")
        print(f"  Average: {spread_moves['spread_movement'].mean():+.2f} points")
        print(f"  Median: {spread_moves['spread_movement'].median():+.2f} points")
        min_move = spread_moves["spread_movement"].min()
        max_move = spread_moves["spread_movement"].max()
        print(f"  Range: {min_move:+.2f} to {max_move:+.2f}")
        moved = (spread_moves["spread_movement"] != 0).sum()
        print(f"  Games with movement: {moved} / {len(spread_moves)}")
        print()

    # Total movement stats
    total_moves = moved[moved["total_movement"].notna()]
    if len(total_moves) > 0:
        print("Total Movement:")
        print(f"  Average: {total_moves['total_movement'].mean():+.2f} points")
        print(f"  Median: {total_moves['total_movement'].median():+.2f} points")
        min_move = total_moves["total_movement"].min()
        max_move = total_moves["total_movement"].max()
        print(f"  Range: {min_move:+.2f} to {max_move:+.2f}")
        moved = (total_moves["total_movement"] != 0).sum()
        print(f"  Games with movement: {moved} / {len(total_moves)}")
        print()

    # Biggest movers
    print("Top 10 Spread Movements:")
    print("-" * 100)
    top_spread = moved.nlargest(10, "spread_movement", keep="all")[
        [
            "away_team",
            "home_team",
            "open_spread",
            "close_spread",
            "spread_movement",
            "open_favorite",
        ]
    ]
    for _, row in top_spread.iterrows():
        teams = f"{row['away_team']:30s} @ {row['home_team']:30s}"
        lines = f"{row['open_spread']:5.1f} -> {row['close_spread']:5.1f}"
        move = f"({row['spread_movement']:+.1f})"
        print(f"  {teams} | {lines} {move}")

    print()
    print("Top 10 Total Movements:")
    print("-" * 100)
    top_total = moved.nlargest(10, "total_movement", keep="all")[
        ["away_team", "home_team", "open_total", "close_total", "total_movement"]
    ]
    for _, row in top_total.iterrows():
        print(
            f"  {row['away_team']:30s} @ {row['home_team']:30s} | "
            f"{row['open_total']:5.1f} -> {row['close_total']:5.1f} ({row['total_movement']:+.1f})"
        )


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Compare opening vs closing lines for CLV analysis"
    )
    parser.add_argument(
        "--date",
        required=True,
        help="Target date (e.g., '2026-02-05', 'Thu Feb 5', or 'Feb 5')",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=DEFAULT_DB_PATH,
        help="Path to SQLite database (default: data/source/overtime/overtime_lines.db)",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Output CSV file path (default: print summary only)",
    )
    parser.add_argument(
        "--min-movement",
        type=float,
        default=0.0,
        help="Minimum spread/total movement to include (default: 0.0 = all games)",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable debug logging")

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Compare lines
    df = compare_lines(
        db_path=args.db_path,
        target_date=args.date,
        min_movement=args.min_movement,
    )

    if len(df) == 0:
        logger.warning("No games found for date: %s", args.date)
        return

    # Output results
    if args.output:
        write_csv(df, args.output, index=False)
        logger.info("Wrote %d line movements to %s", len(df), args.output)

    # Print summary
    print_movement_summary(df)


if __name__ == "__main__":
    main()
