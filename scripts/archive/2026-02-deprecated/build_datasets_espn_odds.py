"""Build training datasets by matching ESPN results with Odds API historical lines.

Combines:
- ESPN game results (actual scores)
- Odds API historical lines (spreads, totals, movement)
- KenPom efficiency metrics
- Team name mapping

Usage:
    # First collect ESPN results:
    uv run python scripts/collect_espn_season_results.py \\
        --start 2025-11-01 --end 2026-03-31

    # Then build datasets:
    uv run python scripts/build_datasets_espn_odds.py \\
        --espn-data data/espn/season_results_2026.parquet \\
        --output-dir data/ml
"""

import argparse
import logging
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import write_parquet
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.core.team_mapper import TeamMapper
from sports_betting_edge.services.feature_engineering import FeatureEngineer

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def match_espn_to_odds_api(
    espn_games: pd.DataFrame,
    odds_db: OddsAPIDatabase,
    team_mapper: TeamMapper | None,
) -> pd.DataFrame:
    """Match ESPN games to Odds API events.

    Args:
        espn_games: DataFrame with ESPN game results
        odds_db: Odds API database adapter
        team_mapper: Team name mapper (or None for direct matching)

    Returns:
        DataFrame with matched games including event_id from Odds API
    """
    logger.info("Matching ESPN games to Odds API events...")

    # Get all Odds API events
    odds_events = odds_db.get_events_with_scores()

    # Convert game_date strings to dates
    espn_games["game_date_only"] = pd.to_datetime(espn_games["game_date"]).dt.date
    odds_events["game_date_only"] = pd.to_datetime(odds_events["commence_time"]).dt.date

    matches = []
    unmatched_count = 0

    for _, espn_game in espn_games.iterrows():
        espn_date = espn_game["game_date_only"]
        espn_home = espn_game["home_team"]
        espn_away = espn_game["away_team"]

        # Map ESPN names to Odds API names
        if team_mapper:
            # Get KenPom names first (canonical)
            kenpom_home = team_mapper.get_kenpom_name(espn_home, source="espn")
            kenpom_away = team_mapper.get_kenpom_name(espn_away, source="espn")

            # Then map to Odds API names
            odds_home = team_mapper.get_odds_api_name(kenpom_home)
            odds_away = team_mapper.get_odds_api_name(kenpom_away)
        else:
            # Direct name matching (fallback)
            odds_home = espn_home
            odds_away = espn_away

        # Find matching Odds API event (same date, same teams)
        candidates = odds_events[odds_events["game_date_only"] == espn_date]

        match = None
        for _, odds_event in candidates.iterrows():
            odds_home_team = odds_event["home_team"]
            odds_away_team = odds_event["away_team"]

            # Check if teams match (either order due to neutral sites)
            if (odds_home_team == odds_home and odds_away_team == odds_away) or (
                odds_home_team == odds_away and odds_away_team == odds_home
            ):
                match = odds_event
                break

        if match is not None:
            # Merge ESPN + Odds API data
            matched_row = {
                "espn_game_id": espn_game["game_id"],
                "event_id": match["event_id"],
                "game_date": espn_game["game_date"],
                "home_team": espn_game["home_team"],
                "away_team": espn_game["away_team"],
                "home_score": espn_game["home_score"],
                "away_score": espn_game["away_score"],
                "odds_api_home": match["home_team"],
                "odds_api_away": match["away_team"],
                "neutral_site": espn_game["neutral_site"],
                "conference_name": espn_game["conference_name"],
            }
            matches.append(matched_row)
        else:
            unmatched_count += 1
            logger.debug(
                f"No Odds API match for ESPN game: {espn_home} vs {espn_away} on {espn_date}"
            )

    matched_df = pd.DataFrame(matches)

    logger.info(f"Matched {len(matched_df)} games")
    logger.info(f"Unmatched {unmatched_count} games (no Odds API data)")
    logger.info(f"Match rate: {len(matched_df) / len(espn_games) * 100:.1f}%")

    return matched_df


def build_training_datasets(
    matched_games: pd.DataFrame,
    engineer: FeatureEngineer,
    output_dir: Path,
) -> None:
    """Build spreads and totals datasets from matched games.

    Args:
        matched_games: DataFrame with ESPN + Odds API matched games
        engineer: FeatureEngineer instance
        output_dir: Directory to save datasets
    """
    logger.info("Building training datasets...")

    # Load KenPom data
    kenpom_ratings = engineer.load_kenpom_ratings(season=2026)
    kenpom_ff = engineer.load_kenpom_four_factors(season=2026)

    # Get event IDs for line feature extraction
    event_ids = matched_games["event_id"].tolist()

    # Get opening/closing lines from Odds API
    line_features = engineer.odds_db.get_opening_closing_spreads(
        event_ids=event_ids, book_key="fanduel"
    )

    # Merge matched games with line features
    merged = matched_games.merge(line_features, on="event_id", how="inner")

    logger.info(f"Merged {len(merged)} games with line features")

    # Build spreads dataset
    spreads_features = []
    spreads_targets = []

    for _, row in merged.iterrows():
        features = {}

        # Favorite team features
        fav_features = engineer.get_team_features(
            row["favorite_team"], kenpom_ratings, kenpom_ff, prefix="fav_"
        )
        features.update(fav_features)

        # Underdog team features
        dog_features = engineer.get_team_features(
            row["underdog_team"], kenpom_ratings, kenpom_ff, prefix="dog_"
        )
        features.update(dog_features)

        # Matchup features
        if "fav_adj_em" in features and "dog_adj_em" in features:
            features["em_diff"] = features["fav_adj_em"] - features["dog_adj_em"]
        if "fav_adj_o" in features and "dog_adj_d" in features:
            features["fav_o_vs_dog_d"] = features["fav_adj_o"] - features["dog_adj_d"]
        if "dog_adj_o" in features and "fav_adj_d" in features:
            features["dog_o_vs_fav_d"] = features["dog_adj_o"] - features["fav_adj_d"]

        # Line features
        features["opening_spread"] = row.get("opening_spread", None)
        features["closing_spread"] = row.get("closing_spread", None)
        features["line_movement"] = row.get("line_movement", 0)

        # Target: Did favorite cover?
        home_score = row["home_score"]
        away_score = row["away_score"]
        home_team = row["odds_api_home"]
        favorite_team = row["favorite_team"]
        closing_spread = row["closing_spread"]

        # Determine if favorite is home or away
        margin = home_score - away_score if home_team == favorite_team else away_score - home_score

        favorite_covered = margin > closing_spread

        spreads_features.append(features)
        spreads_targets.append(1 if favorite_covered else 0)

    # Build totals dataset
    totals_list = []
    for event_id in event_ids:
        totals = engineer.odds_db.get_canonical_totals(event_id=event_id, book_key="fanduel")
        if len(totals) > 0:
            opening_total = totals.iloc[0]["total"]
            closing_total = totals.iloc[-1]["total"]
            totals_list.append(
                {
                    "event_id": event_id,
                    "opening_total": opening_total,
                    "closing_total": closing_total,
                    "total_movement": closing_total - opening_total,
                }
            )

    totals_df = pd.DataFrame(totals_list)
    merged_totals = matched_games.merge(totals_df, on="event_id", how="inner")

    logger.info(f"Merged {len(merged_totals)} games with totals")

    totals_features = []
    totals_targets = []

    for _, row in merged_totals.iterrows():
        features = {}

        # Home team features
        home_features = engineer.get_team_features(
            row["odds_api_home"], kenpom_ratings, kenpom_ff, prefix="home_"
        )
        features.update(home_features)

        # Away team features
        away_features = engineer.get_team_features(
            row["odds_api_away"], kenpom_ratings, kenpom_ff, prefix="away_"
        )
        features.update(away_features)

        # Tempo features
        if "home_adj_t" in features and "away_adj_t" in features:
            features["avg_tempo"] = (features["home_adj_t"] + features["away_adj_t"]) / 2
            features["tempo_diff"] = abs(features["home_adj_t"] - features["away_adj_t"])

        # Combined offense/defense
        if "home_adj_o" in features and "away_adj_o" in features:
            features["total_offense"] = features["home_adj_o"] + features["away_adj_o"]
        if "home_adj_d" in features and "away_adj_d" in features:
            features["total_defense"] = features["home_adj_d"] + features["away_adj_d"]

        # Line features
        features["opening_total"] = row["opening_total"]
        features["closing_total"] = row["closing_total"]
        features["total_movement"] = row["total_movement"]

        # Target: Did it go over?
        actual_total = row["home_score"] + row["away_score"]
        went_over = actual_total > row["closing_total"]

        totals_features.append(features)
        totals_targets.append(1 if went_over else 0)

    # Save spreads dataset
    spreads_df = pd.DataFrame(spreads_features)
    spreads_df["target"] = spreads_targets

    spreads_output = output_dir / "spreads_espn_odds_2026.parquet"
    write_parquet(spreads_df.to_dict(orient="records"), spreads_output)

    logger.info(
        f"[OK] Spreads dataset: {len(spreads_df)} games, {len(spreads_df.columns)} features"
    )
    logger.info(f"Saved to {spreads_output}")

    # Save totals dataset
    totals_df = pd.DataFrame(totals_features)
    totals_df["target"] = totals_targets

    totals_output = output_dir / "totals_espn_odds_2026.parquet"
    write_parquet(totals_df.to_dict(orient="records"), totals_output)

    logger.info(f"[OK] Totals dataset: {len(totals_df)} games, {len(totals_df.columns)} features")
    logger.info(f"Saved to {totals_output}")

    # Show target distributions
    logger.info("\n=== Dataset Statistics ===")
    logger.info(
        f"Spreads - Favorite covered: {sum(spreads_targets)} / {len(spreads_targets)} "
        f"({sum(spreads_targets) / len(spreads_targets) * 100:.1f}%)"
    )
    logger.info(
        f"Totals - Went over: {sum(totals_targets)} / {len(totals_targets)} "
        f"({sum(totals_targets) / len(totals_targets) * 100:.1f}%)"
    )


def main() -> None:
    """Build training datasets from ESPN + Odds API."""
    parser = argparse.ArgumentParser(
        description="Build training datasets from ESPN results + Odds API lines"
    )
    parser.add_argument(
        "--espn-data",
        type=Path,
        required=True,
        help="Path to ESPN season results parquet",
    )
    parser.add_argument(
        "--odds-db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to Odds API database",
    )
    parser.add_argument(
        "--kenpom-path",
        type=Path,
        default=Path("data/kenpom"),
        help="Path to KenPom data directory",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/ml"),
        help="Output directory for datasets",
    )
    parser.add_argument(
        "--season",
        type=int,
        default=2026,
        help="KenPom season year",
    )

    args = parser.parse_args()

    # Load ESPN results
    logger.info(f"Loading ESPN results from {args.espn_data}...")
    espn_games = pd.read_parquet(args.espn_data)
    logger.info(f"Loaded {len(espn_games)} ESPN games")

    # Initialize feature engineer
    with FeatureEngineer(
        kenpom_path=args.kenpom_path,
        espn_path=Path("data/espn"),  # Not used for this workflow
        odds_db_path=args.odds_db,
    ) as engineer:
        # Match ESPN to Odds API
        matched_games = match_espn_to_odds_api(espn_games, engineer.odds_db, engineer.team_mapper)

        if len(matched_games) == 0:
            logger.error("No matches found. Cannot build datasets.")
            return

        # Build training datasets
        build_training_datasets(matched_games, engineer, args.output_dir)

    logger.info("\n[OK] Dataset building complete!")


if __name__ == "__main__":
    main()
