#!/usr/bin/env python3
"""Train residual regression model for totals (over/under) prediction.

Predicts: actual_total - closing_total (the market's error).
Formula: predicted_total = closing_total + model_residual

This anchors predictions to the market closing line (MAE ~14.1) and
focuses model capacity on what the market misses: rest, KenPom
disagreement, and matchup dynamics.

Usage:
    uv run python scripts/training/train_totals_regression.py \
        --start-date 2025-12-01 --end-date 2026-02-05

    # With holdout split for backtesting
    uv run python scripts/training/train_totals_regression.py \
        --start-date 2025-12-01 --end-date 2026-01-31 \
        --holdout-start 2026-02-01 --holdout-end 2026-02-05
"""

from __future__ import annotations

import json
import logging
import pickle
from datetime import datetime
from pathlib import Path

import click
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from sports_betting_edge.services.feature_engineering import FeatureEngineer

logger = logging.getLogger(__name__)


def train_residual_model(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
) -> xgb.XGBRegressor:
    """Train XGBoost regressor for totals residual.

    Conservative hyperparameters for small dataset (~400 samples).

    Args:
        X_train: Training features
        y_train: Training residuals (actual - closing)
        X_val: Validation features
        y_val: Validation residuals

    Returns:
        Trained XGBoost model
    """
    params = {
        "objective": "reg:squarederror",
        "learning_rate": 0.05,
        "max_depth": 4,
        "min_child_weight": 10,
        "subsample": 0.8,
        "colsample_bytree": 0.7,
        "reg_alpha": 2.0,
        "reg_lambda": 3.0,
        "n_estimators": 200,
        "random_state": 42,
        "n_jobs": -1,
    }

    model = xgb.XGBRegressor(**params)
    model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        verbose=False,
    )

    return model


def evaluate_residual_model(
    model: xgb.XGBRegressor,
    X: pd.DataFrame,
    y: pd.Series,
    closing_totals: pd.Series,
    actual_totals: pd.Series,
    label: str,
) -> dict[str, float]:
    """Evaluate residual model vs market baseline.

    Args:
        model: Trained residual model
        X: Features
        y: True residuals (actual - closing)
        closing_totals: Market closing totals
        actual_totals: Actual game totals
        label: Label for logging (e.g., "Validation")

    Returns:
        Dictionary of evaluation metrics
    """
    y_pred = model.predict(X)

    # Residual model metrics
    residual_mae = mean_absolute_error(y, y_pred)
    residual_rmse = np.sqrt(mean_squared_error(y, y_pred))
    residual_r2 = r2_score(y, y_pred)

    # Market baseline: residual of 0 (just use closing line)
    market_mae = mean_absolute_error(actual_totals, closing_totals)

    # Model predicted total
    predicted_totals = closing_totals + y_pred
    model_total_mae = mean_absolute_error(actual_totals, predicted_totals)

    # Directional accuracy: does the model predict O/U correctly?
    # If residual > 0, model predicts over; if < 0, predicts under
    model_direction = y_pred > 0
    actual_direction = y > 0
    directional_accuracy = (model_direction == actual_direction).mean()

    # Standard deviation for probability calibration
    residual_std = y.std()

    logger.info(f"\n{'=' * 60}")
    logger.info(f"{label} Results ({len(y)} games)")
    logger.info(f"{'=' * 60}")
    logger.info(f"  Residual MAE:       {residual_mae:.2f} pts")
    logger.info(f"  Residual RMSE:      {residual_rmse:.2f} pts")
    logger.info(f"  Residual R2:        {residual_r2:.4f}")
    logger.info(f"  Market Total MAE:   {market_mae:.2f} pts (baseline)")
    logger.info(f"  Model Total MAE:    {model_total_mae:.2f} pts")
    improvement = market_mae - model_total_mae
    logger.info(f"  Improvement:        {improvement:+.2f} pts vs market")
    logger.info(f"  Directional Acc:    {directional_accuracy:.1%}")
    logger.info(f"  Residual Std:       {residual_std:.2f} pts")

    return {
        "residual_mae": residual_mae,
        "residual_rmse": residual_rmse,
        "residual_r2": residual_r2,
        "market_mae": market_mae,
        "model_total_mae": model_total_mae,
        "improvement": improvement,
        "directional_accuracy": directional_accuracy,
        "residual_std": residual_std,
    }


def log_feature_importance(
    model: xgb.XGBRegressor,
    feature_names: list[str],
    top_n: int = 15,
) -> None:
    """Log top feature importances."""
    importances = model.feature_importances_
    sorted_idx = np.argsort(importances)[::-1]

    logger.info(f"\nTop {top_n} Feature Importances:")
    for rank, idx in enumerate(sorted_idx[:top_n], 1):
        logger.info(f"  {rank:2d}. {feature_names[idx]:30s} {importances[idx]:.4f}")


@click.command()
@click.option(
    "--start-date",
    required=True,
    type=click.DateTime(formats=["%Y-%m-%d"]),
    help="Start date for training data (YYYY-MM-DD)",
)
@click.option(
    "--end-date",
    required=True,
    type=click.DateTime(formats=["%Y-%m-%d"]),
    help="End date for training data (YYYY-MM-DD)",
)
@click.option(
    "--holdout-start",
    default=None,
    type=click.DateTime(formats=["%Y-%m-%d"]),
    help="Holdout start date for backtesting (YYYY-MM-DD)",
)
@click.option(
    "--holdout-end",
    default=None,
    type=click.DateTime(formats=["%Y-%m-%d"]),
    help="Holdout end date for backtesting (YYYY-MM-DD)",
)
@click.option(
    "--staging-path",
    default="data/staging",
    type=click.Path(path_type=Path),
    help="Path to staging data directory",
)
@click.option(
    "--output-dir",
    default="models",
    type=click.Path(path_type=Path),
    help="Output directory for models",
)
def main(
    start_date: datetime,
    end_date: datetime,
    holdout_start: datetime | None,
    holdout_end: datetime | None,
    staging_path: Path,
    output_dir: Path,
) -> None:
    """Train totals residual regression model."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    logger.info("=" * 80)
    logger.info("Totals Residual Regression Training")
    logger.info("=" * 80)

    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    # Build training dataset
    engineer = FeatureEngineer(staging_path=str(staging_path))
    X, y = engineer.build_totals_residual_dataset(
        start_date=start_str,
        end_date=end_str,
    )

    if len(X) == 0:
        logger.error("No training data found. Check staging layer.")
        return

    feature_cols = list(X.columns)
    logger.info(f"Features: {len(feature_cols)} columns")
    logger.info(f"Samples: {len(X)} games")
    logger.info(f"Residual stats: mean={y.mean():.2f}, std={y.std():.2f}")

    # Load closing_total and actual_total for evaluation
    events = pd.read_parquet(staging_path / "events.parquet")
    line_features = pd.read_parquet(staging_path / "line_features.parquet")

    # Re-merge to get closing_total aligned with X's index
    events["game_date"] = pd.to_datetime(events["game_date"])
    events_filtered = events[
        (events["game_date"] >= pd.Timestamp(start_str))
        & (events["game_date"] <= pd.Timestamp(end_str))
        & events["home_score"].notna()
    ]
    merged_meta = events_filtered.merge(line_features, on="event_id", how="inner")
    merged_meta = merged_meta[merged_meta["closing_total"].notna()]

    # Align indices
    closing_totals = merged_meta["closing_total"].reset_index(drop=True)
    actual_totals = (merged_meta["home_score"] + merged_meta["away_score"]).reset_index(drop=True)
    X = X.reset_index(drop=True)
    y = y.reset_index(drop=True)

    # Train/val split
    X_train, X_val, y_train, y_val, ct_train, ct_val, at_train, at_val = train_test_split(
        X,
        y,
        closing_totals,
        actual_totals,
        test_size=0.2,
        random_state=42,
    )

    logger.info(f"Train: {len(X_train)} games")
    logger.info(f"Val:   {len(X_val)} games")

    # Train model
    model = train_residual_model(X_train, y_train, X_val, y_val)

    # Evaluate on validation set
    val_metrics = evaluate_residual_model(model, X_val, y_val, ct_val, at_val, "Validation")

    # Feature importance
    log_feature_importance(model, feature_cols)

    # Holdout evaluation (if provided)
    holdout_metrics: dict[str, float] = {}
    if holdout_start and holdout_end:
        ho_start_str = holdout_start.strftime("%Y-%m-%d")
        ho_end_str = holdout_end.strftime("%Y-%m-%d")

        logger.info(f"\nEvaluating holdout: {ho_start_str} to {ho_end_str}")

        X_ho, y_ho = engineer.build_totals_residual_dataset(
            start_date=ho_start_str,
            end_date=ho_end_str,
        )

        if len(X_ho) > 0:
            # Get closing/actual for holdout
            ho_events = events[
                (events["game_date"] >= pd.Timestamp(ho_start_str))
                & (events["game_date"] <= pd.Timestamp(ho_end_str))
                & events["home_score"].notna()
            ]
            ho_merged = ho_events.merge(line_features, on="event_id", how="inner")
            ho_merged = ho_merged[ho_merged["closing_total"].notna()]

            ho_closing = ho_merged["closing_total"].reset_index(drop=True)
            ho_actual = (ho_merged["home_score"] + ho_merged["away_score"]).reset_index(drop=True)
            X_ho = X_ho.reset_index(drop=True)
            y_ho = y_ho.reset_index(drop=True)

            holdout_metrics = evaluate_residual_model(
                model, X_ho, y_ho, ho_closing, ho_actual, "Holdout"
            )
        else:
            logger.warning("No holdout data found")

    # Retrain on all data for production model
    logger.info("\nRetraining on full dataset for production...")
    production_model = train_residual_model(
        X,
        y,
        X_val,
        y_val,  # Use val set for early stopping reference
    )

    # Save model and metadata
    output_dir.mkdir(parents=True, exist_ok=True)

    model_path = output_dir / "totals_residual_2026.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(production_model, f)
    logger.info(f"[OK] Saved model: {model_path}")

    # Save feature names
    features_path = output_dir / "totals_residual_features.txt"
    features_path.write_text("\n".join(feature_cols))
    logger.info(f"[OK] Saved features: {features_path}")

    # Save model metadata
    residual_std = float(y.std())
    metadata = {
        "model_type": "totals_residual_regression",
        "training_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "date_range": f"{start_str} to {end_str}",
        "samples": len(X),
        "features": len(feature_cols),
        "residual_mean": float(y.mean()),
        "residual_std": residual_std,
        "validation_metrics": {k: round(v, 4) for k, v in val_metrics.items()},
    }
    if holdout_metrics:
        metadata["holdout_metrics"] = {k: round(v, 4) for k, v in holdout_metrics.items()}

    metadata_path = output_dir / "totals_residual_metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    logger.info(f"[OK] Saved metadata: {metadata_path}")

    logger.info("\n" + "=" * 80)
    logger.info("Training Complete")
    logger.info(f"  RESIDUAL_STDDEV = {residual_std:.2f}")
    logger.info("  Use: predicted_total = closing_total + model.predict(X)")
    logger.info("  Use: over_prob = norm.cdf(predicted_residual / RESIDUAL_STDDEV)")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
