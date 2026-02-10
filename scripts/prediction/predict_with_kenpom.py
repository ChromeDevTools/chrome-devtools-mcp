"""Generate predictions with KenPom FanMatch data and score models.

Combines:
- Opening/closing odds from database
- Probability predictions from trained models
- KenPom FanMatch predicted scores and spreads
- Score regression model predictions (if available)

Usage:
    python scripts/prediction/predict_with_kenpom.py
    python scripts/prediction/predict_with_kenpom.py --output predictions/today.csv
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.adapters.kenpom import KenPomAdapter
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
        opening_spreads = spreads_by_time.head(10)
        closing_spreads = spreads_by_time.tail(10)

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


async def fetch_kenpom_fanmatch(game_date: str, events_df: pd.DataFrame) -> pd.DataFrame:
    """Fetch KenPom FanMatch predictions for games on specific date.

    Args:
        game_date: Date in YYYY-MM-DD format
        events_df: DataFrame with home_team, away_team

    Returns:
        DataFrame with KenPom predictions merged by team names
    """
    logger.info(f"Fetching KenPom FanMatch predictions for {game_date}...")

    kenpom = KenPomAdapter()
    try:
        fanmatch_games = await kenpom.get_fanmatch(game_date)
        logger.info(f"  Received {len(fanmatch_games)} FanMatch predictions")
    except Exception as e:
        logger.warning(f"  Failed to fetch FanMatch data: {e}")
        return pd.DataFrame()
    finally:
        await kenpom.close()

    if len(fanmatch_games) == 0:
        return pd.DataFrame()

    # Parse FanMatch data
    fanmatch_list = []
    for game in fanmatch_games:
        home_pred = game.get("HomePred")
        visitor_pred = game.get("VisitorPred")

        fanmatch_list.append(
            {
                "home": game.get("Home"),
                "visitor": game.get("Visitor"),
                "kenpom_home_pred": home_pred,
                "kenpom_visitor_pred": visitor_pred,
                "kenpom_home_wp": game.get("HomeWP"),
                "kenpom_predicted_total": (
                    home_pred + visitor_pred if home_pred and visitor_pred else None
                ),
                "kenpom_predicted_spread": (
                    home_pred - visitor_pred if home_pred and visitor_pred else None
                ),
            }
        )

    fanmatch_df = pd.DataFrame(fanmatch_list)

    # Match with our events using team name mappings
    # KenPom uses short names like "Duke", we use "Duke Blue Devils"
    matched = []
    for _, event in events_df.iterrows():
        our_home = event["home_team"]
        our_away = event["away_team"]

        # Try to find matching FanMatch game
        for _, fm in fanmatch_df.iterrows():
            kp_home = fm["home"]
            kp_visitor = fm["visitor"]

            # Skip if team names are None
            if not kp_home or not kp_visitor:
                continue

            # Match if KenPom name is contained in our full name
            # Example: "Duke" in "Duke Blue Devils"
            home_match = kp_home in our_home or our_home in kp_home
            away_match = kp_visitor in our_away or our_away in kp_visitor

            if home_match and away_match:
                matched.append(
                    {
                        "home_team": our_home,
                        "away_team": our_away,
                        "kenpom_predicted_home_score": fm["kenpom_home_pred"],
                        "kenpom_predicted_away_score": fm["kenpom_visitor_pred"],
                        "kenpom_predicted_spread": fm["kenpom_predicted_spread"],
                        "kenpom_predicted_total": fm["kenpom_predicted_total"],
                        "kenpom_home_wp": fm["kenpom_home_wp"],
                    }
                )
                break

    matched_df = pd.DataFrame(matched)
    logger.info(f"  Matched {len(matched_df)} games with our events")

    return matched_df


async def main_async(args: argparse.Namespace) -> None:
    """Main async function to generate predictions."""
    logger.info("[OK] === Generating Predictions with KenPom Data ===\n")

    # Train models
    logger.info("Training models with best seed (1024)...")

    import xgboost as xgb

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
        "random_state": 1024,
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
        "random_state": 1024,
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

    # Fetch KenPom FanMatch predictions
    today = datetime.now(PST).date().isoformat()
    kenpom_df = await fetch_kenpom_fanmatch(today, events_df)

    # Merge KenPom predictions
    if len(kenpom_df) > 0:
        predictions_df = predictions_df.merge(kenpom_df, on=["home_team", "away_team"], how="left")

    # Make spreads predictions
    spreads_df = predictions_df.dropna(subset=spreads_features)
    logger.info(f"Generating spreads predictions for {len(spreads_df)} games...")

    if len(spreads_df) > 0:
        X_spreads = spreads_df[spreads_features]
        spreads_probs = spreads_model.predict_proba(X_spreads)[:, 1]
        spreads_df.loc[:, "home_spread_prob"] = spreads_probs
        spreads_df.loc[:, "away_spread_prob"] = 1 - spreads_probs

    # Make totals predictions
    totals_df = predictions_df.dropna(subset=totals_features)
    logger.info(f"Generating totals predictions for {len(totals_df)} games...")

    if len(totals_df) > 0:
        X_totals = totals_df[totals_features]
        over_probs = totals_model.predict_proba(X_totals)[:, 1]
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

    # Add KenPom columns if available
    if len(kenpom_df) > 0:
        final_df = final_df.merge(
            kenpom_df[
                [
                    "home_team",
                    "away_team",
                    "kenpom_predicted_home_score",
                    "kenpom_predicted_away_score",
                    "kenpom_predicted_spread",
                    "kenpom_predicted_total",
                    "kenpom_home_wp",
                ]
            ],
            on=["home_team", "away_team"],
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
    if len(kenpom_df) > 0:
        logger.info(f"  With KenPom: {final_df['kenpom_predicted_spread'].notna().sum()}")


def main() -> None:
    """Entry point."""
    parser = argparse.ArgumentParser(description="Generate predictions with KenPom data")
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

    # Run async main
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
