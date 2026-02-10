"""
Validate model predictions against actual game results.

Calculates performance metrics:
- MAE (Mean Absolute Error) for scores and totals
- RMSE (Root Mean Squared Error)
- Bias (systematic over/under prediction)
- Spread cover accuracy
- Total over/under accuracy
- Calibration quality

Usage:
    uv run python scripts/analysis/validate_predictions.py --date 2026-02-07
    uv run python scripts/analysis/validate_predictions.py --predictions predictions/2026-02-07.csv
"""

from __future__ import annotations

import argparse
import logging
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from sports_betting_edge.adapters.filesystem import write_csv
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

logging.basicConfig(level=logging.INFO, format="%(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def load_predictions(predictions_file: Path) -> pd.DataFrame:
    """Load predictions from CSV."""
    if not predictions_file.exists():
        raise FileNotFoundError(f"Predictions file not found: {predictions_file}")

    df = pd.read_csv(predictions_file)
    logger.info(f"Loaded {len(df)} predictions from {predictions_file}")

    return df


def get_actual_scores(db: OddsAPIDatabase, predictions: pd.DataFrame) -> pd.DataFrame:
    """Get actual scores for predicted games."""
    # Get event IDs or match by team names
    results = []

    for _, pred in predictions.iterrows():
        # Try to find matching game by team names and date
        # This is approximate - ideally use event_id
        query = f"""
        SELECT
            e.event_id,
            e.home_team,
            e.away_team,
            e.commence_time,
            s.home_score,
            s.away_score
        FROM events e
        JOIN scores s ON e.event_id = s.event_id
        WHERE e.home_team LIKE '%{pred["home_team"].split()[-1]}%'
          AND e.away_team LIKE '%{pred["away_team"].split()[-1]}%'
          AND s.home_score IS NOT NULL
          AND s.away_score IS NOT NULL
        ORDER BY ABS(
            JULIANDAY(e.commence_time) - JULIANDAY('now')
        ) ASC
        LIMIT 1
        """

        game = pd.read_sql_query(query, db.conn)

        if len(game) > 0:
            result = {
                "home_team": pred["home_team"],
                "away_team": pred["away_team"],
                "predicted_home_score": pred["predicted_home_score"],
                "predicted_away_score": pred["predicted_away_score"],
                "predicted_total": pred["predicted_total"],
                "predicted_margin": pred["predicted_margin"],
                "actual_home_score": game.iloc[0]["home_score"],
                "actual_away_score": game.iloc[0]["away_score"],
                "actual_total": (game.iloc[0]["home_score"] + game.iloc[0]["away_score"]),
                "actual_margin": (game.iloc[0]["home_score"] - game.iloc[0]["away_score"]),
                "favorite_team": pred["favorite_team"],
                "spread_magnitude": pred["spread_magnitude"],
                "total_points": pred["total_points"],
            }
            results.append(result)

    if not results:
        logger.warning("No matching games with scores found")
        return pd.DataFrame()

    df = pd.DataFrame(results)
    logger.info(f"Found actual scores for {len(df)} games")

    return df


def calculate_metrics(results: pd.DataFrame) -> dict:
    """Calculate prediction performance metrics."""
    metrics = {}

    # Score prediction metrics
    metrics["home_mae"] = np.mean(
        np.abs(results["predicted_home_score"] - results["actual_home_score"])
    )
    metrics["away_mae"] = np.mean(
        np.abs(results["predicted_away_score"] - results["actual_away_score"])
    )
    metrics["home_rmse"] = np.sqrt(
        np.mean((results["predicted_home_score"] - results["actual_home_score"]) ** 2)
    )
    metrics["away_rmse"] = np.sqrt(
        np.mean((results["predicted_away_score"] - results["actual_away_score"]) ** 2)
    )

    # Bias (positive = overpredicting, negative = underpredicting)
    metrics["home_bias"] = np.mean(results["predicted_home_score"] - results["actual_home_score"])
    metrics["away_bias"] = np.mean(results["predicted_away_score"] - results["actual_away_score"])

    # Total prediction metrics
    metrics["total_mae"] = np.mean(np.abs(results["predicted_total"] - results["actual_total"]))
    metrics["total_rmse"] = np.sqrt(
        np.mean((results["predicted_total"] - results["actual_total"]) ** 2)
    )
    metrics["total_bias"] = np.mean(results["predicted_total"] - results["actual_total"])

    # Margin prediction metrics
    metrics["margin_mae"] = np.mean(np.abs(results["predicted_margin"] - results["actual_margin"]))
    metrics["margin_rmse"] = np.sqrt(
        np.mean((results["predicted_margin"] - results["actual_margin"]) ** 2)
    )
    metrics["margin_bias"] = np.mean(results["predicted_margin"] - results["actual_margin"])

    # Spread accuracy (did favorite cover?)
    results["favorite_covered"] = False
    for idx, row in results.iterrows():
        if row["favorite_team"] == row["home_team"]:
            # Home is favorite
            favorite_margin = row["actual_margin"]
            results.loc[idx, "favorite_covered"] = favorite_margin > row["spread_magnitude"]
        else:
            # Away is favorite
            favorite_margin = -row["actual_margin"]
            results.loc[idx, "favorite_covered"] = favorite_margin > row["spread_magnitude"]

    results["predicted_favorite_cover"] = False
    for idx, row in results.iterrows():
        if row["favorite_team"] == row["home_team"]:
            pred_margin = row["predicted_margin"]
            results.loc[idx, "predicted_favorite_cover"] = pred_margin > row["spread_magnitude"]
        else:
            pred_margin = -row["predicted_margin"]
            results.loc[idx, "predicted_favorite_cover"] = pred_margin > row["spread_magnitude"]

    metrics["spread_accuracy"] = (
        results["favorite_covered"] == results["predicted_favorite_cover"]
    ).mean()

    # Total accuracy (did it go over?)
    results["went_over"] = results["actual_total"] > results["total_points"]
    results["predicted_over"] = results["predicted_total"] > results["total_points"]
    metrics["total_accuracy"] = (results["went_over"] == results["predicted_over"]).mean()

    # Market vs model comparison
    metrics["avg_market_total"] = results["total_points"].mean()
    metrics["avg_actual_total"] = results["actual_total"].mean()
    metrics["avg_predicted_total"] = results["predicted_total"].mean()

    # Market performance (how far off was market?)
    metrics["market_total_mae"] = np.mean(np.abs(results["total_points"] - results["actual_total"]))
    metrics["market_total_bias"] = np.mean(results["total_points"] - results["actual_total"])

    return metrics, results


def print_metrics_report(metrics: dict, results: pd.DataFrame) -> None:
    """Print formatted metrics report."""
    print("\n" + "=" * 70)
    print("MODEL VALIDATION REPORT")
    print("=" * 70)
    print(f"\nGames Analyzed: {len(results)}")
    print(f"Date Range: {results.index.min()} to {results.index.max()}")

    print("\n--- SCORE PREDICTION METRICS ---")
    print(f"Home Score MAE: {metrics['home_mae']:.2f} points")
    print(f"Away Score MAE: {metrics['away_mae']:.2f} points")
    print(f"Home Score RMSE: {metrics['home_rmse']:.2f} points")
    print(f"Away Score RMSE: {metrics['away_rmse']:.2f} points")

    print("\n--- BIAS (Systematic Over/Under Prediction) ---")
    print(
        f"Home Score Bias: {metrics['home_bias']:+.2f} "
        f"({'over' if metrics['home_bias'] > 0 else 'under'}predicting)"
    )
    print(
        f"Away Score Bias: {metrics['away_bias']:+.2f} "
        f"({'over' if metrics['away_bias'] > 0 else 'under'}predicting)"
    )
    print(
        f"Total Bias: {metrics['total_bias']:+.2f} "
        f"({'over' if metrics['total_bias'] > 0 else 'under'}predicting)"
    )
    print(
        f"Margin Bias: {metrics['margin_bias']:+.2f} "
        f"({'over' if metrics['margin_bias'] > 0 else 'under'}predicting home)"
    )

    print("\n--- TOTAL PREDICTION ---")
    print(f"Total MAE: {metrics['total_mae']:.2f} points")
    print(f"Total RMSE: {metrics['total_rmse']:.2f} points")
    print(f"Total Accuracy (O/U): {metrics['total_accuracy']:.1%}")

    print("\n--- MARGIN PREDICTION ---")
    print(f"Margin MAE: {metrics['margin_mae']:.2f} points")
    print(f"Margin RMSE: {metrics['margin_rmse']:.2f} points")

    print("\n--- BETTING PERFORMANCE ---")
    print(f"Spread Cover Accuracy: {metrics['spread_accuracy']:.1%}")
    print(f"Total O/U Accuracy: {metrics['total_accuracy']:.1%}")

    print("\n--- MARKET COMPARISON ---")
    print(f"Market Total (avg): {metrics['avg_market_total']:.1f}")
    print(f"Actual Total (avg): {metrics['avg_actual_total']:.1f}")
    print(f"Model Total (avg): {metrics['avg_predicted_total']:.1f}")
    print(f"\nMarket Total MAE: {metrics['market_total_mae']:.2f} points")
    print(
        f"Model Total MAE: {metrics['total_mae']:.2f} points "
        f"({'better' if metrics['total_mae'] < metrics['market_total_mae'] else 'worse'}"
        " than market)"
    )
    print(f"\nMarket Total Bias: {metrics['market_total_bias']:+.2f}")
    print(f"Model Total Bias: {metrics['total_bias']:+.2f}")

    print("\n--- CALIBRATION ASSESSMENT ---")
    if abs(metrics["total_bias"]) < 1.0:
        print("[OK] Model is well-calibrated (bias < 1 point)")
    elif abs(metrics["total_bias"]) < 3.0:
        print("[WARNING] Model has slight bias (1-3 points)")
    else:
        direction = "over" if metrics["total_bias"] > 0 else "under"
        print(
            f"[ERROR] Model significantly {direction}predicting "
            f"(bias: {abs(metrics['total_bias']):.1f} points)"
        )

    print("\n" + "=" * 70)


def print_game_by_game(results: pd.DataFrame) -> None:
    """Print game-by-game results."""
    print("\n--- GAME BY GAME RESULTS ---\n")

    # Sort by largest total error
    results["total_error"] = abs(results["predicted_total"] - results["actual_total"])
    sorted_results = results.sort_values("total_error", ascending=False)

    for _idx, row in sorted_results.iterrows():
        matchup = f"{row['away_team']} @ {row['home_team']}"
        print(f"{matchup[:50]:50s}")

        # Scores
        pred_score = f"{row['predicted_home_score']:.1f}-{row['predicted_away_score']:.1f}"
        actual_score = f"{row['actual_home_score']:.0f}-{row['actual_away_score']:.0f}"
        print(f"  Predicted: {pred_score:10s} | Actual: {actual_score:10s}")

        # Total
        total_error = row["predicted_total"] - row["actual_total"]
        total_status = "OVER" if row["predicted_total"] > row["total_points"] else "UNDER"
        actual_status = "OVER" if row["actual_total"] > row["total_points"] else "UNDER"
        correct = "OK" if total_status == actual_status else "MISS"

        print(
            f"  Total: {row['predicted_total']:.1f} pred vs {row['actual_total']:.0f} actual "
            f"(market: {row['total_points']:.1f}) | Error: {total_error:+.1f} | {correct}"
        )

        # Margin
        margin_error = row["predicted_margin"] - row["actual_margin"]
        print(f"  Margin: {margin_error:+.1f} error")
        print()


def main() -> None:
    """Main execution."""
    parser = argparse.ArgumentParser(description="Validate model predictions")
    parser.add_argument(
        "--date", type=str, help="Date to validate (YYYY-MM-DD, will look for predictions/DATE.csv)"
    )
    parser.add_argument("--predictions", type=Path, help="Path to predictions CSV file")
    parser.add_argument(
        "--db-path",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Odds database path",
    )
    parser.add_argument("--output", type=Path, help="Output path for detailed results CSV")
    parser.add_argument("--verbose", action="store_true", help="Show game-by-game results")

    args = parser.parse_args()

    # Determine predictions file
    if args.predictions:
        predictions_file = args.predictions
    elif args.date:
        predictions_file = Path(f"predictions/{args.date}_fresh_calibrated.csv")
        if not predictions_file.exists():
            predictions_file = Path(f"predictions/{args.date}_calibrated.csv")
        if not predictions_file.exists():
            predictions_file = Path(f"predictions/{args.date}.csv")
    else:
        # Default to today
        today = date.today().isoformat()
        predictions_file = Path(f"predictions/{today}.csv")

    # Load predictions
    try:
        predictions = load_predictions(predictions_file)
    except FileNotFoundError as e:
        logger.error(str(e))
        logger.info("Available prediction files:")
        pred_dir = Path("predictions")
        if pred_dir.exists():
            for f in sorted(pred_dir.glob("*.csv")):
                logger.info(f"  {f}")
        return

    # Get actual scores
    db = OddsAPIDatabase(str(args.db_path))
    results = get_actual_scores(db, predictions)

    if len(results) == 0:
        logger.error("No completed games found to validate")
        return

    # Calculate metrics
    metrics, results_detailed = calculate_metrics(results)

    # Print report
    print_metrics_report(metrics, results_detailed)

    if args.verbose:
        print_game_by_game(results_detailed)

    # Save detailed results
    if args.output:
        write_csv(results_detailed, str(args.output), index=False)
        logger.info(f"Saved detailed results to {args.output}")
    else:
        # Auto-save
        output_file = predictions_file.parent / f"{predictions_file.stem}_validation.csv"
        write_csv(results_detailed, str(output_file), index=False)
        logger.info(f"Saved detailed results to {output_file}")


if __name__ == "__main__":
    main()
