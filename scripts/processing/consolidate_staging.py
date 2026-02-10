"""Consolidate raw data sources into ML-ready staging layer.

Rebuilds the staging directory with pre-computed, feature-engineered datasets:
- events.parquet: Unified event catalog with scores
- line_features.parquet: Pre-computed line movement features from SQLite views
- team_ratings.parquet: Latest KenPom ratings merged with four factors

This script should run nightly after raw data collection (collect_hybrid.py).
Staging data is ephemeral and rebuilt from raw sources each time.

Usage:
    # Rebuild staging layer
    uv run python scripts/consolidate_staging.py

    # Dry run (validate only, no writes)
    uv run python scripts/consolidate_staging.py --dry-run

    # Force rebuild even if recent
    uv run python scripts/consolidate_staging.py --force
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import (
    read_parquet_df,
)
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.config.settings import settings
from sports_betting_edge.utils.datetime_utils import (
    convert_series_to_pacific,
    now_utc,
    parse_series,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def check_if_stale(staging_path: Path, max_age_hours: int = 24) -> bool:
    """Check if staging data needs rebuild based on metadata timestamp.

    Args:
        staging_path: Path to staging directory
        max_age_hours: Maximum age in hours before considering stale

    Returns:
        True if staging is stale or missing, False if recent
    """
    metadata_file = staging_path / "metadata.json"

    if not metadata_file.exists():
        logger.info("No metadata found - staging rebuild needed")
        return True

    try:
        with open(metadata_file) as f:
            metadata = json.load(f)

        built_at_str = metadata.get("built_at")
        if not built_at_str:
            logger.warning("Metadata missing built_at timestamp - rebuild needed")
            return True

        # Parse metadata timestamp (now in "YYYY-MM-DD HH:MM:SS UTC" format)
        try:
            built_at = datetime.strptime(built_at_str, "%Y-%m-%d %H:%M:%S UTC")
        except ValueError:
            # Fallback for old ISO format timestamps
            built_at = datetime.fromisoformat(built_at_str.replace("Z", "+00:00"))

        age = datetime.now() - built_at
        age_hours = age.total_seconds() / 3600

        if age_hours > max_age_hours:
            logger.info(f"Staging is stale ({age_hours:.1f}h old, max {max_age_hours}h)")
            return True

        logger.info(f"Staging is recent ({age_hours:.1f}h old)")
        return False

    except (json.JSONDecodeError, ValueError) as e:
        logger.warning(f"Could not parse metadata: {e} - rebuild needed")
        return True


def calculate_rest_features(events: pd.DataFrame) -> pd.DataFrame:
    """Calculate rest days and road streak features for each game.

    For each game, calculates situational factors:
    - Days since last game (rest days)
    - Back-to-back indicator (0 days rest)
    - Short rest indicator (1 day rest)
    - Road streak (consecutive away games before this one)
    - Days since last home game (for away teams)

    Args:
        events: Events DataFrame with commence_time, home_team, away_team

    Returns:
        DataFrame with rest features added as new columns
    """
    logger.info("Calculating rest days and road streak features...")

    # Ensure sorted by time
    events = events.sort_values("commence_time").copy()

    # Initialize feature lists
    rest_features = {
        "home_rest_days": [],
        "away_rest_days": [],
        "home_back_to_back": [],
        "away_back_to_back": [],
        "home_short_rest": [],
        "away_short_rest": [],
        "away_road_streak": [],
        "away_days_on_road": [],
    }

    # Track team history: {team_name: {
    #   'last_game': datetime, 'last_home_game': datetime, 'road_streak': int
    # }}
    team_history: dict[str, dict] = {}

    for _, row in events.iterrows():
        home_team = row["home_team"]
        away_team = row["away_team"]
        game_time = row["commence_time"]

        # === HOME TEAM FEATURES ===
        if home_team in team_history:
            last_game = team_history[home_team]["last_game"]
            rest_days = (game_time - last_game).days
            rest_features["home_rest_days"].append(rest_days)
            rest_features["home_back_to_back"].append(rest_days == 0)
            rest_features["home_short_rest"].append(rest_days == 1)
        else:
            # First game of season - use neutral defaults
            rest_features["home_rest_days"].append(3)  # Assume typical 3-day rest
            rest_features["home_back_to_back"].append(False)
            rest_features["home_short_rest"].append(False)

        # === AWAY TEAM FEATURES ===
        if away_team in team_history:
            last_game = team_history[away_team]["last_game"]
            rest_days = (game_time - last_game).days
            road_streak = team_history[away_team]["road_streak"]
            last_home = team_history[away_team]["last_home_game"]

            rest_features["away_rest_days"].append(rest_days)
            rest_features["away_back_to_back"].append(rest_days == 0)
            rest_features["away_short_rest"].append(rest_days == 1)
            rest_features["away_road_streak"].append(road_streak)

            if last_home is not None:
                rest_features["away_days_on_road"].append((game_time - last_home).days)
            else:
                rest_features["away_days_on_road"].append(0)  # First game was away
        else:
            # First game of season
            rest_features["away_rest_days"].append(3)  # Assume typical 3-day rest
            rest_features["away_back_to_back"].append(False)
            rest_features["away_short_rest"].append(False)
            rest_features["away_road_streak"].append(0)
            rest_features["away_days_on_road"].append(0)

        # === UPDATE TEAM HISTORY ===
        # Home team: playing at home resets road streak
        team_history[home_team] = {
            "last_game": game_time,
            "last_home_game": game_time,
            "road_streak": 0,
        }

        # Away team: increment road streak
        if away_team not in team_history:
            team_history[away_team] = {
                "last_game": game_time,
                "last_home_game": None,
                "road_streak": 1,  # This game starts their streak
            }
        else:
            team_history[away_team]["last_game"] = game_time
            team_history[away_team]["road_streak"] += 1

    # Add features to events
    for feature_name, values in rest_features.items():
        events[feature_name] = values

    # Log summary statistics
    home_rest_avg = events["home_rest_days"].mean()
    away_rest_avg = events["away_rest_days"].mean()
    logger.info(f"  Rest days: home avg={home_rest_avg:.1f}, away avg={away_rest_avg:.1f}")

    home_b2b = events["home_back_to_back"].sum()
    away_b2b = events["away_back_to_back"].sum()
    logger.info(f"  Back-to-back games: home={home_b2b}, away={away_b2b}")

    road_max = events["away_road_streak"].max()
    road_avg = events["away_road_streak"].mean()
    logger.info(f"  Road streaks: max={road_max}, avg={road_avg:.1f}")

    return events


def calculate_rolling_metrics(events: pd.DataFrame) -> pd.DataFrame:
    """Calculate rolling performance metrics for each team.

    Tracks each team's recent results and computes rolling averages
    over last 5 and last 10 games. Uses the same chronological
    iteration pattern as calculate_rest_features().

    Args:
        events: Events DataFrame with scores, sorted by commence_time

    Returns:
        DataFrame with rolling metric columns added
    """
    from collections import deque

    logger.info("Calculating rolling performance metrics...")

    events = events.sort_values("commence_time").copy()

    # Only compute for games with scores
    has_scores = events["home_score"].notna() & events["away_score"].notna()

    # Initialize output columns with NaN
    for col in [
        "home_last5_margin_avg",
        "away_last5_margin_avg",
        "home_last10_margin_avg",
        "away_last10_margin_avg",
        "home_last5_win_pct",
        "away_last5_win_pct",
        "home_win_streak",
        "away_win_streak",
        "home_last5_ppg",
        "away_last5_ppg",
    ]:
        events[col] = float("nan")

    # Track per-team history: deque of (margin, points_scored, won)
    team_history: dict[str, deque[tuple[float, float, bool]]] = {}

    for idx, row in events.iterrows():
        home = row["home_team"]
        away = row["away_team"]

        # Compute features BEFORE this game (look-back only)
        for team, prefix in [(home, "home"), (away, "away")]:
            if team in team_history and len(team_history[team]) > 0:
                history = list(team_history[team])
                margins = [h[0] for h in history]
                ppg = [h[1] for h in history]
                wins = [h[2] for h in history]

                # Last 5
                l5 = min(5, len(history))
                events.at[idx, f"{prefix}_last5_margin_avg"] = sum(margins[-l5:]) / l5
                events.at[idx, f"{prefix}_last5_win_pct"] = sum(wins[-l5:]) / l5
                events.at[idx, f"{prefix}_last5_ppg"] = sum(ppg[-l5:]) / l5

                # Last 10
                l10 = min(10, len(history))
                events.at[idx, f"{prefix}_last10_margin_avg"] = sum(margins[-l10:]) / l10

                # Win streak (consecutive recent wins, negative = losses)
                streak = 0
                for w in reversed(wins):
                    if w and streak >= 0:
                        streak += 1
                    elif not w and streak <= 0:
                        streak -= 1
                    else:
                        break
                events.at[idx, f"{prefix}_win_streak"] = streak

        # Update history AFTER computing features (no data leakage)
        if has_scores.at[idx]:
            home_score = float(row["home_score"])
            away_score = float(row["away_score"])
            home_margin = home_score - away_score
            away_margin = away_score - home_score

            if home not in team_history:
                team_history[home] = deque(maxlen=10)
            team_history[home].append((home_margin, home_score, home_margin > 0))

            if away not in team_history:
                team_history[away] = deque(maxlen=10)
            team_history[away].append((away_margin, away_score, away_margin > 0))

    # Log summary
    valid = events["home_last5_margin_avg"].notna()
    logger.info(f"  Rolling metrics computed for {valid.sum()}/{len(events)} games")

    return events


def consolidate_events(
    db: OddsAPIDatabase,
    output_path: Path,
    dry_run: bool = False,
) -> pd.DataFrame:
    """Extract events with scores from SQLite database.

    Args:
        db: OddsAPIDatabase connection
        output_path: Path to write events.parquet
        dry_run: If True, skip writing file

    Returns:
        Events DataFrame with rest and situational features
    """
    logger.info("Extracting events with scores from SQLite...")

    # Get events with scores
    events = db.get_events_with_scores()

    # Add status column (all games with scores are final)
    events["status"] = "final"
    events["source"] = "odds_api"

    # Convert commence_time to Pacific timezone using new utilities
    # Parse ISO8601 strings to UTC timezone-aware datetimes
    events["commence_time"] = parse_series(events["commence_time"])

    # Convert to Pacific timezone for display and analysis
    events["commence_time_pacific"] = convert_series_to_pacific(events["commence_time"])

    # Extract date in Pacific timezone (not UTC!)
    events["game_date"] = events["commence_time_pacific"].dt.date

    logger.info(f"  Found {len(events)} completed games")
    logger.info(f"  Date range: {events['game_date'].min()} to {events['game_date'].max()}")

    # Calculate rest days and road streak features
    events = calculate_rest_features(events)

    # Calculate rolling performance metrics (last 5/10 games)
    events = calculate_rolling_metrics(events)

    # Enrich with ESPN context (neutral site, conference)
    events = enrich_with_espn_context(events, dry_run=dry_run)

    if not dry_run:
        # Write DataFrame directly using pandas
        output_path.parent.mkdir(parents=True, exist_ok=True)
        events.to_parquet(output_path, index=False)
        logger.info(f"  Wrote {output_path}")

    return events


def consolidate_line_features(
    db: OddsAPIDatabase,
    event_ids: list[str],
    output_path: Path,
    dry_run: bool = False,
) -> pd.DataFrame:
    """Extract pre-computed line features from SQLite views.

    Args:
        db: OddsAPIDatabase connection
        event_ids: List of event IDs to extract features for
        output_path: Path to write line_features.parquet
        dry_run: If True, skip writing file

    Returns:
        Line features DataFrame with spreads and totals
    """
    logger.info("Extracting line movement features from SQLite views...")

    # Build features directly from canonical_spreads and spread_movements
    # Instead of relying on ml_line_features view which may not exist
    try:
        line_features = db.get_ml_line_features(event_ids=event_ids)
    except Exception as e:
        logger.warning(f"  ml_line_features view failed: {e}")
        logger.info("  Building features from canonical_spreads instead...")

        # Fallback: Get opening/closing spreads for primary book (fanduel)
        line_features = db.get_opening_closing_spreads(
            event_ids=event_ids,
            book_key="fanduel",
        )

    logger.info(f"  Found spread features for {len(line_features)} games")

    # Add totals data (opening_total, closing_total)
    logger.info("  Extracting totals data...")
    totals_list = []
    for event_id in event_ids:
        try:
            totals = db.get_canonical_totals(event_id=event_id, book_key="fanduel")
            if len(totals) > 0:
                opening_total = totals.iloc[0]["total"]
                closing_total = totals.iloc[-1]["total"]
                totals_list.append(
                    {
                        "event_id": event_id,
                        "opening_total": opening_total,
                        "closing_total": closing_total,
                    }
                )
        except Exception:
            # Skip events without totals
            pass

    if totals_list:
        totals_df = pd.DataFrame(totals_list)
        # Merge totals into line_features
        line_features = line_features.merge(totals_df, on="event_id", how="left")
        logger.info(f"  Added totals for {len(totals_df)} games")
    else:
        logger.warning("  No totals data found")

    # Calculate total movement (if totals data exists)
    if "opening_total" in line_features.columns and "closing_total" in line_features.columns:
        line_features["total_movement"] = (
            line_features["closing_total"] - line_features["opening_total"]
        )
        logger.info("  Calculated total_movement feature")

    # Add bias indicator features for meta-learner
    # These are constant features that help the ensemble meta-learner
    # learn systematic market biases (e.g., 68.1% underdog edge, 62.7% under edge)
    if "closing_spread" in line_features.columns:
        # is_underdog: Constant indicator for spread betting (meta-learner learns bias)
        # Always 1 because underdog is ALWAYS available in spread markets
        line_features["is_underdog"] = 1

        # underdog_magnitude: Absolute spread value (how many points underdog gets)
        line_features["underdog_magnitude"] = line_features["closing_spread"].abs()
        logger.info("  Added spread bias indicators (is_underdog, underdog_magnitude)")

    if "closing_total" in line_features.columns:
        # is_under: Constant indicator for totals betting (meta-learner learns bias)
        # Always 1 because under is ALWAYS available in totals markets
        line_features["is_under"] = 1

        # total_magnitude: Total value (market's expected combined score)
        line_features["total_magnitude"] = line_features["closing_total"]
        logger.info("  Added totals bias indicators (is_under, total_magnitude)")

    # Add line movement features (Day 3-4)
    # Velocity, divergence, and late movements capture +7.3% line movement edge
    logger.info("  Extracting line movement features...")

    # Spread velocity (points per hour movement rate)
    try:
        velocity_df = db.get_spread_velocity(event_ids=event_ids, book_key="fanduel")
        if len(velocity_df) > 0:
            line_features = line_features.merge(
                velocity_df[["event_id", "spread_velocity", "steam_moves_count"]],
                on="event_id",
                how="left",
            )
            logger.info(f"    Added spread_velocity for {len(velocity_df)} games")
    except Exception as e:
        logger.warning(f"    Could not extract spread_velocity: {e}")

    # Book divergence (sharp vs public books)
    try:
        divergence_df = db.get_book_divergence(event_ids=event_ids)
        if len(divergence_df) > 0:
            line_features = line_features.merge(
                divergence_df[["event_id", "book_divergence", "has_disagreement"]],
                on="event_id",
                how="left",
            )
            logger.info(f"    Added book_divergence for {len(divergence_df)} games")
    except Exception as e:
        logger.warning(f"    Could not extract book_divergence: {e}")

    # Last hour movement (final hour before game)
    try:
        last_hour_df = db.get_last_hour_movement(event_ids=event_ids, book_key="fanduel")
        if len(last_hour_df) > 0:
            line_features = line_features.merge(
                last_hour_df[["event_id", "final_hour_movement", "movement_direction"]],
                on="event_id",
                how="left",
            )
            logger.info(f"    Added final_hour_movement for {len(last_hour_df)} games")
    except Exception as e:
        logger.warning(f"    Could not extract final_hour_movement: {e}")

    # Convert datetime columns to Pacific timezone
    if "opening_time" in line_features.columns and len(line_features) > 0:
        logger.info("  Converting line feature timestamps to Pacific timezone...")
        line_features["opening_time"] = parse_series(line_features["opening_time"])
        line_features["opening_time_pacific"] = convert_series_to_pacific(
            line_features["opening_time"]
        )

    if "closing_time" in line_features.columns and len(line_features) > 0:
        line_features["closing_time"] = parse_series(line_features["closing_time"])
        line_features["closing_time_pacific"] = convert_series_to_pacific(
            line_features["closing_time"]
        )

    # Report coverage
    coverage_pct = (len(line_features) / len(event_ids)) * 100 if event_ids else 0
    logger.info(f"  Feature coverage: {coverage_pct:.1f}% ({len(line_features)}/{len(event_ids)})")

    if not dry_run:
        # Write DataFrame directly using pandas (simpler than adapter for DataFrames)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        line_features.to_parquet(output_path, index=False)
        logger.info(f"  Wrote {output_path}")

    return line_features


def consolidate_team_ratings(
    kenpom_path: Path,
    output_path: Path,
    season: int = 2026,
    team_mapping_path: Path | None = None,
    dry_run: bool = False,
) -> pd.DataFrame | None:
    """Merge KenPom ratings, four factors, and height into unified team ratings.

    Args:
        kenpom_path: Path to KenPom data directory
        output_path: Path to write team_ratings.parquet
        season: Season year
        team_mapping_path: Optional path to team_mapping.parquet for name alignment
        dry_run: If True, skip writing file

    Returns:
        Team ratings DataFrame with odds_api_name for merging, or None if KenPom data missing
    """
    logger.info(f"Consolidating KenPom data for season {season}...")

    # Load ratings
    ratings_file = kenpom_path / "ratings" / "season" / f"ratings_{season}.parquet"
    if not ratings_file.exists():
        logger.warning(
            f"KenPom ratings not found: {ratings_file} - "
            "Skipping team ratings consolidation. "
            "Run 'uv run python scripts/collect_kenpom_for_pipeline.py' to fetch ratings."
        )
        return None

    ratings = read_parquet_df(str(ratings_file))
    logger.info(f"  Loaded {len(ratings)} teams from ratings")

    # Load four factors
    ff_file = kenpom_path / "four-factors" / "season" / f"four-factors_{season}.parquet"
    if not ff_file.exists():
        logger.warning(f"Four factors not found: {ff_file} - continuing without")
        ff = pd.DataFrame()
    else:
        ff = read_parquet_df(str(ff_file))
        logger.info(f"  Loaded {len(ff)} teams from four factors")

    # Load height data
    height_file = kenpom_path / "height" / "season" / f"height_{season}.parquet"
    if not height_file.exists():
        logger.warning(f"Height data not found: {height_file} - continuing without")
        height = pd.DataFrame()
    else:
        height = read_parquet_df(str(height_file))
        logger.info(f"  Loaded {len(height)} teams from height data")

    # Merge ratings with four factors on TeamName
    if not ff.empty:
        team_ratings = ratings.merge(
            ff,
            on="TeamName",
            how="left",
            suffixes=("_rating", "_ff"),
        )
        # Use four-factors values for AdjOE, AdjDE, AdjTempo (more complete)
        # and ratings values for AdjEM, Luck, SOS
        rename_dict = {
            "TeamName": "kenpom_name",
            "AdjEM": "adj_em",  # From ratings (no suffix)
            "Pythag": "pythag",  # From ratings (no suffix) - Pythagorean win expectation
            "Luck": "luck",  # From ratings (no suffix)
            "SOS": "sos",  # From ratings (no suffix)
            "AdjOE_ff": "adj_o",  # From four-factors
            "AdjDE_ff": "adj_d",  # From four-factors
            "AdjTempo_ff": "adj_t",  # From four-factors
            "eFG_Pct": "efg_pct",  # From four-factors
            "TO_Pct": "to_pct",  # From four-factors
            "OR_Pct": "or_pct",  # From four-factors
            "FT_Rate": "ft_rate",  # From four-factors
        }
    else:
        team_ratings = ratings.copy()
        # No merge, use ratings columns directly
        rename_dict = {
            "TeamName": "kenpom_name",
            "AdjEM": "adj_em",
            "Pythag": "pythag",  # Pythagorean win expectation
            "AdjOE": "adj_o",
            "AdjDE": "adj_d",
            "AdjTempo": "adj_t",
            "Luck": "luck",
            "SOS": "sos",
        }

    # Rename columns to match staging schema
    team_ratings = team_ratings.rename(columns=rename_dict)

    # Load team mapping to add odds_api_name for merging
    if team_mapping_path and team_mapping_path.exists():
        logger.info(f"  Loading team mapping from {team_mapping_path}")
        team_mapping = read_parquet_df(str(team_mapping_path))

        # Merge with team mapping to get odds_api_name
        team_ratings = team_ratings.merge(
            team_mapping[["kenpom_name", "odds_api_name"]],
            on="kenpom_name",
            how="left",
        )

        mapped_count = team_ratings["odds_api_name"].notna().sum()
        logger.info(f"  Mapped {mapped_count}/{len(team_ratings)} teams to Odds API names")
    else:
        logger.warning("  No team mapping provided - direct name matching may fail")
        team_ratings["odds_api_name"] = team_ratings["kenpom_name"]

    # Merge with height data
    if not height.empty:
        team_ratings = team_ratings.merge(
            height[["TeamName", "HgtEff"]],  # Use effective height (minutes-weighted)
            left_on="kenpom_name",
            right_on="TeamName",
            how="left",
        )
        team_ratings = team_ratings.drop(columns=["TeamName"], errors="ignore")
        team_ratings = team_ratings.rename(columns={"HgtEff": "height_eff"})
        logger.info(f"  Merged height data: {team_ratings['height_eff'].notna().sum()} teams")
    else:
        # Add null column if height data missing
        team_ratings["height_eff"] = None

    # Merge with HCA data
    hca_file = kenpom_path / "hca" / "season" / f"hca_{season}.parquet"
    if hca_file.exists():
        hca = read_parquet_df(str(hca_file))
        logger.info(f"  Loaded {len(hca)} teams from HCA data")
        # HCA table uses "Team" column; merge Pts (points HCA) and Elev (elevation)
        hca_cols = ["Team"]
        if "HCA" in hca.columns:
            hca_cols.append("HCA")
        if "Pts" in hca.columns:
            hca_cols.append("Pts")
        if "Elev" in hca.columns:
            hca_cols.append("Elev")
        team_ratings = team_ratings.merge(
            hca[hca_cols],
            left_on="kenpom_name",
            right_on="Team",
            how="left",
        )
        team_ratings = team_ratings.drop(columns=["Team"], errors="ignore")
        team_ratings = team_ratings.rename(
            columns={"HCA": "hca", "Pts": "hca_pts", "Elev": "elevation"}
        )
        logger.info(f"  Merged HCA data: {team_ratings['hca'].notna().sum()} teams")
    else:
        logger.warning(f"  HCA data not found: {hca_file} - continuing without")
        team_ratings["hca"] = None
        team_ratings["hca_pts"] = None
        team_ratings["elevation"] = None

    # Add season column
    team_ratings["season"] = season

    # Select only needed columns (including odds_api_name for merging)
    desired_cols = [
        "kenpom_name",
        "odds_api_name",
        "adj_em",
        "pythag",
        "adj_o",
        "adj_d",
        "adj_t",
        "luck",
        "sos",
        "efg_pct",
        "to_pct",
        "or_pct",
        "ft_rate",
        "height_eff",
        "hca",
        "hca_pts",
        "elevation",
        "season",
    ]

    # Only keep columns that actually exist
    available_cols = [col for col in desired_cols if col in team_ratings.columns]
    team_ratings = team_ratings[available_cols]

    logger.info(
        f"  Consolidated {len(team_ratings)} teams with {len(team_ratings.columns)} features"
    )

    if not dry_run:
        # Write DataFrame directly using pandas
        output_path.parent.mkdir(parents=True, exist_ok=True)
        team_ratings.to_parquet(output_path, index=False)
        logger.info(f"  Wrote {output_path}")

    return team_ratings


def consolidate_fanmatch_predictions(
    events: pd.DataFrame,
    kenpom_path: Path,
    output_path: Path,
    season: int = 2026,
    team_mapping_path: Path | None = None,
    dry_run: bool = False,
) -> pd.DataFrame | None:
    """Match KenPom FanMatch predictions to staging events.

    Reads cached fanmatch_season_{season}.parquet and matches to staging events
    via team name mapping. Computes kp_predicted_margin and kp_predicted_total.

    Args:
        events: Events DataFrame with event_id, home_team, away_team, game_date
        kenpom_path: Path to KenPom data directory
        output_path: Path to write fanmatch_predictions.parquet
        season: Season year
        team_mapping_path: Path to team_mapping.parquet for name alignment
        dry_run: If True, skip writing file

    Returns:
        FanMatch predictions DataFrame or None if data unavailable
    """
    logger.info("Consolidating FanMatch predictions...")

    fanmatch_file = kenpom_path / "fanmatch" / f"fanmatch_season_{season}.parquet"
    if not fanmatch_file.exists():
        logger.warning(
            f"FanMatch data not found: {fanmatch_file} - "
            "Skipping FanMatch consolidation. "
            "Run market_vs_kenpom_season.py to collect FanMatch data."
        )
        return None

    fanmatch = read_parquet_df(str(fanmatch_file))
    logger.info(f"  Loaded {len(fanmatch)} FanMatch predictions")

    # Load team mapping (kenpom_name -> odds_api_name)
    if team_mapping_path and team_mapping_path.exists():
        team_mapping = read_parquet_df(str(team_mapping_path))
        kp_to_odds = dict(
            zip(
                team_mapping["kenpom_name"],
                team_mapping["odds_api_name"],
                strict=False,
            )
        )
        logger.info(f"  Loaded {len(kp_to_odds)} team name mappings")
    else:
        logger.warning("  No team mapping - FanMatch matching will be unreliable")
        return None

    # Map KenPom team names to odds_api names in fanmatch data
    fanmatch["home_team_mapped"] = fanmatch["kp_home"].map(kp_to_odds)
    fanmatch["away_team_mapped"] = fanmatch["kp_visitor"].map(kp_to_odds)

    # Ensure game_date is string for matching
    fanmatch["game_date"] = pd.to_datetime(fanmatch["game_date"]).dt.date
    events_copy = events[["event_id", "home_team", "away_team", "game_date"]].copy()
    events_copy["game_date"] = pd.to_datetime(events_copy["game_date"]).dt.date

    # Match fanmatch to events on (home_team, away_team, game_date)
    matched = events_copy.merge(
        fanmatch[
            [
                "game_date",
                "home_team_mapped",
                "away_team_mapped",
                "kp_predicted_margin",
                "kp_predicted_total",
                "kp_home_wp",
            ]
        ],
        left_on=["home_team", "away_team", "game_date"],
        right_on=["home_team_mapped", "away_team_mapped", "game_date"],
        how="inner",
    )

    # Clean up merge columns
    matched = matched.drop(columns=["home_team_mapped", "away_team_mapped"], errors="ignore")

    # Select final columns
    result = matched[["event_id", "kp_predicted_margin", "kp_predicted_total", "kp_home_wp"]].copy()

    # Deduplicate (in case of multiple matches)
    result = result.drop_duplicates(subset="event_id")

    match_pct = len(result) / len(events) * 100 if len(events) > 0 else 0
    logger.info(
        f"  Matched {len(result)}/{len(events)} events ({match_pct:.1f}%) with FanMatch predictions"
    )

    if not dry_run and len(result) > 0:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        result.to_parquet(output_path, index=False)
        logger.info(f"  Wrote {output_path}")

    return result


def enrich_with_espn_context(
    events: pd.DataFrame,
    dry_run: bool = False,
) -> pd.DataFrame:
    """Enrich events with ESPN schedule context (neutral site, conference).

    Loads all ESPN schedule parquets and matches to events on
    (game_date, home_team, away_team). ESPN team names match odds_api format.

    Args:
        events: Events DataFrame with home_team, away_team, game_date
        dry_run: If True, skip file operations

    Returns:
        Events DataFrame with context columns added
    """
    import glob

    logger.info("Enriching events with ESPN context...")

    espn_dir = settings.espn_data_dir / "schedule"
    espn_files = sorted(glob.glob(str(espn_dir / "espn_schedule_*.parquet")))

    if not espn_files:
        logger.warning(f"  No ESPN schedule files in {espn_dir} - skipping")
        events["neutral_site"] = False
        events["same_conference"] = False
        events["is_conference_tournament"] = False
        return events

    # Load and combine all ESPN schedule files
    espn_dfs = [read_parquet_df(f) for f in espn_files]
    espn = pd.concat(espn_dfs, ignore_index=True)
    logger.info(f"  Loaded {len(espn)} ESPN schedule records from {len(espn_files)} files")

    # Normalize dates
    espn["game_date"] = pd.to_datetime(espn["game_date"]).dt.date
    events["game_date_dt"] = pd.to_datetime(events["game_date"]).dt.date

    # Select ESPN columns for merge
    espn_cols = espn[
        ["game_date", "home_team", "away_team", "neutral_site", "conference_name"]
    ].copy()
    espn_cols = espn_cols.drop_duplicates(subset=["game_date", "home_team", "away_team"])

    # Merge on (game_date, home_team, away_team)
    merged = events.merge(
        espn_cols,
        left_on=["game_date_dt", "home_team", "away_team"],
        right_on=["game_date", "home_team", "away_team"],
        how="left",
        suffixes=("", "_espn"),
    )

    # Fill neutral_site: default False if not matched
    if "neutral_site" not in merged.columns:
        merged["neutral_site"] = False
    merged["neutral_site"] = merged["neutral_site"].fillna(False).astype(bool)

    # Derive same_conference flag:
    # conference_name is only populated for conference games
    merged["same_conference"] = merged["conference_name"].notna()

    # Derive is_conference_tournament (March 8-15 window)
    merged["is_conference_tournament"] = merged["game_date_dt"].apply(
        lambda d: d.month == 3 and 8 <= d.day <= 15 if d else False
    )

    # Clean up
    drop_cols = ["game_date_dt", "game_date_espn", "conference_name"]
    merged = merged.drop(columns=[c for c in drop_cols if c in merged.columns])

    neutral_count = merged["neutral_site"].sum()
    conf_count = merged["same_conference"].sum()
    logger.info(f"  Neutral site games: {neutral_count}")
    logger.info(f"  Conference games: {conf_count}")

    return merged


def consolidate_action_network(
    events: pd.DataFrame,
    output_path: Path,
    season: int = 2026,
    dry_run: bool = False,
) -> pd.DataFrame | None:
    """Match Action Network betting features to staging events.

    AN team names use the same format as odds_api_name, so direct matching
    on (game_date, home_team, away_team) works without extra mapping.

    Args:
        events: Events DataFrame with event_id, home_team, away_team, game_date
        output_path: Path to write an_features.parquet
        season: Season year (used to find correct AN file)
        dry_run: If True, skip writing file

    Returns:
        Action Network features DataFrame or None if unavailable
    """
    logger.info("Consolidating Action Network features...")

    # AN file uses academic year start (2025 for 2025-26 season)
    an_file = settings.action_network_data_dir / "features" / f"an_features_{season - 1}.parquet"
    if not an_file.exists():
        # Try current season naming convention too
        an_file = settings.action_network_data_dir / "features" / f"an_features_{season}.parquet"
    if not an_file.exists():
        logger.warning("Action Network features not found - skipping")
        return None

    an_df = read_parquet_df(str(an_file))
    logger.info(f"  Loaded {len(an_df)} AN records")

    # Normalize game_date for matching
    an_df["game_date"] = pd.to_datetime(an_df["game_date"]).dt.date
    events_copy = events[["event_id", "home_team", "away_team", "game_date"]].copy()
    events_copy["game_date"] = pd.to_datetime(events_copy["game_date"]).dt.date

    # Select useful AN columns for models
    an_feature_cols = [
        "game_date",
        "home_team",
        "away_team",
    ]
    # Add available feature columns
    optional_cols = [
        "spread_sharp_divergence",
        "total_sharp_divergence",
        "ml_sharp_divergence",
        "spread_home_money_pct",
        "spread_home_tickets_pct",
        "total_over_money_pct",
        "total_over_tickets_pct",
        "num_bets",
        "pinnacle_spread",
        "pinnacle_total",
        "consensus_spread",
        "consensus_total",
        "home_rank",
        "away_rank",
    ]
    for col in optional_cols:
        if col in an_df.columns:
            an_feature_cols.append(col)

    an_subset = an_df[an_feature_cols].copy()

    # Match to events on (game_date, home_team, away_team)
    matched = events_copy.merge(
        an_subset,
        on=["game_date", "home_team", "away_team"],
        how="inner",
    )

    # Deduplicate
    matched = matched.drop_duplicates(subset="event_id")

    # Drop merge columns, keep event_id + features
    result_cols = ["event_id"] + [c for c in matched.columns if c in optional_cols]
    result = matched[result_cols].copy()

    match_pct = len(result) / len(events) * 100 if len(events) > 0 else 0
    logger.info(f"  Matched {len(result)}/{len(events)} events ({match_pct:.1f}%) with AN features")

    if not dry_run and len(result) > 0:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        result.to_parquet(output_path, index=False)
        logger.info(f"  Wrote {output_path}")

    return result


def save_metadata(
    staging_path: Path,
    events_count: int,
    scores_count: int,
    features_count: int,
    teams_count: int,
    fanmatch_count: int = 0,
    dry_run: bool = False,
) -> None:
    """Save staging metadata with build timestamp and coverage stats.

    Args:
        staging_path: Path to staging directory
        events_count: Number of events in staging
        scores_count: Number of events with scores
        features_count: Number of events with line features
        teams_count: Number of teams with ratings
        dry_run: If True, skip writing file
    """
    # Use UTC timestamp without "T" and "Z" for metadata
    built_at_utc = now_utc()

    metadata = {
        "built_at": built_at_utc.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "coverage": {
            "events": events_count,
            "with_scores": scores_count,
            "with_line_features": features_count,
            "teams_with_ratings": teams_count,
            "with_fanmatch": fanmatch_count,
        },
        "feature_coverage_pct": (features_count / events_count * 100) if events_count > 0 else 0,
        "score_coverage_pct": (scores_count / events_count * 100) if events_count > 0 else 0,
    }

    logger.info("\n=== Staging Metadata ===")
    logger.info(f"  Built at: {metadata['built_at']}")
    logger.info(f"  Events: {metadata['coverage']['events']}")
    score_pct = metadata["score_coverage_pct"]
    logger.info(f"  With scores: {metadata['coverage']['with_scores']} ({score_pct:.1f}%)")
    feature_pct = metadata["feature_coverage_pct"]
    feature_count = metadata["coverage"]["with_line_features"]
    logger.info(f"  With features: {feature_count} ({feature_pct:.1f}%)")
    logger.info(f"  Teams: {metadata['coverage']['teams_with_ratings']}")

    if not dry_run:
        metadata_path = staging_path / "metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=2)
        logger.info(f"\n[OK] Wrote metadata to {metadata_path}")


def validate_staging(staging_path: Path) -> bool:
    """Validate staging directory has all required files and reasonable data.

    Args:
        staging_path: Path to staging directory

    Returns:
        True if validation passes, False otherwise
    """
    logger.info("\n=== Validating Staging Data ===")

    required_files = [
        "events.parquet",
        "line_features.parquet",
        "metadata.json",
    ]

    optional_files = [
        "team_ratings.parquet",
        "fanmatch_predictions.parquet",
    ]

    all_valid = True

    for filename in required_files:
        filepath = staging_path / filename
        if not filepath.exists():
            logger.error(f"  [ERROR] Missing file: {filename}")
            all_valid = False
        else:
            logger.info(f"  [OK] Found {filename}")

    for filename in optional_files:
        filepath = staging_path / filename
        if not filepath.exists():
            logger.warning(f"  [WARNING] Optional file missing: {filename}")
        else:
            logger.info(f"  [OK] Found {filename}")

    if all_valid:
        # Load and validate row counts
        try:
            events = read_parquet_df(str(staging_path / "events.parquet"))
            line_features = read_parquet_df(str(staging_path / "line_features.parquet"))

            logger.info("\nRow counts:")
            logger.info(f"  Events: {len(events)}")
            logger.info(f"  Line features: {len(line_features)}")

            # Load team_ratings if available
            team_ratings_path = staging_path / "team_ratings.parquet"
            if team_ratings_path.exists():
                team_ratings = read_parquet_df(str(team_ratings_path))
                logger.info(f"  Team ratings: {len(team_ratings)}")

                if len(team_ratings) < 300:
                    logger.warning(f"  [WARNING] Only {len(team_ratings)} teams - expected ~350")
            else:
                logger.info("  Team ratings: 0 (not available)")

            # Validation checks
            if len(line_features) > len(events):
                logger.warning("  [WARNING] More line features than events - unexpected")

            if len(events) == 0:
                logger.error("  [ERROR] No events in staging")
                all_valid = False

        except Exception as e:
            logger.error(f"  [ERROR] Failed to validate staging data: {e}")
            all_valid = False

    if all_valid:
        logger.info("\n[OK] Staging validation passed")
    else:
        logger.error("\n[ERROR] Staging validation failed")

    return all_valid


def main() -> None:
    """Consolidate raw data into staging layer."""
    parser = argparse.ArgumentParser(description="Consolidate raw data into ML-ready staging layer")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate only, do not write files",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force rebuild even if staging is recent",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=settings.odds_api_db_path,
        help="Path to Odds API SQLite database",
    )
    parser.add_argument(
        "--kenpom-path",
        type=Path,
        default=settings.kenpom_api_data_dir,
        help="Path to KenPom data directory",
    )
    parser.add_argument(
        "--staging-path",
        type=Path,
        default=settings.staging_dir,
        help="Path to staging output directory",
    )
    parser.add_argument(
        "--season",
        type=int,
        default=2026,
        help="KenPom season year",
    )

    args = parser.parse_args()

    logger.info("=" * 80)
    logger.info("STAGING LAYER CONSOLIDATION")
    logger.info("=" * 80)

    # Check if rebuild needed
    if not args.force and not args.dry_run and not check_if_stale(args.staging_path):
        logger.info("\n[OK] Staging is recent, no rebuild needed (use --force to rebuild anyway)")
        return

    # Create staging directory
    args.staging_path.mkdir(parents=True, exist_ok=True)

    # Initialize database connection
    db = OddsAPIDatabase(args.db_path)

    try:
        # Step 1: Consolidate events with scores
        events = consolidate_events(
            db=db,
            output_path=args.staging_path / "events.parquet",
            dry_run=args.dry_run,
        )

        # Step 2: Consolidate line features
        event_ids = events["event_id"].tolist()
        line_features = consolidate_line_features(
            db=db,
            event_ids=event_ids,
            output_path=args.staging_path / "line_features.parquet",
            dry_run=args.dry_run,
        )

        # Step 3: Consolidate team ratings (with team mapping)
        team_mapping_path = settings.team_mapping_path
        team_ratings = consolidate_team_ratings(
            kenpom_path=args.kenpom_path,
            output_path=args.staging_path / "team_ratings.parquet",
            season=args.season,
            team_mapping_path=team_mapping_path if team_mapping_path.exists() else None,
            dry_run=args.dry_run,
        )

        # Step 4: Consolidate FanMatch predictions
        team_mapping_path_fm = settings.team_mapping_path
        fanmatch_preds = consolidate_fanmatch_predictions(
            events=events,
            kenpom_path=args.kenpom_path,
            output_path=args.staging_path / "fanmatch_predictions.parquet",
            season=args.season,
            team_mapping_path=(team_mapping_path_fm if team_mapping_path_fm.exists() else None),
            dry_run=args.dry_run,
        )

        # Step 5: Consolidate Action Network features
        consolidate_action_network(
            events=events,
            output_path=args.staging_path / "an_features.parquet",
            season=args.season,
            dry_run=args.dry_run,
        )

        # Step 6: Save metadata
        save_metadata(
            staging_path=args.staging_path,
            events_count=len(events),
            scores_count=len(events[events["home_score"].notna()]),
            features_count=len(line_features),
            teams_count=len(team_ratings) if team_ratings is not None else 0,
            fanmatch_count=(len(fanmatch_preds) if fanmatch_preds is not None else 0),
            dry_run=args.dry_run,
        )

        # Step 6: Validate
        if not args.dry_run:
            if validate_staging(args.staging_path):
                logger.info("\n[OK] Staging consolidation complete!")
            else:
                logger.error("\n[ERROR] Staging validation failed - check logs above")
                exit(1)
        else:
            logger.info("\n[DRY RUN] Would have consolidated staging data")

    finally:
        db.close()


if __name__ == "__main__":
    main()
