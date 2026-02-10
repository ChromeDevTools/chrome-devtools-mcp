"""Backtest 2026-02-05 games against trained models."""

from __future__ import annotations

import logging
from pathlib import Path

import joblib
import pandas as pd

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.services.feature_engineering import FeatureEngineer

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def main() -> None:
    """Backtest 2026-02-05 games."""
    # Note: Most games on 2026-02-05 UTC are actually 2026-02-04 Pacific time
    target_date_utc = "2026-02-05"
    target_date_pacific = "2026-02-04"  # Most games
    base_path = Path(__file__).parent.parent.parent

    # Load models
    logger.info("Loading trained models...")
    spreads_model = joblib.load(base_path / "models" / "spreads_2026_optimized_v2.pkl")
    totals_model = joblib.load(base_path / "models" / "totals_2026_optimized_v2.pkl")
    home_score_model = joblib.load(base_path / "models" / "home_score_2026.pkl")
    away_score_model = joblib.load(base_path / "models" / "away_score_2026.pkl")

    # Get games with scores from database
    logger.info(f"Fetching games for {target_date_utc} (UTC)...")
    db = OddsAPIDatabase(str(base_path / "data" / "odds_api" / "odds_api.sqlite3"))

    query = """
    SELECT
        e.event_id,
        e.home_team,
        e.away_team,
        e.commence_time,
        s.home_score,
        s.away_score
    FROM events e
    JOIN scores s ON e.event_id = s.event_id
    WHERE DATE(e.commence_time) = ?
    ORDER BY e.commence_time
    """

    games_df = pd.read_sql_query(query, db.conn, params=(target_date_utc,))
    logger.info(f"Found {len(games_df)} games with scores on {target_date_utc} UTC\n")

    if len(games_df) == 0:
        logger.warning(f"No games with scores found for {target_date_utc}")
        return

    # Print games
    for _, game in games_df.iterrows():
        logger.info(
            f"  {game['away_team']} @ {game['home_team']}: "
            f"{game['away_score']}-{game['home_score']}"
        )

    # Build features using FeatureEngineer
    # Note: Use Pacific timezone dates since staging uses Pacific time
    logger.info(
        f"\nBuilding features using staging layer "
        f"(Pacific timezone: {target_date_pacific} to 2026-02-05)..."
    )
    engineer = FeatureEngineer(staging_path=str(base_path / "data" / "staging"))

    # Build spreads features and targets (Pacific timezone date range)
    X_spreads, y_spreads = engineer.build_spreads_dataset(
        start_date=target_date_pacific, end_date="2026-02-05"
    )

    # Build totals features and targets (Pacific timezone date range)
    X_totals, y_totals = engineer.build_totals_dataset(
        start_date=target_date_pacific, end_date="2026-02-05"
    )

    logger.info(f"Spreads features: {len(X_spreads)} games, {len(X_spreads.columns)} features")
    logger.info(f"Totals features: {len(X_totals)} games, {len(X_totals.columns)} features")

    if len(X_spreads) == 0 and len(X_totals) == 0:
        logger.warning(
            "No features could be built. Check that staging files contain data for this date."
        )
        return

    # Load event metadata from staging (once for both spreads and totals)
    staging_events = engineer.load_staging_data(
        start_date=target_date_pacific,
        end_date="2026-02-05",
        season=2026,
        require_line_features=False,
        use_home_away=True,
    )

    logger.info(f"Loaded {len(staging_events)} staging events with metadata\n")

    # Generate predictions
    results = []

    # Spreads predictions
    if len(X_spreads) > 0:
        spreads_pred = spreads_model.predict_proba(X_spreads)[:, 1]

        for idx in range(len(X_spreads)):
            event_row = staging_events.iloc[idx]
            actual_covered = y_spreads.iloc[idx]
            pred_prob = spreads_pred[idx]
            pred_outcome = pred_prob > 0.5

            results.append(
                {
                    "event_id": event_row["event_id"],
                    "home_team": event_row["home_team"],
                    "away_team": event_row["away_team"],
                    "favorite_team": event_row.get("favorite_team", "Unknown"),
                    "underdog_team": event_row.get("underdog_team", "Unknown"),
                    "market": "spread",
                    "prediction": "favorite" if pred_outcome else "underdog",
                    "prob_favorite": pred_prob,
                    "spread_points": event_row.get("closing_spread", 0.0),
                    "home_score": event_row["home_score"],
                    "away_score": event_row["away_score"],
                    "actual_covered_favorite": actual_covered,
                    "correct": pred_outcome == actual_covered,
                }
            )

    # Totals predictions
    if len(X_totals) > 0:
        # Check if we need to add missing line features
        # Models were trained with 31 features but we only have 28 without line features
        if len(X_totals.columns) == 28:
            logger.info("Adding missing line features (opening/closing totals) with defaults...")
            X_totals["opening_total"] = X_totals["expected_total"]
            X_totals["closing_total"] = X_totals["expected_total"]
            X_totals["total_movement"] = 0.0

        totals_pred = totals_model.predict_proba(X_totals)[:, 1]

        # Score predictions
        home_pred = home_score_model.predict(X_totals)
        away_pred = away_score_model.predict(X_totals)

        for idx in range(len(X_totals)):
            event_row = staging_events.iloc[idx]
            actual_went_over = y_totals.iloc[idx]
            pred_prob = totals_pred[idx]
            pred_outcome = pred_prob > 0.5

            total_score = event_row["home_score"] + event_row["away_score"]

            results.append(
                {
                    "event_id": event_row["event_id"],
                    "home_team": event_row["home_team"],
                    "away_team": event_row["away_team"],
                    "market": "total",
                    "prediction": "over" if pred_outcome else "under",
                    "prob_over": pred_prob,
                    "total_line": event_row.get(
                        "closing_total", X_totals["expected_total"].iloc[idx]
                    ),
                    "home_score": event_row["home_score"],
                    "away_score": event_row["away_score"],
                    "actual_total": total_score,
                    "actual_went_over": actual_went_over,
                    "correct": pred_outcome == actual_went_over,
                    "pred_home_score": home_pred[idx],
                    "pred_away_score": away_pred[idx],
                    "pred_total": home_pred[idx] + away_pred[idx],
                }
            )

    results_df = pd.DataFrame(results)

    # Calculate metrics
    logger.info("\n" + "=" * 80)
    logger.info(f"BACKTEST RESULTS - {target_date_utc} (UTC) = {target_date_pacific} Pacific")
    logger.info("=" * 80)

    # Spreads performance
    spreads_results = results_df[results_df["market"] == "spread"]
    if len(spreads_results) > 0:
        spreads_accuracy = spreads_results["correct"].mean()
        logger.info("\nSPREADS MODEL:")
        logger.info(f"  Games: {len(spreads_results)}")
        logger.info(f"  Accuracy: {spreads_accuracy:.1%}")
        logger.info(f"  Correct: {spreads_results['correct'].sum()}")
        logger.info(f"  Incorrect: {(~spreads_results['correct']).sum()}")

        # Show confidence breakdown
        high_conf = spreads_results[
            (spreads_results["prob_favorite"] > 0.6) | (spreads_results["prob_favorite"] < 0.4)
        ]
        if len(high_conf) > 0:
            logger.info(
                f"  High confidence (>60% or <40%): {high_conf['correct'].mean():.1%} "
                f"({len(high_conf)} games)"
            )

    # Totals performance
    totals_results = results_df[results_df["market"] == "total"]
    if len(totals_results) > 0:
        totals_accuracy = totals_results["correct"].mean()
        mae = (totals_results["actual_total"] - totals_results["pred_total"]).abs().mean()
        rmse = ((totals_results["actual_total"] - totals_results["pred_total"]) ** 2).mean() ** 0.5

        logger.info("\nTOTALS MODEL:")
        logger.info(f"  Games: {len(totals_results)}")
        logger.info(f"  Accuracy: {totals_accuracy:.1%}")
        logger.info(f"  Correct: {totals_results['correct'].sum()}")
        logger.info(f"  Incorrect: {(~totals_results['correct']).sum()}")
        logger.info("\nSCORE PREDICTION:")
        logger.info(f"  MAE: {mae:.2f} points")
        logger.info(f"  RMSE: {rmse:.2f} points")

        # Show confidence breakdown
        high_conf = totals_results[
            (totals_results["prob_over"] > 0.6) | (totals_results["prob_over"] < 0.4)
        ]
        if len(high_conf) > 0:
            logger.info(
                f"  High confidence (>60% or <40%): {high_conf['correct'].mean():.1%} "
                f"({len(high_conf)} games)"
            )

    # Save detailed results
    output_path = base_path / "predictions" / f"{target_date_utc}_backtest.csv"
    results_df.to_csv(output_path, index=False)
    logger.info(f"\nDetailed results saved to: {output_path}")

    # Show all predictions
    logger.info("\n" + "=" * 80)
    logger.info("DETAILED PREDICTIONS:")
    logger.info("=" * 80)

    # Spreads
    spreads_results = results_df[results_df["market"] == "spread"]
    if len(spreads_results) > 0:
        logger.info("\nSPREADS:")
        for _, row in spreads_results.iterrows():
            status = "[OK]" if row["correct"] else "[WRONG]"
            logger.info(
                f"  {status} {row['away_team']} @ {row['home_team']}: "
                f"Pred={row['prediction']} ({row['prob_favorite']:.1%}), "
                f"Spread={row['spread_points']:.1f}, "
                f"Score={int(row['away_score'])}-{int(row['home_score'])}"
            )

    # Totals
    totals_results = results_df[results_df["market"] == "total"]
    if len(totals_results) > 0:
        logger.info("\nTOTALS:")
        for _, row in totals_results.iterrows():
            status = "[OK]" if row["correct"] else "[WRONG]"
            logger.info(
                f"  {status} {row['away_team']} @ {row['home_team']}: "
                f"Pred={row['prediction']} ({row['prob_over']:.1%}), "
                f"Line={row['total_line']:.1f}, "
                f"Actual={int(row['actual_total'])} "
                f"(pred={row['pred_total']:.1f})"
            )


if __name__ == "__main__":
    main()
