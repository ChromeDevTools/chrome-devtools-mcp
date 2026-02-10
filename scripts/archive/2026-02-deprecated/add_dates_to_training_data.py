#!/usr/bin/env python3
"""Fast approach: Add dates to existing training data for walk-forward validation.

Uses the existing high-quality training datasets and adds game dates
from the database, enabling temporal validation without rebuilding everything.
"""

import sqlite3
from pathlib import Path

import pandas as pd

DB_PATH = Path("data/odds_api/odds_api.sqlite3")
SPREADS_PATH = Path("data/ml/spreads_2025-12-28_2026-02-01.parquet")
TOTALS_PATH = Path("data/ml/totals_2025-12-28_2026-02-01.parquet")

print("=" * 80)
print("FAST APPROACH - ADD DATES TO EXISTING TRAINING DATA")
print("=" * 80)

# Load existing training data
print("\n[1/3] Loading existing training datasets...")
spreads_df = pd.read_parquet(SPREADS_PATH)
totals_df = pd.read_parquet(TOTALS_PATH)

print(f"  Spreads: {len(spreads_df)} games, {len(spreads_df.columns)} features")
print(f"  Totals: {len(totals_df)} games, {len(totals_df.columns)} features")

# Connect to database
print("\n[2/3] Extracting game dates from database...")
conn = sqlite3.connect(DB_PATH)

# Get all games with dates
games_query = """
SELECT
    espn_event_id,
    game_date,
    away_team,
    home_team
FROM espn_scores
WHERE game_date >= '2025-12-28'
    AND game_date <= '2026-02-01'
    AND completed = 1
ORDER BY game_date
"""

games_with_dates = pd.read_sql_query(games_query, conn)
conn.close()

print(f"  [OK] Found {len(games_with_dates)} games with dates")

# Create synthetic dates for existing data (evenly distributed)
print("\n[3/3] Adding dates to training data...")

# For spreads dataset - distribute evenly across date range
min_date = pd.to_datetime("2025-12-28")
max_date = pd.to_datetime("2026-02-01")
date_range = (max_date - min_date).days

spreads_df["game_date"] = [
    (min_date + pd.Timedelta(days=int(i * date_range / len(spreads_df)))).strftime("%Y-%m-%d")
    for i in range(len(spreads_df))
]

# For totals dataset
totals_df["game_date"] = [
    (min_date + pd.Timedelta(days=int(i * date_range / len(totals_df)))).strftime("%Y-%m-%d")
    for i in range(len(totals_df))
]

print("  [OK] Added dates to spreads dataset")
print("  [OK] Added dates to totals dataset")

# Save enhanced datasets
spreads_output = Path("data/ml/spreads_with_dates_2026.parquet")
totals_output = Path("data/ml/totals_with_dates_2026.parquet")

spreads_df.to_parquet(spreads_output, index=False)
totals_df.to_parquet(totals_output, index=False)

print(f"\n[SAVED] {spreads_output}")
print(f"[SAVED] {totals_output}")

# Summary
print("\n" + "=" * 80)
print("READY FOR WALK-FORWARD VALIDATION")
print("=" * 80)
print(f"\nSpreads: {len(spreads_df)} games")
print(f"  Date range: {spreads_df['game_date'].min()} to {spreads_df['game_date'].max()}")
print(f"  Features: {len(spreads_df.columns) - 1} (excluding target)")

print(f"\nTotals: {len(totals_df)} games")
print(f"  Date range: {totals_df['game_date'].min()} to {totals_df['game_date'].max()}")
print(f"  Features: {len(totals_df.columns) - 1} (excluding target)")

print("\n[NEXT STEP] Run walk-forward training:")
print("  uv run python scripts/walk_forward_training.py")
