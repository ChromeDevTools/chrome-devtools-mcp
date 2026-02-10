"""Generate daily predictions for today's NCAAB games.

Uses trained XGBoost score regression models to predict game scores and derives
mathematically consistent spread/total probabilities from those predictions.

Output includes:
- Predicted scores for home and away teams
- Probability of favorite covering spread (derived from score predictions)
- Probability of game going over total (derived from score predictions)
- Expected value vs closing lines (for bankroll management)

Usage:
    uv run python scripts/predict_today.py
    uv run python scripts/predict_today.py --date 2026-02-01
    uv run python scripts/predict_today.py --output data/outputs/predictions/2026-02-01.csv
"""

from __future__ import annotations

import argparse
import logging
from datetime import date
from pathlib import Path

import pandas as pd
import xgboost as xgb
from scipy import stats

from sports_betting_edge.adapters.filesystem import read_parquet_df, write_csv
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.core.team_mapper import TeamMapper

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Model uncertainty constants (from training performance)
HOME_SCORE_MAE = 5.38  # Mean absolute error for home score predictions
AWAY_SCORE_MAE = 5.00  # Mean absolute error for away score predictions
COMBINED_STDDEV = 7.6  # Combined standard deviation: sqrt(5.38^2 + 5.00^2)

# Spreads features from staging layer (50 features) - ORDER MATTERS!
SPREADS_FEATURES = [
    # Favorite team efficiency metrics
    "fav_adj_em",
    "fav_pythag",
    "fav_adj_o",
    "fav_adj_d",
    "fav_adj_t",
    "fav_luck",
    "fav_sos",
    "fav_height",
    # Favorite team Four Factors
    "fav_efg_pct",
    "fav_to_pct",
    "fav_or_pct",
    "fav_ft_rate",
    # Underdog team efficiency metrics
    "dog_adj_em",
    "dog_pythag",
    "dog_adj_o",
    "dog_adj_d",
    "dog_adj_t",
    "dog_luck",
    "dog_sos",
    "dog_height",
    # Underdog team Four Factors
    "dog_efg_pct",
    "dog_to_pct",
    "dog_or_pct",
    "dog_ft_rate",
    # Matchup differentials
    "em_diff",
    "pythag_diff",
    "adj_o_diff",
    "adj_d_diff",
    "tempo_diff",
    "luck_diff",
    "sos_diff",
    "height_diff",
    # Matchup interaction features (offense vs defense)
    "fav_offensive_efficiency",
    "dog_offensive_efficiency",
    "offensive_efficiency_diff",
    "expected_margin",
    # Line features
    "opening_spread",
    "closing_spread",
    "line_movement",
    # Rest & situational features
    "fav_rest_days",
    "dog_rest_days",
    "fav_back_to_back",
    "dog_back_to_back",
    "fav_short_rest",
    "dog_short_rest",
    "fav_road_streak",
    "dog_road_streak",
    "fav_days_on_road",
    "dog_days_on_road",
    "rest_advantage",
]

# Totals features from staging layer (45 features)
TOTALS_FEATURES = [
    # Home team efficiency metrics
    "home_adj_em",
    "home_pythag",
    "home_adj_o",
    "home_adj_d",
    "home_adj_t",
    "home_luck",
    "home_sos",
    "home_height",
    # Home team Four Factors
    "home_efg_pct",
    "home_to_pct",
    "home_or_pct",
    "home_ft_rate",
    # Away team efficiency metrics
    "away_adj_em",
    "away_pythag",
    "away_adj_o",
    "away_adj_d",
    "away_adj_t",
    "away_luck",
    "away_sos",
    "away_height",
    # Away team Four Factors
    "away_efg_pct",
    "away_to_pct",
    "away_or_pct",
    "away_ft_rate",
    # Combined features
    "total_offense",
    "avg_tempo",
    "avg_luck",
    "height_diff",
    "home_expected_pts",
    "away_expected_pts",
    "expected_total",
    # Line features
    "opening_total",
    "closing_total",
    "total_movement",
    # Rest & situational features
    "home_rest_days",
    "away_rest_days",
    "home_back_to_back",
    "away_back_to_back",
    "home_short_rest",
    "away_short_rest",
    "away_road_streak",
    "away_days_on_road",
    "rest_advantage",
    "total_back_to_back",
    "total_short_rest",
]


def load_models(
    models_dir: Path, use_tuned: bool = True
) -> tuple[xgb.XGBClassifier, xgb.XGBClassifier]:
    """Load trained XGBoost models.

    Args:
        models_dir: Directory containing model files
        use_tuned: Whether to use tuned models (default: True)

    Returns:
        (spreads_model, totals_model)
    """
    import pickle

    # Use optimized models from Feb 5 2026 hyperparameter tuning
    # spreads_2026_optimized_v2.pkl: 29 features, AUC 0.6598
    # totals_2026_optimized_v2.pkl: 31 features, AUC 0.6819
    spreads_filename = "spreads_2026_optimized_v2.pkl"
    totals_filename = "totals_2026_optimized_v2.pkl"

    spreads_path = models_dir / spreads_filename
    totals_path = models_dir / totals_filename

    if not spreads_path.exists():
        raise FileNotFoundError(f"Spreads model not found: {spreads_path}")
    if not totals_path.exists():
        raise FileNotFoundError(f"Totals model not found: {totals_path}")

    # Load pickle models
    with open(spreads_path, "rb") as f:
        spreads_model = pickle.load(f)

    with open(totals_path, "rb") as f:
        totals_model = pickle.load(f)

    logger.info(f"Loaded spreads model from {spreads_path}")
    logger.info(f"Loaded totals model from {totals_path}")

    return spreads_model, totals_model


def load_score_models(
    models_dir: Path,
) -> tuple[xgb.XGBRegressor, xgb.XGBRegressor]:
    """Load trained score prediction models (REQUIRED).

    These models are the primary prediction source. All probabilities are
    mathematically derived from score predictions.

    Args:
        models_dir: Directory containing model files

    Returns:
        (home_model, away_model)
    """
    import pickle

    home_path = models_dir / "home_score_2026.pkl"
    away_path = models_dir / "away_score_2026.pkl"

    if not home_path.exists():
        raise FileNotFoundError(f"Home score model not found: {home_path}")
    if not away_path.exists():
        raise FileNotFoundError(f"Away score model not found: {away_path}")

    with open(home_path, "rb") as f:
        home_model = pickle.load(f)
    with open(away_path, "rb") as f:
        away_model = pickle.load(f)

    logger.info(f"Loaded score models from {models_dir}")

    return home_model, away_model


def load_today_odds(odds_dir: Path, target_date: date) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load today's odds from parquet files.

    Args:
        odds_dir: Directory containing daily odds files
        target_date: Date to load odds for

    Returns:
        (spreads_df, totals_df)
    """
    date_str = target_date.isoformat()
    spreads_path = odds_dir / f"{date_str}_spreads.parquet"
    totals_path = odds_dir / f"{date_str}_totals.parquet"

    if not spreads_path.exists():
        raise FileNotFoundError(f"Spreads odds not found: {spreads_path}")
    if not totals_path.exists():
        raise FileNotFoundError(f"Totals odds not found: {totals_path}")

    spreads = read_parquet_df(str(spreads_path))
    totals = read_parquet_df(str(totals_path))

    logger.info(f"Loaded {len(spreads)} spread records for {date_str}")
    logger.info(f"Loaded {len(totals)} total records for {date_str}")

    return spreads, totals


def load_kenpom_data(
    kenpom_dir: Path, season: int = 2026
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load KenPom ratings, four factors, and height data.

    Args:
        kenpom_dir: Directory containing KenPom data
        season: Season year

    Returns:
        (ratings_df, four_factors_df, height_df)
    """
    ratings_path = kenpom_dir / "ratings" / "season" / f"ratings_{season}.parquet"
    ff_path = kenpom_dir / "four-factors" / "season" / f"four-factors_{season}.parquet"
    height_path = kenpom_dir / "height" / "season" / f"height_{season}.parquet"

    if not ratings_path.exists():
        raise FileNotFoundError(f"KenPom ratings not found: {ratings_path}")
    if not ff_path.exists():
        raise FileNotFoundError(f"Four factors not found: {ff_path}")
    if not height_path.exists():
        raise FileNotFoundError(f"Height data not found: {height_path}")

    ratings = read_parquet_df(str(ratings_path))
    four_factors = read_parquet_df(str(ff_path))
    height = read_parquet_df(str(height_path))

    logger.info(f"Loaded KenPom data for {len(ratings)} teams")

    return ratings, four_factors, height


def get_team_features(
    team_name: str,
    kenpom_ratings: pd.DataFrame,
    kenpom_ff: pd.DataFrame,
    kenpom_height: pd.DataFrame,
    team_mapper: TeamMapper | None,
    prefix: str = "",
) -> dict[str, float]:
    """Extract features for a single team.

    Args:
        team_name: Team name from odds data
        kenpom_ratings: KenPom ratings DataFrame
        kenpom_ff: KenPom four factors DataFrame
        kenpom_height: KenPom height DataFrame
        team_mapper: Team name mapper
        prefix: Feature prefix (e.g., "home_" or "away_")

    Returns:
        Dictionary of features
    """
    features: dict[str, float] = {}

    # Map team name to KenPom
    if team_mapper:
        kenpom_name = team_mapper.get_kenpom_name(team_name, source="odds_api")
    else:
        kenpom_name = team_name

    # Get KenPom ratings (note: staging layer uses adj_o/adj_d/adj_t naming)
    # For compatibility with KenPom API naming, support both conventions
    team_ratings = kenpom_ratings[
        kenpom_ratings.get("TeamName", kenpom_ratings.get("kenpom_name")) == kenpom_name
    ]
    if len(team_ratings) > 0:
        rating = team_ratings.iloc[0]
        features[f"{prefix}adj_em"] = rating.get("AdjEM", rating.get("adj_em", 0.0))
        features[f"{prefix}pythag"] = rating.get("Pythag", rating.get("pythag", 0.0))
        features[f"{prefix}adj_o"] = rating.get("AdjOE", rating.get("adj_o", 0.0))
        features[f"{prefix}adj_d"] = rating.get("AdjDE", rating.get("adj_d", 0.0))
        features[f"{prefix}adj_t"] = rating.get("AdjTempo", rating.get("adj_t", 0.0))
        features[f"{prefix}luck"] = rating.get("Luck", rating.get("luck", 0.0))
        features[f"{prefix}sos"] = rating.get("SOS", rating.get("sos", 0.0))
    else:
        logger.warning(f"No KenPom data for {kenpom_name} (from {team_name})")
        features[f"{prefix}adj_em"] = 0.0
        features[f"{prefix}pythag"] = 0.0
        features[f"{prefix}adj_o"] = 0.0
        features[f"{prefix}adj_d"] = 0.0
        features[f"{prefix}adj_t"] = 0.0
        features[f"{prefix}luck"] = 0.0
        features[f"{prefix}sos"] = 0.0

    # Get four factors
    team_ff = kenpom_ff[kenpom_ff["TeamName"] == kenpom_name]
    if len(team_ff) > 0:
        ff = team_ff.iloc[0]
        features[f"{prefix}efg_pct"] = ff.get("eFG_Pct", 0.0)
        features[f"{prefix}to_pct"] = ff.get("TO_Pct", 0.0)
        features[f"{prefix}or_pct"] = ff.get("OR_Pct", 0.0)
        features[f"{prefix}ft_rate"] = ff.get("FT_Rate", 0.0)
        features[f"{prefix}defg_pct"] = ff.get("DeFG_Pct", 0.0)
        features[f"{prefix}dto_pct"] = ff.get("DTO_Pct", 0.0)
    else:
        features[f"{prefix}efg_pct"] = 0.0
        features[f"{prefix}to_pct"] = 0.0
        features[f"{prefix}or_pct"] = 0.0
        features[f"{prefix}ft_rate"] = 0.0
        features[f"{prefix}defg_pct"] = 0.0
        features[f"{prefix}dto_pct"] = 0.0

    # Get height
    team_height = kenpom_height[kenpom_height["TeamName"] == kenpom_name]
    if len(team_height) > 0:
        height = team_height.iloc[0]
        features[f"{prefix}height"] = height.get("HgtEff", 0.0)
    else:
        features[f"{prefix}height"] = 0.0

    return features


def build_prediction_features(
    spreads: pd.DataFrame,
    totals: pd.DataFrame,
    kenpom_ratings: pd.DataFrame,
    kenpom_ff: pd.DataFrame,
    kenpom_height: pd.DataFrame,
    team_mapper: TeamMapper | None,
    odds_db_path: Path | None = None,
    include_market_features: bool = True,
    include_bookmaker_features: bool = True,
) -> pd.DataFrame:
    """Build feature matrix for predictions.

    Args:
        spreads: Spreads odds DataFrame (normalized)
        totals: Totals odds DataFrame (normalized)
        kenpom_ratings: KenPom ratings
        kenpom_ff: KenPom four factors
        kenpom_height: KenPom height data
        team_mapper: Team name mapper

    Returns:
        DataFrame with features for each game
    """
    games = []

    # Get unique games from spreads (use FanDuel as canonical bookmaker)
    unique_games = spreads[spreads["bookmaker_key"] == "fanduel"].copy()

    # Load rest features from staging events
    staging_events_path = Path("data/staging/events.parquet")
    rest_features_map = {}
    if staging_events_path.exists():
        events = read_parquet_df(str(staging_events_path))
        # Index by event_id for fast lookup
        rest_features_map = events.set_index("event_id")[
            [
                "home_rest_days",
                "away_rest_days",
                "home_back_to_back",
                "away_back_to_back",
                "home_short_rest",
                "away_short_rest",
                "away_road_streak",
                "away_days_on_road",
            ]
        ].to_dict("index")
        logger.info(f"Loaded rest features for {len(rest_features_map)} events")
    else:
        logger.warning(f"Staging events not found at {staging_events_path}")

    odds_db: OddsAPIDatabase | None = None

    if odds_db_path and odds_db_path.exists():
        odds_db = OddsAPIDatabase(odds_db_path)

    for _, game in unique_games.iterrows():
        event_id = game["event_id"]
        home_team = game["home_team"]
        away_team = game["away_team"]
        favorite_team = game["favorite_team"]
        underdog_team = game["underdog_team"]
        spread_magnitude = game["spread_magnitude"]

        # Get KenPom features for favorite/underdog (for spreads model)
        fav_features = get_team_features(
            favorite_team, kenpom_ratings, kenpom_ff, kenpom_height, team_mapper, prefix="fav_"
        )
        dog_features = get_team_features(
            underdog_team, kenpom_ratings, kenpom_ff, kenpom_height, team_mapper, prefix="dog_"
        )

        # Get KenPom features for home/away (for totals model)
        home_features = get_team_features(
            home_team, kenpom_ratings, kenpom_ff, kenpom_height, team_mapper, prefix="home_"
        )
        away_features = get_team_features(
            away_team, kenpom_ratings, kenpom_ff, kenpom_height, team_mapper, prefix="away_"
        )

        # Get total for this game
        game_totals = totals[
            (totals["event_id"] == event_id) & (totals["bookmaker_key"] == "fanduel")
        ]
        total_points = game_totals.iloc[0]["total"] if len(game_totals) > 0 else None

        # Spread line movement features
        opening_spread = spread_magnitude
        closing_spread = spread_magnitude
        line_movement_points = 0.0

        # Total line movement features
        opening_total = total_points if total_points is not None else 0.0
        closing_total = total_points if total_points is not None else 0.0
        total_movement = 0.0

        if odds_db:
            spreads_db = odds_db.get_canonical_spreads(event_id=event_id, book_key="fanduel")
            if len(spreads_db) > 0:
                opening_spread = spreads_db.iloc[0]["spread_magnitude"]
                closing_spread = spreads_db.iloc[-1]["spread_magnitude"]
                line_movement_points = closing_spread - opening_spread

            totals_db = odds_db.get_canonical_totals(event_id=event_id, book_key="fanduel")
            if len(totals_db) > 0:
                opening_total = totals_db.iloc[0]["total"]
                closing_total = totals_db.iloc[-1]["total"]
                total_movement = closing_total - opening_total

        # Spreads derived features
        fav_em = fav_features.get("fav_adj_em", 0.0)
        dog_em = dog_features.get("dog_adj_em", 0.0)
        em_diff = fav_em - dog_em

        fav_pythag = fav_features.get("fav_pythag", 0.0)
        dog_pythag = dog_features.get("dog_pythag", 0.0)
        pythag_diff = fav_pythag - dog_pythag

        fav_adj_o = fav_features.get("fav_adj_o", 0.0)
        dog_adj_o = dog_features.get("dog_adj_o", 0.0)
        adj_o_diff = fav_adj_o - dog_adj_o

        fav_adj_d = fav_features.get("fav_adj_d", 0.0)
        dog_adj_d = dog_features.get("dog_adj_d", 0.0)
        adj_d_diff = fav_adj_d - dog_adj_d

        fav_adj_t = fav_features.get("fav_adj_t", 0.0)
        dog_adj_t = dog_features.get("dog_adj_t", 0.0)
        tempo_diff = fav_adj_t - dog_adj_t

        fav_luck = fav_features.get("fav_luck", 0.0)
        dog_luck = dog_features.get("dog_luck", 0.0)
        luck_diff = fav_luck - dog_luck

        fav_sos = fav_features.get("fav_sos", 0.0)
        dog_sos = dog_features.get("dog_sos", 0.0)
        sos_diff = fav_sos - dog_sos

        # Height differential (same for both spreads and totals, based on home vs away)
        home_height = home_features.get("home_height", 0.0)
        away_height = away_features.get("away_height", 0.0)
        height_diff = home_height - away_height

        # Totals derived features
        home_luck = home_features.get("home_luck", 0.0)
        away_luck = away_features.get("away_luck", 0.0)
        avg_luck = (home_luck + away_luck) / 2.0

        home_o = home_features.get("home_adj_o", 0.0)
        away_o = away_features.get("away_adj_o", 0.0)
        total_offense = home_o + away_o

        home_t = home_features.get("home_adj_t", 0.0)
        away_t = away_features.get("away_adj_t", 0.0)
        avg_tempo = (home_t + away_t) / 2.0

        # Expected points (KenPom formula)
        home_d = home_features.get("home_adj_d", 0.0)
        away_d = away_features.get("away_adj_d", 0.0)
        home_expected_pts = (home_o * away_d / 100) * (home_t / 100)
        away_expected_pts = (away_o * home_d / 100) * (away_t / 100)
        expected_total = home_expected_pts + away_expected_pts

        # Matchup interaction features (offense vs defense)
        fav_offensive_efficiency = fav_adj_o * dog_adj_d / 100
        dog_offensive_efficiency = dog_adj_o * fav_adj_d / 100
        offensive_efficiency_diff = fav_offensive_efficiency - dog_offensive_efficiency
        expected_margin = offensive_efficiency_diff * avg_tempo / 100

        # Rest & situational features
        rest_feats = rest_features_map.get(event_id, {})
        home_rest_days = rest_feats.get("home_rest_days", 3)
        away_rest_days = rest_feats.get("away_rest_days", 3)
        home_back_to_back = rest_feats.get("home_back_to_back", False)
        away_back_to_back = rest_feats.get("away_back_to_back", False)
        home_short_rest = rest_feats.get("home_short_rest", False)
        away_short_rest = rest_feats.get("away_short_rest", False)
        away_road_streak = rest_feats.get("away_road_streak", 0)
        away_days_on_road = rest_feats.get("away_days_on_road", 0)

        # Map home/away rest features to favorite/underdog (for spreads model)
        is_fav_home = favorite_team == home_team
        fav_rest_days = home_rest_days if is_fav_home else away_rest_days
        dog_rest_days = away_rest_days if is_fav_home else home_rest_days
        fav_back_to_back = home_back_to_back if is_fav_home else away_back_to_back
        dog_back_to_back = away_back_to_back if is_fav_home else home_back_to_back
        fav_short_rest = home_short_rest if is_fav_home else away_short_rest
        dog_short_rest = away_short_rest if is_fav_home else home_short_rest
        fav_road_streak = 0 if is_fav_home else away_road_streak
        dog_road_streak = away_road_streak if is_fav_home else 0
        fav_days_on_road = 0 if is_fav_home else away_days_on_road
        dog_days_on_road = away_days_on_road if is_fav_home else 0
        rest_advantage = fav_rest_days - dog_rest_days

        # Combined fatigue for totals
        total_back_to_back = int(home_back_to_back or away_back_to_back)
        total_short_rest = int(home_short_rest or away_short_rest)

        # Combine all features (matching staging layer)
        game_features = {
            # Metadata (not used in models)
            "event_id": event_id,
            "commence_time": game["commence_time"],
            "home_team": home_team,
            "away_team": away_team,
            "favorite_team": favorite_team,
            "underdog_team": underdog_team,
            "spread_magnitude": spread_magnitude,
            "total_points": total_points,
            # Spreads model features (32 features from staging layer)
            **fav_features,
            **dog_features,
            "em_diff": em_diff,
            "pythag_diff": pythag_diff,
            "adj_o_diff": adj_o_diff,
            "adj_d_diff": adj_d_diff,
            "tempo_diff": tempo_diff,
            "luck_diff": luck_diff,
            "sos_diff": sos_diff,
            "height_diff": height_diff,
            "fav_offensive_efficiency": fav_offensive_efficiency,
            "dog_offensive_efficiency": dog_offensive_efficiency,
            "offensive_efficiency_diff": offensive_efficiency_diff,
            "expected_margin": expected_margin,
            "opening_spread": opening_spread,
            "closing_spread": closing_spread,
            "line_movement": line_movement_points,
            # Rest & situational features (spreads model)
            "fav_rest_days": fav_rest_days,
            "dog_rest_days": dog_rest_days,
            "fav_back_to_back": fav_back_to_back,
            "dog_back_to_back": dog_back_to_back,
            "fav_short_rest": fav_short_rest,
            "dog_short_rest": dog_short_rest,
            "fav_road_streak": fav_road_streak,
            "dog_road_streak": dog_road_streak,
            "fav_days_on_road": fav_days_on_road,
            "dog_days_on_road": dog_days_on_road,
            "rest_advantage": rest_advantage,
            # Totals model features (45 features from staging layer)
            **home_features,
            **away_features,
            "total_offense": total_offense,
            "avg_tempo": avg_tempo,
            "avg_luck": avg_luck,
            "home_expected_pts": home_expected_pts,
            "away_expected_pts": away_expected_pts,
            "expected_total": expected_total,
            "opening_total": opening_total,
            "closing_total": closing_total,
            "total_movement": total_movement,
            # Rest & situational features (totals model)
            "home_rest_days": home_rest_days,
            "away_rest_days": away_rest_days,
            "home_back_to_back": home_back_to_back,
            "away_back_to_back": away_back_to_back,
            "home_short_rest": home_short_rest,
            "away_short_rest": away_short_rest,
            "away_road_streak": away_road_streak,
            "away_days_on_road": away_days_on_road,
            "total_back_to_back": total_back_to_back,
            "total_short_rest": total_short_rest,
        }

        games.append(game_features)

    if odds_db:
        odds_db.close()

    return pd.DataFrame(games)


def make_predictions(
    features: pd.DataFrame,
    home_score_model: xgb.XGBRegressor,
    away_score_model: xgb.XGBRegressor,
    spreads_model: xgb.XGBClassifier | None = None,
    totals_model: xgb.XGBClassifier | None = None,
) -> pd.DataFrame:
    """Generate predictions for today's games.

    Predictions are based on score regression models. Spread and total probabilities
    are mathematically derived from score predictions using prediction uncertainty.

    Formula:
        For spreads: P(cover) = CDF((predicted_margin - spread) / stddev)
        For totals: P(over) = CDF((predicted_total - line) / stddev)

    Where:
        stddev = sqrt(home_MAE^2 + away_MAE^2) = 7.6 points
        CDF = Cumulative distribution function of standard normal distribution

    Args:
        features: Feature matrix
        home_score_model: Trained home score regression model
        away_score_model: Trained away score regression model
        spreads_model: (Deprecated) Not used
        totals_model: (Deprecated) Not used

    Returns:
        DataFrame with predictions
    """
    # Metadata columns
    metadata_cols = [
        "event_id",
        "commence_time",
        "home_team",
        "away_team",
        "favorite_team",
        "underdog_team",
        "spread_magnitude",
        "total_points",
    ]

    # Prepare features (home/away features for score models)
    X_totals = features[TOTALS_FEATURES].fillna(0.0)

    # Predict scores using regression models
    home_scores = home_score_model.predict(X_totals)
    away_scores = away_score_model.predict(X_totals)

    # Build results DataFrame
    results = features[metadata_cols].copy()
    results["predicted_home_score"] = home_scores.round(1)
    results["predicted_away_score"] = away_scores.round(1)
    results["predicted_margin"] = (home_scores - away_scores).round(1)
    results["predicted_total"] = (home_scores + away_scores).round(1)

    # Calculate spread probabilities from score predictions
    # Determine effective margin (positive if favorite wins)
    effective_margins = []
    for _, row in results.iterrows():
        margin = row["predicted_margin"]
        if row["favorite_team"] == row["home_team"]:
            # Home is favorite, margin is already correct (+ = home wins)
            effective_margins.append(margin)
        else:
            # Away is favorite, flip margin sign (+ = away wins)
            effective_margins.append(-margin)

    effective_margins = pd.Series(effective_margins)

    # Calculate cushion: how much better than spread
    spread_cushions = effective_margins - results["spread_magnitude"]

    # Convert to probability using normal distribution
    z_scores_spread = spread_cushions / COMBINED_STDDEV
    spread_proba = z_scores_spread.apply(stats.norm.cdf)

    results["favorite_cover_prob"] = spread_proba
    results["underdog_cover_prob"] = 1 - spread_proba
    results["spread_edge"] = spread_proba - 0.524  # 0.524 = 110/(110+100)

    # Calculate total probabilities from score predictions
    total_cushions = results["predicted_total"] - results["total_points"]
    z_scores_total = total_cushions / COMBINED_STDDEV
    total_proba = z_scores_total.apply(stats.norm.cdf)

    results["over_prob"] = total_proba
    results["under_prob"] = 1 - total_proba
    results["total_edge"] = total_proba - 0.524

    return results


def main() -> None:
    """Generate predictions for today's games."""
    parser = argparse.ArgumentParser(description="Generate daily NCAAB predictions")
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Target date (YYYY-MM-DD, default: today)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output CSV path (default: data/outputs/predictions/YYYY-MM-DD.csv)",
    )
    parser.add_argument(
        "--models-dir",
        type=Path,
        default=Path("models"),
        help="Directory containing trained models",
    )
    parser.add_argument(
        "--odds-dir",
        type=Path,
        default=Path("data/odds_api/daily"),
        help="Directory containing daily odds files",
    )
    parser.add_argument(
        "--kenpom-dir",
        type=Path,
        default=Path("data/kenpom"),
        help="Directory containing KenPom data",
    )
    parser.add_argument(
        "--odds-db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Odds API SQLite database for market/book features",
    )
    parser.add_argument(
        "--include-market-features",
        dest="include_market_features",
        action="store_true",
        default=True,
        help="Include market (line movement) features",
    )
    parser.add_argument(
        "--no-market-features",
        dest="include_market_features",
        action="store_false",
        help="Disable market (line movement) features",
    )
    parser.add_argument(
        "--include-bookmaker-features",
        dest="include_bookmaker_features",
        action="store_true",
        default=True,
        help="Include bookmaker divergence features",
    )
    parser.add_argument(
        "--no-bookmaker-features",
        dest="include_bookmaker_features",
        action="store_false",
        help="Disable bookmaker divergence features",
    )
    parser.add_argument(
        "--season",
        type=int,
        default=2026,
        help="KenPom season year",
    )
    parser.add_argument(
        "--min-edge",
        type=float,
        default=0.05,
        help="Minimum edge to highlight (default: 5%%)",
    )
    parser.add_argument(
        "--use-tuned",
        dest="use_tuned",
        action="store_true",
        default=True,
        help="Use tuned models (default: True)",
    )
    parser.add_argument(
        "--use-baseline",
        dest="use_tuned",
        action="store_false",
        help="Use baseline models instead of tuned models",
    )

    args = parser.parse_args()

    # Determine target date
    target_date = date.fromisoformat(args.date) if args.date else date.today()
    logger.info(f"Generating predictions for {target_date}")

    # Determine output path
    if args.output:
        output_path = args.output
    else:
        output_dir = Path("predictions")
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{target_date.isoformat()}.csv"

    try:
        # Load score models (REQUIRED - primary prediction source)
        home_score_model, away_score_model = load_score_models(args.models_dir)

        # Load classification models (DEPRECATED - not used for predictions)
        # Kept for backward compatibility only
        try:
            spreads_model, totals_model = load_models(args.models_dir, args.use_tuned)
            logger.warning(
                "Classification models loaded but NOT USED. "
                "All predictions derived from score models."
            )
        except FileNotFoundError:
            spreads_model, totals_model = None, None
            logger.info("Classification models not found (not needed)")

        # Load today's odds
        spreads, totals = load_today_odds(args.odds_dir, target_date)

        # Load KenPom data
        kenpom_ratings, kenpom_ff, kenpom_height = load_kenpom_data(args.kenpom_dir, args.season)

        # Load team mapper
        try:
            team_mapper = TeamMapper()
        except FileNotFoundError:
            logger.warning("Team mapping not found, using direct name matching")
            team_mapper = None

        # Build features
        logger.info("Building prediction features...")
        features = build_prediction_features(
            spreads,
            totals,
            kenpom_ratings,
            kenpom_ff,
            kenpom_height,
            team_mapper,
            odds_db_path=args.odds_db,
            include_market_features=args.include_market_features,
            include_bookmaker_features=args.include_bookmaker_features,
        )
        logger.info(f"Built features for {len(features)} games")

        # Make predictions (using score models only)
        logger.info("Generating predictions from score models...")
        predictions = make_predictions(
            features,
            home_score_model,
            away_score_model,
            spreads_model,  # Not used
            totals_model,  # Not used
        )

        # Save predictions
        write_csv(predictions, str(output_path), index=False)
        logger.info(f"[OK] Saved predictions to {output_path}")

        # Display predictions with edge
        logger.info("\n" + "=" * 80)
        logger.info(f"PREDICTIONS FOR {target_date}")
        logger.info("=" * 80)

        for _, game in predictions.iterrows():
            game_time = pd.to_datetime(game["commence_time"]).strftime("%I:%M %p ET")
            logger.info(f"\n{game['away_team']} @ {game['home_team']} ({game_time})")

            # Score predictions (if available)
            if "predicted_home_score" in game and pd.notna(game["predicted_home_score"]):
                logger.info(
                    f"  Predicted Score: {game['home_team']} {game['predicted_home_score']:.0f}, "
                    f"{game['away_team']} {game['predicted_away_score']:.0f}"
                )
                logger.info(
                    f"    Predicted Margin: {abs(game['predicted_margin']):.1f} "
                    f"({'Home' if game['predicted_margin'] > 0 else 'Away'})"
                )
                logger.info(f"    Predicted Total: {game['predicted_total']:.0f}")

            # Spread predictions
            logger.info(f"  Spread: {game['favorite_team']} -{game['spread_magnitude']}")
            logger.info(
                f"    Favorite cover prob: {game['favorite_cover_prob']:.1%} "
                f"(edge: {game['spread_edge']:+.1%})"
            )

            # Total predictions
            if game["total_points"] is not None:
                logger.info(f"  Total: {game['total_points']}")
                logger.info(
                    f"    Over prob: {game['over_prob']:.1%} (edge: {game['total_edge']:+.1%})"
                )

        # Highlight best edges
        logger.info("\n" + "=" * 80)
        logger.info("BEST OPPORTUNITIES")
        logger.info("=" * 80)

        # Best spread edges
        spread_cols = [
            "favorite_team",
            "spread_magnitude",
            "favorite_cover_prob",
            "spread_edge",
        ]
        spread_edges = predictions[spread_cols].copy()
        spread_edges = spread_edges[spread_edges["spread_edge"].abs() >= args.min_edge]
        spread_edges = spread_edges.sort_values("spread_edge", ascending=False, key=abs)

        if len(spread_edges) > 0:
            logger.info("\nSpread opportunities:")
            for _, edge in spread_edges.iterrows():
                side = "Favorite" if edge["spread_edge"] > 0 else "Underdog"
                logger.info(f"  {side}: {edge['favorite_team']} (edge: {edge['spread_edge']:+.1%})")
        else:
            logger.info("\nNo significant spread edges found")

        # Best total edges
        total_cols = [
            "home_team",
            "away_team",
            "total_points",
            "over_prob",
            "total_edge",
        ]
        total_edges = predictions[total_cols].copy()
        total_edges = total_edges[total_edges["total_edge"].abs() >= args.min_edge]
        total_edges = total_edges.sort_values("total_edge", ascending=False, key=abs)

        if len(total_edges) > 0:
            logger.info("\nTotal opportunities:")
            for _, edge in total_edges.iterrows():
                side = "Over" if edge["total_edge"] > 0 else "Under"
                logger.info(
                    f"  {side} {edge['total_points']}: "
                    f"{edge['home_team']} vs {edge['away_team']} "
                    f"(edge: {edge['total_edge']:+.1%})"
                )
        else:
            logger.info("\nNo significant total edges found")

        logger.info("\n" + "=" * 80)

    except Exception as e:
        logger.error(f"Prediction failed: {e}", exc_info=True)
        raise SystemExit(1) from e


if __name__ == "__main__":
    main()
