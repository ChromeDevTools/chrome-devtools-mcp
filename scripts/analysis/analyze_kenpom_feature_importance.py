"""Analyze KenPom feature importance for predicting game outcomes.

Evaluates which KenPom metrics are most predictive of:
- Game winners
- Spread coverage
- Over/under totals
- Actual scores

Uses XGBoost feature importance to rank metrics.

Usage:
    python scripts/analysis/analyze_kenpom_feature_importance.py
    python scripts/analysis/analyze_kenpom_feature_importance.py --min-games 100
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split

from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.config.logging import configure_logging

configure_logging()
logger = logging.getLogger(__name__)


def load_kenpom_team_data() -> pd.DataFrame:
    """Load KenPom team ratings from staging.

    Returns:
        DataFrame with team ratings
    """
    logger.info("Loading KenPom team ratings...")

    team_ratings = read_parquet_df("data/staging/team_ratings.parquet")
    logger.info(f"  Loaded {len(team_ratings)} team records")

    return team_ratings


def build_feature_dataset(db: OddsAPIDatabase, team_ratings: pd.DataFrame) -> pd.DataFrame:
    """Build dataset with KenPom features and game outcomes.

    Args:
        db: Database with game results
        team_ratings: KenPom team ratings

    Returns:
        DataFrame with features and labels
    """
    logger.info("Building feature dataset...")

    # Get completed games with scores
    query = """
    SELECT
        e.event_id,
        e.home_team,
        e.away_team,
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

    games_df = pd.read_sql_query(query, db.conn)
    logger.info(f"  Found {len(games_df)} completed games")

    # Merge with KenPom ratings
    games_df = games_df.merge(
        team_ratings,
        left_on="home_team",
        right_on="odds_api_name",
        how="left",
        suffixes=("", "_home"),
    )

    games_df = games_df.merge(
        team_ratings,
        left_on="away_team",
        right_on="odds_api_name",
        how="left",
        suffixes=("_home", "_away"),
    )

    # Drop games without KenPom data
    before_count = len(games_df)
    games_df = games_df.dropna(subset=["adj_em_home", "adj_em_away"])
    logger.info(f"  Dropped {before_count - len(games_df)} games without KenPom data")

    # Calculate outcomes
    games_df["actual_home_score"] = games_df["home_score"]
    games_df["actual_away_score"] = games_df["away_score"]
    games_df["actual_spread"] = games_df["home_score"] - games_df["away_score"]
    games_df["actual_total"] = games_df["home_score"] + games_df["away_score"]
    games_df["home_won"] = (games_df["actual_spread"] > 0).astype(int)

    # Calculate differential features
    games_df["adj_em_diff"] = games_df["adj_em_home"] - games_df["adj_em_away"]
    games_df["pythag_diff"] = games_df["pythag_home"] - games_df["pythag_away"]
    games_df["adj_o_diff"] = games_df["adj_o_home"] - games_df["adj_o_away"]
    games_df["adj_d_diff"] = games_df["adj_d_home"] - games_df["adj_d_away"]
    games_df["adj_t_diff"] = games_df["adj_t_home"] - games_df["adj_t_away"]
    games_df["sos_diff"] = games_df["sos_home"] - games_df["sos_away"]
    games_df["luck_diff"] = games_df["luck_home"] - games_df["luck_away"]

    # Four Factors differentials
    games_df["efg_pct_diff"] = games_df["efg_pct_home"] - games_df["efg_pct_away"]
    games_df["to_pct_diff"] = games_df["to_pct_home"] - games_df["to_pct_away"]
    games_df["or_pct_diff"] = games_df["or_pct_home"] - games_df["or_pct_away"]
    games_df["ft_rate_diff"] = games_df["ft_rate_home"] - games_df["ft_rate_away"]

    # Combined metrics
    games_df["total_offense"] = games_df["adj_o_home"] + games_df["adj_o_away"]
    games_df["avg_tempo"] = (games_df["adj_t_home"] + games_df["adj_t_away"]) / 2
    games_df["avg_defense"] = (games_df["adj_d_home"] + games_df["adj_d_away"]) / 2

    logger.info(f"  Built dataset with {len(games_df)} games")

    return games_df


def analyze_feature_importance(df: pd.DataFrame, target: str, feature_type: str) -> pd.DataFrame:
    """Analyze feature importance for a specific target.

    Args:
        df: Dataset with features
        target: Target column name
        feature_type: Type of features to use

    Returns:
        DataFrame with feature importance rankings
    """
    logger.info(f"\nAnalyzing feature importance for {target}...")

    # Define feature sets
    all_kenpom_features = [
        # Efficiency metrics
        "adj_em_home",
        "adj_em_away",
        "adj_em_diff",
        "pythag_home",
        "pythag_away",
        "pythag_diff",
        # Offense/Defense
        "adj_o_home",
        "adj_o_away",
        "adj_o_diff",
        "adj_d_home",
        "adj_d_away",
        "adj_d_diff",
        # Tempo
        "adj_t_home",
        "adj_t_away",
        "adj_t_diff",
        "avg_tempo",
        # Strength of Schedule
        "sos_home",
        "sos_away",
        "sos_diff",
        # Luck
        "luck_home",
        "luck_away",
        "luck_diff",
        # Four Factors
        "efg_pct_home",
        "efg_pct_away",
        "efg_pct_diff",
        "to_pct_home",
        "to_pct_away",
        "to_pct_diff",
        "or_pct_home",
        "or_pct_away",
        "or_pct_diff",
        "ft_rate_home",
        "ft_rate_away",
        "ft_rate_diff",
        # Combined
        "total_offense",
        "avg_defense",
    ]

    # Select features available in dataset
    features = [f for f in all_kenpom_features if f in df.columns]
    logger.info(f"  Using {len(features)} features")

    # Prepare data
    X = df[features].fillna(df[features].median())
    y = df[target]

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Train model
    if target in ["home_won"]:
        # Classification
        model = xgb.XGBClassifier(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            random_state=42,
        )
        model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
        score = model.score(X_test, y_test)
        metric_name = "Accuracy"
    else:
        # Regression
        model = xgb.XGBRegressor(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            random_state=42,
        )
        model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
        from sklearn.metrics import mean_absolute_error

        score = mean_absolute_error(y_test, model.predict(X_test))
        metric_name = "MAE"

    logger.info(f"  Test {metric_name}: {score:.4f}")

    # Get feature importance
    importance_dict = model.get_booster().get_score(importance_type="gain")
    importance_values = [importance_dict.get(f"f{i}", 0.0) for i in range(len(features))]

    importance_df = pd.DataFrame({"feature": features, "importance": importance_values})
    importance_df = importance_df.sort_values("importance", ascending=False)
    importance_df["importance_pct"] = (
        100 * importance_df["importance"] / importance_df["importance"].sum()
    )

    # Show top features
    logger.info("\n  Top 10 Features:")
    for _, row in importance_df.head(10).iterrows():
        logger.info(f"    {row['feature']:30s} {row['importance_pct']:6.2f}%")

    return importance_df


def main() -> None:
    """Entry point."""
    parser = argparse.ArgumentParser(description="Analyze KenPom feature importance")
    parser.add_argument(
        "--db-path",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Database path",
    )
    parser.add_argument(
        "--min-games",
        type=int,
        default=50,
        help="Minimum games required for analysis",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("analysis"),
        help="Output directory for results",
    )

    args = parser.parse_args()

    logger.info("[OK] === KenPom Feature Importance Analysis ===\n")

    # Load data
    db = OddsAPIDatabase(args.db_path)
    team_ratings = load_kenpom_team_data()
    df = build_feature_dataset(db, team_ratings)

    if len(df) < args.min_games:
        logger.error(f"Insufficient data: {len(df)} games (min: {args.min_games})")
        return

    # Analyze different targets
    targets = {
        "home_won": "Win Prediction",
        "actual_spread": "Spread Prediction",
        "actual_total": "Total Prediction",
        "actual_home_score": "Home Score Prediction",
        "actual_away_score": "Away Score Prediction",
    }

    all_results = {}
    for target, description in targets.items():
        logger.info(f"\n{'=' * 60}")
        logger.info(f"{description}")
        logger.info("=" * 60)

        importance_df = analyze_feature_importance(df, target, description)
        all_results[target] = importance_df

        # Save individual results
        output_file = args.output_dir / f"kenpom_importance_{target}.csv"
        args.output_dir.mkdir(parents=True, exist_ok=True)
        importance_df.to_csv(output_file, index=False)
        logger.info(f"\n  Saved to {output_file}")

    # Create summary report
    logger.info("\n" + "=" * 60)
    logger.info("SUMMARY: Top 5 Features by Target")
    logger.info("=" * 60)

    for target, description in targets.items():
        logger.info(f"\n{description}:")
        top5 = all_results[target].head(5)
        for _, row in top5.iterrows():
            logger.info(f"  {row['feature']:30s} {row['importance_pct']:6.2f}%")

    logger.info("\n[OK] Analysis complete!")


if __name__ == "__main__":
    main()
