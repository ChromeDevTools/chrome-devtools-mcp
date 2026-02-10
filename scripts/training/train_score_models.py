#!/usr/bin/env python3
"""Train regression models to predict game scores and margins.

This script trains XGBoost regression models to predict:
1. Home team score
2. Away team score
3. Margin (home - away)
4. Total (home + away)
"""

from __future__ import annotations

import json
import logging
import pickle
from datetime import datetime
from pathlib import Path

import click
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from sports_betting_edge.config.settings import settings
from sports_betting_edge.services.feature_engineering import FeatureEngineer

logger = logging.getLogger(__name__)

# D1 average constants for expected points formula
DI_AVG_EFF = 109.15  # D1 avg offensive/defensive efficiency (per 100 poss)
DI_AVG_TEMPO = 67.34  # D1 avg possessions per game
DEFAULT_HCA_PTS = 3.2  # Fallback HCA when per-team data unavailable


def build_score_features(
    staging_path: Path,
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """Build features for score prediction.

    Args:
        staging_path: Path to staging data directory
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)

    Returns:
        DataFrame with features and score targets
    """
    from datetime import datetime as dt

    engineer = FeatureEngineer(staging_path=str(staging_path))

    # Load raw merged data with scores
    logger.info(f"Building dataset from {start_date} to {end_date}...")
    start_dt = dt.fromisoformat(start_date).date()
    end_dt = dt.fromisoformat(end_date).date()

    merged = engineer.load_staging_data(
        start_dt,
        end_dt,
        season=2026,
        require_line_features=False,
        use_home_away=True,
    )

    logger.info(f"Loaded {len(merged)} games")

    # Build features (same as totals model)
    X = pd.DataFrame()

    # Home team features
    # Removed: pythag, adj_em, adj_o, adj_d (all captured by expected_pts formula)
    # expected_pts = f(adj_o, opp_adj_d, tempo) encodes the efficiency matchup
    X["home_adj_t"] = merged["adj_t_home"]
    X["home_luck"] = merged["luck_home"]
    X["home_sos"] = merged["sos_home"]
    X["home_height"] = merged["height_eff_home"]
    X["home_efg_pct"] = merged["efg_pct_home"]
    X["home_to_pct"] = merged["to_pct_home"]
    X["home_or_pct"] = merged["or_pct_home"]
    X["home_ft_rate"] = merged["ft_rate_home"]

    # Away team features
    # Removed: pythag, adj_em, adj_o, adj_d (all captured by expected_pts formula)
    X["away_adj_t"] = merged["adj_t_away"]
    X["away_luck"] = merged["luck_away"]
    X["away_sos"] = merged["sos_away"]
    X["away_height"] = merged["height_eff_away"]
    X["away_efg_pct"] = merged["efg_pct_away"]
    X["away_to_pct"] = merged["to_pct_away"]
    X["away_or_pct"] = merged["or_pct_away"]
    X["away_ft_rate"] = merged["ft_rate_away"]

    # Combined features
    # NOTE: total_offense, avg_defense removed (r>0.85 with adj_o/adj_d)
    X["avg_tempo"] = (X["home_adj_t"] + X["away_adj_t"]) / 2
    X["avg_luck"] = (X["home_luck"] + X["away_luck"]) / 2
    X["height_diff"] = X["home_height"] - X["away_height"]

    # Expected pts computed from raw merged data (adj_o/adj_d not in X)
    game_tempo = (merged["adj_t_home"] * merged["adj_t_away"]) / DI_AVG_TEMPO
    # Per-team HCA (points component) or league average fallback
    home_hca = (
        merged["hca_pts_home"].fillna(DEFAULT_HCA_PTS)
        if "hca_pts_home" in merged.columns
        else DEFAULT_HCA_PTS
    )
    X["home_expected_pts"] = (merged["adj_o_home"] * merged["adj_d_away"] / DI_AVG_EFF) * (
        game_tempo / 100
    ) + (home_hca / 2)
    X["away_expected_pts"] = (merged["adj_o_away"] * merged["adj_d_home"] / DI_AVG_EFF) * (
        game_tempo / 100
    ) - (home_hca / 2)
    X["expected_total"] = X["home_expected_pts"] + X["away_expected_pts"]
    if "hca_home" in merged.columns:
        X["home_hca"] = merged["hca_home"].fillna(0.0)

    # Differential features - REDUCED to avoid double-counting talent gap
    # Removed: adj_em_diff, pythag_diff, adj_o_diff, adj_d_diff (r>0.85 with expected_pts)
    # Keep tempo diff (independent signal) and Four Factors diffs (shooting quality, not efficiency)
    X["adj_t_diff"] = X["home_adj_t"] - X["away_adj_t"]

    # Four Factors differentials (shooting quality - different signal from efficiency)
    X["efg_pct_diff"] = X["home_efg_pct"] - X["away_efg_pct"]
    X["to_pct_diff"] = X["home_to_pct"] - X["away_to_pct"]
    X["or_pct_diff"] = X["home_or_pct"] - X["away_or_pct"]
    X["ft_rate_diff"] = X["home_ft_rate"] - X["away_ft_rate"]

    # Contextual differentials
    X["sos_diff"] = X["home_sos"] - X["away_sos"]
    X["luck_diff"] = X["home_luck"] - X["away_luck"]

    # Add line features if available
    if "opening_total" in merged.columns:
        X["opening_total"] = merged["opening_total"]
        X["closing_total"] = merged["closing_total"]
        X["total_movement"] = merged["closing_total"] - merged["opening_total"]

    # KenPom FanMatch features (optional - XGBoost handles NaN)
    if "kp_predicted_margin" in merged.columns:
        X["kp_predicted_margin"] = merged["kp_predicted_margin"]
        X["kp_predicted_total"] = merged["kp_predicted_total"]
        X["kp_home_wp"] = merged["kp_home_wp"]

        # Market disagreement features
        if "favorite_team" in merged.columns and "closing_spread" in merged.columns:
            is_home_fav = merged["home_team"] == merged["favorite_team"]
            market_home_margin = (
                merged["closing_spread"].abs().where(is_home_fav, -merged["closing_spread"].abs())
            )
            X["kp_market_margin_diff"] = merged["kp_predicted_margin"] - market_home_margin
        if "closing_total" in merged.columns:
            X["kp_market_total_diff"] = merged["kp_predicted_total"] - merged["closing_total"]

    # Rest & situational features
    X["home_rest_days"] = merged["home_rest_days"]
    X["away_rest_days"] = merged["away_rest_days"]
    X["home_back_to_back"] = merged["home_back_to_back"]
    X["away_back_to_back"] = merged["away_back_to_back"]
    X["home_short_rest"] = merged["home_short_rest"]
    X["away_short_rest"] = merged["away_short_rest"]
    X["away_road_streak"] = merged["away_road_streak"]
    X["away_days_on_road"] = merged["away_days_on_road"]
    X["rest_advantage"] = X["home_rest_days"] - X["away_rest_days"]
    X["total_back_to_back"] = (X["home_back_to_back"] | X["away_back_to_back"]).astype(int)
    X["total_short_rest"] = (X["home_short_rest"] | X["away_short_rest"]).astype(int)

    # Add score targets
    X["home_score"] = merged["home_score"]
    X["away_score"] = merged["away_score"]
    X["margin"] = merged["home_score"] - merged["away_score"]
    X["total_score"] = merged["home_score"] + merged["away_score"]

    # Drop rows with missing scores
    X = X.dropna(subset=["home_score", "away_score"])

    logger.info(f"Final dataset: {len(X)} games with complete scores")

    return X


def train_score_models(
    X_train: pd.DataFrame,
    X_val: pd.DataFrame,
    y_train_home: pd.Series,
    y_val_home: pd.Series,
    y_train_away: pd.Series,
    y_val_away: pd.Series,
) -> tuple[xgb.XGBRegressor, xgb.XGBRegressor]:
    """Train regression models for home and away scores.

    Args:
        X_train: Training features
        X_val: Validation features
        y_train_home: Training home scores
        y_val_home: Validation home scores
        y_train_away: Training away scores
        y_val_away: Validation away scores

    Returns:
        Tuple of (home_model, away_model)
    """
    # Regularized parameters to prevent extreme mismatch overprediction
    # Key changes from v1: shallower trees, higher min samples per leaf,
    # L1/L2 regularization, and early stopping
    params = {
        "objective": "reg:squarederror",
        "learning_rate": 0.05,
        "max_depth": 4,
        "min_child_weight": 10,
        "subsample": 0.7,
        "colsample_bytree": 0.6,
        "reg_alpha": 1.0,
        "reg_lambda": 5.0,
        "gamma": 1.0,
        "n_estimators": 300,
        "early_stopping_rounds": 20,
        "random_state": 42,
        "n_jobs": -1,
    }

    # Train home score model
    logger.info("Training home score model...")
    home_model = xgb.XGBRegressor(**params)
    home_model.fit(
        X_train,
        y_train_home,
        eval_set=[(X_val, y_val_home)],
        verbose=False,
    )
    logger.info(f"  Home model stopped at {home_model.best_iteration} rounds")

    # Train away score model
    logger.info("Training away score model...")
    away_model = xgb.XGBRegressor(**params)
    away_model.fit(
        X_train,
        y_train_away,
        eval_set=[(X_val, y_val_away)],
        verbose=False,
    )
    logger.info(f"  Away model stopped at {away_model.best_iteration} rounds")

    return home_model, away_model


def evaluate_model(
    model: xgb.XGBRegressor,
    X: pd.DataFrame,
    y: pd.Series,
    name: str,
) -> dict[str, float]:
    """Evaluate regression model performance.

    Args:
        model: Trained model
        X: Features
        y: True values
        name: Model name for logging

    Returns:
        Dictionary of metrics
    """
    import numpy as np

    y_pred = model.predict(X)

    mae = mean_absolute_error(y, y_pred)
    mse = mean_squared_error(y, y_pred)
    rmse = np.sqrt(mse)
    r2 = r2_score(y, y_pred)

    logger.info(f"\n{name} Performance:")
    logger.info(f"  MAE:  {mae:.2f} points")
    logger.info(f"  RMSE: {rmse:.2f} points")
    logger.info(f"  R²:   {r2:.4f}")

    return {"mae": mae, "rmse": rmse, "r2": r2}


def diagnose_bias(
    home_model: xgb.XGBRegressor,
    away_model: xgb.XGBRegressor,
    X_val: pd.DataFrame,
    y_val_home: pd.Series,
    y_val_away: pd.Series,
) -> dict[str, float]:
    """Diagnose systematic bias in score predictions.

    Args:
        home_model: Trained home score model
        away_model: Trained away score model
        X_val: Validation features
        y_val_home: Actual home scores
        y_val_away: Actual away scores

    Returns:
        Dictionary of bias metrics
    """
    import numpy as np

    home_pred = home_model.predict(X_val)
    away_pred = away_model.predict(X_val)

    # Per-component bias (positive = overprediction)
    home_bias = float(np.mean(home_pred - y_val_home))
    away_bias = float(np.mean(away_pred - y_val_away))

    # Derived metrics
    total_pred = home_pred + away_pred
    total_actual = np.asarray(y_val_home) + np.asarray(y_val_away)
    total_bias = float(np.mean(total_pred - total_actual))
    total_mae = float(np.mean(np.abs(total_pred - total_actual)))

    margin_pred = home_pred - away_pred
    margin_actual = np.asarray(y_val_home) - np.asarray(y_val_away)
    margin_bias = float(np.mean(margin_pred - margin_actual))

    # Actual averages
    actual_total_mean = float(np.mean(total_actual))
    pred_total_mean = float(np.mean(total_pred))

    # Market comparison (if closing_total available)
    market_total_mae = None
    market_total_bias = None
    if "closing_total" in X_val.columns:
        closing = X_val["closing_total"].values
        valid = ~np.isnan(closing)
        if valid.sum() > 10:
            market_total_mae = float(np.mean(np.abs(closing[valid] - total_actual[valid])))
            market_total_bias = float(np.mean(closing[valid] - total_actual[valid]))

    logger.info("\n" + "=" * 80)
    logger.info("BIAS DIAGNOSTICS")
    logger.info("=" * 80)
    logger.info(f"  Home score bias:   {home_bias:+.2f} pts")
    logger.info(f"  Away score bias:   {away_bias:+.2f} pts")
    logger.info(f"  Margin bias:       {margin_bias:+.2f} pts")
    logger.info(f"  Total bias:        {total_bias:+.2f} pts")
    logger.info(f"  Actual total mean: {actual_total_mean:.1f}")
    logger.info(f"  Pred total mean:   {pred_total_mean:.1f}")
    logger.info(f"  Total MAE:         {total_mae:.2f} pts")

    if market_total_mae is not None:
        logger.info(f"  Market total MAE:  {market_total_mae:.2f} pts")
        logger.info(f"  Market total bias: {market_total_bias:+.2f} pts")

    # Warn if bias is large
    if abs(total_bias) > 2.0:
        logger.warning(f"[WARNING] Total bias of {total_bias:+.2f} exceeds +/- 2.0 threshold!")

    metrics = {
        "home_bias": home_bias,
        "away_bias": away_bias,
        "margin_bias": margin_bias,
        "total_bias": total_bias,
        "actual_total_mean": actual_total_mean,
        "pred_total_mean": pred_total_mean,
        "total_mae": total_mae,
    }
    if market_total_mae is not None and market_total_bias is not None:
        metrics["market_total_mae"] = market_total_mae
        metrics["market_total_bias"] = market_total_bias

    return metrics


def _season_to_dates(season: int) -> tuple[str, str]:
    """Convert a season year to start/end dates.

    Args:
        season: Season year (e.g. 2026 = 2025-11 to 2026-04)

    Returns:
        Tuple of (start_date, end_date) as YYYY-MM-DD strings
    """
    start = f"{season - 1}-11-04"
    end = datetime.now().strftime("%Y-%m-%d")
    return start, end


@click.command()
@click.option(
    "--start-date",
    required=False,
    type=click.DateTime(formats=["%Y-%m-%d"]),
    help="Start date for training data (YYYY-MM-DD)",
)
@click.option(
    "--end-date",
    required=False,
    type=click.DateTime(formats=["%Y-%m-%d"]),
    help="End date for training data (YYYY-MM-DD)",
)
@click.option(
    "--season",
    required=False,
    type=int,
    help="Season year (e.g. 2026). Auto-computes start/end dates.",
)
@click.option(
    "--staging-path",
    default=str(settings.staging_dir),
    type=click.Path(path_type=Path),
    help="Path to staging data directory",
)
@click.option(
    "--output-dir",
    default=str(settings.models_dir),
    type=click.Path(path_type=Path),
    help="Output directory for models",
)
def main(
    start_date: datetime | None,
    end_date: datetime | None,
    season: int | None,
    staging_path: Path,
    output_dir: Path,
) -> None:
    """Train score prediction models."""
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    logger.info("=" * 80)
    logger.info("Score Prediction Model Training")
    logger.info("=" * 80)

    # Resolve dates from --season or --start-date/--end-date
    if season is not None:
        start_str, end_str = _season_to_dates(season)
        logger.info(f"Season {season} -> {start_str} to {end_str}")
    elif start_date is not None and end_date is not None:
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")
    else:
        raise click.UsageError("Provide either --season or both --start-date and --end-date")

    # Build dataset
    df = build_score_features(staging_path, start_str, end_str)

    # Select features (exclude target columns)
    target_cols = [
        "home_score",
        "away_score",
        "margin",
        "total_score",
        "went_over",  # The target from build_totals_dataset
    ]
    feature_cols = [col for col in df.columns if col not in target_cols]

    X = df[feature_cols]
    y_home = df["home_score"]
    y_away = df["away_score"]

    logger.info(f"Features: {len(feature_cols)} columns")
    logger.info(f"Samples: {len(X)} games")

    # Split data
    X_train, X_val, y_train_home, y_val_home = train_test_split(
        X,
        y_home,
        test_size=0.2,
        random_state=42,
    )
    _, _, y_train_away, y_val_away = train_test_split(
        X,
        y_away,
        test_size=0.2,
        random_state=42,
    )

    logger.info(f"Train: {len(X_train)} games")
    logger.info(f"Val:   {len(X_val)} games")

    # Train models
    home_model, away_model = train_score_models(
        X_train,
        X_val,
        y_train_home,
        y_val_home,
        y_train_away,
        y_val_away,
    )

    # Evaluate models
    logger.info("\n" + "=" * 80)
    logger.info("Model Evaluation")
    logger.info("=" * 80)

    home_metrics = evaluate_model(home_model, X_val, y_val_home, "Home Score")
    away_metrics = evaluate_model(away_model, X_val, y_val_away, "Away Score")

    # Compute derived metrics (margin and total)
    import numpy as np

    home_pred = home_model.predict(X_val)
    away_pred = away_model.predict(X_val)
    margin_pred = home_pred - away_pred
    total_pred = home_pred + away_pred

    margin_true = y_val_home - y_val_away
    total_true = y_val_home + y_val_away

    margin_mae = mean_absolute_error(margin_true, margin_pred)
    margin_mse = mean_squared_error(margin_true, margin_pred)
    margin_rmse = np.sqrt(margin_mse)
    total_mae = mean_absolute_error(total_true, total_pred)
    total_mse = mean_squared_error(total_true, total_pred)
    total_rmse = np.sqrt(total_mse)

    logger.info("\nDerived Predictions:")
    logger.info(f"  Margin MAE:  {margin_mae:.2f} points")
    logger.info(f"  Margin RMSE: {margin_rmse:.2f} points")
    logger.info(f"  Total MAE:   {total_mae:.2f} points")
    logger.info(f"  Total RMSE:  {total_rmse:.2f} points")

    # Bias diagnostics
    bias_metrics = diagnose_bias(home_model, away_model, X_val, y_val_home, y_val_away)

    # Save models
    output_dir.mkdir(parents=True, exist_ok=True)

    home_path = output_dir / "home_score_2026.pkl"
    away_path = output_dir / "away_score_2026.pkl"

    with open(home_path, "wb") as f:
        pickle.dump(home_model, f)
    with open(away_path, "wb") as f:
        pickle.dump(away_model, f)

    logger.info("\n[OK] Saved models:")
    logger.info(f"  Home: {home_path}")
    logger.info(f"  Away: {away_path}")

    # Save feature names
    feature_path = output_dir / "score_features.txt"
    feature_path.write_text("\n".join(feature_cols))
    logger.info(f"  Features: {feature_path}")

    # Save enhanced metadata
    metadata = {
        "trained_at": datetime.now().isoformat(),
        "date_range": {"start": start_str, "end": end_str},
        "samples": {
            "total": len(X),
            "train": len(X_train),
            "val": len(X_val),
        },
        "features": len(feature_cols),
        "evaluation": {
            "home_mae": float(home_metrics["mae"]),
            "home_rmse": float(home_metrics["rmse"]),
            "away_mae": float(away_metrics["mae"]),
            "away_rmse": float(away_metrics["rmse"]),
            "margin_mae": float(margin_mae),
            "margin_rmse": float(margin_rmse),
            "total_mae": float(total_mae),
            "total_rmse": float(total_rmse),
        },
        "bias": bias_metrics,
    }
    metadata_path = output_dir / "score_model_metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    logger.info(f"  Metadata: {metadata_path}")

    logger.info("\n" + "=" * 80)
    logger.info("Training Complete")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
