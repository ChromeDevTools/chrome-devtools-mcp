"""Train ensemble of diverse models for spreads prediction.

This script trains an ensemble combining XGBoost, LightGBM, and Random Forest
models to improve prediction performance through model diversity.

Usage:
    python scripts/training/train_spreads_ensemble.py

The script will:
1. Load training data from staging layer
2. Train three diverse models (XGBoost, LightGBM, Random Forest)
3. Compare ensemble strategies (simple, weighted, stacking)
4. Save the best performing ensemble

Expected improvement: +3-5% AUC over single best model
"""

from __future__ import annotations

import logging
import pickle
from datetime import date
from pathlib import Path

from sklearn.model_selection import train_test_split

from sports_betting_edge.config.logging import configure_logging
from sports_betting_edge.services.ensemble import EnsembleTrainer
from sports_betting_edge.services.feature_engineering import FeatureEngineer

configure_logging()
logger = logging.getLogger(__name__)


def main() -> None:
    """Train spreads ensemble model."""
    logger.info("[OK] === Training Spreads Ensemble ===\n")

    # Configuration
    START_DATE = date(2025, 11, 4)
    END_DATE = date(2026, 2, 5)
    SEASON = 2026
    OUTPUT_DIR = Path("data/models")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load data
    logger.info(f"Loading training data from {START_DATE} to {END_DATE}...")
    engineer = FeatureEngineer(staging_path="data/staging/")
    X, y = engineer.build_spreads_dataset(
        start_date=START_DATE,
        end_date=END_DATE,
        season=SEASON,
    )

    logger.info(f"Dataset: {len(X)} samples, {len(X.columns)} features")
    logger.info(f"Cover rate: {y.mean():.2%}\n")

    if len(X) == 0:
        logger.error("No training data found. Exiting.")
        return

    # Train/val split
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    logger.info(f"Train: {len(X_train)}, Val: {len(X_val)}\n")

    # Model parameters (use optimized parameters from hyperparameter tuning)
    xgb_params = {
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
    }

    lgb_params = {
        "n_estimators": 500,
        "max_depth": 10,
        "learning_rate": 0.05,
        "num_leaves": 31,
        "min_child_samples": 20,
        "reg_alpha": 4.0,
        "reg_lambda": 2.0,
        "subsample": 0.6,
        "colsample_bytree": 0.6,
    }

    rf_params = {
        "n_estimators": 500,
        "max_depth": 15,
        "min_samples_split": 30,
        "min_samples_leaf": 15,
        "max_features": "sqrt",
    }

    model_params = {
        "xgboost": xgb_params,
        "lightgbm": lgb_params,
        "rf": rf_params,
    }

    # Train ensembles with different strategies
    trainer = EnsembleTrainer()

    strategies = ["simple", "weighted", "stacking"]
    ensembles = {}

    for strategy in strategies:
        logger.info(f"\n[OK] === Training {strategy.upper()} ensemble ===\n")
        ensemble = trainer.train(
            X_train,
            y_train,
            X_val,
            y_val,
            models=["xgboost", "lightgbm", "rf"],
            strategy=strategy,
            model_params=model_params,
        )
        ensembles[strategy] = ensemble

    # Find best ensemble
    logger.info("\n[OK] === Ensemble Comparison ===\n")
    best_strategy = None
    best_auc = 0.0

    from sklearn.metrics import roc_auc_score

    for strategy, ensemble in ensembles.items():
        y_val_pred = ensemble.predict_proba(X_val)
        auc = roc_auc_score(y_val, y_val_pred)
        logger.info(f"{strategy.capitalize()} ensemble AUC: {auc:.4f}")

        if auc > best_auc:
            best_auc = auc
            best_strategy = strategy

    logger.info(f"\n[OK] Best ensemble: {best_strategy} (AUC: {best_auc:.4f})")

    # Save best ensemble
    output_path = OUTPUT_DIR / "spreads_2026_ensemble.pkl"
    with open(output_path, "wb") as f:
        pickle.dump(ensembles[best_strategy], f)

    logger.info(f"[OK] Saved best ensemble to {output_path}\n")

    # Save all ensembles for comparison
    for strategy, ensemble in ensembles.items():
        output_path = OUTPUT_DIR / f"spreads_2026_ensemble_{strategy}.pkl"
        with open(output_path, "wb") as f:
            pickle.dump(ensemble, f)
        logger.info(f"[OK] Saved {strategy} ensemble to {output_path}")

    logger.info("\n[OK] === Ensemble Training Complete ===")


if __name__ == "__main__":
    main()
