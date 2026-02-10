#!/usr/bin/env python3
"""Multi-day CLV analysis using Overtime lines and ESPN scores.

Analyzes closing line value across multiple dates to identify:
- Systematic edges (favorites vs underdogs, overs vs unders)
- Sharp money accuracy over time
- Profitable betting patterns

Usage:
    uv run python scripts/analyze_clv_multi_day.py \\
        --start 2026-01-31 --end 2026-02-05
    uv run python scripts/analyze_clv_multi_day.py \\
        --start 2026-01-31 --end 2026-02-05 --output data/clv_analysis.csv
    uv run python scripts/analyze_clv_multi_day.py \\
        --start 2026-01-31 --end 2026-02-05 --collect-scores
"""

from __future__ import annotations

import argparse
import logging
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import select

from sports_betting_edge.adapters.database import (
    OvertimeLineSnapshotDB,
    OvertimeOpeningLineDB,
    create_database_engine,
    make_session_factory,
)
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

logger = logging.getLogger(__name__)

# Team name mappings (ESPN -> Overtime)
TEAM_NAME_MAP = {
    "Queens University": "Queens NC",
    "UMBC": "MD Baltimore Co",
    "UAlbany": "Albany NY",
    "Mount St. Mary's": "Mt. St. Marys",
    "Saint Peter's": "St. Peters",
    "Saint Francis": "St. Francis PA",
    "Long Island University": "Long Island",
    "UNC Wilmington": "NC Wilmington",
    "Charleston": "Coll Of Charleston",
    "Florida Gulf Coast": "Fla Gulf Coast",
    "Omaha": "Nebraska Omaha",
    "Southeast Missouri State": "SE Missouri State",
    "UT Martin": "Tennessee Martin",
    "UC Santa Barbara": "Cal Santa Barbara",
    "Northern Colorado": "No. Colorado",
    "UC Riverside": "Cal Riverside",
    "Cal State Fullerton": "CS Fullerton",
    "Cal Poly": "Cal Poly SLO",
    "Cal State Northridge": "CS Northridge",
    "Cal State Bakersfield": "CS Bakersfield",
    "UC Irvine": "Cal Irvine",
}


def collect_scores_for_range(start_date: str, end_date: str) -> None:
    """Run ESPN score collection for date range.

    Args:
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
    """
    logger.info("Collecting ESPN scores from %s to %s", start_date, end_date)
    cmd = [
        "uv",
        "run",
        "python",
        "scripts/backfill_espn_scores.py",
        "--start",
        start_date,
        "--end",
        end_date,
    ]
    subprocess.run(cmd, check=True)


def get_opening_lines(session, start_date: str, end_date: str) -> pd.DataFrame:
    """Get all opening lines for date range.

    Args:
        session: SQLAlchemy session
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)

    Returns:
        DataFrame with opening lines
    """
    # Convert dates to search patterns
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)

    # Get all opening lines in date range (inclusive of end_date)
    stmt = select(OvertimeOpeningLineDB).where(
        OvertimeOpeningLineDB.opened_at >= start_dt,
        OvertimeOpeningLineDB.opened_at < end_dt,
    )
    openings = session.execute(stmt).scalars().all()

    records = []
    for opening in openings:
        records.append(
            {
                "game_id": opening.game_id,
                "category": opening.category,
                "opened_at": opening.opened_at,
                "game_date": opening.game_date_str,
                "away_team": opening.away_team,
                "home_team": opening.home_team,
                "open_spread": opening.spread_magnitude,
                "open_favorite": opening.favorite_team,
                "open_fav_price": opening.spread_favorite_price,
                "open_dog_price": opening.spread_underdog_price,
                "open_total": opening.total_points,
                "open_over_price": opening.total_over_price,
                "open_under_price": opening.total_under_price,
            }
        )

    return pd.DataFrame(records)


def get_closing_lines(session, game_ids: list[str]) -> pd.DataFrame:
    """Get latest pre-game snapshots (closing lines) for games.

    Args:
        session: SQLAlchemy session
        game_ids: List of game IDs

    Returns:
        DataFrame with closing lines
    """
    records = []

    for game_id in game_ids:
        # Get all snapshots for this game
        stmt = (
            select(OvertimeLineSnapshotDB)
            .where(OvertimeLineSnapshotDB.game_id == game_id)
            .order_by(OvertimeLineSnapshotDB.captured_at.desc())
        )
        snapshots = session.execute(stmt).scalars().all()

        # Find latest pre-game snapshot (filter out live betting lines)
        for snapshot in snapshots:
            # Check if this looks like pre-game (not live betting)
            spread_ok = snapshot.spread_magnitude is None or snapshot.spread_magnitude >= 0.5
            total_ok = snapshot.total_points is None or snapshot.total_points >= 100.0

            if spread_ok and total_ok:
                records.append(
                    {
                        "game_id": snapshot.game_id,
                        "close_spread": snapshot.spread_magnitude,
                        "close_favorite": snapshot.favorite_team,
                        "close_fav_price": snapshot.spread_favorite_price,
                        "close_dog_price": snapshot.spread_underdog_price,
                        "close_total": snapshot.total_points,
                        "close_over_price": snapshot.total_over_price,
                        "close_under_price": snapshot.total_under_price,
                        "closed_at": snapshot.captured_at,
                    }
                )
                break

    return pd.DataFrame(records)


def load_espn_scores(db_path: str, start_date: str, end_date: str) -> pd.DataFrame:
    """Load ESPN scores from database for date range.

    Args:
        db_path: Path to database
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)

    Returns:
        DataFrame with scores
    """
    db = OddsAPIDatabase(db_path)

    query = f"""
        SELECT
            game_date,
            away_team,
            away_score,
            home_team,
            home_score,
            completed
        FROM espn_scores
        WHERE game_date >= '{start_date}'
        AND game_date <= '{end_date}'
        AND completed = 1
    """

    scores_df = pd.read_sql_query(query, db.conn)

    # Apply team name mapping
    scores_df["away_team_normalized"] = scores_df["away_team"].replace(TEAM_NAME_MAP)
    scores_df["home_team_normalized"] = scores_df["home_team"].replace(TEAM_NAME_MAP)

    logger.info("Loaded %d ESPN scores", len(scores_df))
    return scores_df


def calculate_clv_metrics(
    openings: pd.DataFrame, closings: pd.DataFrame, scores: pd.DataFrame
) -> pd.DataFrame:
    """Calculate CLV metrics for all games.

    Args:
        openings: Opening lines DataFrame
        closings: Closing lines DataFrame
        scores: Scores DataFrame

    Returns:
        DataFrame with CLV analysis
    """
    # Merge openings with closings
    lines = openings.merge(closings, on="game_id", how="left")

    # Calculate line movements
    lines["spread_movement"] = lines["close_spread"] - lines["open_spread"]
    lines["total_movement"] = lines["close_total"] - lines["open_total"]

    # Merge with scores
    matched = lines.merge(
        scores,
        left_on=["away_team", "home_team"],
        right_on=["away_team_normalized", "home_team_normalized"],
        how="inner",
        suffixes=("_line", "_score"),
    )

    # Calculate results
    matched["actual_margin"] = matched["home_score"] - matched["away_score"]
    matched["actual_total"] = matched["home_score"] + matched["away_score"]

    # Spread analysis
    matched["fav_is_home"] = matched["close_favorite"] == matched["home_team_line"]
    matched["fav_covers"] = np.where(
        matched["fav_is_home"],
        matched["actual_margin"] > matched["close_spread"],
        -matched["actual_margin"] > matched["close_spread"],
    )

    # Total analysis
    matched["over_covers"] = matched["actual_total"] > matched["close_total"]

    # Sharp money analysis
    matched["spread_moved_to_fav"] = matched["spread_movement"] > 0
    matched["total_moved_up"] = matched["total_movement"] > 0

    matched["spread_move_correct"] = matched["spread_moved_to_fav"] == matched["fav_covers"]
    matched["total_move_correct"] = matched["total_moved_up"] == matched["over_covers"]

    logger.info("Calculated CLV metrics for %d games", len(matched))
    return matched


def print_summary(results: pd.DataFrame) -> None:
    """Print comprehensive CLV summary.

    Args:
        results: Results DataFrame
    """
    if len(results) == 0:
        print("\n[WARNING] No games to analyze")
        return

    print("\n" + "=" * 100)
    print("MULTI-DAY CLOSING LINE VALUE (CLV) ANALYSIS")
    print("=" * 100)
    print()

    # Date range
    print(
        f"Analysis period: {results['game_date_line'].min()} to {results['game_date_line'].max()}"
    )
    print(f"Total games analyzed: {len(results)}")
    print(f"Games per day: {len(results) / results['game_date_line'].nunique():.1f}")
    print()

    # Overall spread performance
    print("SPREAD PERFORMANCE (Against Closing Line):")
    print("-" * 100)
    fav_covers = results["fav_covers"].sum()
    dog_covers = len(results) - fav_covers
    fav_pct = 100 * fav_covers / len(results)
    dog_pct = 100 * dog_covers / len(results)

    print(f"  Favorites: {fav_covers:3d} - {dog_covers:3d} ({fav_pct:5.1f}%)")
    print(f"  Underdogs: {dog_covers:3d} - {fav_covers:3d} ({dog_pct:5.1f}%)")
    print("  Break-even: 52.4% at -110 odds")

    if dog_pct > 52.4:
        edge = dog_pct - 52.4
        print(f"  Result: UNDERDOGS have {edge:+.1f}% edge - PROFITABLE!")
    elif fav_pct > 52.4:
        edge = fav_pct - 52.4
        print(f"  Result: FAVORITES have {edge:+.1f}% edge - PROFITABLE!")
    else:
        print("  Result: No significant edge")
    print()

    # Overall total performance
    print("TOTAL PERFORMANCE (Against Closing Line):")
    print("-" * 100)
    overs = results["over_covers"].sum()
    unders = len(results) - overs
    over_pct = 100 * overs / len(results)
    under_pct = 100 * unders / len(results)

    print(f"  Overs:  {overs:3d} - {unders:3d} ({over_pct:5.1f}%)")
    print(f"  Unders: {unders:3d} - {overs:3d} ({under_pct:5.1f}%)")
    print("  Break-even: 52.4% at -110 odds")

    if under_pct > 52.4:
        edge = under_pct - 52.4
        print(f"  Result: UNDERS have {edge:+.1f}% edge - PROFITABLE!")
    elif over_pct > 52.4:
        edge = over_pct - 52.4
        print(f"  Result: OVERS have {edge:+.1f}% edge - PROFITABLE!")
    else:
        print("  Result: No significant edge")
    print()

    # Sharp money accuracy
    print("SHARP MONEY ACCURACY:")
    print("-" * 100)

    # Spread movements
    moved_spreads = results[results["spread_movement"].abs() >= 0.5]
    if len(moved_spreads) > 0:
        correct = moved_spreads["spread_move_correct"].sum()
        accuracy = 100 * correct / len(moved_spreads)
        print("Spread movements (>= 0.5 pts):")
        pct = 100 * len(moved_spreads) / len(results)
        print(f"  Games with movement: {len(moved_spreads):3d} / {len(results):3d} ({pct:.1f}%)")
        print(f"  Sharp money accuracy: {correct:3d} / {len(moved_spreads):3d} ({accuracy:.1f}%)")
        print("  Random chance: 50.0%")
        if accuracy > 50:
            print(f"  Result: Sharp money PROFITABLE (edge: {accuracy - 50:+.1f}%)")
        else:
            print(f"  Result: Sharp money UNPROFITABLE (fade for {50 - accuracy:+.1f}% edge)")
        print()

    # Total movements
    moved_totals = results[results["total_movement"].abs() >= 0.5]
    if len(moved_totals) > 0:
        correct = moved_totals["total_move_correct"].sum()
        accuracy = 100 * correct / len(moved_totals)
        print("Total movements (>= 0.5 pts):")
        pct = 100 * len(moved_totals) / len(results)
        print(f"  Games with movement: {len(moved_totals):3d} / {len(results):3d} ({pct:.1f}%)")
        print(f"  Sharp money accuracy: {correct:3d} / {len(moved_totals):3d} ({accuracy:.1f}%)")
        print("  Random chance: 50.0%")
        if accuracy > 50:
            print(f"  Result: Sharp money PROFITABLE (edge: {accuracy - 50:+.1f}%)")
        else:
            print(f"  Result: Sharp money UNPROFITABLE (fade for {50 - accuracy:+.1f}% edge)")
        print()

    # Day-by-day breakdown
    print("DAILY BREAKDOWN:")
    print("-" * 100)
    daily = results.groupby("game_date_line").agg(
        {
            "game_id": "count",
            "fav_covers": "sum",
            "over_covers": "sum",
        }
    )
    daily["dog_covers"] = daily["game_id"] - daily["fav_covers"]
    daily["under_covers"] = daily["game_id"] - daily["over_covers"]
    daily["fav_pct"] = 100 * daily["fav_covers"] / daily["game_id"]
    daily["over_pct"] = 100 * daily["over_covers"] / daily["game_id"]

    print(f"{'Date':12s} {'Games':>6s} {'Fav%':>6s} {'Over%':>6s}")
    for date, row in daily.iterrows():
        print(f"{date:12s} {row['game_id']:6.0f} {row['fav_pct']:6.1f} {row['over_pct']:6.1f}")


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Multi-day CLV analysis using Overtime lines and ESPN scores"
    )
    parser.add_argument("--start", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument(
        "--overtime-db",
        type=Path,
        default=Path("data/source/overtime/overtime_lines.db"),
        help="Path to Overtime database",
    )
    parser.add_argument(
        "--odds-db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to Odds API database (for ESPN scores)",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Output CSV file for detailed results",
    )
    parser.add_argument(
        "--collect-scores",
        action="store_true",
        help="Run ESPN score collection before analysis",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable debug logging")

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    # Collect scores if requested
    if args.collect_scores:
        collect_scores_for_range(args.start, args.end)

    # Get opening and closing lines from Overtime database
    logger.info("Loading opening and closing lines from Overtime database")
    overtime_url = f"sqlite:///{args.overtime_db}"
    engine = create_database_engine(overtime_url)
    SessionFactory = make_session_factory(engine)

    with SessionFactory() as session:
        openings = get_opening_lines(session, args.start, args.end)
        logger.info("Loaded %d opening lines", len(openings))

        if len(openings) == 0:
            logger.error("No opening lines found for date range")
            return

        closings = get_closing_lines(session, openings["game_id"].tolist())
        logger.info("Loaded %d closing lines", len(closings))

    # Get ESPN scores
    logger.info("Loading ESPN scores from database")
    scores = load_espn_scores(str(args.odds_db), args.start, args.end)

    if len(scores) == 0:
        logger.warning("No ESPN scores found - run with --collect-scores first")
        return

    # Calculate CLV metrics
    results = calculate_clv_metrics(openings, closings, scores)

    if len(results) == 0:
        logger.error("No matching games found between lines and scores")
        return

    # Save detailed results if requested
    if args.output:
        results.to_csv(args.output, index=False)
        logger.info("Wrote detailed results to %s", args.output)

    # Print summary
    print_summary(results)


if __name__ == "__main__":
    main()
