#!/usr/bin/env python3
"""Build comprehensive ML dataset with proper dates and KenPom features."""

import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd

DB_PATH = Path("data/odds_api/odds_api.sqlite3")
OUTPUT_DIR = Path("data/ml")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

print("=" * 80)
print("COMPREHENSIVE DATASET BUILDER")
print("=" * 80)

conn = sqlite3.connect(DB_PATH)

# Step 1: Get completed games
print("\n[1/5] Loading completed games with scores...")
games_df = pd.read_sql_query(
    """
    SELECT
        espn_event_id, game_date, commence_time,
        away_team, home_team, away_score, home_score
    FROM espn_scores
    WHERE completed = 1
        AND away_score IS NOT NULL
        AND home_score IS NOT NULL
    ORDER BY game_date
    """,
    conn,
)
print(
    f"  [OK] {len(games_df):,} games | "
    f"{games_df['game_date'].min()} to {games_df['game_date'].max()}"
)

# Step 2: Match to odds events
print("\n[2/5] Matching games to odds events...")
events_df = pd.read_sql_query(
    """
    SELECT DISTINCT
        event_id,
        away_team,
        home_team,
        DATE(commence_time) as event_date
    FROM events
    WHERE has_odds = 1
    """,
    conn,
)

merged = games_df.merge(
    events_df,
    left_on=["away_team", "home_team", "game_date"],
    right_on=["away_team", "home_team", "event_date"],
    how="inner",
)
print(f"  [OK] Matched {len(merged):,} games to odds events")

# Step 3: Get closing lines
print("\n[3/5] Loading closing lines (FanDuel)...")
closing_df = pd.read_sql_query(
    """
    SELECT
        o.event_id,
        o.market_key,
        o.outcome_name,
        o.point as closing_line,
        o.price_american as closing_juice
    FROM observations o
    INNER JOIN (
        SELECT
            event_id,
            market_key,
            outcome_name,
            MAX(as_of) as last_seen
        FROM observations
        WHERE book_key = 'fanduel'
            AND market_key IN ('spreads', 'totals')
        GROUP BY event_id, market_key, outcome_name
    ) last
    ON o.event_id = last.event_id
        AND o.market_key = last.market_key
        AND o.outcome_name = last.outcome_name
        AND o.as_of = last.last_seen
    WHERE o.book_key = 'fanduel'
    """,
    conn,
)
print(f"  [OK] {len(closing_df):,} closing line observations")

# Step 4: Load KenPom ratings (FIXED columns)
print("\n[4/5] Loading KenPom ratings...")
kenpom_df = pd.read_sql_query(
    """
    SELECT
        team,
        adj_em,
        adj_o,
        adj_d,
        adj_t,
        luck,
        rank
    FROM kp_pomeroy_ratings
    WHERE season = 2026
    """,
    conn,
)
print(f"  [OK] {len(kenpom_df)} teams")

# Step 5: Load Four Factors
print("\n[5/5] Loading Four Factors...")
try:
    ff_df = pd.read_sql_query(
        """
        SELECT
            team,
            efg_pct,
            to_pct,
            or_pct,
            ftrate,
            efg_pct_d,
            to_pct_d,
            or_pct_d,
            ftrate_d
        FROM kp_four_factors
        WHERE season = 2026
        """,
        conn,
    )
    print(f"  [OK] {len(ff_df)} teams")
except Exception as e:
    print(f"  [WARN] Four Factors error: {e}")
    ff_df = None

conn.close()

# Build dataset
print("\n[6/6] Building comprehensive dataset...")


def normalize_name(name):
    """Extract core team name for matching."""
    return str(name).split()[-1] if name else ""


def match_kenpom(team_name, kp_df):
    """Match team to KenPom data."""
    core = normalize_name(team_name)
    match = kp_df[kp_df["team"].str.contains(core, case=False, na=False)]
    return match.iloc[0].to_dict() if not match.empty else None


dataset = []
for _, game in merged.iterrows():
    event_id = game["event_id"]

    # Get spreads
    spreads = closing_df[
        (closing_df["event_id"] == event_id) & (closing_df["market_key"] == "spreads")
    ]

    home_spread = spreads[
        spreads["outcome_name"].str.contains(
            normalize_name(game["home_team"]), case=False, na=False
        )
    ]

    if home_spread.empty:
        continue

    closing_spread = home_spread.iloc[0]["closing_line"]

    # Get totals
    totals = closing_df[
        (closing_df["event_id"] == event_id) & (closing_df["market_key"] == "totals")
    ]
    over_row = totals[totals["outcome_name"] == "Over"]
    closing_total = over_row.iloc[0]["closing_line"] if not over_row.empty else None

    # Match KenPom
    away_kp = match_kenpom(game["away_team"], kenpom_df)
    home_kp = match_kenpom(game["home_team"], kenpom_df)

    if not away_kp or not home_kp:
        continue

    # Build feature dict
    features = {
        "game_date": game["game_date"],
        "away_team": game["away_team"],
        "home_team": game["home_team"],
        "away_score": game["away_score"],
        "home_score": game["home_score"],
        "closing_spread": closing_spread,
        "closing_total": closing_total,
        "away_adj_em": away_kp["adj_em"],
        "away_adj_o": away_kp["adj_o"],
        "away_adj_d": away_kp["adj_d"],
        "away_adj_t": away_kp["adj_t"],
        "away_luck": away_kp["luck"],
        "home_adj_em": home_kp["adj_em"],
        "home_adj_o": home_kp["adj_o"],
        "home_adj_d": home_kp["adj_d"],
        "home_adj_t": home_kp["adj_t"],
        "home_luck": home_kp["luck"],
        "kenpom_margin": home_kp["adj_em"] - away_kp["adj_em"],
        "tempo_avg": (away_kp["adj_t"] + home_kp["adj_t"]) / 2,
    }

    # Add Four Factors if available
    if ff_df is not None:
        away_ff = match_kenpom(game["away_team"], ff_df)
        home_ff = match_kenpom(game["home_team"], ff_df)
        if away_ff and home_ff:
            for col in ["efg_pct", "to_pct", "or_pct", "ftrate", "efg_pct_d", "to_pct_d"]:
                features[f"away_{col}"] = away_ff.get(col)
                features[f"home_{col}"] = home_ff.get(col)

    dataset.append(features)

df = pd.DataFrame(dataset)
print(f"  [OK] Built dataset with {len(df):,} games")

# Calculate outcomes
print("\n[7/7] Calculating outcomes and creating targets...")
df["actual_margin"] = df["home_score"] - df["away_score"]
df["favorite_covered"] = np.where(
    df["closing_spread"] < 0,  # Home is favorite
    df["actual_margin"] > abs(df["closing_spread"]),
    df["actual_margin"] < -abs(df["closing_spread"]),
)

df["actual_total"] = df["home_score"] + df["away_score"]
df["over_hit"] = df["actual_total"] > df["closing_total"]

# Create spreads dataset (favorite/underdog perspective)
spreads_df = df.copy()
spreads_df["is_home_fav"] = spreads_df["closing_spread"] < 0

for idx, row in spreads_df.iterrows():
    if row["is_home_fav"]:
        spreads_df.at[idx, "fav_adj_em"] = row["home_adj_em"]
        spreads_df.at[idx, "fav_adj_o"] = row["home_adj_o"]
        spreads_df.at[idx, "fav_adj_d"] = row["home_adj_d"]
        spreads_df.at[idx, "fav_adj_t"] = row["home_adj_t"]
        spreads_df.at[idx, "fav_luck"] = row["home_luck"]
        spreads_df.at[idx, "dog_adj_em"] = row["away_adj_em"]
        spreads_df.at[idx, "dog_adj_o"] = row["away_adj_o"]
        spreads_df.at[idx, "dog_adj_d"] = row["away_adj_d"]
        spreads_df.at[idx, "dog_adj_t"] = row["away_adj_t"]
        spreads_df.at[idx, "dog_luck"] = row["away_luck"]
    else:
        spreads_df.at[idx, "fav_adj_em"] = row["away_adj_em"]
        spreads_df.at[idx, "fav_adj_o"] = row["away_adj_o"]
        spreads_df.at[idx, "fav_adj_d"] = row["away_adj_d"]
        spreads_df.at[idx, "fav_adj_t"] = row["away_adj_t"]
        spreads_df.at[idx, "fav_luck"] = row["away_luck"]
        spreads_df.at[idx, "dog_adj_em"] = row["home_adj_em"]
        spreads_df.at[idx, "dog_adj_o"] = row["home_adj_o"]
        spreads_df.at[idx, "dog_adj_d"] = row["home_adj_d"]
        spreads_df.at[idx, "dog_adj_t"] = row["home_adj_t"]
        spreads_df.at[idx, "dog_luck"] = row["home_luck"]

spreads_df["em_diff"] = spreads_df["fav_adj_em"] - spreads_df["dog_adj_em"]
spreads_df["target"] = spreads_df["favorite_covered"].astype(int)

# Create totals dataset (home/away perspective)
totals_df = df[df["closing_total"].notna()].copy()
totals_df["target"] = totals_df["over_hit"].astype(int)

# Save datasets
spreads_output = OUTPUT_DIR / "spreads_comprehensive_2026.parquet"
totals_output = OUTPUT_DIR / "totals_comprehensive_2026.parquet"

spreads_df.to_parquet(spreads_output, index=False)
totals_df.to_parquet(totals_output, index=False)

print(f"\n[SAVED] Spreads -> {spreads_output}")
print(f"[SAVED] Totals -> {totals_output}")

# Summary
print("\n" + "=" * 80)
print("DATASET SUMMARY")
print("=" * 80)

print("\n[SPREADS]")
print(f"  Games: {len(spreads_df):,}")
print(f"  Date range: {spreads_df['game_date'].min()} to {spreads_df['game_date'].max()}")
print("  Target distribution:")
spreads_target_sum = spreads_df["target"].sum()
spreads_target_pct = spreads_df["target"].mean() * 100
spreads_target_fail = (~spreads_df["target"].astype(bool)).sum()
spreads_target_fail_pct = (1 - spreads_df["target"].mean()) * 100
print(f"    Favorite covered: {spreads_target_sum} ({spreads_target_pct:.1f}%)")
print(f"    Favorite failed:  {spreads_target_fail} ({spreads_target_fail_pct:.1f}%)")

print("\n[TOTALS]")
print(f"  Games: {len(totals_df):,}")
print(f"  Date range: {totals_df['game_date'].min()} to {totals_df['game_date'].max()}")
print("  Target distribution:")
totals_target_sum = totals_df["target"].sum()
totals_target_pct = totals_df["target"].mean() * 100
totals_target_fail = (~totals_df["target"].astype(bool)).sum()
totals_target_fail_pct = (1 - totals_df["target"].mean()) * 100
print(f"    Over hit:  {totals_target_sum} ({totals_target_pct:.1f}%)")
print(f"    Under hit: {totals_target_fail} ({totals_target_fail_pct:.1f}%)")

print("\n[FEATURES]")
print("  - KenPom: adj_em, adj_o, adj_d, adj_t, luck")
print("  - Four Factors: efg_pct, to_pct, or_pct, ftrate (both teams, if available)")
print("  - Derived: kenpom_margin, tempo_avg, em_diff")
print("  - Market: closing_spread, closing_total")
print("  - Dates: game_date (for walk-forward validation)")

print("\n[NEXT STEP] Run walk-forward training with temporal validation")
