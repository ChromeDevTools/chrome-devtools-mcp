"""Compare KenPom and ML model predictions."""

from __future__ import annotations

import numpy as np
import pandas as pd


def main() -> None:
    """Compare KenPom score predictions with ML model predictions."""
    # Load both prediction sets
    kenpom = pd.read_csv("data/outputs/predictions/scores_2026-02-05.csv")
    ml_model = pd.read_csv("data/outputs/predictions/2026-02-05_retrained.csv")

    print("=" * 100)
    print("KENPOM vs ML MODEL COMPARISON")
    print("=" * 100)
    print()

    # Merge on home_team and away_team
    merged = ml_model.merge(
        kenpom[
            [
                "home_team",
                "away_team",
                "predicted_home_score",
                "predicted_away_score",
                "predicted_total",
                "predicted_margin",
                "agrees_with_spread",
            ]
        ],
        on=["home_team", "away_team"],
        how="inner",
        suffixes=("_ml", "_kenpom"),
    )

    print(f"Games in comparison: {len(merged)}")
    print()

    # 1. SPREAD AGREEMENT
    print("=" * 100)
    print("1. SPREAD PREDICTION AGREEMENT")
    print("=" * 100)
    print()

    # ML model uses favorite_cover_prob > 0.5 as prediction
    merged["ml_predicts_favorite"] = merged["favorite_cover_prob"] > 0.5
    # KenPom column already named correctly after merge
    merged["kenpom_predicts_favorite"] = merged["agrees_with_spread"]

    ml_agree_count = merged["ml_predicts_favorite"].sum()
    kenpom_agree_count = merged["kenpom_predicts_favorite"].sum()

    ml_pct = ml_agree_count / len(merged) * 100
    kp_pct = kenpom_agree_count / len(merged) * 100
    print(f"ML Model agrees with spread: {ml_agree_count} / {len(merged)} ({ml_pct:.1f}%)")
    print(f"KenPom agrees with spread: {kenpom_agree_count} / {len(merged)} ({kp_pct:.1f}%)")
    print()

    # Games where they disagree
    disagreements = merged[merged["ml_predicts_favorite"] != merged["kenpom_predicts_favorite"]]
    print(f"Games where ML and KenPom DISAGREE on winner: {len(disagreements)}")
    if len(disagreements) > 0:
        print()
        for _, game in disagreements.iterrows():
            print(f"  {game['away_team']} @ {game['home_team']}")
            print(f"    Favorite: {game['favorite_team']} (-{game['spread_magnitude']})")
            print(f"    ML Model: Favorite cover prob = {game['favorite_cover_prob']:.1%}")
            print(f"    KenPom: Agrees = {game['kenpom_predicts_favorite']}")
            print()

    # 2. TOTAL PREDICTIONS
    print("=" * 100)
    print("2. TOTAL PREDICTIONS COMPARISON")
    print("=" * 100)
    print()

    print("Average Predicted Totals:")
    print(f"  Betting Lines: {merged['total_points'].mean():.1f} points")
    print(f"  KenPom: {merged['predicted_total'].mean():.1f} points")
    diff_mean = (merged["predicted_total"] - merged["total_points"]).mean()
    print(f"  Difference (KenPom - Betting Line): {diff_mean:.1f} points")
    print()

    # Show games with biggest total disagreement
    merged["total_diff_models"] = merged["predicted_total"] - merged["total_points"]
    print("Biggest Disagreements (KenPom vs Betting Line):")
    print()
    print("KenPom predicts HIGHER totals:")
    top_higher = merged.nlargest(5, "total_diff_models")
    for _, game in top_higher.iterrows():
        print(f"  {game['away_team']} @ {game['home_team']}")
        ln, kp, diff = game["total_points"], game["predicted_total"], game["total_diff_models"]
        print(f"    Betting Line: {ln:.1f} | KenPom: {kp:.1f} | Diff: +{diff:.1f}")

    print()
    print("KenPom predicts LOWER totals:")
    top_lower = merged.nsmallest(5, "total_diff_models")
    for _, game in top_lower.iterrows():
        print(f"  {game['away_team']} @ {game['home_team']}")
        ln, kp, diff = game["total_points"], game["predicted_total"], game["total_diff_models"]
        print(f"    Betting Line: {ln:.1f} | KenPom: {kp:.1f} | Diff: {diff:.1f}")

    print()

    # 3. OVER/UNDER PREDICTIONS
    print("=" * 100)
    print("3. OVER/UNDER PREDICTIONS")
    print("=" * 100)
    print()

    # ML model predicts over if over_prob > 0.5
    merged["ml_predicts_over"] = merged["over_prob"] > 0.5
    merged["kenpom_predicts_over"] = merged["predicted_total"] > merged["total_points"]

    ml_over_count = merged["ml_predicts_over"].sum()
    kenpom_over_count = merged["kenpom_predicts_over"].sum()

    ml_over_pct = ml_over_count / len(merged) * 100
    kp_over_pct = kenpom_over_count / len(merged) * 100
    print(f"ML Model predicts OVER: {ml_over_count} / {len(merged)} ({ml_over_pct:.1f}%)")
    print(f"KenPom predicts OVER: {kenpom_over_count} / {len(merged)} ({kp_over_pct:.1f}%)")
    print()

    # Agreement on over/under
    ou_agreement = (merged["ml_predicts_over"] == merged["kenpom_predicts_over"]).sum()
    ou_pct = ou_agreement / len(merged) * 100
    print(f"Models agree on Over/Under: {ou_agreement} / {len(merged)} ({ou_pct:.1f}%)")
    print()

    # Games where they disagree on O/U
    ou_disagreements = merged[merged["ml_predicts_over"] != merged["kenpom_predicts_over"]]
    print(f"Games where models DISAGREE on Over/Under: {len(ou_disagreements)}")
    if len(ou_disagreements) > 0:
        print()
        for _, game in ou_disagreements.head(10).iterrows():
            print(f"  {game['away_team']} @ {game['home_team']}")
            print(f"    Betting Total: {game['total_points']:.1f}")
            print(f"    ML Model: Over prob = {game['over_prob']:.1%}")
            print(f"    KenPom Total: {game['predicted_total']:.1f}")
            ml_pick = "OVER" if game["ml_predicts_over"] else "UNDER"
            kenpom_pick = "OVER" if game["kenpom_predicts_over"] else "UNDER"
            print(f"    ML picks {ml_pick}, KenPom picks {kenpom_pick}")
            print()

    # 4. MODEL CONFIDENCE
    print("=" * 100)
    print("4. MODEL CONFIDENCE ANALYSIS")
    print("=" * 100)
    print()

    print("ML Model Confidence (probability distributions):")
    print(f"  Avg Favorite Cover Prob: {merged['favorite_cover_prob'].mean():.1%}")
    print(f"  Avg Over Prob: {merged['over_prob'].mean():.1%}")
    print(f"  Std Dev Favorite Prob: {merged['favorite_cover_prob'].std():.3f}")
    print(f"  Most Confident Pick: {merged['favorite_cover_prob'].max():.1%}")
    print(f"  Least Confident Pick: {merged['favorite_cover_prob'].min():.1%}")
    print()

    print("KenPom Model (deterministic):")
    print(f"  Avg Margin: {merged['predicted_margin'].abs().mean():.1f} points")
    print(f"  Std Dev Margin: {merged['predicted_margin'].std():.1f}")
    print(f"  Largest Margin: {merged['predicted_margin'].abs().max():.1f} points")
    print()

    # 5. RECOMMENDED PICKS
    print("=" * 100)
    print("5. RECOMMENDED PICKS (Where Both Models Agree)")
    print("=" * 100)
    print()

    # High confidence ML picks that KenPom also agrees with
    high_conf_spread = merged[
        (merged["ml_predicts_favorite"] == merged["kenpom_predicts_favorite"])
        & (merged["favorite_cover_prob"] > 0.65)
    ].sort_values("favorite_cover_prob", ascending=False)

    print("SPREAD PICKS (Both models agree, ML confidence > 65%):")
    if len(high_conf_spread) == 0:
        print("  None found")
    else:
        for _, game in high_conf_spread.head(5).iterrows():
            pick = game["favorite_team"] if game["ml_predicts_favorite"] else game["underdog_team"]
            print(f"  {game['away_team']} @ {game['home_team']}")
            print(f"    Pick: {pick}")
            print(f"    ML Confidence: {game['favorite_cover_prob']:.1%}")
            kp_m = abs(game["predicted_margin"])
            sp = game["spread_magnitude"]
            print(f"    KenPom Margin: {kp_m:.1f} vs Spread: {sp:.1f}")
            print()

    # Over/Under picks where both agree
    ou_consensus = merged[merged["ml_predicts_over"] == merged["kenpom_predicts_over"]].copy()
    ou_consensus["ml_ou_confidence"] = np.maximum(
        ou_consensus["over_prob"], ou_consensus["under_prob"]
    )

    print("OVER/UNDER PICKS (Both models agree):")
    for _, game in ou_consensus.nlargest(5, "ml_ou_confidence").iterrows():
        pick = "OVER" if game["ml_predicts_over"] else "UNDER"
        print(f"  {game['away_team']} @ {game['home_team']}")
        print(f"    Pick: {pick} {game['total_points']:.1f}")
        print(f"    ML Confidence: {game['ml_ou_confidence']:.1%}")
        kp_tot = game["predicted_total"]
        line = game["total_points"]
        print(f"    KenPom Total: {kp_tot:.1f} vs Line: {line:.1f}")
        print()

    print("=" * 100)


if __name__ == "__main__":
    main()
