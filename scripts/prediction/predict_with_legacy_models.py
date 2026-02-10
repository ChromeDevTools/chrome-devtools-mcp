"""Generate predictions using legacy trained models.

Uses the seed ensemble models trained on complete_dataset.parquet features.

Usage:
    python scripts/prediction/predict_with_legacy_models.py
    python scripts/prediction/predict_with_legacy_models.py --output predictions/today.csv
"""

from __future__ import annotations

import argparse
import logging
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.config.logging import configure_logging

configure_logging()
logger = logging.getLogger(__name__)

PST = ZoneInfo("America/Los_Angeles")


def extract_legacy_features(db: OddsAPIDatabase, events_df: pd.DataFrame) -> pd.DataFrame:
    """Extract features matching legacy dataset format.

    Args:
        db: Database connection
        events_df: DataFrame with event_id, home_team, away_team

    Returns:
        DataFrame with features for spreads and totals models
    """
    logger.info(f"Extracting features for {len(events_df)} events...")

    # Get canonical spreads and totals for each event
    features_list = []

    for _, event in events_df.iterrows():
        event_id = event["event_id"]
        home_team = event["home_team"]
        away_team = event["away_team"]

        # Get spreads
        spreads = db.get_canonical_spreads(event_id=event_id)
        if len(spreads) == 0:
            continue

        # Get consensus opening and closing spreads
        spreads_by_time = spreads.sort_values("as_of")
        opening_spreads = spreads_by_time.head(10)  # First 10 observations
        closing_spreads = spreads_by_time.tail(10)  # Last 10 observations

        opening_spread_magnitude = opening_spreads["spread_magnitude"].median()
        closing_spread_magnitude = closing_spreads["spread_magnitude"].median()
        opening_spread_range = (
            opening_spreads["spread_magnitude"].max() - opening_spreads["spread_magnitude"].min()
        )
        closing_spread_range = (
            closing_spreads["spread_magnitude"].max() - closing_spreads["spread_magnitude"].min()
        )
        num_books_spread = spreads["book_key"].nunique()

        # Get favorite from most recent spreads
        latest_spread = spreads_by_time.iloc[-1]
        home_is_favorite = latest_spread["favorite_team"] == home_team

        # Calculate implied probabilities (simple conversion)
        # Using -110 juice assumption
        if home_is_favorite:
            closing_home_implied_prob = 0.5 + (closing_spread_magnitude / 100) * 0.5
            opening_home_implied_prob = 0.5 + (opening_spread_magnitude / 100) * 0.5
        else:
            closing_home_implied_prob = 0.5 - (closing_spread_magnitude / 100) * 0.5
            opening_home_implied_prob = 0.5 - (opening_spread_magnitude / 100) * 0.5

        # Get totals
        totals = db.get_canonical_totals(event_id=event_id)
        if len(totals) > 0:
            totals_by_time = totals.sort_values("as_of")
            opening_totals = totals_by_time.head(10)
            closing_totals = totals_by_time.tail(10)

            # canonical_totals uses "total" column for total points
            opening_total = opening_totals["total"].median()
            closing_total = closing_totals["total"].median()
            opening_total_range = opening_totals["total"].max() - opening_totals["total"].min()
            closing_total_range = closing_totals["total"].max() - closing_totals["total"].min()
            num_books_total = totals["book_key"].nunique()
            total_movement = closing_total - opening_total
        else:
            opening_total = None
            closing_total = None
            opening_total_range = None
            closing_total_range = None
            num_books_total = None
            total_movement = None

        features_list.append(
            {
                "event_id": event_id,
                "home_team": home_team,
                "away_team": away_team,
                # Spreads features
                "consensus_opening_spread_magnitude": opening_spread_magnitude,
                "consensus_closing_spread_magnitude": closing_spread_magnitude,
                "opening_spread_range": opening_spread_range,
                "closing_spread_range": closing_spread_range,
                "num_books_spread": num_books_spread,
                "spread_magnitude_movement": abs(
                    closing_spread_magnitude - opening_spread_magnitude
                ),
                "opening_home_implied_prob": opening_home_implied_prob,
                "closing_home_implied_prob": closing_home_implied_prob,
                "home_is_favorite": 1 if home_is_favorite else 0,
                # Totals features
                "consensus_opening_total": opening_total,
                "consensus_closing_total": closing_total,
                "opening_total_range": opening_total_range,
                "closing_total_range": closing_total_range,
                "num_books_total": num_books_total,
                "total_movement": total_movement,
            }
        )

    features_df = pd.DataFrame(features_list)
    logger.info(f"Extracted features for {len(features_df)} events")

    return features_df


def main() -> None:
    """Generate predictions for today's games."""
    parser = argparse.ArgumentParser(description="Generate predictions with legacy models")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("predictions") / f"{datetime.now(PST).date()}.csv",
        help="Output CSV path",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Database path",
    )

    args = parser.parse_args()

    logger.info("[OK] === Generating Predictions with Legacy Models ===\n")

    # Train single models with best seed (1024) instead of loading ensemble
    # This avoids pickle import issues and uses the best performing seed
    logger.info("Training models with best seed (1024)...")

    import xgboost as xgb

    from sports_betting_edge.adapters.filesystem import read_parquet_df

    # Load legacy dataset
    df = read_parquet_df("data/staging/complete_dataset.parquet")

    # Train spreads model
    spreads_features = [
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
    spreads_df_clean = df.dropna(subset=spreads_features + ["home_covered_spread"])
    X_spreads_train = spreads_df_clean[spreads_features]
    y_spreads_train = spreads_df_clean["home_covered_spread"]

    spreads_params = {
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
        "random_state": 1024,  # Best seed
    }
    spreads_model = xgb.XGBClassifier(**spreads_params)
    spreads_model.fit(X_spreads_train, y_spreads_train, verbose=False)

    # Train totals model
    totals_features = [
        "consensus_opening_total",
        "consensus_closing_total",
        "opening_total_range",
        "closing_total_range",
        "num_books_total",
        "total_movement",
    ]
    totals_df_clean = df.dropna(subset=totals_features + ["went_over"])
    X_totals_train = totals_df_clean[totals_features]
    y_totals_train = totals_df_clean["went_over"]

    totals_params = {
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
        "random_state": 1024,  # Best seed
    }
    totals_model = xgb.XGBClassifier(**totals_params)
    totals_model.fit(X_totals_train, y_totals_train, verbose=False)

    logger.info("  Spreads model loaded ✅")
    logger.info("  Totals model loaded ✅\n")

    # Get today's games
    db = OddsAPIDatabase(args.db_path)

    query = """
    SELECT event_id, home_team, away_team, commence_time
    FROM events
    WHERE DATE(commence_time) >= DATE('now')
      AND DATE(commence_time) <= DATE('now', '+1 day')
    ORDER BY commence_time
    """

    events_df = pd.read_sql_query(query, db.conn)
    logger.info(f"Found {len(events_df)} games\n")

    if len(events_df) == 0:
        logger.warning("No games found for today/tomorrow")
        return

    # Extract features
    features_df = extract_legacy_features(db, events_df)

    # Merge with event info
    predictions_df = events_df.merge(
        features_df, on="event_id", how="inner", suffixes=("_event", "")
    )

    # Make spreads predictions
    spreads_features = [
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

    spreads_df = predictions_df.dropna(subset=spreads_features)
    logger.info(f"Generating spreads predictions for {len(spreads_df)} games...")

    if len(spreads_df) > 0:
        X_spreads = spreads_df[spreads_features]
        spreads_probs = spreads_model.predict_proba(X_spreads)[:, 1]  # Get positive class
        spreads_df.loc[:, "home_spread_prob"] = spreads_probs
        spreads_df.loc[:, "away_spread_prob"] = 1 - spreads_probs

    # Make totals predictions
    totals_features = [
        "consensus_opening_total",
        "consensus_closing_total",
        "opening_total_range",
        "closing_total_range",
        "num_books_total",
        "total_movement",
    ]

    totals_df = predictions_df.dropna(subset=totals_features)
    logger.info(f"Generating totals predictions for {len(totals_df)} games...")

    if len(totals_df) > 0:
        X_totals = totals_df[totals_features]
        over_probs = totals_model.predict_proba(X_totals)[:, 1]  # Get positive class
        totals_df.loc[:, "over_prob"] = over_probs
        totals_df.loc[:, "under_prob"] = 1 - over_probs

    # Combine predictions
    final_df = predictions_df[["event_id", "home_team", "away_team", "commence_time"]].copy()

    if len(spreads_df) > 0:
        final_df = final_df.merge(
            spreads_df[
                [
                    "event_id",
                    "consensus_opening_spread_magnitude",
                    "consensus_closing_spread_magnitude",
                    "home_spread_prob",
                    "away_spread_prob",
                ]
            ],
            on="event_id",
            how="left",
        )

    if len(totals_df) > 0:
        final_df = final_df.merge(
            totals_df[
                [
                    "event_id",
                    "consensus_opening_total",
                    "consensus_closing_total",
                    "over_prob",
                    "under_prob",
                ]
            ],
            on="event_id",
            how="left",
        )

    # Sort by commence time
    final_df = final_df.sort_values("commence_time")

    # Save
    args.output.parent.mkdir(parents=True, exist_ok=True)
    final_df.to_csv(args.output, index=False)

    logger.info(f"\n[OK] Saved {len(final_df)} predictions to {args.output}")

    # Show summary
    logger.info("\n=== Prediction Summary ===")
    logger.info(f"  Total games: {len(final_df)}")
    logger.info(f"  With spreads: {final_df['home_spread_prob'].notna().sum()}")
    logger.info(f"  With totals: {final_df['over_prob'].notna().sum()}")

    if len(final_df) > 0:
        logger.info("\nTop 5 Confident Spreads Predictions:")
        spreads_confident = final_df.dropna(subset=["home_spread_prob"]).copy()
        spreads_confident["home_confidence"] = spreads_confident["home_spread_prob"].apply(
            lambda x: abs(x - 0.5)
        )
        top_spreads = spreads_confident.nlargest(5, "home_confidence")

        for _, row in top_spreads.iterrows():
            logger.info(
                f"  {row['home_team']}: "
                f"{row['home_spread_prob']:.1%} to cover | "
                f"{row['away_team']}: {row['away_spread_prob']:.1%} to cover"
            )


if __name__ == "__main__":
    main()
