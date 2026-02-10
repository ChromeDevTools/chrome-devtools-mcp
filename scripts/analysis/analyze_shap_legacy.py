"""SHAP feature importance analysis for legacy dataset models.

Analyzes which features are most important for spreads and totals prediction
to identify candidates for feature pruning.

Usage:
    python scripts/analysis/analyze_shap_legacy.py
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.config.logging import configure_logging

configure_logging()
logger = logging.getLogger(__name__)


def analyze_model(model_type: str) -> None:
    """Analyze SHAP feature importance for a model type.

    Args:
        model_type: "spreads" or "totals"
    """
    logger.info(f"\n[OK] === Analyzing {model_type.upper()} Model ===\n")

    # Load legacy complete dataset
    df = read_parquet_df("data/staging/complete_dataset.parquet")

    # Define features based on model type
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

    X = df_clean[feature_cols]
    y = df_clean[label_col]

    # Load best model (seed 1024)

    model_path = Path(f"data/models/{model_type}_2026_seed_ensemble_legacy_metadata.json")
    if not model_path.exists():
        logger.error(f"Model metadata not found: {model_path}")
        return

    # Train a single model with best seed for SHAP analysis
    import xgboost as xgb

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Use simple parameters
    params = {
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
        "random_state": 1024,  # Best seed
    }

    model = xgb.XGBClassifier(**params)
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

    logger.info(f"Trained model on {len(X_train)} samples")
    logger.info(f"Validation set: {len(X_val)} samples\n")

    # Use XGBoost built-in feature importance (gain-based)
    logger.info("Calculating feature importance (using XGBoost gain)...")
    importance_dict = model.get_booster().get_score(importance_type="gain")

    # Convert to pandas Series with feature names
    importance_values = [importance_dict.get(f"f{i}", 0.0) for i in range(len(feature_cols))]
    importance = pd.Series(importance_values, index=feature_cols).sort_values(ascending=False)

    # Calculate percentage
    total_importance = importance.sum()
    importance_pct = (importance / total_importance * 100).round(2)

    # Create summary dataframe
    importance_df = pd.DataFrame(
        {
            "Feature": importance.index,
            "Importance": importance.values.round(4),
            "Percentage": importance_pct.values,
        }
    ).reset_index(drop=True)

    logger.info(f"\n[OK] === {model_type.upper()} Feature Importance ===\n")
    logger.info(importance_df.to_string(index=False))

    # Identify weak features (<1% importance)
    weak_features = importance_df[importance_df["Percentage"] < 1.0]
    if len(weak_features) > 0:
        logger.info("\n[WARNING] Weak features (<1% importance):")
        for _, row in weak_features.iterrows():
            logger.info(f"  - {row['Feature']}: {row['Percentage']:.2f}%")
        logger.info(f"\nConsider removing {len(weak_features)} weak features")
    else:
        logger.info("\n[OK] All features have >1% importance")

    # Save results
    output_dir = Path("data/analysis")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"shap_importance_{model_type}_legacy.csv"
    importance_df.to_csv(output_path, index=False)
    logger.info(f"\n[OK] Saved importance to {output_path}\n")


def main() -> None:
    """Run SHAP analysis for both model types."""
    analyze_model("spreads")
    analyze_model("totals")


if __name__ == "__main__":
    main()
