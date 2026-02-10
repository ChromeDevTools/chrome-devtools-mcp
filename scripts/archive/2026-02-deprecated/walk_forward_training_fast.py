#!/usr/bin/env python3
"""Walk-Forward Training with date-enhanced datasets."""

from datetime import timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, log_loss, roc_auc_score

# Configuration
TRAINING_WINDOW_DAYS = 21
VALIDATION_WINDOW_DAYS = 7
STEP_SIZE_DAYS = 7
MIN_GAMES_PER_WINDOW = 50

MODEL_PARAMS = {
    "n_estimators": 150,
    "max_depth": 3,
    "learning_rate": 0.05,
    "min_child_weight": 5,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "objective": "binary:logistic",
    "eval_metric": "logloss",
    "random_state": 42,
    "use_label_encoder": False,
}

print("=" * 80)
print("WALK-FORWARD VALIDATION TRAINING")
print("=" * 80)

# Load datasets with dates
spreads_path = Path("data/ml/spreads_with_dates_2026.parquet")
totals_path = Path("data/ml/totals_with_dates_2026.parquet")

print("\n[LOADING DATASETS]")
spreads_df = pd.read_parquet(spreads_path)
totals_df = pd.read_parquet(totals_path)

spreads_df["game_date"] = pd.to_datetime(spreads_df["game_date"])
totals_df["game_date"] = pd.to_datetime(totals_df["game_date"])

spreads_min = spreads_df["game_date"].min().date()
spreads_max = spreads_df["game_date"].max().date()
totals_min = totals_df["game_date"].min().date()
totals_max = totals_df["game_date"].max().date()
print(f"Spreads: {len(spreads_df)} games | {spreads_min} to {spreads_max}")
print(f"Totals: {len(totals_df)} games | {totals_min} to {totals_max}")


def create_walk_forward_splits(df):
    """Create temporal train/validation splits."""
    df = df.sort_values("game_date")
    min_date = df["game_date"].min()
    max_date = df["game_date"].max()

    splits = []
    val_start = min_date + timedelta(days=TRAINING_WINDOW_DAYS)

    while True:
        val_end = val_start + timedelta(days=VALIDATION_WINDOW_DAYS)
        if val_end > max_date:
            break

        train_start = val_start - timedelta(days=TRAINING_WINDOW_DAYS)
        train_mask = (df["game_date"] >= train_start) & (df["game_date"] < val_start)
        val_mask = (df["game_date"] >= val_start) & (df["game_date"] < val_end)

        train_df = df[train_mask]
        val_df = df[val_mask]

        if len(train_df) >= MIN_GAMES_PER_WINDOW and len(val_df) >= 10:
            splits.append((train_df, val_df, f"{val_start.date()}_to_{val_end.date()}"))

        val_start += timedelta(days=STEP_SIZE_DAYS)

    return splits


def train_and_evaluate(splits, target_col="target"):
    """Train model on each window and aggregate results."""
    all_preds = []
    all_probs = []
    all_actuals = []
    results = []

    for i, (train_df, val_df, period) in enumerate(splits, 1):
        print(f"\n[Window {i}/{len(splits)}] {period}")
        print(f"  Train: {len(train_df)} games")
        print(f"  Val:   {len(val_df)} games")

        y_train = train_df[target_col]
        y_val = val_df[target_col]

        feature_cols = [col for col in train_df.columns if col not in [target_col, "game_date"]]

        X_train = train_df[feature_cols].fillna(0)
        X_val = val_df[feature_cols].fillna(0)

        print(f"  Features: {len(feature_cols)}")

        model = xgb.XGBClassifier(**MODEL_PARAMS)
        model.fit(X_train, y_train, verbose=False)

        y_pred = model.predict(X_val)
        y_proba = model.predict_proba(X_val)[:, 1]

        acc = accuracy_score(y_val, y_pred)
        try:
            auc = roc_auc_score(y_val, y_proba)
            ll = log_loss(y_val, y_proba)
        except Exception:
            auc, ll = 0.5, np.nan

        print(f"  Accuracy: {acc:.4f} | AUC: {auc:.4f} | LogLoss: {ll:.4f}")

        all_preds.extend(y_pred)
        all_probs.extend(y_proba)
        all_actuals.extend(y_val)

        results.append(
            {
                "period": period,
                "train_games": len(train_df),
                "val_games": len(val_df),
                "accuracy": acc,
                "auc": auc,
                "logloss": ll,
            }
        )

    overall_acc = accuracy_score(all_actuals, all_preds)
    overall_auc = roc_auc_score(all_actuals, all_probs)
    overall_ll = log_loss(all_actuals, all_probs)

    return {
        "overall_accuracy": overall_acc,
        "overall_auc": overall_auc,
        "overall_logloss": overall_ll,
        "window_results": results,
    }


# Train spreads model
print("\n" + "=" * 80)
print("SPREADS MODEL - WALK-FORWARD VALIDATION")
print("=" * 80)

spreads_splits = create_walk_forward_splits(spreads_df)

if len(spreads_splits) == 0:
    print("\n[WARN] Not enough data for walk-forward, using 80/20 split")
    split_idx = int(len(spreads_df) * 0.8)
    train_df = spreads_df.iloc[:split_idx]
    val_df = spreads_df.iloc[split_idx:]
    spreads_splits = [(train_df, val_df, "single_split")]

print(f"\nCreated {len(spreads_splits)} validation windows")
spreads_results = train_and_evaluate(spreads_splits)

# Train totals model
print("\n" + "=" * 80)
print("TOTALS MODEL - WALK-FORWARD VALIDATION")
print("=" * 80)

totals_splits = create_walk_forward_splits(totals_df)

if len(totals_splits) == 0:
    print("\n[WARN] Not enough data for walk-forward, using 80/20 split")
    split_idx = int(len(totals_df) * 0.8)
    train_df = totals_df.iloc[:split_idx]
    val_df = totals_df.iloc[split_idx:]
    totals_splits = [(train_df, val_df, "single_split")]

print(f"\nCreated {len(totals_splits)} validation windows")
totals_results = train_and_evaluate(totals_splits)

# Final model training on all data
print("\n" + "=" * 80)
print("TRAINING FINAL MODELS ON ALL DATA")
print("=" * 80)

print("\n[Spreads Model]")
y = spreads_df["target"]
X = spreads_df[[col for col in spreads_df.columns if col not in ["target", "game_date"]]].fillna(0)

final_spreads = xgb.XGBClassifier(**MODEL_PARAMS)
final_spreads.fit(X, y, verbose=False)

spreads_model_path = Path("data/models/spreads_model.json")
final_spreads.save_model(str(spreads_model_path))
print(f"  [SAVED] {spreads_model_path}")

print("\n[Totals Model]")
y = totals_df["target"]
X = totals_df[[col for col in totals_df.columns if col not in ["target", "game_date"]]].fillna(0)

final_totals = xgb.XGBClassifier(**MODEL_PARAMS)
final_totals.fit(X, y, verbose=False)

totals_model_path = Path("data/models/totals_model.json")
final_totals.save_model(str(totals_model_path))
print(f"  [SAVED] {totals_model_path}")

# Summary
print("\n" + "=" * 80)
print("WALK-FORWARD VALIDATION SUMMARY")
print("=" * 80)

print("\n[SPREADS MODEL]")
print(f"  Overall Accuracy: {spreads_results['overall_accuracy']:.4f}")
print(f"  Overall AUC:      {spreads_results['overall_auc']:.4f}")
print(f"  Overall LogLoss:  {spreads_results['overall_logloss']:.4f}")
print(f"  Validation windows: {len(spreads_results['window_results'])}")

print("\n[TOTALS MODEL]")
print(f"  Overall Accuracy: {totals_results['overall_accuracy']:.4f}")
print(f"  Overall AUC:      {totals_results['overall_auc']:.4f}")
print(f"  Overall LogLoss:  {totals_results['overall_logloss']:.4f}")
print(f"  Validation windows: {len(totals_results['window_results'])}")

print("\n" + "=" * 80)
print("PERFORMANCE ANALYSIS")
print("=" * 80)

if spreads_results["overall_accuracy"] > 0.52:
    print("\n✅ SPREADS MODEL: PROFITABLE")
    print(f"   Accuracy: {spreads_results['overall_accuracy']:.2%} (above 52% threshold)")
    print(f"   Expected ROI: ~{(spreads_results['overall_accuracy'] - 0.524) * 100:.1f}% per bet")
else:
    print(f"\n⚠️  SPREADS MODEL: {spreads_results['overall_accuracy']:.2%} (below 52% threshold)")

if totals_results["overall_accuracy"] > 0.52:
    print("\n✅ TOTALS MODEL: PROFITABLE")
    print(f"   Accuracy: {totals_results['overall_accuracy']:.2%} (above 52% threshold)")
    print(f"   Expected ROI: ~{(totals_results['overall_accuracy'] - 0.524) * 100:.1f}% per bet")
else:
    print(f"\n⚠️  TOTALS MODEL: {totals_results['overall_accuracy']:.2%} (below 52% threshold)")

print("\n[MODELS READY FOR DEPLOYMENT]")
print("Models trained on full dataset and saved.")
print("Note: These models expect 30+ features including Four Factors.")
print("For tonight, recommend using KenPom-based predictions (simpler approach).")
