"""Export complete dataset with odds and scores to Parquet.

Extracts all events with both betting odds and final scores, including:
- Opening and closing lines (spreads, totals, moneylines)
- Consensus metrics across bookmakers
- Closing Line Value (CLV) calculations
- Market efficiency indicators

The exported dataset is ML-ready for model training and backtesting.

Usage:
    uv run python scripts/export_complete_dataset.py

    # Custom output path
    uv run python scripts/export_complete_dataset.py --output data/ml_ready_dataset.parquet

    # Export as CSV instead
    uv run python scripts/export_complete_dataset.py --format csv
"""

import argparse
import logging
import sqlite3
from pathlib import Path

import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def export_complete_dataset(
    db_path: Path,
    query_path: Path,
    output_path: Path,
    output_format: str = "parquet",
) -> None:
    """Export complete dataset to file.

    Args:
        db_path: Path to SQLite database
        query_path: Path to SQL query file
        output_path: Path to save output file
        output_format: Output format (parquet or csv)
    """
    logger.info(f"Reading query from {query_path}")
    query = query_path.read_text()

    logger.info(f"Executing query against {db_path}")
    conn = sqlite3.connect(str(db_path))
    df = pd.read_sql_query(query, conn)
    conn.close()

    logger.info(f"Query returned {len(df)} games with complete data")

    if len(df) == 0:
        logger.warning("No complete data found - nothing to export")
        return

    # Show summary statistics
    logger.info(f"Date range: {df['game_date'].min()} to {df['game_date'].max()}")
    logger.info(f"Unique teams: {pd.concat([df['home_team'], df['away_team']]).nunique()}")
    logger.info(f"Average books per game (spread): {df['num_books_spread'].mean():.1f}")
    logger.info(f"Average books per game (total): {df['num_books_total'].mean():.1f}")

    # Market coverage (normalized column names)
    spread_coverage = df["consensus_closing_spread_magnitude"].notna().sum()
    total_coverage = df["consensus_closing_total"].notna().sum()
    ml_coverage = df["closing_home_implied_prob"].notna().sum()

    logger.info("Market coverage:")
    logger.info(f"  Spreads: {spread_coverage}/{len(df)} ({spread_coverage / len(df) * 100:.1f}%)")
    logger.info(f"  Totals: {total_coverage}/{len(df)} ({total_coverage / len(df) * 100:.1f}%)")
    logger.info(f"  Moneylines: {ml_coverage}/{len(df)} ({ml_coverage / len(df) * 100:.1f}%)")

    # CLV summary (normalized)
    logger.info("Closing Line Value (CLV) summary:")
    logger.info(f"  Mean home spread CLV: {df['home_spread_clv'].mean():.2f} points")
    logger.info(f"  Home cover rate: {df['home_covered_spread'].mean() * 100:.1f}%")
    logger.info(f"  Over rate: {df['went_over'].mean() * 100:.1f}%")
    logger.info(f"  Mean total error: {df['total_error'].mean():.2f} points")

    # Save to file
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if output_format == "parquet":
        df.to_parquet(output_path, index=False)
        logger.info(f"[OK] Exported {len(df)} games to {output_path}")
    elif output_format == "csv":
        df.to_csv(output_path, index=False)
        logger.info(f"[OK] Exported {len(df)} games to {output_path}")
    else:
        raise ValueError(f"Unsupported format: {output_format}")

    # Show column list
    logger.info(f"\nDataset contains {len(df.columns)} columns:")
    for col in df.columns:
        logger.info(f"  - {col}")


def main() -> None:
    """Run dataset export."""
    parser = argparse.ArgumentParser(description="Export complete dataset to Parquet or CSV")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--query",
        type=Path,
        default=Path("sql/query_complete_dataset_normalized.sql"),
        help="Path to SQL query file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/complete_dataset.parquet"),
        help="Path to output file",
    )
    parser.add_argument(
        "--format",
        choices=["parquet", "csv"],
        default="parquet",
        help="Output format (default: parquet)",
    )

    args = parser.parse_args()

    # Validate inputs
    if not args.db.exists():
        logger.error(f"Database not found: {args.db}")
        return

    if not args.query.exists():
        logger.error(f"Query file not found: {args.query}")
        return

    # Export dataset
    export_complete_dataset(
        db_path=args.db,
        query_path=args.query,
        output_path=args.output,
        output_format=args.format,
    )


if __name__ == "__main__":
    main()
