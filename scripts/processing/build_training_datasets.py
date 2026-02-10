"""Build XGBoost training datasets from integrated data sources.

Combines KenPom, line movement, and game outcomes into ML-ready datasets.

Usage:
    # Build datasets for December 2025
    uv run python scripts/build_training_datasets.py --start 2025-12-01 --end 2025-12-31

    # Build for specific output path
    uv run python scripts/build_training_datasets.py --output data/ml/training_2025.parquet
"""

import argparse
import logging
from pathlib import Path

from sports_betting_edge.adapters.filesystem import write_parquet
from sports_betting_edge.services.feature_engineering import FeatureEngineer

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def main() -> None:
    """Build training datasets."""
    parser = argparse.ArgumentParser(description="Build ML training datasets")
    parser.add_argument(
        "--start",
        type=str,
        default="2025-12-01",
        help="Start date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end",
        type=str,
        default="2026-01-31",
        help="End date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="data/ml",
        help="Output directory for datasets",
    )
    parser.add_argument(
        "--season",
        type=int,
        default=2026,
        help="KenPom season year",
    )

    args = parser.parse_args()

    logger.info("Building training datasets...")
    logger.info(f"Date range: {args.start} to {args.end}")

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    engineer = FeatureEngineer(staging_path="data/staging/")

    # Build spreads dataset
    logger.info("\n=== Building Spreads Dataset ===")
    X_spreads, y_spreads = engineer.build_spreads_dataset(
        start_date=args.start,
        end_date=args.end,
        season=args.season,
    )

    # Save spreads dataset
    spreads_output = output_dir / f"spreads_{args.start}_{args.end}.parquet"
    spreads_data = X_spreads.copy()
    spreads_data["target"] = y_spreads
    write_parquet(spreads_data.to_dict(orient="records"), spreads_output)  # type: ignore[arg-type]
    logger.info(f"[OK] Saved spreads dataset -> {spreads_output}")
    logger.info(f"     {len(spreads_data)} games, {len(X_spreads.columns)} features")

    # Build totals dataset
    logger.info("\n=== Building Totals Dataset ===")
    X_totals, y_totals = engineer.build_totals_dataset(
        start_date=args.start,
        end_date=args.end,
        season=args.season,
    )

    # Save totals dataset
    totals_output = output_dir / f"totals_{args.start}_{args.end}.parquet"
    totals_data = X_totals.copy()
    totals_data["target"] = y_totals
    write_parquet(totals_data.to_dict(orient="records"), totals_output)  # type: ignore[arg-type]
    logger.info(f"[OK] Saved totals dataset -> {totals_output}")
    logger.info(f"     {len(totals_data)} games, {len(X_totals.columns)} features")

    # Summary
    logger.info("\n=== Summary ===")
    logger.info(f"Spreads: {len(X_spreads)} games")
    logger.info(f"  Favorite covered: {y_spreads.sum()} ({y_spreads.mean():.1%})")
    logger.info(f"  Favorite failed: {(~y_spreads.astype(bool)).sum()}")

    logger.info(f"\nTotals: {len(X_totals)} games")
    logger.info(f"  Went over: {y_totals.sum()} ({y_totals.mean():.1%})")
    logger.info(f"  Went under: {(~y_totals.astype(bool)).sum()}")

    logger.info("\n[OK] Training datasets built successfully!")


if __name__ == "__main__":
    main()
