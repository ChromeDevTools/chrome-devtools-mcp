"""Analyze feature importance from trained XGBoost score regression models.

This script loads the trained home/away score models and reports the
most important KenPom statistics that predict game winners and scores.
Uses both built-in XGBoost importance and SHAP values for interpretation.
"""

from __future__ import annotations

import logging
import pickle
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
import xgboost as xgb

from sports_betting_edge.config.logging import configure_logging

logger = logging.getLogger(__name__)

# Feature names from train_score_models.py
SCORE_FEATURES = [
    # Home team KenPom stats
    "home_adj_em",
    "home_pythag",
    "home_adj_o",
    "home_adj_d",
    "home_adj_t",
    "home_luck",
    "home_sos",
    "home_efg_pct",
    "home_to_pct",
    "home_or_pct",
    "home_ft_rate",
    # Away team KenPom stats
    "away_adj_em",
    "away_pythag",
    "away_adj_o",
    "away_adj_d",
    "away_adj_t",
    "away_luck",
    "away_sos",
    "away_efg_pct",
    "away_to_pct",
    "away_or_pct",
    "away_ft_rate",
    # Combined features
    "total_offense",
    "avg_tempo",
    "avg_luck",
    "home_expected_pts",
    "away_expected_pts",
    "expected_total",
    # Line features (if available)
    "opening_total",
    "closing_total",
    "total_movement",
]


def load_model(model_path: Path) -> xgb.XGBRegressor:
    """Load a pickled XGBoost regression model.

    Args:
        model_path: Path to .pkl model file

    Returns:
        Loaded XGBoost regressor
    """
    logger.info(f"Loading model from {model_path}...")
    with open(model_path, "rb") as f:
        model = pickle.load(f)
    return model


def analyze_builtin_importance(
    model: xgb.XGBRegressor, model_name: str, features: list[str]
) -> pd.DataFrame:
    """Analyze feature importance using XGBoost's built-in metrics.

    Args:
        model: Trained XGBoost model
        model_name: Name for logging (e.g., "Home Score")
        features: List of feature names in order

    Returns:
        DataFrame with feature names and importance scores
    """
    logger.info(f"Analyzing built-in importance for {model_name} model...")

    # Get feature importance (gain-based by default)
    importance_dict = model.get_booster().get_score(importance_type="gain")

    # Map feature indices to names (f0 -> actual_feature_name)
    feature_map = {f"f{i}": name for i, name in enumerate(features)}

    # Convert to DataFrame with actual feature names
    importance_df = pd.DataFrame(
        [
            {
                "feature": feature_map.get(k, k),
                "feature_index": k,
                "importance_gain": v,
            }
            for k, v in importance_dict.items()
        ]
    )

    # Sort by importance
    importance_df = importance_df.sort_values("importance_gain", ascending=False).reset_index(
        drop=True
    )

    return importance_df


def analyze_shap_importance(
    model: xgb.XGBRegressor, X_sample: pd.DataFrame, model_name: str
) -> tuple[pd.DataFrame, shap.Explanation]:
    """Analyze feature importance using SHAP values.

    Args:
        model: Trained XGBoost model
        X_sample: Sample data for SHAP analysis (use validation set)
        model_name: Name for logging

    Returns:
        Tuple of (importance DataFrame, SHAP explanation object)
    """
    logger.info(f"Computing SHAP values for {model_name} model (may take a few minutes)...")

    # Create SHAP explainer
    explainer = shap.TreeExplainer(model)

    # Compute SHAP values (use a sample to speed up)
    sample_size = min(500, len(X_sample))
    X_shap = X_sample.sample(n=sample_size, random_state=42)
    shap_values = explainer.shap_values(X_shap)

    # Calculate mean absolute SHAP value for each feature
    mean_abs_shap = np.abs(shap_values).mean(axis=0)

    # Create DataFrame
    shap_df = pd.DataFrame(
        {"feature": X_sample.columns, "mean_abs_shap": mean_abs_shap}
    ).sort_values("mean_abs_shap", ascending=False)

    # Create SHAP explanation object for plotting
    explanation = shap.Explanation(
        values=shap_values,
        base_values=explainer.expected_value,
        data=X_shap.values,
        feature_names=X_sample.columns.tolist(),
    )

    return shap_df, explanation


def categorize_features(importance_df: pd.DataFrame) -> dict[str, list[str]]:
    """Categorize features by KenPom stat type.

    Args:
        importance_df: DataFrame with feature names and importances

    Returns:
        Dictionary mapping category names to feature lists
    """
    categories: dict[str, list[str]] = {
        "Efficiency Metrics (AdjEM, AdjO, AdjD)": [],
        "Four Factors (eFG%, TO%, OR%, FT Rate)": [],
        "Tempo & Pace": [],
        "Schedule & Luck": [],
        "Expected Points & Totals": [],
        "Betting Lines": [],
        "Other": [],
    }

    for feature in importance_df["feature"]:
        if "adj_em" in feature or "adj_o" in feature or "adj_d" in feature or "pythag" in feature:
            categories["Efficiency Metrics (AdjEM, AdjO, AdjD)"].append(feature)
        elif any(x in feature for x in ["efg_pct", "to_pct", "or_pct", "ft_rate", "defg", "dto"]):
            categories["Four Factors (eFG%, TO%, OR%, FT Rate)"].append(feature)
        elif "tempo" in feature or "adj_t" in feature:
            categories["Tempo & Pace"].append(feature)
        elif "sos" in feature or "luck" in feature:
            categories["Schedule & Luck"].append(feature)
        elif "expected" in feature or "total_offense" in feature:
            categories["Expected Points & Totals"].append(feature)
        elif any(x in feature for x in ["opening", "closing", "movement"]):
            categories["Betting Lines"].append(feature)
        else:
            categories["Other"].append(feature)

    return categories


def print_top_features(importance_df: pd.DataFrame, n: int = 20) -> None:
    """Print the top N most important features.

    Args:
        importance_df: DataFrame with feature names and importances
        n: Number of top features to print
    """
    logger.info(f"\n{'=' * 80}")
    logger.info(f"TOP {n} MOST IMPORTANT FEATURES")
    logger.info("=" * 80)

    total_importance = importance_df["importance_gain"].sum()

    for idx, row in importance_df.head(n).iterrows():
        feature = row["feature"]
        importance = row["importance_gain"]
        pct = (importance / total_importance) * 100

        logger.info(f"{idx + 1:2d}. {feature:40s} {importance:12.2f} ({pct:5.2f}%)")


def print_category_summary(importance_df: pd.DataFrame, categories: dict[str, list[str]]) -> None:
    """Print importance summary by feature category.

    Args:
        importance_df: DataFrame with feature names and importances
        categories: Dictionary mapping category names to feature lists
    """
    logger.info(f"\n{'=' * 80}")
    logger.info("FEATURE IMPORTANCE BY CATEGORY")
    logger.info("=" * 80)

    total_importance = importance_df["importance_gain"].sum()

    # Calculate total importance per category
    category_scores = {}
    for category, features in categories.items():
        if not features:
            continue

        category_importance = importance_df[importance_df["feature"].isin(features)][
            "importance_gain"
        ].sum()

        category_scores[category] = category_importance

    # Sort categories by importance
    sorted_categories = sorted(category_scores.items(), key=lambda x: x[1], reverse=True)

    for category, importance in sorted_categories:
        pct = (importance / total_importance) * 100
        feature_count = len(categories[category])
        logger.info(f"\n{category} ({feature_count} features): {importance:12.2f} ({pct:5.2f}%)")

        # Show top 3 features in this category
        category_features = importance_df[importance_df["feature"].isin(categories[category])].head(
            3
        )

        for _, row in category_features.iterrows():
            feature = row["feature"]
            feat_importance = row["importance_gain"]
            feat_pct = (feat_importance / total_importance) * 100
            logger.info(f"  - {feature:38s} {feat_importance:10.2f} ({feat_pct:5.2f}%)")


def load_sample_data() -> pd.DataFrame:
    """Load sample data for SHAP analysis from training script.

    Returns:
        DataFrame with features (no targets)
    """
    from sports_betting_edge.services.feature_engineering import FeatureEngineer

    logger.info("Loading sample data for SHAP analysis...")

    staging_path = Path("data/staging")
    engineer = FeatureEngineer(staging_path=str(staging_path))

    # Load recent data (last 60 days)
    from datetime import datetime, timedelta

    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=60)

    merged = engineer.load_staging_data(
        start_date, end_date, season=2026, require_line_features=False, use_home_away=True
    )

    # Build features (same as train_score_models.py)
    X = pd.DataFrame()

    # Home team features
    X["home_adj_em"] = merged["adj_em_home"]
    X["home_pythag"] = merged["pythag_home"]
    X["home_adj_o"] = merged["adj_o_home"]
    X["home_adj_d"] = merged["adj_d_home"]
    X["home_adj_t"] = merged["adj_t_home"]
    X["home_luck"] = merged["luck_home"]
    X["home_sos"] = merged["sos_home"]
    X["home_efg_pct"] = merged["efg_pct_home"]
    X["home_to_pct"] = merged["to_pct_home"]
    X["home_or_pct"] = merged["or_pct_home"]
    X["home_ft_rate"] = merged["ft_rate_home"]

    # Away team features
    X["away_adj_em"] = merged["adj_em_away"]
    X["away_pythag"] = merged["pythag_away"]
    X["away_adj_o"] = merged["adj_o_away"]
    X["away_adj_d"] = merged["adj_d_away"]
    X["away_adj_t"] = merged["adj_t_away"]
    X["away_luck"] = merged["luck_away"]
    X["away_sos"] = merged["sos_away"]
    X["away_efg_pct"] = merged["efg_pct_away"]
    X["away_to_pct"] = merged["to_pct_away"]
    X["away_or_pct"] = merged["or_pct_away"]
    X["away_ft_rate"] = merged["ft_rate_away"]

    # Combined features
    X["total_offense"] = X["home_adj_o"] + X["away_adj_o"]
    X["avg_tempo"] = (X["home_adj_t"] + X["away_adj_t"]) / 2
    X["avg_luck"] = (X["home_luck"] + X["away_luck"]) / 2
    X["home_expected_pts"] = (X["home_adj_o"] * X["away_adj_d"] / 100) * (X["home_adj_t"] / 100)
    X["away_expected_pts"] = (X["away_adj_o"] * X["home_adj_d"] / 100) * (X["away_adj_t"] / 100)
    X["expected_total"] = X["home_expected_pts"] + X["away_expected_pts"]

    # Add line features if available
    if "opening_total" in merged.columns:
        X["opening_total"] = merged["opening_total"]
        X["closing_total"] = merged["closing_total"]
        X["total_movement"] = merged["closing_total"] - merged["opening_total"]

    # Drop rows with missing values
    X = X.dropna()

    logger.info(f"Loaded {len(X)} games for SHAP analysis")

    return X


def create_comparison_plot(
    home_importance: pd.DataFrame, away_importance: pd.DataFrame, output_path: Path
) -> None:
    """Create comparison plot of home vs away feature importance.

    Args:
        home_importance: Home model importance DataFrame
        away_importance: Away model importance DataFrame
        output_path: Path to save the plot
    """
    # Merge home and away importance
    comparison = home_importance.merge(away_importance, on="feature", suffixes=("_home", "_away"))

    # Take top 15 features by total importance
    comparison["total_importance"] = (
        comparison["importance_gain_home"] + comparison["importance_gain_away"]
    )
    top_features = comparison.nlargest(15, "total_importance")

    # Create plot
    fig, ax = plt.subplots(figsize=(12, 8))

    x = np.arange(len(top_features))
    width = 0.35

    ax.barh(
        x - width / 2,
        top_features["importance_gain_home"],
        width,
        label="Home Score Model",
        color="#2E86AB",
    )
    ax.barh(
        x + width / 2,
        top_features["importance_gain_away"],
        width,
        label="Away Score Model",
        color="#A23B72",
    )

    ax.set_yticks(x)
    ax.set_yticklabels(top_features["feature"])
    ax.set_xlabel("Feature Importance (Gain)", fontsize=12)
    ax.set_title("Top 15 Features: Home vs Away Score Prediction", fontsize=14, fontweight="bold")
    ax.legend(loc="lower right")
    ax.grid(axis="x", alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches="tight")
    logger.info(f"Comparison plot saved to: {output_path}")


def main() -> None:
    """Analyze feature importance for home and away score models."""
    configure_logging()

    models_dir = Path("models")
    output_dir = Path("reports")
    output_dir.mkdir(exist_ok=True)

    # Load models
    home_model = load_model(models_dir / "home_score_2026.pkl")
    away_model = load_model(models_dir / "away_score_2026.pkl")

    # Load sample data for SHAP analysis
    X_sample = load_sample_data()

    # Determine actual features (may vary if line features missing)
    actual_features = X_sample.columns.tolist()

    logger.info(f"\nAnalyzing {len(actual_features)} features:")
    for i, feat in enumerate(actual_features, 1):
        logger.info(f"  {i:2d}. {feat}")

    # ============================================================================
    # HOME SCORE MODEL ANALYSIS
    # ============================================================================
    logger.info("\n" + "=" * 80)
    logger.info("HOME SCORE MODEL - BUILT-IN IMPORTANCE")
    logger.info("=" * 80)

    home_builtin = analyze_builtin_importance(home_model, "Home Score", actual_features)
    print_top_features(home_builtin, n=15)

    home_categories = categorize_features(home_builtin)
    print_category_summary(home_builtin, home_categories)

    logger.info("\n" + "=" * 80)
    logger.info("HOME SCORE MODEL - SHAP ANALYSIS")
    logger.info("=" * 80)

    try:
        home_shap_df, home_shap_exp = analyze_shap_importance(home_model, X_sample, "Home Score")
        print_top_features(home_shap_df.rename(columns={"mean_abs_shap": "importance_gain"}), n=15)
    except Exception as e:
        logger.warning(f"SHAP analysis failed (likely compatibility issue): {e}")
        logger.warning("Continuing without SHAP analysis...")
        home_shap_df, home_shap_exp = None, None

    # ============================================================================
    # AWAY SCORE MODEL ANALYSIS
    # ============================================================================
    logger.info("\n\n" + "=" * 80)
    logger.info("AWAY SCORE MODEL - BUILT-IN IMPORTANCE")
    logger.info("=" * 80)

    away_builtin = analyze_builtin_importance(away_model, "Away Score", actual_features)
    print_top_features(away_builtin, n=15)

    away_categories = categorize_features(away_builtin)
    print_category_summary(away_builtin, away_categories)

    logger.info("\n" + "=" * 80)
    logger.info("AWAY SCORE MODEL - SHAP ANALYSIS")
    logger.info("=" * 80)

    try:
        away_shap_df, away_shap_exp = analyze_shap_importance(away_model, X_sample, "Away Score")
        print_top_features(away_shap_df.rename(columns={"mean_abs_shap": "importance_gain"}), n=15)
    except Exception as e:
        logger.warning(f"SHAP analysis failed (likely compatibility issue): {e}")
        logger.warning("Continuing without SHAP analysis...")
        away_shap_df, away_shap_exp = None, None

    # ============================================================================
    # SAVE RESULTS
    # ============================================================================
    logger.info("\n" + "=" * 80)
    logger.info("SAVING RESULTS")
    logger.info("=" * 80)

    # Save CSV reports
    home_builtin.to_csv(output_dir / "home_score_builtin_importance.csv", index=False)
    away_builtin.to_csv(output_dir / "away_score_builtin_importance.csv", index=False)

    if home_shap_df is not None:
        home_shap_df.to_csv(output_dir / "home_score_shap_importance.csv", index=False)
    if away_shap_df is not None:
        away_shap_df.to_csv(output_dir / "away_score_shap_importance.csv", index=False)

    # Create comparison plot
    create_comparison_plot(home_builtin, away_builtin, output_dir / "importance_comparison.png")

    # Create SHAP summary plots (if available)
    if home_shap_exp is not None:
        plt.figure(figsize=(10, 8))
        shap.summary_plot(home_shap_exp, show=False, max_display=15)
        plt.title("Home Score Model - SHAP Feature Importance", fontsize=14, fontweight="bold")
        plt.tight_layout()
        plt.savefig(output_dir / "home_shap_summary.png", dpi=300, bbox_inches="tight")
        logger.info(f"Home SHAP summary saved to: {output_dir / 'home_shap_summary.png'}")

    if away_shap_exp is not None:
        plt.figure(figsize=(10, 8))
        shap.summary_plot(away_shap_exp, show=False, max_display=15)
        plt.title("Away Score Model - SHAP Feature Importance", fontsize=14, fontweight="bold")
        plt.tight_layout()
        plt.savefig(output_dir / "away_shap_summary.png", dpi=300, bbox_inches="tight")
        logger.info(f"Away SHAP summary saved to: {output_dir / 'away_shap_summary.png'}")

    # KEY INSIGHTS
    logger.info("\n" + "=" * 80)
    logger.info("KEY INSIGHTS - WHAT PREDICTS WINNERS?")
    logger.info("=" * 80)

    # Top 5 features for each model
    top5_home = home_builtin.head(5)["feature"].tolist()
    top5_away = away_builtin.head(5)["feature"].tolist()

    logger.info("\nTop 5 KenPom Stats for Predicting HOME Team Score:")
    for i, feat in enumerate(top5_home, 1):
        logger.info(f"  {i}. {feat}")

    logger.info("\nTop 5 KenPom Stats for Predicting AWAY Team Score:")
    for i, feat in enumerate(top5_away, 1):
        logger.info(f"  {i}. {feat}")

    # Category importance for home model
    logger.info("\nMost Important Stat Categories (Home Model):")
    total_importance = home_builtin["importance_gain"].sum()
    for category, features in home_categories.items():
        if not features:
            continue
        cat_importance = home_builtin[home_builtin["feature"].isin(features)][
            "importance_gain"
        ].sum()
        pct = (cat_importance / total_importance) * 100
        logger.info(f"  - {category}: {pct:.1f}%")

    logger.info("\n[OK] Feature importance analysis complete!")
    logger.info(f"\nAll results saved to: {output_dir.absolute()}")


if __name__ == "__main__":
    main()
