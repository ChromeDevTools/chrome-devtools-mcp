"""Comprehensive spreads model training pipeline.

Trains XGBoost model for NCAA Men's Basketball spreads prediction with:
- Line movement features from streaming odds data
- Bayesian hyperparameter optimization (Optuna)
- Probability calibration for Kelly criterion
- Walk-forward validation with temporal stability checks
- SHAP-based feature selection
- Comprehensive metrics tracking

Usage:
    python scripts/train_spreads_model.py --start-date 2025-12-28 --end-date 2026-02-01
    python scripts/train_spreads_model.py --tune --n-trials 100
    python scripts/train_spreads_model.py --feature-selection --top-k 30
    python scripts/train_spreads_model.py --save-model models/spreads_2026.pkl

Example:
    # Full pipeline with all features
    python scripts/train_spreads_model.py \\
        --start-date 2025-12-28 \\
        --end-date 2026-02-01 \\
        --tune \\
        --n-trials 50 \\
        --feature-selection \\
        --top-k 30 \\
        --save-model models/spreads_final.pkl \\
        --output-dir data/outputs/results/spreads_training
"""

import logging
import pickle
from datetime import date, datetime
from pathlib import Path
from typing import Any

import click
import pandas as pd
import xgboost as xgb

from sports_betting_edge.config.logging import configure_logging
from sports_betting_edge.services.feature_engineering import FeatureEngineer
from sports_betting_edge.services.feature_selection import SHAPFeatureSelector
from sports_betting_edge.services.hyperparameter_tuning import (
    XGBoostHyperparameterTuner,
)
from sports_betting_edge.services.model_calibration import (
    calibrate_model,
    compare_calibration,
    evaluate_calibration,
)
from sports_betting_edge.services.walk_forward_validation import (
    WalkForwardValidator,
)

logger = logging.getLogger(__name__)


def load_training_data(
    engineer: FeatureEngineer,
    start_date: date,
    end_date: date,
    season: int = 2026,
) -> tuple[pd.DataFrame, pd.Series]:
    """Load and prepare training data.

    Args:
        engineer: Feature engineer
        start_date: Start date for training data
        end_date: End date for training data
        season: KenPom season year

    Returns:
        Tuple of (X, y) features and labels
    """
    logger.info(f"Loading training data from {start_date} to {end_date}...")

    # Build dataset using staging layer
    X, y = engineer.build_spreads_dataset(
        start_date=start_date,
        end_date=end_date,
        season=season,
    )

    if len(X) == 0:
        logger.warning("No training data found")
        return X, y

    logger.info(f"Loaded {len(X)} samples with {len(X.columns)} features")
    logger.info(f"Cover rate: {y.mean():.2%}")

    return X, y


def tune_hyperparameters(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    n_trials: int = 100,
    output_dir: Path | None = None,
) -> dict[str, Any]:
    """Run hyperparameter optimization.

    Args:
        X_train: Training features
        y_train: Training labels
        X_val: Validation features
        y_val: Validation labels
        n_trials: Number of Optuna trials
        output_dir: Optional directory to save study results

    Returns:
        Best hyperparameters
    """
    logger.info(f"Starting hyperparameter tuning with {n_trials} trials...")

    tuner = XGBoostHyperparameterTuner(
        X_train=X_train,
        y_train=y_train,
        X_val=X_val,
        y_val=y_val,
        n_trials=n_trials,
        study_name="spreads_tuning",
    )

    best_params = tuner.optimize()

    # Save study if output directory provided
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        tuner.save_study(output_dir / "optuna_study.pkl")
        tuner.plot_optimization_history(output_dir / "optimization_history.html")
        tuner.plot_param_importances(output_dir / "param_importances.html")

        # Save tuning summary
        summary_df = tuner.get_tuning_summary()
        summary_df.to_csv(output_dir / "tuning_summary.csv", index=False)
        logger.info(f"Saved tuning results to {output_dir}")

    return best_params


def train_and_calibrate(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_val: pd.DataFrame,
    y_val: pd.Series,
    params: dict[str, Any],
    use_calibration: bool = True,
) -> tuple[Any, pd.DataFrame | None]:
    """Train model and apply calibration.

    Args:
        X_train: Training features
        y_train: Training labels
        X_val: Validation features
        y_val: Validation labels
        params: XGBoost parameters
        use_calibration: Whether to calibrate probabilities

    Returns:
        Tuple of (model, calibration_comparison_df)
    """
    logger.info("Training XGBoost model...")

    # Add fixed parameters
    model_params = {
        **params,
        "objective": "binary:logistic",
        "eval_metric": "logloss",
        "random_state": 42,
        "early_stopping_rounds": 20,
    }

    model = xgb.XGBClassifier(**model_params)
    model.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        verbose=False,
    )

    logger.info(f"Best iteration: {model.best_iteration}")

    if use_calibration:
        logger.info("Calibrating probabilities...")

        # Get uncalibrated predictions
        y_val_proba_uncal = model.predict_proba(X_val)[:, 1]

        # Calibrate
        calibrated_model = calibrate_model(model, X_val, y_val, method="isotonic")

        # Get calibrated predictions
        y_val_proba_cal = calibrated_model.predict_proba(X_val)[:, 1]

        # Compare
        comparison_df = compare_calibration(y_val, y_val_proba_uncal, y_val_proba_cal)

        logger.info("Calibration complete")
        return calibrated_model, comparison_df

    return model, None


def select_features(
    model: Any,
    X_train: pd.DataFrame,
    X_val: pd.DataFrame,
    method: str = "importance",
    top_k: int = 30,
    output_dir: Path | None = None,
) -> list[str]:
    """Perform SHAP-based feature selection.

    Args:
        model: Trained model
        X_train: Training features
        X_val: Validation features
        method: Selection method ("importance", "cumulative", "correlation")
        top_k: Number of features to select
        output_dir: Optional directory to save SHAP results

    Returns:
        List of selected feature names
    """
    logger.info("Running SHAP-based feature selection...")

    selector = SHAPFeatureSelector(
        model=model,
        X_train=X_train,
        X_val=X_val,
        background_samples=100,
    )

    # Generate reports
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        selector.generate_summary_report(output_dir / "shap_summary.json")
        selector.plot_feature_importance(
            top_k=top_k, output_path=output_dir / "feature_importance.png"
        )
        selector.plot_shap_summary(output_path=output_dir / "shap_summary.png")

    # Select features
    selected_features = selector.select_features(
        method=method,
        top_k=top_k if method == "importance" else None,  # type: ignore[arg-type]
    )

    logger.info(f"Selected {len(selected_features)} features")
    return selected_features


def run_walk_forward_validation(
    engineer: FeatureEngineer,
    params: dict[str, Any],
    start_date: date,
    end_date: date,
    output_dir: Path | None = None,
) -> tuple[pd.DataFrame, WalkForwardValidator]:
    """Run walk-forward validation.

    Args:
        engineer: Feature engineer
        params: Model parameters
        start_date: Start date for validation
        end_date: End date for validation
        output_dir: Optional directory to save results

    Returns:
        Tuple of (DataFrame with validation results, WalkForwardValidator instance)
    """
    logger.info("Running walk-forward validation...")

    validator = WalkForwardValidator(
        train_window_days=30,
        test_window_days=7,
        step_days=7,
        window_type="rolling",
    )

    results_df = validator.validate_spreads(
        engineer=engineer,
        model_params=params,
        start_date=start_date,
        end_date=end_date,
        use_calibration=True,
    )

    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        results_df.to_csv(output_dir / "walkforward_results.csv", index=False)
        logger.info(f"Saved walk-forward results to {output_dir}")

    return results_df, validator


@click.command()
@click.option(
    "--start-date",
    type=click.DateTime(formats=["%Y-%m-%d"]),
    required=True,
    help="Start date for training data (YYYY-MM-DD)",
)
@click.option(
    "--end-date",
    type=click.DateTime(formats=["%Y-%m-%d"]),
    required=True,
    help="End date for training data (YYYY-MM-DD)",
)
@click.option(
    "--tune/--no-tune",
    default=False,
    help="Run hyperparameter tuning",
)
@click.option(
    "--n-trials",
    type=int,
    default=50,
    help="Number of Optuna trials (default: 50)",
)
@click.option(
    "--feature-selection/--no-feature-selection",
    default=False,
    help="Run SHAP feature selection",
)
@click.option(
    "--top-k",
    type=int,
    default=30,
    help="Number of features to select (default: 30)",
)
@click.option(
    "--walkforward/--no-walkforward",
    default=True,
    help="Run walk-forward validation (default: True)",
)
@click.option(
    "--save-model",
    type=click.Path(),
    help="Path to save final trained model",
)
@click.option(
    "--output-dir",
    type=click.Path(),
    default="data/outputs/results/spreads_training",
    help="Output directory for results",
)
@click.option(
    "--staging-path",
    type=click.Path(exists=True),
    default="data/staging",
    help="Path to staging data directory",
)
@click.option(
    "--season",
    type=int,
    default=2026,
    help="KenPom season year",
)
def main(
    start_date: datetime,
    end_date: datetime,
    tune: bool,
    n_trials: int,
    feature_selection: bool,
    top_k: int,
    walkforward: bool,
    save_model: str | None,
    output_dir: str,
    staging_path: str,
    season: int,
) -> None:
    """Comprehensive spreads model training pipeline."""
    configure_logging()

    logger.info("=== Spreads Model Training Pipeline ===")
    logger.info(f"Training period: {start_date.date()} to {end_date.date()}")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Initialize feature engineer with staging layer
    engineer = FeatureEngineer(staging_path=staging_path)

    # Load training data
    X_full, y_full = load_training_data(
        engineer=engineer,
        start_date=start_date.date(),
        end_date=end_date.date(),
        season=season,
    )

    # Train/val split (80/20)
    split_idx = int(len(X_full) * 0.8)
    X_train = X_full.iloc[:split_idx]
    y_train = y_full.iloc[:split_idx]
    X_val = X_full.iloc[split_idx:]
    y_val = y_full.iloc[split_idx:]

    logger.info(f"Train: {len(X_train)}, Val: {len(X_val)}")

    # Hyperparameter tuning
    if tune:
        best_params = tune_hyperparameters(
            X_train, y_train, X_val, y_val, n_trials, output_path / "tuning"
        )
    else:
        # Use default parameters
        logger.info("Using default parameters (no tuning)")
        best_params = {
            "n_estimators": 200,
            "max_depth": 6,
            "learning_rate": 0.1,
            "min_child_weight": 1,
            "gamma": 0.0,
            "reg_alpha": 0.0,
            "reg_lambda": 1.0,
            "subsample": 1.0,
            "colsample_bytree": 1.0,
            "colsample_bylevel": 1.0,
        }

    # Feature selection (must run before calibration - SHAP doesn't support calibrated models)
    if feature_selection:
        # Train uncalibrated model for feature selection
        logger.info("Training uncalibrated model for feature selection...")
        uncal_model, _ = train_and_calibrate(
            X_train, y_train, X_val, y_val, best_params, use_calibration=False
        )

        selected_features = select_features(
            uncal_model,
            X_train,
            X_val,
            method="importance",
            top_k=top_k,
            output_dir=output_path / "feature_selection",
        )

        # Retrain with selected features and calibrate
        logger.info("Retraining with selected features...")
        X_train_selected = X_train[selected_features]
        X_val_selected = X_val[selected_features]

        model, calibration_df = train_and_calibrate(
            X_train_selected,
            y_train,
            X_val_selected,
            y_val,
            best_params,
            use_calibration=True,
        )

        # Save selected features list
        with open(output_path / "selected_features.txt", "w") as f:
            for feature in selected_features:
                f.write(f"{feature}\n")
    else:
        # Train and calibrate with all features
        model, calibration_df = train_and_calibrate(
            X_train, y_train, X_val, y_val, best_params, use_calibration=True
        )

    if calibration_df is not None:
        calibration_df.to_csv(output_path / "calibration_comparison.csv", index=False)

    # Walk-forward validation
    if walkforward:
        wf_results, validator = run_walk_forward_validation(
            engineer=engineer,
            params=best_params,
            start_date=start_date.date(),
            end_date=end_date.date(),
            output_dir=output_path / "walkforward",
        )

        if len(wf_results) > 0:
            logger.info("\n=== Walk-Forward Validation Summary ===")
            logger.info(f"Mean Test AUC: {wf_results['test_auc'].mean():.4f}")
            logger.info(f"Std Test AUC: {wf_results['test_auc'].std():.4f}")
        else:
            date_range_days = (end_date.date() - start_date.date()).days
            min_days = validator.train_window_days + validator.test_window_days + 1
            logger.warning(
                "\n=== Walk-Forward Validation Skipped ===\n"
                "Date range too short for configured window sizes:\n"
                f"  - Date range: {start_date.date()} to {end_date.date()} "
                f"({date_range_days} days)\n"
                f"  - Required: train_window ({validator.train_window_days} days) + "
                f"test_window ({validator.test_window_days} days) + "
                f"1 day gap = {min_days} days minimum\n"
                "Either extend the date range or reduce window sizes."
            )

    # Evaluate final model
    logger.info("\n=== Final Model Evaluation ===")
    y_val_proba = model.predict_proba(X_val)[:, 1]
    from sklearn.metrics import log_loss, roc_auc_score

    val_auc = roc_auc_score(y_val, y_val_proba)
    val_logloss = log_loss(y_val, y_val_proba)

    logger.info(f"Validation AUC: {val_auc:.4f}")
    logger.info(f"Validation LogLoss: {val_logloss:.4f}")

    # Evaluate calibration
    cal_metrics = evaluate_calibration(y_val, y_val_proba)
    logger.info(f"Brier Score: {cal_metrics['brier_score']:.4f}")
    logger.info(f"ECE: {cal_metrics['expected_calibration_error']:.4f}")

    # Save final model
    if save_model:
        model_path = Path(save_model)
        model_path.parent.mkdir(parents=True, exist_ok=True)

        with open(model_path, "wb") as f:
            pickle.dump(model, f)

        logger.info(f"Saved final model to {model_path}")

        # Save metadata
        metadata = {
            "training_period": {
                "start": start_date.date().isoformat(),
                "end": end_date.date().isoformat(),
            },
            "n_samples": len(X_full),
            "n_features": len(X_train.columns),
            "hyperparameters": best_params,
            "validation_metrics": {
                "auc": val_auc,
                "logloss": val_logloss,
                "brier_score": cal_metrics["brier_score"],
                "ece": cal_metrics["expected_calibration_error"],
            },
        }

        import json

        with open(model_path.parent / "model_metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

    logger.info("\n=== Training Pipeline Complete ===")
    logger.info(f"Results saved to: {output_path}")


if __name__ == "__main__":
    main()
