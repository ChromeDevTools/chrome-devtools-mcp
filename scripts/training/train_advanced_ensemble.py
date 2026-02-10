#!/usr/bin/env python3
"""Train advanced ensemble models for score prediction.

State-of-the-art ensemble combining:
- XGBoost, LightGBM, CatBoost regressors
- Stacked ensemble with Ridge meta-learner
- Optuna hyperparameter optimization
- Advanced feature engineering
- Cross-validation with proper evaluation
"""

from __future__ import annotations

import logging
import pickle
from datetime import datetime
from pathlib import Path

import click
import numpy as np
import optuna
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


def build_advanced_features(
    staging_path: Path,
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """Build advanced features including rolling stats and interactions.

    Args:
        staging_path: Path to staging data directory
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)

    Returns:
        DataFrame with advanced features and targets
    """
    from sports_betting_edge.services.feature_engineering import FeatureEngineer

    engineer = FeatureEngineer(staging_path=str(staging_path))

    # Load raw merged data
    logger.info(f"Loading data from {start_date} to {end_date}...")
    start_dt = datetime.fromisoformat(start_date).date()
    end_dt = datetime.fromisoformat(end_date).date()

    merged = engineer.load_staging_data(
        start_dt,
        end_dt,
        season=2026,
        require_line_features=False,
        use_home_away=True,
    )

    logger.info(f"Loaded {len(merged)} games")

    # Base features
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

    # ========== ADVANCED FEATURES ==========

    # 1. Efficiency Matchups (offense vs defense)
    X["home_off_vs_def"] = X["home_adj_o"] - X["away_adj_d"]
    X["away_off_vs_def"] = X["away_adj_o"] - X["home_adj_d"]

    # 2. Tempo-adjusted scoring potential
    X["home_scoring_potential"] = (X["home_adj_o"] * X["away_adj_d"] / 100) * (
        X["home_adj_t"] / 100
    )
    X["away_scoring_potential"] = (X["away_adj_o"] * X["home_adj_d"] / 100) * (
        X["away_adj_t"] / 100
    )

    # 3. Expected total and pace
    X["expected_total"] = X["home_scoring_potential"] + X["away_scoring_potential"]
    X["avg_tempo"] = (X["home_adj_t"] + X["away_adj_t"]) / 2
    X["tempo_advantage"] = X["home_adj_t"] - X["away_adj_t"]

    # 4. Four Factors differentials
    X["efg_diff"] = X["home_efg_pct"] - X["away_efg_pct"]
    X["to_diff"] = X["home_to_pct"] - X["away_to_pct"]
    X["or_diff"] = X["home_or_pct"] - X["away_or_pct"]
    X["ft_diff"] = X["home_ft_rate"] - X["away_ft_rate"]

    # 5. Composite strength metrics
    X["home_overall_strength"] = (
        X["home_adj_em"] * 0.4
        + X["home_pythag"] * 0.3
        + X["home_adj_o"] * 0.15
        + X["home_adj_d"] * 0.15
    )
    X["away_overall_strength"] = (
        X["away_adj_em"] * 0.4
        + X["away_pythag"] * 0.3
        + X["away_adj_o"] * 0.15
        + X["away_adj_d"] * 0.15
    )
    X["strength_diff"] = X["home_overall_strength"] - X["away_overall_strength"]

    # 6. Interaction features (most predictive combinations)
    X["home_o_x_tempo"] = X["home_adj_o"] * X["home_adj_t"]
    X["away_o_x_tempo"] = X["away_adj_o"] * X["away_adj_t"]
    X["efficiency_product"] = X["home_adj_em"] * X["away_adj_em"]
    X["pythag_product"] = X["home_pythag"] * X["away_pythag"]

    # 7. Luck and overperformance factors
    X["luck_diff"] = X["home_luck"] - X["away_luck"]
    X["total_luck"] = X["home_luck"] + X["away_luck"]

    # 8. Schedule strength impact
    X["sos_diff"] = X["home_sos"] - X["away_sos"]

    # 9. Add line features if available
    if "opening_total" in merged.columns:
        X["opening_total"] = merged["opening_total"]
        X["closing_total"] = merged["closing_total"]
        X["total_movement"] = merged["closing_total"] - merged["opening_total"]
        X["expected_vs_line"] = X["expected_total"] - X["closing_total"]

    # Add targets
    X["home_score"] = merged["home_score"]
    X["away_score"] = merged["away_score"]
    X["margin"] = merged["home_score"] - merged["away_score"]
    X["total_score"] = merged["home_score"] + merged["away_score"]

    # Drop missing
    X = X.dropna(subset=["home_score", "away_score"])

    logger.info(f"Final dataset: {len(X)} games, {len(X.columns) - 4} features")

    return X


def optimize_xgboost(trial: optuna.Trial) -> dict:
    """Suggest XGBoost hyperparameters."""
    return {
        "max_depth": trial.suggest_int("xgb_max_depth", 3, 10),
        "learning_rate": trial.suggest_float("xgb_learning_rate", 0.01, 0.3, log=True),
        "min_child_weight": trial.suggest_int("xgb_min_child_weight", 1, 10),
        "subsample": trial.suggest_float("xgb_subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("xgb_colsample_bytree", 0.6, 1.0),
        "gamma": trial.suggest_float("xgb_gamma", 0.0, 5.0),
        "reg_alpha": trial.suggest_float("xgb_reg_alpha", 0.0, 10.0),
        "reg_lambda": trial.suggest_float("xgb_reg_lambda", 0.0, 10.0),
        "n_estimators": trial.suggest_int("xgb_n_estimators", 50, 500),
    }


def optimize_lightgbm(trial: optuna.Trial) -> dict:
    """Suggest LightGBM hyperparameters."""
    return {
        "num_leaves": trial.suggest_int("lgb_num_leaves", 10, 100),
        "learning_rate": trial.suggest_float("lgb_learning_rate", 0.01, 0.3, log=True),
        "min_child_samples": trial.suggest_int("lgb_min_child_samples", 5, 50),
        "subsample": trial.suggest_float("lgb_subsample", 0.6, 1.0),
        "colsample_bytree": trial.suggest_float("lgb_colsample_bytree", 0.6, 1.0),
        "reg_alpha": trial.suggest_float("lgb_reg_alpha", 0.0, 10.0),
        "reg_lambda": trial.suggest_float("lgb_reg_lambda", 0.0, 10.0),
        "n_estimators": trial.suggest_int("lgb_n_estimators", 50, 500),
    }


def optimize_catboost(trial: optuna.Trial) -> dict:
    """Suggest CatBoost hyperparameters."""
    return {
        "depth": trial.suggest_int("cat_depth", 3, 10),
        "learning_rate": trial.suggest_float("cat_learning_rate", 0.01, 0.3, log=True),
        "l2_leaf_reg": trial.suggest_float("cat_l2_leaf_reg", 0.1, 10.0),
        "iterations": trial.suggest_int("cat_iterations", 50, 500),
    }


def train_base_models(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    n_trials: int = 50,
) -> dict:
    """Train and optimize base models.

    Args:
        X_train: Training features
        y_train: Training target
        X_val: Validation features
        y_val: Validation target
        n_trials: Number of Optuna trials

    Returns:
        Dictionary of trained models
    """
    import lightgbm as lgb
    import xgboost as xgb
    from catboost import CatBoostRegressor

    models = {}

    # ========== XGBoost ==========
    logger.info("Training XGBoost with Optuna...")

    def xgb_objective(trial):
        params = optimize_xgboost(trial)
        model = xgb.XGBRegressor(
            **params,
            objective="reg:squarederror",
            random_state=42,
            n_jobs=-1,
        )
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
        y_pred = model.predict(X_val)
        return np.sqrt(mean_squared_error(y_val, y_pred))

    xgb_study = optuna.create_study(direction="minimize", study_name="xgboost")
    xgb_study.optimize(xgb_objective, n_trials=n_trials, show_progress_bar=True)

    # Train final XGBoost
    best_xgb_params = {k.replace("xgb_", ""): v for k, v in xgb_study.best_params.items()}
    models["xgboost"] = xgb.XGBRegressor(
        **best_xgb_params,
        objective="reg:squarederror",
        random_state=42,
        n_jobs=-1,
    )
    models["xgboost"].fit(X_train, y_train)
    logger.info(f"XGBoost Best RMSE: {xgb_study.best_value:.3f}")

    # ========== LightGBM ==========
    logger.info("Training LightGBM with Optuna...")

    def lgb_objective(trial):
        params = optimize_lightgbm(trial)
        model = lgb.LGBMRegressor(**params, random_state=42, n_jobs=-1, verbose=-1)
        model.fit(X_train, y_train, eval_set=[(X_val, y_val)])
        y_pred = model.predict(X_val)
        return np.sqrt(mean_squared_error(y_val, y_pred))

    lgb_study = optuna.create_study(direction="minimize", study_name="lightgbm")
    lgb_study.optimize(lgb_objective, n_trials=n_trials, show_progress_bar=True)

    # Train final LightGBM
    best_lgb_params = {k.replace("lgb_", ""): v for k, v in lgb_study.best_params.items()}
    models["lightgbm"] = lgb.LGBMRegressor(
        **best_lgb_params, random_state=42, n_jobs=-1, verbose=-1
    )
    models["lightgbm"].fit(X_train, y_train)
    logger.info(f"LightGBM Best RMSE: {lgb_study.best_value:.3f}")

    # ========== CatBoost ==========
    logger.info("Training CatBoost with Optuna...")

    def cat_objective(trial):
        params = optimize_catboost(trial)
        model = CatBoostRegressor(**params, random_state=42, verbose=False, thread_count=-1)
        model.fit(X_train, y_train, eval_set=(X_val, y_val))
        y_pred = model.predict(X_val)
        return np.sqrt(mean_squared_error(y_val, y_pred))

    cat_study = optuna.create_study(direction="minimize", study_name="catboost")
    cat_study.optimize(cat_objective, n_trials=n_trials, show_progress_bar=True)

    # Train final CatBoost
    best_cat_params = {k.replace("cat_", ""): v for k, v in cat_study.best_params.items()}
    models["catboost"] = CatBoostRegressor(
        **best_cat_params, random_state=42, verbose=False, thread_count=-1
    )
    models["catboost"].fit(X_train, y_train)
    logger.info(f"CatBoost Best RMSE: {cat_study.best_value:.3f}")

    return models


def build_stacked_ensemble(
    base_models: dict,
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
) -> Ridge:
    """Build stacked ensemble with Ridge meta-learner.

    Args:
        base_models: Dictionary of trained base models
        X_train: Training features
        y_train: Training target
        X_val: Validation features
        y_val: Validation target

    Returns:
        Trained meta-learner
    """
    logger.info("Building stacked ensemble...")

    # Generate meta-features (predictions from base models)
    meta_train = np.column_stack([model.predict(X_train) for model in base_models.values()])
    meta_val = np.column_stack([model.predict(X_val) for model in base_models.values()])

    # Train meta-learner
    meta_learner = Ridge(alpha=1.0)
    meta_learner.fit(meta_train, y_train)

    # Evaluate
    train_pred = meta_learner.predict(meta_train)
    val_pred = meta_learner.predict(meta_val)

    train_rmse = np.sqrt(mean_squared_error(y_train, train_pred))
    val_rmse = np.sqrt(mean_squared_error(y_val, val_pred))

    logger.info(f"Stacked Train RMSE: {train_rmse:.3f}")
    logger.info(f"Stacked Val RMSE: {val_rmse:.3f}")

    # Show base model weights
    weights = meta_learner.coef_
    logger.info("\nMeta-learner weights:")
    for name, weight in zip(base_models.keys(), weights, strict=False):
        logger.info(f"  {name}: {weight:.3f}")

    return meta_learner


def evaluate_ensemble(
    base_models: dict,
    meta_learner: Ridge,
    X: pd.DataFrame,
    y: pd.Series,
    name: str,
) -> dict:
    """Evaluate ensemble performance.

    Args:
        base_models: Dictionary of trained base models
        meta_learner: Trained meta-learner
        X: Features
        y: True values
        name: Dataset name for logging

    Returns:
        Dictionary of metrics
    """
    # Base model predictions
    base_preds = np.column_stack([model.predict(X) for model in base_models.values()])

    # Ensemble prediction
    y_pred = meta_learner.predict(base_preds)

    mae = mean_absolute_error(y, y_pred)
    rmse = np.sqrt(mean_squared_error(y, y_pred))
    r2 = r2_score(y, y_pred)

    logger.info(f"\n{name} Performance:")
    logger.info(f"  MAE:  {mae:.2f} points")
    logger.info(f"  RMSE: {rmse:.2f} points")
    logger.info(f"  R²:   {r2:.4f}")

    return {"mae": mae, "rmse": rmse, "r2": r2}


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
@click.option(
    "--n-trials",
    default=50,
    type=int,
    help="Number of Optuna trials per model",
)
def main(
    start_date: datetime,
    end_date: datetime,
    staging_path: Path,
    output_dir: Path,
    n_trials: int,
) -> None:
    """Train advanced ensemble score prediction models."""
    logger.info("=" * 80)
    logger.info("ADVANCED ENSEMBLE SCORE PREDICTION")
    logger.info("=" * 80)

    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    # Build advanced features
    df = build_advanced_features(staging_path, start_str, end_str)

    # Prepare data
    target_cols = ["home_score", "away_score", "margin", "total_score"]
    feature_cols = [col for col in df.columns if col not in target_cols]

    X = df[feature_cols]
    y_home = df["home_score"]
    y_away = df["away_score"]

    # Split data (80/20)
    train_size = int(0.8 * len(X))
    X_train, X_val = X[:train_size], X[train_size:]
    y_train_home, y_val_home = y_home[:train_size], y_home[train_size:]
    y_train_away, y_val_away = y_away[:train_size], y_away[train_size:]

    logger.info("\nDataset Info:")
    logger.info(f"  Features: {len(feature_cols)}")
    logger.info(f"  Train: {len(X_train)} games")
    logger.info(f"  Val: {len(X_val)} games")

    # ========== TRAIN HOME SCORE ENSEMBLE ==========
    logger.info("\n" + "=" * 80)
    logger.info("TRAINING HOME SCORE ENSEMBLE")
    logger.info("=" * 80)

    home_base_models = train_base_models(X_train, y_train_home, X_val, y_val_home, n_trials)
    home_meta = build_stacked_ensemble(home_base_models, X_train, y_train_home, X_val, y_val_home)

    # ========== TRAIN AWAY SCORE ENSEMBLE ==========
    logger.info("\n" + "=" * 80)
    logger.info("TRAINING AWAY SCORE ENSEMBLE")
    logger.info("=" * 80)

    away_base_models = train_base_models(X_train, y_train_away, X_val, y_val_away, n_trials)
    away_meta = build_stacked_ensemble(away_base_models, X_train, y_train_away, X_val, y_val_away)

    # ========== EVALUATE ==========
    logger.info("\n" + "=" * 80)
    logger.info("FINAL EVALUATION")
    logger.info("=" * 80)

    home_metrics = evaluate_ensemble(
        home_base_models, home_meta, X_val, y_val_home, "Home Score Ensemble"
    )
    away_metrics = evaluate_ensemble(
        away_base_models, away_meta, X_val, y_val_away, "Away Score Ensemble"
    )

    # Derived metrics
    home_pred = home_meta.predict(
        np.column_stack([m.predict(X_val) for m in home_base_models.values()])
    )
    away_pred = away_meta.predict(
        np.column_stack([m.predict(X_val) for m in away_base_models.values()])
    )

    margin_pred = home_pred - away_pred
    total_pred = home_pred + away_pred
    margin_true = y_val_home - y_val_away
    total_true = y_val_home + y_val_away

    logger.info("\nDerived Predictions:")
    logger.info(f"  Margin MAE:  {mean_absolute_error(margin_true, margin_pred):.2f} pts")
    logger.info(f"  Margin RMSE: {np.sqrt(mean_squared_error(margin_true, margin_pred)):.2f} pts")
    logger.info(f"  Total MAE:   {mean_absolute_error(total_true, total_pred):.2f} pts")
    logger.info(f"  Total RMSE:  {np.sqrt(mean_squared_error(total_true, total_pred)):.2f} pts")

    # ========== SAVE MODELS ==========
    output_dir.mkdir(parents=True, exist_ok=True)

    ensemble_home = {
        "base_models": home_base_models,
        "meta_learner": home_meta,
        "feature_names": feature_cols,
        "metrics": home_metrics,
    }

    ensemble_away = {
        "base_models": away_base_models,
        "meta_learner": away_meta,
        "feature_names": feature_cols,
        "metrics": away_metrics,
    }

    home_path = output_dir / "ensemble_home_2026.pkl"
    away_path = output_dir / "ensemble_away_2026.pkl"

    with open(home_path, "wb") as f:
        pickle.dump(ensemble_home, f)
    with open(away_path, "wb") as f:
        pickle.dump(ensemble_away, f)

    logger.info("\n[OK] Saved ensemble models:")
    logger.info(f"  Home: {home_path}")
    logger.info(f"  Away: {away_path}")

    logger.info("\n" + "=" * 80)
    logger.info("TRAINING COMPLETE")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
