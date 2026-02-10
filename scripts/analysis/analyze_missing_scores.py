"""Analyze missing scores to understand gaps in data collection.

Usage:
    uv run python scripts/analyze_missing_scores.py
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import write_csv
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def analyze_missing_scores(db_path: Path) -> None:
    """Analyze which games have odds but no scores.

    Args:
        db_path: Path to Odds API database
    """
    db = OddsAPIDatabase(str(db_path))

    # Get events with odds but no scores, that are in the past
    query = """
        SELECT
            e.event_id,
            e.home_team,
            e.away_team,
            e.commence_time,
            DATE(e.commence_time) as game_date,
            COUNT(DISTINCT o.book_key) as num_bookmakers,
            COUNT(DISTINCT o.market_key) as num_markets
        FROM events e
        INNER JOIN observations o ON e.event_id = o.event_id
        LEFT JOIN scores s ON e.event_id = s.event_id
        WHERE s.event_id IS NULL
        AND DATE(e.commence_time) < DATE('now')
        GROUP BY e.event_id, e.home_team, e.away_team, e.commence_time
        ORDER BY e.commence_time DESC
    """

    missing_df = pd.read_sql_query(query, db.conn)

    logger.info(f"Total games with odds but no scores: {len(missing_df)}")

    if len(missing_df) == 0:
        logger.info("[OK] No missing scores!")
        return

    # Analyze by date
    logger.info("\n" + "=" * 80)
    logger.info("MISSING SCORES BY DATE")
    logger.info("=" * 80)

    by_date = missing_df.groupby("game_date").size().sort_index(ascending=False)
    logger.info(f"\n{by_date.head(20).to_string()}")

    # Date range
    logger.info("\n" + "=" * 80)
    logger.info("DATE RANGE")
    logger.info("=" * 80)
    logger.info(f"Earliest missing: {missing_df['game_date'].min()}")
    logger.info(f"Latest missing:   {missing_df['game_date'].max()}")
    logger.info(f"Unique dates:     {missing_df['game_date'].nunique()}")

    # Sample of recent missing games
    logger.info("\n" + "=" * 80)
    logger.info("RECENT MISSING GAMES (last 10)")
    logger.info("=" * 80)

    recent = missing_df.head(10)
    for _, row in recent.iterrows():
        logger.info(
            f"{row['game_date']}: {row['away_team']:30s} @ {row['home_team']:30s} "
            f"({row['num_bookmakers']} books, {row['num_markets']} markets)"
        )

    # Export detailed list
    output_path = Path("data/missing_scores_detail.csv")
    write_csv(missing_df, output_path, index=False)
    logger.info(f"\nDetailed list exported to: {output_path}")

    # Check how many scores we DO have
    scores_query = """
        SELECT
            DATE(e.commence_time) as game_date,
            COUNT(*) as games_with_scores
        FROM scores s
        INNER JOIN events e ON s.event_id = e.event_id
        WHERE s.completed = 1
        GROUP BY DATE(e.commence_time)
        ORDER BY game_date DESC
    """

    scores_df = pd.read_sql_query(scores_query, db.conn)

    logger.info("\n" + "=" * 80)
    logger.info("SCORES WE DO HAVE (by date)")
    logger.info("=" * 80)
    logger.info(f"\n{scores_df.head(20).to_string()}")


def main() -> None:
    """Analyze missing scores."""
    db_path = Path("data/odds_api/odds_api.sqlite3")

    if not db_path.exists():
        logger.error(f"Database not found: {db_path}")
        return

    analyze_missing_scores(db_path)


if __name__ == "__main__":
    main()
