#!/usr/bin/env python3
"""Diagnostic script for score model performance investigation.

Checks:
1. Data availability (events, line features, team ratings)
2. Feature coverage and completeness
3. Model file existence and sizes
4. Training data date ranges
"""

from __future__ import annotations

from pathlib import Path

from sports_betting_edge.adapters.filesystem import read_parquet_df


def main() -> None:
    """Run diagnostics."""
    print("=" * 80)
    print("SCORE MODEL DIAGNOSTICS")
    print("=" * 80)

    # Check staging data
    print("\n1. STAGING DATA STATUS")
    print("-" * 80)

    events = read_parquet_df("data/staging/events.parquet")
    line_features = read_parquet_df("data/staging/line_features.parquet")
    team_ratings = read_parquet_df("data/staging/team_ratings.parquet")

    print(f"Events:        {len(events):5d} games")
    print(f"With scores:   {events['home_score'].notna().sum():5d} games")
    print(f"Date range:    {events['game_date'].min()} to {events['game_date'].max()}")
    print(f"\nLine features: {len(line_features):5d} games")
    print(f"Team ratings:  {len(team_ratings):5d} teams")

    if len(line_features) == 0:
        print("\n[ERROR] Line features table is EMPTY!")
        print("This prevents models from training properly.")
        print("Fix: Run 'uv run python scripts/processing/consolidate_staging.py --force'")

    # Check feature completeness
    print("\n2. FEATURE COVERAGE")
    print("-" * 80)

    if len(line_features) > 0:
        # Merge to check coverage
        merged = events.merge(line_features, on="event_id", how="inner")
        coverage = len(merged) / len(events) * 100
        print(f"Games with both scores AND line features: {len(merged)} ({coverage:.1f}%)")

        if coverage < 80:
            print(f"\n[WARNING] Only {coverage:.1f}% of games have complete features")
            print("Recommend: Collect more line data or use subset with complete data")
    else:
        print("Cannot compute coverage - line features table empty")

    # Check model files
    print("\n3. MODEL FILES")
    print("-" * 80)

    model_dir = Path("models")
    home_model = model_dir / "home_score_2026.pkl"
    away_model = model_dir / "away_score_2026.pkl"
    features_file = model_dir / "score_features.txt"

    if home_model.exists():
        size_mb = home_model.stat().st_size / 1024 / 1024
        print(f"Home model:   {home_model} ({size_mb:.2f} MB)")
    else:
        print("[ERROR] Home model not found!")

    if away_model.exists():
        size_mb = away_model.stat().st_size / 1024 / 1024
        print(f"Away model:   {away_model} ({size_mb:.2f} MB)")
    else:
        print("[ERROR] Away model not found!")

    if features_file.exists():
        features = features_file.read_text().strip().split("\n")
        print(f"Features:     {len(features)} features")

        # Check for line features
        line_feats = [f for f in features if "total" in f.lower() or "line" in f.lower()]
        if line_feats:
            print(f"Line-related: {line_feats}")
        else:
            print("[WARNING] No line-related features found in feature set")
    else:
        print("[ERROR] Features file not found!")

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)

    issues = []
    if len(line_features) == 0:
        issues.append("Line features table is EMPTY (CRITICAL)")
    if len(team_ratings) == 0:
        issues.append("Team ratings table is EMPTY (CRITICAL)")
    if len(events) < 600:
        issues.append(f"Only {len(events)} games (recommend 600+)")

    if issues:
        print("\n[ISSUES FOUND]")
        for i, issue in enumerate(issues, 1):
            print(f"{i}. {issue}")
    else:
        print("\n[OK] All checks passed")

    print("\nNext steps:")
    if len(line_features) == 0:
        print("  1. Run: uv run python scripts/processing/consolidate_staging.py --force")
    print(
        '  2. Verify line features: uv run python -c "from '
        "sports_betting_edge.adapters.filesystem import read_parquet_df; "
        "print(len(read_parquet_df('data/staging/line_features.parquet')))\""
    )
    print("  3. Retrain models with complete data")


if __name__ == "__main__":
    main()
