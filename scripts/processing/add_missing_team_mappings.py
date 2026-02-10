"""Add missing team mappings identified in Phase 1 audit."""

from __future__ import annotations

import pandas as pd

from sports_betting_edge.adapters.filesystem import read_parquet_df, write_parquet


def main() -> None:
    """Add 5 confirmed team mappings for Odds API names."""
    # Read existing mappings
    mapping_path = "data/staging/mappings/team_mapping.parquet"
    df = read_parquet_df(mapping_path)

    print(f"Current mappings: {len(df)}")

    # New mappings to add (only teams confirmed in KenPom)
    new_mappings = [
        {
            "kenpom_name": "Alabama St.",
            "odds_api_name": "Alabama State Hornets",
            "odds_api_score": 0.90,  # Manual match
            "espn_name": None,  # Will be filled by ESPN mapper
            "espn_score": None,
        },
        {
            "kenpom_name": "Nicholls",
            "odds_api_name": "Nicholls Colonels",
            "odds_api_score": 0.90,
            "espn_name": None,
            "espn_score": None,
        },
        {
            "kenpom_name": "St. Thomas",
            "odds_api_name": "St. Thomas-Minnesota Tommies",
            "odds_api_score": 0.90,
            "espn_name": None,
            "espn_score": None,
        },
        {
            "kenpom_name": "Texas A&M Corpus Chris",
            "odds_api_name": "Texas A&M-Corpus Christi Islanders",
            "odds_api_score": 0.90,
            "espn_name": None,
            "espn_score": None,
        },
        {
            "kenpom_name": "Tennessee Martin",
            "odds_api_name": "UT Martin Skyhawks",
            "odds_api_score": 0.90,
            "espn_name": None,
            "espn_score": None,
        },
    ]

    # Check for duplicates before adding
    existing_kenpom = set(df["kenpom_name"].values)
    existing_odds_api = set(df["odds_api_name"].dropna().values)

    to_add = []
    for mapping in new_mappings:
        if mapping["kenpom_name"] in existing_kenpom:
            print(f"[SKIP] {mapping['kenpom_name']} already mapped")
            continue
        if mapping["odds_api_name"] in existing_odds_api:
            print(f"[SKIP] {mapping['odds_api_name']} already mapped")
            continue
        to_add.append(mapping)
        print(f"[ADD] {mapping['kenpom_name']} <- {mapping['odds_api_name']}")

    if len(to_add) == 0:
        print("\nNo new mappings to add (all already exist)")
        return

    # Append new mappings
    new_df = pd.DataFrame(to_add)
    updated_df = pd.concat([df, new_df], ignore_index=True)

    # Save updated mappings
    write_parquet(updated_df, mapping_path)

    print(f"\nUpdated mappings: {len(updated_df)} (added {len(to_add)})")

    # Document unmappable teams (not in KenPom D1)
    print("\n" + "=" * 60)
    print("UNMAPPABLE TEAMS (not in KenPom D1 database):")
    print("=" * 60)
    unmappable = [
        "Bryant & Stratton (Ohio) Bobcats - NAIA/D3 school",
        "Elizabeth City State Vikings - D2 school",
        "Elms College Blazers - D3 school",
        "Morehouse Maroon Tigers - D2 school",
    ]
    for team in unmappable:
        print(f"  - {team}")
    print("\nThese teams appear in exhibition games and cannot generate features.")


if __name__ == "__main__":
    main()
