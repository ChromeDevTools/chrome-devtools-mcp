"""Generate daily predictions for CBB games.

Uses score models for spread predictions and residual model for totals.
Falls back to score-derived totals when residual model is unavailable.

Output format:
- home_team, away_team, favorite_team
- spread_magnitude, total_points
- predicted_home_score, predicted_away_score
- predicted_margin, predicted_total
- favorite_cover_prob, underdog_cover_prob
- over_prob, under_prob
- totals_method (residual | score_derived)

Usage:
    uv run python scripts/prediction/generate_daily_predictions.py
    uv run python scripts/prediction/generate_daily_predictions.py --date 2026-02-08
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import pickle
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
from scipy import stats

from sports_betting_edge.adapters.filesystem import read_parquet_df, write_csv
from sports_betting_edge.adapters.kenpom import KenPomAdapter
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.config.settings import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# D1 average constants for expected points formula
DI_AVG_EFF = 109.15  # D1 avg offensive/defensive efficiency (per 100 poss)
DI_AVG_TEMPO = 67.34  # D1 avg possessions per game
DEFAULT_HCA_PTS = 3.2  # Fallback HCA when per-team data unavailable

# Score model uncertainty (for spread probabilities)
COMBINED_STDDEV = 7.6  # sqrt(5.38^2 + 5.00^2)


async def fetch_fanmatch_for_date(
    target_date: date,
    games: pd.DataFrame,
    staging_path: Path,
) -> pd.DataFrame:
    """Fetch KenPom FanMatch predictions and match to today's games.

    Uses team_mapping.parquet for reliable name matching (not fuzzy).

    Args:
        target_date: Date to fetch FanMatch for
        games: Games DataFrame with home_team, away_team columns
        staging_path: Path to staging directory (for team mapping)

    Returns:
        Games DataFrame with FanMatch columns added
    """
    logger.info(f"Fetching KenPom FanMatch predictions for {target_date}...")

    # Load team mapping (odds_api_name -> kenpom_name for reverse lookup)
    mapping_path = staging_path / "mappings" / "team_mapping.parquet"
    if not mapping_path.exists():
        logger.warning("  Team mapping not found - skipping FanMatch")
        return games

    team_mapping = read_parquet_df(str(mapping_path))
    odds_to_kp = dict(
        zip(
            team_mapping["odds_api_name"],
            team_mapping["kenpom_name"],
            strict=False,
        )
    )

    # Fetch from KenPom API for both target date and previous day.
    # The Odds API uses UTC commence_time, while KenPom uses Eastern Time dates.
    # Evening ET games (e.g. 7 PM ET = midnight UTC) land on the next UTC date,
    # so we fetch both days and merge to cover the boundary.
    kenpom = KenPomAdapter()
    try:
        fanmatch_games: list[dict[str, Any]] = []
        prev_date = target_date - timedelta(days=1)
        for d in [prev_date, target_date]:
            try:
                batch = await kenpom.get_fanmatch(d.isoformat())
                logger.info(f"  FanMatch {d}: {len(batch)} games")
                fanmatch_games.extend(batch)
            except Exception as e:
                logger.debug(f"  FanMatch {d} unavailable: {e}")
        logger.info(f"  Received {len(fanmatch_games)} total FanMatch predictions")
    except Exception as e:
        logger.warning(f"  Failed to fetch FanMatch: {e} - continuing without")
        return games
    finally:
        await kenpom.close()

    if len(fanmatch_games) == 0:
        logger.info("  No FanMatch games returned")
        return games

    # Build lookup: (kenpom_home, kenpom_away) -> prediction
    fm_lookup: dict[tuple[str, str], dict] = {}
    for game in fanmatch_games:
        home = game.get("Home")
        visitor = game.get("Visitor")
        home_pred = game.get("HomePred")
        visitor_pred = game.get("VisitorPred")

        if home and visitor and home_pred is not None and visitor_pred is not None:
            fm_lookup[(home, visitor)] = {
                "kp_predicted_margin": home_pred - visitor_pred,
                "kp_predicted_total": home_pred + visitor_pred,
                "kp_home_wp": game.get("HomeWP"),
            }

    # Match games using team mapping
    matched_count = 0
    kp_margins = []
    kp_totals = []
    kp_wps = []

    for _, row in games.iterrows():
        home_kp = odds_to_kp.get(row["home_team"])
        away_kp = odds_to_kp.get(row["away_team"])

        if home_kp and away_kp and (home_kp, away_kp) in fm_lookup:
            fm = fm_lookup[(home_kp, away_kp)]
            kp_margins.append(fm["kp_predicted_margin"])
            kp_totals.append(fm["kp_predicted_total"])
            kp_wps.append(fm["kp_home_wp"])
            matched_count += 1
        else:
            kp_margins.append(None)
            kp_totals.append(None)
            kp_wps.append(None)

    games["kp_predicted_margin"] = pd.array(kp_margins, dtype=pd.Float64Dtype())
    games["kp_predicted_total"] = pd.array(kp_totals, dtype=pd.Float64Dtype())
    games["kp_home_wp"] = pd.array(kp_wps, dtype=pd.Float64Dtype())

    logger.info(f"  Matched {matched_count}/{len(games)} games with FanMatch")
    return games


def load_score_models(models_dir: Path) -> tuple:
    """Load trained score prediction models."""
    home_path = models_dir / "home_score_2026.pkl"
    away_path = models_dir / "away_score_2026.pkl"

    if not home_path.exists() or not away_path.exists():
        raise FileNotFoundError(f"Score models not found in {models_dir}")

    with open(home_path, "rb") as f:
        home_model = pickle.load(f)
    with open(away_path, "rb") as f:
        away_model = pickle.load(f)

    logger.info(f"Loaded score models from {models_dir}")
    return home_model, away_model


def load_residual_model(models_dir: Path) -> tuple | None:
    """Load totals residual model and metadata.

    Returns:
        Tuple of (model, feature_list, residual_std) or None if not available
    """
    model_path = models_dir / "totals_residual_2026.pkl"
    features_path = models_dir / "totals_residual_features.txt"
    metadata_path = models_dir / "totals_residual_metadata.json"

    if not model_path.exists() or not features_path.exists():
        logger.warning("Residual model not found, will use score-derived totals")
        return None

    with open(model_path, "rb") as f:
        model = pickle.load(f)

    with open(features_path) as f:
        feature_list = [line.strip() for line in f if line.strip()]

    # Load residual_std from metadata
    residual_std = 11.82  # Default fallback
    if metadata_path.exists():
        with open(metadata_path) as f:
            metadata = json.load(f)
        residual_std = metadata.get("residual_std", residual_std)

    logger.info(f"Loaded residual model ({len(feature_list)} features, std={residual_std:.2f})")
    return model, feature_list, residual_std


def get_games_from_daily_parquet(
    target_date: date,
    daily_dir: Path,
    preferred_book: str = "fanduel",
) -> pd.DataFrame | None:
    """Load today's games from daily parquet snapshots.

    Falls back to consensus across books if preferred book unavailable.
    Returns None if daily parquet files don't exist.
    """
    date_str = target_date.isoformat()
    spreads_path = daily_dir / f"{date_str}_spreads.parquet"
    totals_path = daily_dir / f"{date_str}_totals.parquet"

    if not spreads_path.exists() or not totals_path.exists():
        return None

    spreads = pd.read_parquet(spreads_path)
    totals = pd.read_parquet(totals_path)

    if len(spreads) == 0 or len(totals) == 0:
        return None

    # Try preferred book first, fall back to first available
    book_col = "bookmaker_key"
    if preferred_book in spreads[book_col].values:
        sp = spreads[spreads[book_col] == preferred_book]
        tot = totals[totals[book_col] == preferred_book]
    else:
        # Use first available book per game for consensus
        first_book = spreads[book_col].iloc[0]
        logger.info(f"  {preferred_book} not in daily parquet, using {first_book}")
        sp = spreads[spreads[book_col] == first_book]
        tot = totals[totals[book_col] == first_book]

    # Deduplicate: one row per event
    sp = sp.drop_duplicates(subset=["event_id"], keep="first")
    tot = tot.drop_duplicates(subset=["event_id"], keep="first")

    # Build games DataFrame matching the schema expected downstream
    games = sp[["event_id", "home_team", "away_team", "commence_time"]].copy()
    games["favorite_team"] = sp["favorite_team"].values
    games["underdog_team"] = sp["underdog_team"].values
    games["spread_magnitude"] = sp["spread_magnitude"].values

    # Merge totals
    tot_cols = tot[["event_id"]].copy()
    total_col = "total" if "total" in tot.columns else "total_points"
    tot_cols["total_points"] = tot[total_col].values
    games = games.merge(tot_cols, on="event_id", how="inner")

    # Opening total = closing total for single-snapshot data
    games["opening_total"] = games["total_points"]

    logger.info(f"Loaded {len(games)} games from daily parquet ({date_str})")
    return games


def get_todays_games(db: OddsAPIDatabase, target_date: date) -> pd.DataFrame:
    """Get today's games with consensus odds from streaming DB."""
    date_str = target_date.isoformat()

    query = f"""
    WITH spread_odds AS (
        SELECT
            o.event_id,
            o.outcome_name as favorite_team,
            CASE
                WHEN o.outcome_name = e.home_team THEN e.away_team
                ELSE e.home_team
            END as underdog_team,
            ABS(o.point) as spread_magnitude,
            ROW_NUMBER() OVER (
                PARTITION BY o.event_id
                ORDER BY o.book_last_update DESC
            ) as rn
        FROM observations o
        JOIN events e ON o.event_id = e.event_id
        WHERE o.market_key = 'spreads'
            AND o.book_key = 'fanduel'
            AND DATE(e.commence_time) = '{date_str}'
            AND o.point < 0
    ),
    total_odds AS (
        SELECT
            o.event_id,
            o.point as total_points,
            ROW_NUMBER() OVER (
                PARTITION BY o.event_id
                ORDER BY o.book_last_update DESC
            ) as rn
        FROM observations o
        JOIN events e ON o.event_id = e.event_id
        WHERE o.market_key = 'totals'
            AND o.book_key = 'fanduel'
            AND o.outcome_name = 'Over'
            AND DATE(e.commence_time) = '{date_str}'
            AND o.point IS NOT NULL
    ),
    opening_totals AS (
        SELECT
            o.event_id,
            o.point as opening_total,
            ROW_NUMBER() OVER (
                PARTITION BY o.event_id
                ORDER BY o.book_last_update ASC
            ) as rn
        FROM observations o
        JOIN events e ON o.event_id = e.event_id
        WHERE o.market_key = 'totals'
            AND o.book_key = 'fanduel'
            AND o.outcome_name = 'Over'
            AND DATE(e.commence_time) = '{date_str}'
            AND o.point IS NOT NULL
    )
    SELECT DISTINCT
        e.event_id,
        e.home_team,
        e.away_team,
        e.commence_time,
        s.favorite_team,
        s.underdog_team,
        s.spread_magnitude,
        t.total_points,
        ot.opening_total
    FROM events e
    JOIN spread_odds s ON e.event_id = s.event_id AND s.rn = 1
    JOIN total_odds t ON e.event_id = t.event_id AND t.rn = 1
    LEFT JOIN opening_totals ot ON e.event_id = ot.event_id AND ot.rn = 1
    WHERE DATE(e.commence_time) = '{date_str}'
    ORDER BY e.commence_time
    """

    games = pd.read_sql_query(query, db.conn)
    logger.info(f"Found {len(games)} games with complete odds for {date_str}")
    return games


def enrich_with_features(games: pd.DataFrame, staging_path: Path) -> pd.DataFrame:
    """Enrich games with features from staging layer."""
    events = read_parquet_df(str(staging_path / "events.parquet"))
    team_ratings = read_parquet_df(str(staging_path / "team_ratings.parquet"))

    # Merge with events for rest/travel features
    games = games.merge(
        events[
            [
                "event_id",
                "home_rest_days",
                "away_rest_days",
                "home_back_to_back",
                "away_back_to_back",
                "home_short_rest",
                "away_short_rest",
                "away_road_streak",
                "away_days_on_road",
            ]
        ],
        on="event_id",
        how="left",
    )

    # Map team names to KenPom features via odds_api_name column
    team_ratings_home = team_ratings.copy()
    team_ratings_home.columns = [
        f"home_{col}" if col != "odds_api_name" else col for col in team_ratings_home.columns
    ]

    team_ratings_away = team_ratings.copy()
    team_ratings_away.columns = [
        f"away_{col}" if col != "odds_api_name" else col for col in team_ratings_away.columns
    ]

    games = games.merge(
        team_ratings_home,
        left_on="home_team",
        right_on="odds_api_name",
        how="left",
    )
    games = games.merge(
        team_ratings_away,
        left_on="away_team",
        right_on="odds_api_name",
        how="left",
    )

    # Calculate derived features (superset for both score and totals models)
    games["total_offense"] = games["home_adj_o"] + games["away_adj_o"]
    games["avg_tempo"] = (games["home_adj_t"] + games["away_adj_t"]) / 2
    games["avg_luck"] = (games["home_luck"] + games["away_luck"]) / 2
    games["height_diff"] = games["home_height_eff"] - games["away_height_eff"]
    games["avg_defense"] = (games["home_adj_d"] + games["away_adj_d"]) / 2

    # Rename height_eff to height for consistency with model features
    games = games.rename(
        columns={"home_height_eff": "home_height", "away_height_eff": "away_height"}
    )

    # Expected points (corrected KenPom formula with per-team HCA)
    game_tempo = (games["home_adj_t"] * games["away_adj_t"]) / DI_AVG_TEMPO
    # Per-team HCA or league average fallback
    if "home_hca_pts" in games.columns:
        home_hca = games["home_hca_pts"].fillna(DEFAULT_HCA_PTS)
    else:
        home_hca = DEFAULT_HCA_PTS
    games["home_expected_pts"] = (games["home_adj_o"] * games["away_adj_d"] / DI_AVG_EFF) * (
        game_tempo / 100
    ) + (home_hca / 2)
    games["away_expected_pts"] = (games["away_adj_o"] * games["home_adj_d"] / DI_AVG_EFF) * (
        game_tempo / 100
    ) - (home_hca / 2)
    games["expected_total"] = games["home_expected_pts"] + games["away_expected_pts"]
    # Expose HCA as explicit feature
    if "home_hca" in games.columns:
        pass  # Already present from team_ratings merge
    elif "home_hca_pts" in games.columns:
        games["home_hca"] = games["home_hca_pts"].fillna(0.0)

    # Differentials (full set for totals model; score model selects its subset via features.txt)
    games["adj_em_diff"] = games["home_adj_em"] - games["away_adj_em"]
    games["pythag_diff"] = games["home_pythag"] - games["away_pythag"]
    games["adj_o_diff"] = games["home_adj_o"] - games["away_adj_o"]
    games["adj_d_diff"] = games["home_adj_d"] - games["away_adj_d"]
    games["adj_t_diff"] = games["home_adj_t"] - games["away_adj_t"]
    games["efg_pct_diff"] = games["home_efg_pct"] - games["away_efg_pct"]
    games["to_pct_diff"] = games["home_to_pct"] - games["away_to_pct"]
    games["or_pct_diff"] = games["home_or_pct"] - games["away_or_pct"]
    games["ft_rate_diff"] = games["home_ft_rate"] - games["away_ft_rate"]
    games["sos_diff"] = games["home_sos"] - games["away_sos"]
    games["luck_diff"] = games["home_luck"] - games["away_luck"]

    # Market features for residual model and score model compatibility
    games["closing_total"] = games["total_points"]
    games["total_movement"] = games["total_points"] - games["opening_total"]
    games["kenpom_market_diff"] = games["expected_total"] - games["total_points"]

    # FanMatch-derived features (if FanMatch data was merged)
    if "kp_predicted_margin" in games.columns:
        # Market margin in home perspective for comparison
        is_home_fav = games["home_team"] == games["favorite_team"]
        market_home_margin = games["spread_magnitude"].where(
            is_home_fav, -games["spread_magnitude"]
        )
        games["kp_market_margin_diff"] = games["kp_predicted_margin"] - market_home_margin
        games["kp_market_total_diff"] = games["kp_predicted_total"] - games["total_points"]

    # Fill missing values with defaults BEFORE rest calculations
    games = games.fillna(
        {
            "home_rest_days": 3,
            "away_rest_days": 3,
            "home_back_to_back": False,
            "away_back_to_back": False,
            "home_short_rest": False,
            "away_short_rest": False,
            "away_road_streak": 0,
            "away_days_on_road": 0,
            "opening_total": games["total_points"],
            "total_movement": 0,
        }
    )

    # Rest features (calculate after filling NaNs)
    games["rest_advantage"] = games["home_rest_days"] - games["away_rest_days"]
    games["total_back_to_back"] = games["home_back_to_back"].astype(int) + games[
        "away_back_to_back"
    ].astype(int)
    games["total_short_rest"] = games["home_short_rest"].astype(int) + games[
        "away_short_rest"
    ].astype(int)

    logger.info(f"Enriched {len(games)} games with staging features")
    return games


def make_predictions(
    games: pd.DataFrame,
    home_model: object,
    away_model: object,
    score_features: list[str],
    residual_model: object | None = None,
    residual_features: list[str] | None = None,
    residual_std: float = 11.82,
) -> pd.DataFrame:
    """Generate predictions using score models (spreads) and residual model (totals).

    Args:
        games: Enriched games DataFrame
        home_model: Trained home score model
        away_model: Trained away score model
        score_features: Feature list for score models
        residual_model: Optional trained residual model for totals
        residual_features: Feature list for residual model
        residual_std: Standard deviation of residuals for probability calc
    """
    # Score predictions (used for spreads, and fallback for totals)
    X_score = games[score_features].fillna(0.0)
    home_scores = home_model.predict(X_score)
    away_scores = away_model.predict(X_score)

    # Build results
    results = games[
        [
            "home_team",
            "away_team",
            "favorite_team",
            "spread_magnitude",
            "total_points",
        ]
    ].copy()

    results["predicted_home_score"] = home_scores.round(1)
    results["predicted_away_score"] = away_scores.round(1)
    results["predicted_margin"] = (home_scores - away_scores).round(1)

    # === SPREAD PROBABILITIES (from score models) ===
    effective_margins = []
    for _, row in results.iterrows():
        margin = row["predicted_margin"]
        if row["favorite_team"] == row["home_team"]:
            effective_margins.append(margin)
        else:
            effective_margins.append(-margin)

    effective_margins_s = pd.Series(effective_margins)
    spread_cushions = effective_margins_s - results["spread_magnitude"]
    z_scores = spread_cushions / COMBINED_STDDEV
    results["favorite_cover_prob"] = z_scores.apply(stats.norm.cdf).apply(lambda x: f"{x:.0%}")
    results["underdog_cover_prob"] = (1 - z_scores.apply(stats.norm.cdf)).apply(
        lambda x: f"{x:.0%}"
    )

    # Always compute score-derived total for monitoring
    score_totals = home_scores + away_scores
    results["score_derived_total"] = score_totals.round(1)

    # === TOTAL PROBABILITIES ===
    if residual_model is not None and residual_features is not None:
        # Residual model: predicted_total = closing_total + residual
        X_residual = games[residual_features].fillna(0.0)
        predicted_residuals = residual_model.predict(X_residual)

        results["predicted_total"] = (games["total_points"] + predicted_residuals).round(1)

        # Over probability: P(actual > closing) = P(residual > 0)
        # We use the predicted residual as signal, scaled by std
        z_totals = predicted_residuals / residual_std
        over_probs = pd.Series(z_totals).apply(stats.norm.cdf)

        results["over_prob"] = over_probs.apply(lambda x: f"{x:.0%}")
        results["under_prob"] = (1 - over_probs).apply(lambda x: f"{x:.0%}")
        results["totals_method"] = "residual"

        logger.info(
            f"Residual model: avg predicted residual = "
            f"{predicted_residuals.mean():.2f}, "
            f"avg over_prob = {over_probs.mean():.1%}"
        )
    else:
        # Fallback: score-derived totals
        results["predicted_total"] = score_totals.round(1)

        total_cushions = score_totals - results["total_points"]
        z_totals = total_cushions / COMBINED_STDDEV
        results["over_prob"] = z_totals.apply(stats.norm.cdf).apply(lambda x: f"{x:.0%}")
        results["under_prob"] = (1 - z_totals.apply(stats.norm.cdf)).apply(lambda x: f"{x:.0%}")
        results["totals_method"] = "score_derived"

        logger.info("Using score-derived totals (no residual model)")

    # Disconnect between score models and final total prediction
    results["total_disconnect"] = (
        (results["score_derived_total"] - results["predicted_total"]).abs().round(1)
    )

    # Warn about large disconnects
    large_disconnect = results[results["total_disconnect"] > 10]
    if len(large_disconnect) > 0:
        logger.warning(f"[WARNING] {len(large_disconnect)} games have total_disconnect > 10 pts:")
        for _, row in large_disconnect.iterrows():
            logger.warning(
                f"  {row['away_team']} @ {row['home_team']}: "
                f"score_derived={row['score_derived_total']}, "
                f"predicted={row['predicted_total']}, "
                f"disconnect={row['total_disconnect']}"
            )

    return results


def main() -> None:
    """Generate predictions for today's games."""
    parser = argparse.ArgumentParser(description="Generate daily predictions")
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Target date (YYYY-MM-DD, default: today)",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=settings.odds_api_db_path,
        help="Odds database path",
    )
    parser.add_argument(
        "--staging-path",
        type=Path,
        default=settings.staging_dir,
        help="Staging data path",
    )
    parser.add_argument(
        "--models-dir",
        type=Path,
        default=settings.models_dir,
        help="Models directory",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output CSV path",
    )

    args = parser.parse_args()

    # Determine target date
    target_date = date.fromisoformat(args.date) if args.date else date.today()
    logger.info(f"Generating predictions for {target_date}")

    # Determine output path
    if args.output:
        output_path = args.output
    else:
        output_dir = settings.predictions_dir
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{target_date.isoformat()}.csv"

    try:
        # Load score models (always needed for spreads)
        home_model, away_model = load_score_models(args.models_dir)

        # Load score feature list
        features_path = args.models_dir / "score_features.txt"
        with open(features_path) as f:
            score_features = [line.strip() for line in f if line.strip()]
        logger.info(f"Loaded {len(score_features)} score features")

        # Load residual model (optional, for totals)
        residual_result = load_residual_model(args.models_dir)
        residual_model = None
        residual_features = None
        residual_std = 11.82
        if residual_result is not None:
            residual_model, residual_features, residual_std = residual_result

        # Get today's games: try daily parquet first (fast), fall back to DB
        daily_dir = settings.daily_odds_dir
        games = get_games_from_daily_parquet(target_date, daily_dir)

        if games is None or len(games) == 0:
            logger.info("Daily parquet not available, querying streaming DB")
            db = OddsAPIDatabase(args.db_path)
            games = get_todays_games(db, target_date)
            db.close()

        if len(games) == 0:
            logger.error(f"No games found for {target_date}")
            return

        # Fetch FanMatch predictions for today's games
        games = asyncio.run(fetch_fanmatch_for_date(target_date, games, args.staging_path))

        # Enrich with features
        games = enrich_with_features(games, args.staging_path)

        # Make predictions
        predictions = make_predictions(
            games,
            home_model,
            away_model,
            score_features,
            residual_model=residual_model,
            residual_features=residual_features,
            residual_std=residual_std,
        )

        # Save
        write_csv(predictions, str(output_path), index=False)
        logger.info(f"[OK] Saved {len(predictions)} predictions to {output_path}")

        # Display summary
        logger.info(f"\nPredictions for {target_date}:")
        for _, game in predictions.iterrows():
            logger.info(
                f"  {game['away_team']} @ {game['home_team']}: "
                f"{game['predicted_away_score']}-{game['predicted_home_score']} "
                f"(Spread: {game['favorite_team']} {game['favorite_cover_prob']}, "
                f"Total: O{game['over_prob']} [{game['totals_method']}])"
            )

    except Exception as e:
        logger.error(f"Prediction failed: {e}", exc_info=True)
        raise


if __name__ == "__main__":
    main()
