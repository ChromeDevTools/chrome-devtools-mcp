#!/usr/bin/env python3
"""Deploy models to generate predictions for today's games.

Loads trained models, applies to today's games with KenPom features,
calculates expected value (EV) vs market odds, and recommends plays.

Usage:
    uv run python scripts/deploy_today_predictions.py
    uv run python scripts/deploy_today_predictions.py --min-ev 0.02  # 2% edge minimum
"""

import argparse
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

# Configuration
MODELS_DIR = Path("data/models")
ANALYSIS_DIR = Path("data/analysis")
MIN_EV_DEFAULT = 0.015  # 1.5% minimum expected value (ROI)
MIN_PROBABILITY = 0.45  # Don't recommend extreme longshots
MAX_PROBABILITY = 0.70  # Don't recommend heavy favorites (juice too high)

print("=" * 80)
print("MODEL DEPLOYMENT - TODAY'S GAMES")
print("=" * 80)


def american_to_implied_prob(odds: int) -> float:
    """Convert American odds to implied probability."""
    if odds < 0:
        return abs(odds) / (abs(odds) + 100)
    else:
        return 100 / (odds + 100)


def prob_to_american_odds(prob: float) -> int:
    """Convert probability to fair American odds."""
    if prob >= 0.5:
        return int(-prob / (1 - prob) * 100)
    else:
        return int((1 - prob) / prob * 100)


def calculate_ev(model_prob: float, market_odds: int) -> float:
    """Calculate expected value (ROI) for a bet.

    Args:
        model_prob: Model's predicted probability of winning
        market_odds: American odds offered by bookmaker

    Returns:
        Expected value as decimal (0.05 = 5% ROI)
    """
    if market_odds < 0:
        # Favorite - risk abs(odds) to win 100
        win_amount = 100 / abs(market_odds)
        return (model_prob * win_amount) - ((1 - model_prob) * 1)
    else:
        # Underdog - risk 100 to win odds
        win_amount = market_odds / 100
        return (model_prob * win_amount) - ((1 - model_prob) * 1)


def load_models():
    """Load trained models."""
    print("\n[1/5] Loading trained models...")

    spreads_model_path = MODELS_DIR / "spreads_model.json"
    totals_model_path = MODELS_DIR / "totals_model.json"

    if not spreads_model_path.exists():
        print(f"  [ERROR] Spreads model not found: {spreads_model_path}")
        print("  Run training first: uv run python scripts/walk_forward_training.py")
        return None, None

    spreads_model = xgb.XGBClassifier()
    spreads_model.load_model(str(spreads_model_path))
    print("  [OK] Loaded spreads model")

    totals_model = None
    if totals_model_path.exists():
        totals_model = xgb.XGBClassifier()
        totals_model.load_model(str(totals_model_path))
        print("  [OK] Loaded totals model")
    else:
        print("  [WARN] Totals model not found, spreads only")

    return spreads_model, totals_model


def load_todays_games():
    """Load today's games with odds and KenPom data."""
    print("\n[2/5] Loading today's games...")

    today = date.today().isoformat()
    games_path = ANALYSIS_DIR / f"complete_analysis_{today}_main_lines.csv"

    if not games_path.exists():
        print(f"  [ERROR] Today's games not found: {games_path}")
        print("  Run data merge first")
        return None

    df = pd.read_csv(games_path)
    print(f"  [OK] Loaded {len(df)} games")

    # Filter to games with KenPom data
    df_kp = df[df["kenpom_margin"].notna()].copy()
    print(f"  [OK] {len(df_kp)} games with KenPom data")

    return df_kp


def prepare_spreads_features(df):
    """Prepare features for spreads model (favorite/underdog perspective)."""
    print("\n[3/5] Preparing spreads features...")

    features_list = []

    for idx, row in df.iterrows():
        home_spread = row["home_spread"]

        # Determine favorite/underdog
        is_home_fav = home_spread < 0

        if is_home_fav:
            # Home is favorite
            fav_adjoe = row["home_adjoe"]
            fav_adjde = row["home_adjde"]
            fav_adjem = row["home_adjem"]
            fav_tempo = row["home_tempo"]
            dog_adjoe = row["away_adjoe"]
            dog_adjde = row["away_adjde"]
            dog_adjem = row["away_adjem"]
            dog_tempo = row["away_tempo"]
        else:
            # Away is favorite
            fav_adjoe = row["away_adjoe"]
            fav_adjde = row["away_adjde"]
            fav_adjem = row["away_adjem"]
            fav_tempo = row["away_tempo"]
            dog_adjoe = row["home_adjoe"]
            dog_adjde = row["home_adjde"]
            dog_adjem = row["home_adjem"]
            dog_tempo = row["home_tempo"]

        # Build feature dict matching training data format
        features = {
            "game_idx": idx,
            "fav_adj_em": fav_adjem,
            "fav_adj_o": fav_adjoe,
            "fav_adj_d": fav_adjde,
            "fav_adj_t": fav_tempo,
            "dog_adj_em": dog_adjem,
            "dog_adj_o": dog_adjoe,
            "dog_adj_d": dog_adjde,
            "dog_adj_t": dog_tempo,
            "em_diff": fav_adjem - dog_adjem,
            "closing_spread": abs(home_spread),
        }

        features_list.append(features)

    features_df = pd.DataFrame(features_list)
    print(f"  [OK] Prepared {len(features_df)} games with {len(features_df.columns) - 1} features")

    return features_df


def prepare_totals_features(df):
    """Prepare features for totals model (home/away perspective)."""
    print("\n[3/5] Preparing totals features...")

    features_list = []

    for idx, row in df.iterrows():
        # Build feature dict matching training data format
        features = {
            "game_idx": idx,
            "away_adj_em": row["away_adjem"],
            "away_adj_o": row["away_adjoe"],
            "away_adj_d": row["away_adjde"],
            "away_adj_t": row["away_tempo"],
            "home_adj_em": row["home_adjem"],
            "home_adj_o": row["home_adjoe"],
            "home_adj_d": row["home_adjde"],
            "home_adj_t": row["home_tempo"],
            "tempo_avg": (row["away_tempo"] + row["home_tempo"]) / 2,
            "closing_total": row["total"],
        }

        features_list.append(features)

    features_df = pd.DataFrame(features_list)
    print(f"  [OK] Prepared {len(features_df)} games with {len(features_df.columns) - 1} features")

    return features_df


def generate_predictions(spreads_model, totals_model, games_df):
    """Generate predictions for all games."""
    print("\n[4/5] Generating predictions...")

    predictions = []

    # Spreads predictions
    if spreads_model is not None and len(games_df) > 0:
        spreads_features = prepare_spreads_features(games_df)

        # Get feature columns (exclude game_idx)
        feature_cols = [col for col in spreads_features.columns if col != "game_idx"]
        X = spreads_features[feature_cols].fillna(0)

        # Predict
        probs = spreads_model.predict_proba(X)[:, 1]  # Probability favorite covers

        for i, (_idx, row) in enumerate(games_df.iterrows()):
            fav_cover_prob = probs[i]
            home_spread = row["home_spread"]
            is_home_fav = home_spread < 0

            # Determine recommended side
            if is_home_fav:
                # Home is favorite
                home_win_prob = fav_cover_prob
                away_win_prob = 1 - fav_cover_prob
                home_odds = row["home_spread_juice"]
                away_odds = row["away_spread_juice"]
            else:
                # Away is favorite
                away_win_prob = fav_cover_prob
                home_win_prob = 1 - fav_cover_prob
                away_odds = row["away_spread_juice"]
                home_odds = row["home_spread_juice"]

            # Calculate EV for both sides
            home_ev = calculate_ev(home_win_prob, home_odds) if not np.isnan(home_odds) else -999
            away_ev = calculate_ev(away_win_prob, away_odds) if not np.isnan(away_odds) else -999

            # Recommend side with positive EV
            if home_ev > away_ev and home_ev > 0:
                predictions.append(
                    {
                        "game_time": row["game_time"],
                        "away_team": row["away_team"],
                        "home_team": row["home_team"],
                        "bet_type": "SPREAD",
                        "pick": row["home_team"],
                        "line": f"{row['home_spread']:+.1f}",
                        "odds": int(home_odds),
                        "model_prob": home_win_prob,
                        "fair_odds": prob_to_american_odds(home_win_prob),
                        "ev": home_ev,
                        "roi_pct": home_ev * 100,
                    }
                )
            elif away_ev > 0:
                predictions.append(
                    {
                        "game_time": row["game_time"],
                        "away_team": row["away_team"],
                        "home_team": row["home_team"],
                        "bet_type": "SPREAD",
                        "pick": row["away_team"],
                        "line": f"{-row['home_spread']:+.1f}",
                        "odds": int(away_odds),
                        "model_prob": away_win_prob,
                        "fair_odds": prob_to_american_odds(away_win_prob),
                        "ev": away_ev,
                        "roi_pct": away_ev * 100,
                    }
                )

    # Totals predictions
    if totals_model is not None and len(games_df) > 0:
        totals_features = prepare_totals_features(games_df)

        feature_cols = [col for col in totals_features.columns if col != "game_idx"]
        X = totals_features[feature_cols].fillna(0)

        probs = totals_model.predict_proba(X)[:, 1]  # Probability over hits

        for i, (_idx, row) in enumerate(games_df.iterrows()):
            over_prob = probs[i]
            under_prob = 1 - over_prob

            over_odds = row["over_juice"]
            under_odds = row["under_juice"]

            if pd.isna(over_odds) or pd.isna(under_odds):
                continue

            over_ev = calculate_ev(over_prob, over_odds)
            under_ev = calculate_ev(under_prob, under_odds)

            if over_ev > under_ev and over_ev > 0:
                predictions.append(
                    {
                        "game_time": row["game_time"],
                        "away_team": row["away_team"],
                        "home_team": row["home_team"],
                        "bet_type": "TOTAL",
                        "pick": "OVER",
                        "line": f"O{row['total']:.1f}",
                        "odds": int(over_odds),
                        "model_prob": over_prob,
                        "fair_odds": prob_to_american_odds(over_prob),
                        "ev": over_ev,
                        "roi_pct": over_ev * 100,
                    }
                )
            elif under_ev > 0:
                predictions.append(
                    {
                        "game_time": row["game_time"],
                        "away_team": row["away_team"],
                        "home_team": row["home_team"],
                        "bet_type": "TOTAL",
                        "pick": "UNDER",
                        "line": f"U{row['total']:.1f}",
                        "odds": int(under_odds),
                        "model_prob": under_prob,
                        "fair_odds": prob_to_american_odds(under_prob),
                        "ev": under_ev,
                        "roi_pct": under_ev * 100,
                    }
                )

    print(f"  [OK] Generated {len(predictions)} predictions")
    return pd.DataFrame(predictions)


def display_recommendations(predictions_df, min_ev):
    """Display ranked recommendations."""
    print("\n[5/5] Recommendations (Ranked by EV)...")
    print("=" * 80)

    # Filter by minimum EV and probability bounds
    filtered = predictions_df[
        (predictions_df["ev"] >= min_ev)
        & (predictions_df["model_prob"] >= MIN_PROBABILITY)
        & (predictions_df["model_prob"] <= MAX_PROBABILITY)
    ]

    if len(filtered) == 0:
        print("\n[INFO] No plays meet EV threshold")
        print(f"  Minimum EV: {min_ev * 100:.1f}%")
        print("  Try lowering threshold: --min-ev 0.01")
        return

    # Sort by EV descending
    filtered = filtered.sort_values("ev", ascending=False)

    print(f"\n{len(filtered)} RECOMMENDED PLAYS (min EV: {min_ev * 100:.1f}%)")
    print("=" * 80)

    for _i, row in filtered.iterrows():
        print(f"\n{row['game_time']}")
        print(f"{row['away_team']} @ {row['home_team']}")
        print(f"  BET: {row['pick']} {row['line']} ({row['odds']:+d})")
        print(f"  Model probability: {row['model_prob']:.1%}")
        print(f"  Fair odds: {row['fair_odds']:+d}")
        print(f"  Market odds: {row['odds']:+d}")
        print(f"  Expected Value: {row['roi_pct']:+.2f}% ROI")
        print(f"  Type: {row['bet_type']}")

    # Save to file
    output_path = ANALYSIS_DIR / f"predictions_{date.today().isoformat()}.csv"
    predictions_df.to_csv(output_path, index=False)
    print(f"\n[SAVED] All predictions -> {output_path}")

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total plays recommended: {len(filtered)}")
    print(f"Average EV: {filtered['ev'].mean() * 100:+.2f}% ROI")
    best_play = filtered.iloc[0]
    best_desc = f"{best_play['pick']} {best_play['line']}"
    best_ev = f"{best_play['roi_pct']:+.1f}% EV"
    print(f"Best play: {best_desc} ({best_ev})")

    spreads_count = len(filtered[filtered["bet_type"] == "SPREAD"])
    totals_count = len(filtered[filtered["bet_type"] == "TOTAL"])
    print("\nBy type:")
    print(f"  Spreads: {spreads_count}")
    print(f"  Totals: {totals_count}")


def main():
    """Main deployment pipeline."""
    parser = argparse.ArgumentParser(description="Deploy models for today's games")
    parser.add_argument(
        "--min-ev",
        type=float,
        default=MIN_EV_DEFAULT,
        help=f"Minimum expected value (ROI) to recommend (default: {MIN_EV_DEFAULT})",
    )
    args = parser.parse_args()

    # Load models
    spreads_model, totals_model = load_models()
    if spreads_model is None:
        return 1

    # Load today's games
    games_df = load_todays_games()
    if games_df is None or len(games_df) == 0:
        return 1

    # Generate predictions
    predictions_df = generate_predictions(spreads_model, totals_model, games_df)

    if len(predictions_df) == 0:
        print("\n[INFO] No positive EV plays found")
        return 0

    # Display recommendations
    display_recommendations(predictions_df, args.min_ev)

    return 0


if __name__ == "__main__":
    sys.exit(main())
