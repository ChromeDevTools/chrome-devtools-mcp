"""Backtest KenPom FanMatch predictions against actual results.

Evaluates KenPom FanMatch prediction accuracy for:
- Predicted scores (MAE, RMSE)
- Spread predictions (cover rate, ATS accuracy)
- Total predictions (over/under accuracy)
- Win probability calibration

Usage:
    python scripts/analysis/backtest_kenpom_fanmatch.py --start 2025-11-01 --end 2026-02-06
    python scripts/analysis/backtest_kenpom_fanmatch.py --season 2026
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from sports_betting_edge.adapters.kenpom import KenPomAdapter
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.config.logging import configure_logging

configure_logging()
logger = logging.getLogger(__name__)

PST = ZoneInfo("America/Los_Angeles")


async def fetch_fanmatch_for_date_range(start_date: date, end_date: date) -> pd.DataFrame:
    """Fetch KenPom FanMatch predictions for a date range.

    Args:
        start_date: Start date
        end_date: End date (inclusive)

    Returns:
        DataFrame with FanMatch predictions
    """
    logger.info(f"Fetching FanMatch predictions from {start_date} to {end_date}...")

    kenpom = KenPomAdapter()
    all_predictions = []

    try:
        # Fetch predictions for each date
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.isoformat()
            try:
                games = await kenpom.get_fanmatch(date_str)
                logger.info(f"  {date_str}: {len(games)} games")

                for game in games:
                    home_pred = game.get("HomePred")
                    visitor_pred = game.get("VisitorPred")

                    all_predictions.append(
                        {
                            "game_date": date_str,
                            "kenpom_game_id": game.get("GameID"),
                            "kenpom_home": game.get("Home"),
                            "kenpom_visitor": game.get("Visitor"),
                            "kenpom_home_rank": game.get("HomeRank"),
                            "kenpom_visitor_rank": game.get("VisitorRank"),
                            "kenpom_home_pred": home_pred,
                            "kenpom_visitor_pred": visitor_pred,
                            "kenpom_predicted_spread": (
                                home_pred - visitor_pred if home_pred and visitor_pred else None
                            ),
                            "kenpom_predicted_total": (
                                home_pred + visitor_pred if home_pred and visitor_pred else None
                            ),
                            "kenpom_home_wp": game.get("HomeWP"),
                            "kenpom_pred_tempo": game.get("PredTempo"),
                            "kenpom_thrill_score": game.get("ThrillScore"),
                        }
                    )
            except Exception as e:
                logger.warning(f"  Failed to fetch {date_str}: {e}")

            current_date += timedelta(days=1)

    finally:
        await kenpom.close()

    predictions_df = pd.DataFrame(all_predictions)
    logger.info(f"  Total predictions: {len(predictions_df)}")

    return predictions_df


def match_with_actual_results(fanmatch_df: pd.DataFrame, db: OddsAPIDatabase) -> pd.DataFrame:
    """Match FanMatch predictions with actual game results.

    Args:
        fanmatch_df: DataFrame with FanMatch predictions
        db: Database with actual results

    Returns:
        DataFrame with predictions and actual results merged
    """
    logger.info("Matching FanMatch predictions with actual results...")

    # Get completed games with scores
    query = """
    SELECT
        e.event_id,
        e.home_team,
        e.away_team,
        e.commence_time,
        s.home_score,
        s.away_score,
        DATE(e.commence_time) as game_date
    FROM events e
    INNER JOIN scores s ON e.event_id = s.event_id
    WHERE s.home_score IS NOT NULL
        AND s.away_score IS NOT NULL
        AND s.completed = 1
    ORDER BY e.commence_time
    """

    actual_df = pd.read_sql_query(query, db.conn)
    logger.info(f"  Found {len(actual_df)} completed games in database")

    # Calculate actual spread and total
    actual_df["actual_home_score"] = actual_df["home_score"]
    actual_df["actual_away_score"] = actual_df["away_score"]
    actual_df["actual_spread"] = actual_df["home_score"] - actual_df["away_score"]
    actual_df["actual_total"] = actual_df["home_score"] + actual_df["away_score"]
    actual_df["actual_home_won"] = (actual_df["actual_spread"] > 0).astype(int)

    # Match by date and team names
    matched = []
    for _, fm in fanmatch_df.iterrows():
        kp_home = fm["kenpom_home"]
        kp_visitor = fm["kenpom_visitor"]
        game_date = fm["game_date"]

        if not kp_home or not kp_visitor:
            continue

        # Find matching game in actual results
        date_games = actual_df[actual_df["game_date"] == game_date]

        for _, actual in date_games.iterrows():
            our_home = actual["home_team"]
            our_away = actual["away_team"]

            # Match if KenPom name is contained in our full name
            home_match = kp_home in our_home or our_home in kp_home
            away_match = kp_visitor in our_away or our_away in kp_visitor

            if home_match and away_match:
                matched.append(
                    {
                        **fm.to_dict(),
                        "event_id": actual["event_id"],
                        "our_home_team": our_home,
                        "our_away_team": our_away,
                        "actual_home_score": actual["actual_home_score"],
                        "actual_away_score": actual["actual_away_score"],
                        "actual_spread": actual["actual_spread"],
                        "actual_total": actual["actual_total"],
                        "actual_home_won": actual["actual_home_won"],
                    }
                )
                break

    matched_df = pd.DataFrame(matched)
    logger.info(f"  Matched {len(matched_df)} games with actual results")

    return matched_df


def calculate_metrics(results_df: pd.DataFrame) -> dict:
    """Calculate prediction accuracy metrics.

    Args:
        results_df: DataFrame with predictions and actuals

    Returns:
        Dictionary of metrics
    """
    logger.info("Calculating prediction accuracy metrics...")

    # Score prediction accuracy
    home_mae = abs(results_df["kenpom_home_pred"] - results_df["actual_home_score"]).mean()
    away_mae = abs(results_df["kenpom_visitor_pred"] - results_df["actual_away_score"]).mean()

    home_rmse = (
        (results_df["kenpom_home_pred"] - results_df["actual_home_score"]) ** 2
    ).mean() ** 0.5
    away_rmse = (
        (results_df["kenpom_visitor_pred"] - results_df["actual_away_score"]) ** 2
    ).mean() ** 0.5

    # Spread prediction accuracy
    spread_mae = abs(results_df["kenpom_predicted_spread"] - results_df["actual_spread"]).mean()
    spread_rmse = (
        (results_df["kenpom_predicted_spread"] - results_df["actual_spread"]) ** 2
    ).mean() ** 0.5

    # Total prediction accuracy
    total_mae = abs(results_df["kenpom_predicted_total"] - results_df["actual_total"]).mean()
    total_rmse = (
        (results_df["kenpom_predicted_total"] - results_df["actual_total"]) ** 2
    ).mean() ** 0.5

    # Win prediction accuracy
    results_df["predicted_home_won"] = (results_df["kenpom_predicted_spread"] > 0).astype(int)
    win_accuracy = (results_df["predicted_home_won"] == results_df["actual_home_won"]).mean()

    # Win probability calibration (binned)
    wp_bins = [0, 20, 40, 60, 80, 100]
    results_df["wp_bin"] = pd.cut(results_df["kenpom_home_wp"], bins=wp_bins, labels=wp_bins[1:])
    wp_calibration = results_df.groupby("wp_bin")["actual_home_won"].mean() * 100

    metrics = {
        "n_games": len(results_df),
        "score_prediction": {
            "home_mae": round(home_mae, 2),
            "away_mae": round(away_mae, 2),
            "home_rmse": round(home_rmse, 2),
            "away_rmse": round(away_rmse, 2),
        },
        "spread_prediction": {
            "mae": round(spread_mae, 2),
            "rmse": round(spread_rmse, 2),
        },
        "total_prediction": {
            "mae": round(total_mae, 2),
            "rmse": round(total_rmse, 2),
        },
        "win_prediction": {"accuracy": round(win_accuracy, 4)},
        "win_probability_calibration": wp_calibration.to_dict(),
    }

    return metrics


async def main_async(args: argparse.Namespace) -> None:
    """Main async function."""
    logger.info("[OK] === KenPom FanMatch Backtesting ===\n")

    # Determine date range
    if args.season:
        # Season runs roughly Nov - Apr
        start_date = date(args.season - 1, 11, 1)
        end_date = date.today()
        logger.info(f"Using season {args.season}: {start_date} to {end_date}")
    else:
        start_date = datetime.strptime(args.start, "%Y-%m-%d").date()
        end_date = datetime.strptime(args.end, "%Y-%m-%d").date()
        logger.info(f"Using date range: {start_date} to {end_date}")

    # Fetch FanMatch predictions
    fanmatch_df = await fetch_fanmatch_for_date_range(start_date, end_date)

    if len(fanmatch_df) == 0:
        logger.warning("No FanMatch predictions found for date range")
        return

    # Match with actual results
    db = OddsAPIDatabase(args.db_path)
    results_df = match_with_actual_results(fanmatch_df, db)

    if len(results_df) == 0:
        logger.warning("No matches found between predictions and actual results")
        return

    # Calculate metrics
    metrics = calculate_metrics(results_df)

    # Display results
    logger.info("\n=== Backtest Results ===")
    logger.info(f"Games analyzed: {metrics['n_games']}")
    logger.info("\nScore Prediction Accuracy:")
    logger.info(
        f"  Home: MAE={metrics['score_prediction']['home_mae']}, "
        f"RMSE={metrics['score_prediction']['home_rmse']}"
    )
    logger.info(
        f"  Away: MAE={metrics['score_prediction']['away_mae']}, "
        f"RMSE={metrics['score_prediction']['away_rmse']}"
    )
    logger.info("\nSpread Prediction Accuracy:")
    logger.info(
        f"  MAE={metrics['spread_prediction']['mae']}, RMSE={metrics['spread_prediction']['rmse']}"
    )
    logger.info("\nTotal Prediction Accuracy:")
    logger.info(
        f"  MAE={metrics['total_prediction']['mae']}, RMSE={metrics['total_prediction']['rmse']}"
    )
    logger.info(f"\nWin Prediction Accuracy: {metrics['win_prediction']['accuracy']:.1%}")
    logger.info("\nWin Probability Calibration:")
    for wp_bin, actual_rate in metrics["win_probability_calibration"].items():
        logger.info(f"  {wp_bin}% predicted → {actual_rate:.1f}% actual")

    # Save detailed results
    if args.output:
        results_df.to_csv(args.output, index=False)
        logger.info(f"\n[OK] Saved detailed results to {args.output}")

        # Save metrics summary
        metrics_path = args.output.with_suffix(".json")
        import json

        with open(metrics_path, "w") as f:
            json.dump(metrics, f, indent=2, default=str)
        logger.info(f"[OK] Saved metrics to {metrics_path}")


def main() -> None:
    """Entry point."""
    parser = argparse.ArgumentParser(description="Backtest KenPom FanMatch predictions")
    parser.add_argument("--start", type=str, help="Start date (YYYY-MM-DD)", default=None)
    parser.add_argument("--end", type=str, help="End date (YYYY-MM-DD)", default=None)
    parser.add_argument(
        "--season",
        type=int,
        help="Season year (e.g., 2026 for 2025-26 season)",
        default=None,
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Database path",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("analysis/kenpom_fanmatch_backtest.csv"),
        help="Output CSV path for detailed results",
    )

    args = parser.parse_args()

    # Validate inputs
    if args.season is None and (args.start is None or args.end is None):
        parser.error("Either --season or both --start and --end are required")

    # Run async main
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
