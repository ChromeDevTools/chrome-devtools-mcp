"""Train XGBoost model for spreads (favorite cover) prediction.

Usage:
    uv run python scripts/train_spreads_basic_model.py \
        --data data/ml/spreads_2025-12-01_2026-02-03.parquet
"""

import argparse
import logging
from pathlib import Path

import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, log_loss, roc_auc_score
from sklearn.model_selection import train_test_split

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

BASIC_SPREADS_FEATURES = [
    "opening_spread",
    "closing_spread",
    "line_movement",
    "fav_adj_em",
    "fav_adj_o",
    "fav_adj_d",
    "fav_adj_t",
    "fav_luck",
    "fav_sos",
    "fav_efg_pct",
    "fav_to_pct",
    "fav_or_pct",
    "fav_ft_rate",
    "fav_defg_pct",
    "fav_dto_pct",
    "dog_adj_em",
    "dog_adj_o",
    "dog_adj_d",
    "dog_adj_t",
    "dog_luck",
    "dog_sos",
    "dog_efg_pct",
    "dog_to_pct",
    "dog_or_pct",
    "dog_ft_rate",
    "dog_defg_pct",
    "dog_dto_pct",
    "em_diff",
    "fav_o_vs_dog_d",
    "dog_o_vs_fav_d",
]

FULL_SPREADS_FEATURES = [
    *BASIC_SPREADS_FEATURES,
    "pinnacle_closing_spread",
    "fanduel_closing_spread",
    "draftkings_closing_spread",
    "betmgm_closing_spread",
    "total_steam_moves",
    "max_steam_move",
    "steam_move_direction",
    "movement_velocity",
    "hours_tracked",
    "avg_observations_per_hour",
    "late_movement_points",
    "late_movement_flag",
    "late_movement_pct",
    "sharp_public_split",
    "pinnacle_movement",
    "public_movement",
    "reverse_line_movement",
    "consensus_spread",
    "spread_variance",
    "has_market_disagreement",
    "outlier_book_count",
    "near_key_number",
    "closest_key_number",
]


def load_dataset(data_path: Path, feature_set: str) -> tuple[pd.DataFrame, pd.Series]:
    """Load training dataset from parquet.

    Args:
        data_path: Path to parquet file with features and target
        feature_set: "basic" or "full"

    Returns:
        (X, y) where X is features and y is target
    """
    logger.info("Loading dataset from %s...", data_path)
    df = pd.read_parquet(data_path)

    if "target" not in df.columns:
        raise ValueError("Dataset missing required 'target' column")

    features = BASIC_SPREADS_FEATURES if feature_set == "basic" else FULL_SPREADS_FEATURES
    missing = [col for col in features if col not in df.columns]
    if missing:
        missing_str = ", ".join(missing)
        raise ValueError(f"Dataset missing required spreads features: {missing_str}")

    # Separate features and target
    y = df["target"]
    X = df[features]

    # Fill NaN with 0 (missing KenPom data)
    X = X.fillna(0)

    logger.info("Loaded %d samples, %d features", len(X), len(X.columns))
    logger.info("Target distribution: %s", y.value_counts().to_dict())

    return X, y


def train_model(
    X: pd.DataFrame,
    y: pd.Series,
    test_size: float = 0.2,
    random_state: int = 42,
) -> tuple[xgb.XGBClassifier, dict]:
    """Train XGBoost classifier with train/test split.

    Args:
        X: Feature matrix
        y: Target labels (1=favorite covered, 0=favorite did not cover)
        test_size: Proportion of data for testing
        random_state: Random seed for reproducibility

    Returns:
        (trained_model, metrics_dict)
    """
    logger.info("Splitting data: %.1f%% test set...", test_size * 100)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )

    logger.info("Train set: %d samples", len(X_train))
    logger.info("Test set: %d samples", len(X_test))

    # Train XGBoost classifier
    logger.info("Training XGBoost classifier...")
    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=5,
        learning_rate=0.1,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=random_state,
    )

    model.fit(
        X_train,
        y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )

    # Evaluate
    logger.info("Evaluating model...")
    y_train_pred = model.predict(X_train)
    y_test_pred = model.predict(X_test)
    y_train_proba = model.predict_proba(X_train)[:, 1]
    y_test_proba = model.predict_proba(X_test)[:, 1]

    metrics = {
        "train_accuracy": accuracy_score(y_train, y_train_pred),
        "test_accuracy": accuracy_score(y_test, y_test_pred),
        "train_logloss": log_loss(y_train, y_train_proba),
        "test_logloss": log_loss(y_test, y_test_proba),
        "train_auc": roc_auc_score(y_train, y_train_proba),
        "test_auc": roc_auc_score(y_test, y_test_proba),
    }

    logger.info("\n=== Model Performance ===")
    logger.info("Train Accuracy: %.4f", metrics["train_accuracy"])
    logger.info("Test Accuracy:  %.4f", metrics["test_accuracy"])
    logger.info("Train LogLoss:  %.4f", metrics["train_logloss"])
    logger.info("Test LogLoss:   %.4f", metrics["test_logloss"])
    logger.info("Train AUC:      %.4f", metrics["train_auc"])
    logger.info("Test AUC:       %.4f", metrics["test_auc"])

    # Feature importance
    feature_importance = pd.DataFrame(
        {"feature": X.columns, "importance": model.feature_importances_}
    ).sort_values("importance", ascending=False)

    logger.info("\n=== Top 10 Features ===")
    for _, row in feature_importance.head(10).iterrows():
        logger.info("%s: %.4f", row["feature"], row["importance"])

    return model, metrics


def save_model(model: xgb.XGBClassifier, output_path: Path) -> None:
    """Save trained model to JSON format.

    Args:
        model: Trained XGBoost model
        output_path: Path to save model file
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    model.save_model(str(output_path))
    logger.info("Model saved to %s", output_path)


def main() -> None:
    """Train spreads prediction model."""
    parser = argparse.ArgumentParser(description="Train XGBoost spreads model")
    parser.add_argument(
        "--data",
        type=Path,
        required=True,
        help="Path to training data parquet file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("models/spreads_model.json"),
        help="Path to save trained model",
    )
    parser.add_argument(
        "--feature-set",
        choices=["basic", "full"],
        default="basic",
        help="Feature set to use (basic or full)",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Proportion of data for testing",
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=42,
        help="Random seed for reproducibility",
    )

    args = parser.parse_args()

    # Load data
    X, y = load_dataset(args.data, args.feature_set)

    # Train model
    model, _metrics = train_model(X, y, test_size=args.test_size, random_state=args.random_state)

    # Save model
    save_model(model, args.output)

    logger.info("\n[OK] Spreads model training complete!")


if __name__ == "__main__":
    main()
