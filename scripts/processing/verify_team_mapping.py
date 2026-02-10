"""Verify team name mapping quality."""

from __future__ import annotations

from sports_betting_edge.adapters.filesystem import read_parquet_df

df = read_parquet_df("data/staging/mappings/team_mapping.parquet")

print("=== Verification of Known Teams ===")
test_teams = [
    "Duke",
    "Kentucky",
    "Kansas",
    "North Carolina",
    "Gonzaga",
    "Michigan",
    "Alabama",
    "UCLA",
]

for team in test_teams:
    matches = df[df["kenpom_name"] == team]
    if len(matches) > 0:
        row = matches.iloc[0]
        print(f"\n{team}:")
        print(f"  Odds API: {row['odds_api_name']} (score: {row['odds_api_match_score']})")
        if row["espn_name"]:
            print(f"  ESPN: {row['espn_name']} (score: {row['espn_match_score']})")
    else:
        print(f"\n{team}: NOT FOUND")

print("\n\n=== Mapping Statistics ===")
print(f"Total teams: {len(df)}")
odds_matched = (df["odds_api_name"] != "").sum()
espn_matched = (df["espn_name"] != "").sum()
high_quality = ((df["odds_api_match_score"] >= 90) | (df["espn_match_score"] >= 90)).sum()

print(f"Matched to Odds API: {odds_matched} ({odds_matched / len(df):.1%})")
print(f"Matched to ESPN: {espn_matched} ({espn_matched / len(df):.1%})")
print(f"High quality matches (score>=90): {high_quality} ({high_quality / len(df):.1%})")
