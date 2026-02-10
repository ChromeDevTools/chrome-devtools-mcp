"""Train ensemble of XGBoost models with different random seeds.

This script implements the Day 5-7 ensemble strategy from IMPROVEMENT_SUMMARY.md:
- Train 5 XGBoost models with different random seeds (42, 123, 456, 789, 1024)
- Weight predictions by validation AUC
- Compare ensemble performance vs single best model

Expected improvement: +2-4% AUC through reduced variance

Usage:
    python scripts/training/train_seed_ensemble.py --model-type spreads
    python scripts/training/train_seed_ensemble.py --model-type totals --n-seeds 7
"""

from __future__ import annotations

import logging
import pickle
from pathlib import Path
from typing import Any, Literal

import click
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, log_loss, roc_auc_score
from sklearn.model_selection import train_test_split

from sports_betting_edge.config.logging import configure_logging
from sports_betting_edge.services.feature_engineering import FeatureEngineer

configure_logging()
logger = logging.getLogger(__name__)


class SeedEnsemble:
    """Ensemble of models trained with different random seeds."""

    def __init__(self, models: list[Any], weights: list[float]) -> None:
        """Initialize seed ensemble.

        Args:
            models: List of trained models
            weights: List of weights (validation AUCs)
        """
        self.models = models
        self.weights = np.array(weights)
        # Normalize weights to sum to 1
        self.weights = self.weights / self.weights.sum()

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Predict probabilities using weighted average.

        Args:
            X: Feature matrix

        Returns:
            Array of probabilities (positive class)
        """
        predictions = np.zeros(len(X))

        for model, weight in zip(self.models, self.weights, strict=False):
            pred = model.predict_proba(X)[:, 1]
            predictions += weight * pred

        return predictions

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Predict class labels.

        Args:
            X: Feature matrix

        Returns:
            Array of class labels
        """
        proba = self.predict_proba(X)
        return (proba >= 0.5).astype(int)


def train_single_seed_model(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    seed: int,
    base_params: dict[str, Any],
) -> tuple[Any, float]:
    """Train a single XGBoost model with given seed.

    Args:
        X_train: Training features
        y_train: Training labels
        X_val: Validation features
        y_val: Validation labels
        seed: Random seed
        base_params: Base model parameters

    Returns:
        Tuple of (trained model, validation AUC)
    """
    logger.info(f"Training model with seed={seed}...")

    # Create params with seed
    params = base_params.copy()
    params["random_state"] = seed

    # Train model
    model = xgb.XGBClassifier(**params)
    model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        verbose=False,
    )

    # Evaluate
    y_val_pred = model.predict_proba(X_val)[:, 1]
    val_auc = roc_auc_score(y_val, y_val_pred)

    logger.info(f"  Seed {seed} validation AUC: {val_auc:.4f}")

    return model, val_auc


@click.command()
@click.option(
    "--model-type",
    type=click.Choice(["spreads", "totals"]),
    required=True,
    help="Type of model to train",
)
@click.option(
    "--n-seeds",
    type=int,
    default=5,
    help="Number of models with different seeds",
)
@click.option(
    "--start-date",
    type=click.DateTime(formats=["%Y-%m-%d"]),
    default="2025-11-04",
    help="Start date for training data",
)
@click.option(
    "--end-date",
    type=click.DateTime(formats=["%Y-%m-%d"]),
    default="2026-02-05",
    help="End date for training data",
)
@click.option(
    "--season",
    type=int,
    default=2026,
    help="KenPom season year",
)
@click.option(
    "--output-dir",
    type=click.Path(path_type=Path),
    default="data/models",
    help="Output directory for models",
)
def main(
    model_type: Literal["spreads", "totals"],
    n_seeds: int,
    start_date: Any,
    end_date: Any,
    season: int,
    output_dir: Path,
) -> None:
    """Train ensemble of XGBoost models with different random seeds."""
    logger.info(f"[OK] === Training {model_type.upper()} Seed Ensemble ===\n")
    logger.info("Configuration:")
    logger.info(f"  Model type: {model_type}")
    logger.info(f"  Number of seeds: {n_seeds}")
    logger.info(f"  Date range: {start_date.date()} to {end_date.date()}")
    logger.info(f"  Season: {season}\n")

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load data
    logger.info("Loading training data...")
    engineer = FeatureEngineer(staging_path="data/staging/")

    if model_type == "spreads":
        X, y = engineer.build_spreads_dataset(
            start_date=start_date.date(),
            end_date=end_date.date(),
            season=season,
        )
    else:  # totals
        X, y = engineer.build_totals_dataset(
            start_date=start_date.date(),
            end_date=end_date.date(),
            season=season,
        )

    logger.info(f"Dataset: {len(X)} samples, {len(X.columns)} features")
    logger.info(f"Positive rate: {y.mean():.2%}\n")

    if len(X) == 0:
        logger.error("No training data found. Exiting.")
        return

    # Train/val split
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    logger.info(f"Train: {len(X_train)}, Val: {len(X_val)}\n")

    # Load best hyperparameters from previous tuning
    # These are from the optimized models (spreads_2026_optimized.pkl, totals_2026_optimized.pkl)
    if model_type == "spreads":
        # From Trial #5 in ENSEMBLE_TRAINING_SUMMARY.md
        base_params = {
            "n_estimators": 500,
            "max_depth": 10,
            "learning_rate": 0.2442,
            "min_child_weight": 9,
            "gamma": 2.9895,
            "reg_alpha": 4.6094,
            "reg_lambda": 0.4425,
            "subsample": 0.5980,
            "colsample_bytree": 0.5226,
            "colsample_bylevel": 0.7966,
            "objective": "binary:logistic",
            "eval_metric": "logloss",
            "early_stopping_rounds": 20,
        }
    else:  # totals
        # From Trial #46 in ENSEMBLE_TRAINING_SUMMARY.md
        base_params = {
            "n_estimators": 400,
            "max_depth": 11,
            "learning_rate": 0.045,
            "min_child_weight": 5,
            "gamma": 4.2,
            "reg_alpha": 4.3,
            "reg_lambda": 0.7,
            "subsample": 0.88,
            "colsample_bytree": 0.94,
            "objective": "binary:logistic",
            "eval_metric": "logloss",
            "early_stopping_rounds": 20,
        }

    # Generate seeds (use prime numbers for better randomness)
    seeds = [42, 123, 456, 789, 1024, 2048, 4096, 8192, 16384][:n_seeds]
    logger.info(f"Training {n_seeds} models with seeds: {seeds}\n")

    # Train models
    models = []
    val_aucs = []

    for seed in seeds:
        model, val_auc = train_single_seed_model(X_train, y_train, X_val, y_val, seed, base_params)
        models.append(model)
        val_aucs.append(val_auc)

    # Create ensemble
    logger.info("\n[OK] === Ensemble Results ===\n")
    ensemble = SeedEnsemble(models=models, weights=val_aucs)

    # Evaluate individual models
    logger.info("Individual model performance:")
    for i, (seed, auc) in enumerate(zip(seeds, val_aucs, strict=False)):
        weight_pct = ensemble.weights[i] * 100
        logger.info(f"  Seed {seed:5d}: AUC={auc:.4f}, Weight={weight_pct:.1f}%")

    # Evaluate ensemble
    logger.info("\nEnsemble performance:")
    ensemble_pred = ensemble.predict_proba(X_val)
    ensemble_auc = roc_auc_score(y_val, ensemble_pred)
    ensemble_acc = accuracy_score(y_val, (ensemble_pred >= 0.5).astype(int))
    ensemble_logloss = log_loss(y_val, ensemble_pred)

    logger.info(f"  Validation AUC: {ensemble_auc:.4f}")
    logger.info(f"  Validation Accuracy: {ensemble_acc:.2%}")
    logger.info(f"  Validation Log Loss: {ensemble_logloss:.4f}")

    # Compare to best single model
    best_single_auc = max(val_aucs)
    best_single_idx = val_aucs.index(best_single_auc)
    improvement = ensemble_auc - best_single_auc
    improvement_pct = improvement / best_single_auc * 100

    logger.info(f"\nComparison to best single model (seed {seeds[best_single_idx]}):")
    logger.info(f"  Best single AUC: {best_single_auc:.4f}")
    logger.info(f"  Ensemble AUC: {ensemble_auc:.4f}")
    logger.info(f"  Improvement: {improvement:+.4f} ({improvement_pct:+.2f}%)")

    # Save ensemble
    output_path = output_dir / f"{model_type}_2026_seed_ensemble.pkl"
    with open(output_path, "wb") as f:
        pickle.dump(ensemble, f)

    logger.info(f"\n[OK] Saved ensemble to {output_path}")

    # Save metadata
    metadata = {
        "model_type": model_type,
        "n_seeds": n_seeds,
        "seeds": seeds,
        "val_aucs": val_aucs,
        "ensemble_auc": ensemble_auc,
        "ensemble_accuracy": ensemble_acc,
        "ensemble_logloss": ensemble_logloss,
        "best_single_auc": best_single_auc,
        "improvement": improvement,
        "improvement_pct": improvement_pct,
        "weights": ensemble.weights.tolist(),
        "date_range": {
            "start": str(start_date.date()),
            "end": str(end_date.date()),
        },
        "season": season,
        "n_samples": len(X),
        "n_features": len(X.columns),
    }

    metadata_path = output_dir / f"{model_type}_2026_seed_ensemble_metadata.json"
    import json

    with open(metadata_path, "w") as f:
        json.dump(metadata, indent=2, fp=f)

    logger.info(f"[OK] Saved metadata to {metadata_path}\n")


if __name__ == "__main__":
    main()
