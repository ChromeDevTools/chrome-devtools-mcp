"""Quick script to check team mapping coverage."""

from __future__ import annotations

from sports_betting_edge.adapters.filesystem import read_parquet_df

df = read_parquet_df("data/staging/mappings/team_mapping.parquet")

odds_api_coverage = (df["odds_api_name"] != "").sum()
espn_coverage = (df["espn_name"] != "").sum()

print("Team Mapping Coverage:")
print(f"  Total teams: {len(df)}")
print(f"  Odds API: {odds_api_coverage}/{len(df)} ({odds_api_coverage / len(df) * 100:.1f}%)")
print(f"  ESPN: {espn_coverage}/{len(df)} ({espn_coverage / len(df) * 100:.1f}%)")
