"""Train ensemble of XGBoost models with different random seeds using legacy data.

Uses complete_dataset.parquet which has scores + line features for 436 games.

Usage:
    python scripts/training/train_seed_ensemble_legacy.py --model-type spreads
    python scripts/training/train_seed_ensemble_legacy.py --model-type totals
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

from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.config.logging import configure_logging

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
    "--output-dir",
    type=click.Path(path_type=Path),
    default="data/models",
    help="Output directory for models",
)
def main(
    model_type: Literal["spreads", "totals"],
    n_seeds: int,
    output_dir: Path,
) -> None:
    """Train ensemble of XGBoost models with different random seeds."""
    logger.info(f"[OK] === Training {model_type.upper()} Seed Ensemble ===\n")
    logger.info("Configuration:")
    logger.info(f"  Model type: {model_type}")
    logger.info(f"  Number of seeds: {n_seeds}\n")

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load legacy complete dataset
    logger.info("Loading complete_dataset.parquet...")
    df = read_parquet_df("data/staging/complete_dataset.parquet")
    logger.info(f"Loaded {len(df)} games from {df['game_date'].min()} to {df['game_date'].max()}\n")

    # Define features based on what's available in complete_dataset
    # Basic features: line features + game outcomes
    if model_type == "spreads":
        feature_cols = [
            "consensus_opening_spread_magnitude",
            "consensus_closing_spread_magnitude",
            "opening_spread_range",
            "closing_spread_range",
            "num_books_spread",
            "spread_magnitude_movement",
            "opening_home_implied_prob",
            "closing_home_implied_prob",
            "home_is_favorite",
        ]
        label_col = "home_covered_spread"
    else:  # totals
        feature_cols = [
            "consensus_opening_total",
            "consensus_closing_total",
            "opening_total_range",
            "closing_total_range",
            "num_books_total",
            "total_movement",
        ]
        label_col = "went_over"

    # Filter to games with required features
    required_cols = feature_cols + [label_col]
    df_clean = df.dropna(subset=required_cols)

    logger.info(f"Dataset after filtering for {model_type} features:")
    logger.info(f"  {len(df_clean)} games ({len(df_clean) / len(df) * 100:.1f}% coverage)")
    logger.info(f"  Features: {len(feature_cols)}")
    logger.info(f"  Positive rate: {df_clean[label_col].mean():.2%}\n")

    if len(df_clean) == 0:
        logger.error("No training data found. Exiting.")
        return

    X = df_clean[feature_cols]
    y = df_clean[label_col]

    # Train/val split
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    logger.info(f"Train: {len(X_train)}, Val: {len(X_val)}\n")

    # Use simple parameters (no hyperparameter tuning)
    base_params = {
        "n_estimators": 300,
        "max_depth": 6,
        "learning_rate": 0.1,
        "min_child_weight": 5,
        "gamma": 1.0,
        "reg_alpha": 1.0,
        "reg_lambda": 1.0,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "objective": "binary:logistic",
        "eval_metric": "logloss",
        "early_stopping_rounds": 20,
    }

    # Generate seeds
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
    output_path = output_dir / f"{model_type}_2026_seed_ensemble_legacy.pkl"
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
        "n_samples": len(df_clean),
        "n_features": len(feature_cols),
        "features": feature_cols,
    }

    metadata_path = output_dir / f"{model_type}_2026_seed_ensemble_legacy_metadata.json"
    import json

    with open(metadata_path, "w") as f:
        json.dump(metadata, indent=2, fp=f)

    logger.info(f"[OK] Saved metadata to {metadata_path}\n")


if __name__ == "__main__":
    main()
