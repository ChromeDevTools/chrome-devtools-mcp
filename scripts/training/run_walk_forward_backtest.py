"""Run walk-forward backtest for score regression models.

Retrains score models on expanding/rolling historical windows,
measures true out-of-sample performance, and stores results.

Usage:
    uv run python scripts/training/run_walk_forward_backtest.py
    uv run python scripts/training/run_walk_forward_backtest.py --start 2025-12-01 --end 2026-02-09
    uv run python scripts/training/run_walk_forward_backtest.py --step 7 --window expanding
"""

from __future__ import annotations

import argparse
import logging
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.config.settings import settings
from sports_betting_edge.services.feature_engineering import FeatureEngineer
from sports_betting_edge.services.walk_forward_validation import (
    WalkForwardValidator,
)

logger = logging.getLogger(__name__)


def main() -> None:
    """Entry point for walk-forward backtest."""
    parser = argparse.ArgumentParser(
        description="Walk-forward backtest for score regression models"
    )
    parser.add_argument(
        "--start",
        type=str,
        default="2025-12-01",
        help="Backtest start date (default: 2025-12-01)",
    )
    parser.add_argument(
        "--end",
        type=str,
        default=None,
        help="Backtest end date (default: today)",
    )
    parser.add_argument(
        "--train-days",
        type=int,
        default=30,
        help="Training window in days (default: 30)",
    )
    parser.add_argument(
        "--step",
        type=int,
        default=7,
        help="Step size in days (default: 7)",
    )
    parser.add_argument(
        "--test-days",
        type=int,
        default=7,
        help="Test window in days (default: 7)",
    )
    parser.add_argument(
        "--window",
        choices=["expanding", "rolling"],
        default="expanding",
        help="Window type (default: expanding)",
    )
    parser.add_argument(
        "--min-train",
        type=int,
        default=100,
        help="Minimum training samples (default: 100)",
    )
    parser.add_argument(
        "--min-test",
        type=int,
        default=10,
        help="Minimum test samples (default: 10)",
    )
    parser.add_argument(
        "--season",
        type=int,
        default=2026,
        help="KenPom season (default: 2026)",
    )
    parser.add_argument(
        "--staging-path",
        type=Path,
        default=Path(str(settings.staging_dir)),
        help="Staging data directory",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Database path for storing results",
    )
    parser.add_argument(
        "--store-results",
        action="store_true",
        help="Store results in database",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Save results CSV to this path",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    end_date = args.end or date.today().isoformat()

    logger.info("=" * 80)
    logger.info("Walk-Forward Backtest: Score Regression Models")
    logger.info("=" * 80)
    logger.info("Period: %s to %s", args.start, end_date)
    logger.info(
        "Window: %s (%d day train, %d day test, %d day step)",
        args.window,
        args.train_days,
        args.test_days,
        args.step,
    )

    # Initialize
    engineer = FeatureEngineer(staging_path=str(args.staging_path))

    validator = WalkForwardValidator(
        train_window_days=args.train_days,
        test_window_days=args.test_days,
        step_days=args.step,
        window_type=args.window,
        min_train_samples=args.min_train,
        min_test_samples=args.min_test,
    )

    # Run validation
    results_df = validator.validate_score_models(
        engineer=engineer,
        start_date=args.start,
        end_date=end_date,
        season=args.season,
    )

    if results_df.empty:
        logger.warning("No results produced - check date range and data")
        return

    # Store results in database
    if args.store_results:
        backtest_id = f"score_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
        db = OddsAPIDatabase(str(args.db_path))

        for _, row in results_df.iterrows():
            skip = {
                "split_id",
                "train_start",
                "train_end",
                "test_start",
                "test_end",
                "train_samples",
                "test_samples",
            }
            metrics: dict[str, Any] = {
                str(k): (float(v) if isinstance(v, int | float) else str(v))
                for k, v in row.items()
                if str(k) not in skip
            }
            db.store_backtest_result(
                backtest_id=backtest_id,
                split_id=int(row["split_id"]),
                model_type="score_regression",
                train_start=str(row["train_start"]),
                train_end=str(row["train_end"]),
                test_start=str(row["test_start"]),
                test_end=str(row["test_end"]),
                train_samples=int(row["train_samples"]),
                test_samples=int(row["test_samples"]),
                metrics=metrics,
            )

        logger.info("[OK] Stored results with backtest_id=%s", backtest_id)

    # Save CSV
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        results_df.to_csv(args.output, index=False)
        logger.info("[OK] Results saved to %s", args.output)

    logger.info("\n" + "=" * 80)
    logger.info("Backtest Complete")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
