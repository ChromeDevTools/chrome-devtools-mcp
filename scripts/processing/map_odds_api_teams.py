"""Map The Odds API team names to canonical team mapping.

This script matches The Odds API team names to the canonical KenPom-based
team mapping table. The Odds API uses full team names with mascots.

Usage:
    uv run python scripts/map_odds_api_teams.py

Output:
    Updates data/processed/team_mapping.parquet with Odds API fields
"""

import logging
from pathlib import Path

import pandas as pd
from thefuzz import fuzz

from sports_betting_edge.adapters.filesystem import read_parquet_df, write_parquet

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# Manual mappings for Odds API name variations
MANUAL_ODDS_API_MAPPINGS = {
    # Odds API name -> KenPom TeamName
    "Alabama Crimson Tide": "Alabama",
    "Cleveland St Vikings": "Cleveland St.",
    "Colorado Buffaloes": "Colorado",
    "East Tennessee St Buccaneers": "East Tennessee St.",
    "Florida Atlantic Owls": "Florida Atlantic",
    "Florida Gators": "Florida",
    "Green Bay Phoenix": "Green Bay",
    "Illinois Fighting Illini": "Illinois",
    "Iowa Hawkeyes": "Iowa",
    "Iowa State Cyclones": "Iowa St.",
    "Kansas St Wildcats": "Kansas St.",
    "Maryland Terrapins": "Maryland",
    "Memphis Tigers": "Memphis",
    "Minnesota Golden Gophers": "Minnesota",
    "Mt. St. Mary's Mountaineers": "Mount St. Mary's",
    "Nebraska Cornhuskers": "Nebraska",
    "Northern Kentucky Norse": "Northern Kentucky",
    "Oregon Ducks": "Oregon",
    "Penn State Nittany Lions": "Penn St.",
    "Purdue Boilermakers": "Purdue",
    "St. Thomas (MN) Tommies": "St. Thomas",
    "TCU Horned Frogs": "TCU",
    "UL Monroe Warhawks": "Louisiana Monroe",
    "Western Carolina Catamounts": "Western Carolina",
    "Wichita St Shockers": "Wichita St.",
    "Wright St Raiders": "Wright St.",
    # Additional common patterns
    "Alabama A&M Bulldogs": "Alabama A&M",
    "Alabama St Hornets": "Alabama St.",
    "Appalachian State Mountaineers": "Appalachian St.",
    "Arizona State Sun Devils": "Arizona St.",
    "Arizona Wildcats": "Arizona",
    "Arkansas Razorbacks": "Arkansas",
    "Arkansas State Red Wolves": "Arkansas St.",
    "Auburn Tigers": "Auburn",
    "Ball State Cardinals": "Ball St.",
    "Baylor Bears": "Baylor",
    "Boise State Broncos": "Boise St.",
    "Boston College Eagles": "Boston College",
    "Bowling Green Falcons": "Bowling Green",
    "BYU Cougars": "BYU",
    "California Golden Bears": "California",
    "Cincinnati Bearcats": "Cincinnati",
    "Clemson Tigers": "Clemson",
    "Colorado State Rams": "Colorado St.",
    "Connecticut Huskies": "Connecticut",
    "Duke Blue Devils": "Duke",
    "Florida State Seminoles": "Florida St.",
    "Fresno State Bulldogs": "Fresno St.",
    "Georgia Bulldogs": "Georgia",
    "Georgia State Panthers": "Georgia St.",
    "Georgia Tech Yellow Jackets": "Georgia Tech",
    "Gonzaga Bulldogs": "Gonzaga",
    "Houston Cougars": "Houston",
    "Indiana Hoosiers": "Indiana",
    "Indiana State Sycamores": "Indiana St.",
    "Kansas Jayhawks": "Kansas",
    "Kansas State Wildcats": "Kansas St.",
    "Kent State Golden Flashes": "Kent St.",
    "Kentucky Wildcats": "Kentucky",
    "Louisiana State Tigers": "Louisiana St.",
    "Louisville Cardinals": "Louisville",
    "LSU Tigers": "Louisiana St.",
    "Marquette Golden Eagles": "Marquette",
    "Miami (FL) Hurricanes": "Miami FL",
    "Miami Hurricanes": "Miami FL",
    "Miami (OH) RedHawks": "Miami OH",
    "Michigan Wolverines": "Michigan",
    "Michigan State Spartans": "Michigan St.",
    "Middle Tennessee Blue Raiders": "Middle Tennessee",
    "Mississippi State Bulldogs": "Mississippi St.",
    "Missouri Tigers": "Missouri",
    "Missouri State Bears": "Missouri St.",
    "Montana State Bobcats": "Montana St.",
    "Murray State Racers": "Murray St.",
    "NC State Wolfpack": "N.C. State",
    "North Carolina State Wolfpack": "N.C. State",
    "North Carolina Tar Heels": "North Carolina",
    "North Dakota State Bison": "North Dakota St.",
    "Notre Dame Fighting Irish": "Notre Dame",
    "Ohio State Buckeyes": "Ohio St.",
    "Oklahoma State Cowboys": "Oklahoma St.",
    "Ole Miss Rebels": "Mississippi",
    "Oregon State Beavers": "Oregon St.",
    "Pitt Panthers": "Pittsburgh",
    "Pittsburgh Panthers": "Pittsburgh",
    "San Diego State Aztecs": "San Diego St.",
    "San Jose State Spartans": "San Jose St.",
    "South Carolina Gamecocks": "South Carolina",
    "South Carolina State Bulldogs": "South Carolina St.",
    "South Dakota State Jackrabbits": "South Dakota St.",
    "South Florida Bulls": "South Florida",
    "Southern California Trojans": "USC",
    "Stanford Cardinal": "Stanford",
    "Syracuse Orange": "Syracuse",
    "Tennessee Volunteers": "Tennessee",
    "Tennessee State Tigers": "Tennessee St.",
    "Texas A&M Aggies": "Texas A&M",
    "Texas Longhorns": "Texas",
    "Texas State Bobcats": "Texas St.",
    "Texas Tech Red Raiders": "Texas Tech",
    "UCF Knights": "UCF",
    "UCLA Bruins": "UCLA",
    "UConn Huskies": "Connecticut",
    "USC Trojans": "USC",
    "Utah State Aggies": "Utah St.",
    "VCU Rams": "VCU",
    "Villanova Wildcats": "Villanova",
    "Virginia Cavaliers": "Virginia",
    "Virginia Tech Hokies": "Virginia Tech",
    "Wake Forest Demon Deacons": "Wake Forest",
    "Washington Huskies": "Washington",
    "Washington State Cougars": "Washington St.",
    "West Virginia Mountaineers": "West Virginia",
    "Western Kentucky Hilltoppers": "Western Kentucky",
    "Wisconsin Badgers": "Wisconsin",
    "Wofford Terriers": "Wofford",
    "Wyoming Cowboys": "Wyoming",
}


def load_team_mapping() -> pd.DataFrame:
    """Load the canonical team mapping table."""
    mapping_path = Path("data/processed/team_mapping.parquet")
    if not mapping_path.exists():
        raise FileNotFoundError(f"Team mapping not found: {mapping_path}")

    df = read_parquet_df(str(mapping_path))
    logger.info(f"Loaded team mapping with {len(df)} teams")
    return df


def load_odds_api_teams() -> pd.DataFrame:
    """Load Odds API team names from recent data."""
    # Find most recent odds file
    odds_dir = Path("data/odds_api/sample")
    if not odds_dir.exists():
        raise FileNotFoundError(
            "Odds API sample data not found. Run collect_odds_api_sample.py first."
        )

    odds_files = list(odds_dir.glob("ncaab_odds_*.parquet"))
    if not odds_files:
        raise FileNotFoundError("No Odds API sample files found")

    # Use most recent file
    latest_file = max(odds_files, key=lambda p: p.stat().st_mtime)
    logger.info(f"Loading Odds API data from {latest_file}")

    df = read_parquet_df(str(latest_file))

    # Extract unique team names
    home_teams = df["home_team"].unique()
    away_teams = df["away_team"].unique()
    all_teams = sorted(set(list(home_teams) + list(away_teams)))

    logger.info(f"Found {len(all_teams)} unique teams in Odds API data")
    return pd.DataFrame({"odds_api_name": all_teams})


def fuzzy_match_with_mascot(
    odds_api_name: str, kenpom_names: list[str], threshold: int = 85
) -> str | None:
    """Find best matching KenPom team name.

    Odds API includes mascots (e.g., "Alabama Crimson Tide"), so we need
    to extract the core team name for matching.

    Args:
        odds_api_name: Full Odds API team name with mascot
        kenpom_names: List of KenPom team names
        threshold: Minimum similarity score (0-100)

    Returns:
        Best matching KenPom name or None if no good match
    """
    # Extract core team name (first part before mascot)
    # e.g., "Alabama Crimson Tide" -> "Alabama"
    # e.g., "East Tennessee St Buccaneers" -> "East Tennessee St"
    core_name = odds_api_name

    # Common mascot patterns to remove
    mascots = [
        " Crimson Tide",
        " Golden Griffins",
        " Mocs",
        " Vikings",
        " Chanticleers",
        " Buffaloes",
        " Dukes",
        " Pirates",
        " Buccaneers",
        " Stags",
        " Owls",
        " Gators",
        " Paladins",
        " Phoenix",
        " Fighting Illini",
        " Hawkeyes",
        " Cyclones",
        " Wildcats",
        " Jaspers",
        " Red Foxes",
        " Terrapins",
        " Tigers",
        " Warriors",
        " Panthers",
        " Golden Gophers",
        " Mountaineers",
        " Cornhuskers",
        " Purple Eagles",
        " Norse",
        " Golden Grizzlies",
        " Ducks",
        " Nittany Lions",
        " Boilermakers",
        " Bobcats",
        " Rams",
        " Broncs",
        " Pioneers",
        " Peacocks",
        " Bulldogs",
        " Saints",
        " Tommies",
        " Horned Frogs",
        " Green Wave",
        " Golden Hurricane",
        " Warhawks",
        " Kangaroos",
        " Catamounts",
        " Shockers",
        " Terriers",
        " Raiders",
    ]

    for mascot in mascots:
        if core_name.endswith(mascot):
            core_name = core_name[: -len(mascot)].strip()
            break

    best_score = 0
    best_match = None

    for kenpom_name in kenpom_names:
        # Compare full names
        score_full = fuzz.ratio(odds_api_name.lower(), kenpom_name.lower())

        # Compare core names (more important)
        score_core = fuzz.ratio(core_name.lower(), kenpom_name.lower())

        # Use best score, but prioritize core match
        score = max(score_full, score_core * 1.2)  # Boost core match

        if score > best_score:
            best_score = score
            best_match = kenpom_name

    if best_score >= threshold:
        return best_match
    return None


def map_odds_api_to_canonical(mapping_df: pd.DataFrame, odds_api_df: pd.DataFrame) -> pd.DataFrame:
    """Map Odds API teams to canonical team mapping."""
    kenpom_names = mapping_df["kenpom_name"].tolist()
    matches = []
    unmatched = []

    for odds_api_name in odds_api_df["odds_api_name"]:
        # Try manual mapping first
        if odds_api_name in MANUAL_ODDS_API_MAPPINGS:
            kenpom_match = MANUAL_ODDS_API_MAPPINGS[odds_api_name]
            match_type = "manual"
        else:
            # Try fuzzy matching with mascot handling
            kenpom_match = fuzzy_match_with_mascot(odds_api_name, kenpom_names)
            match_type = "fuzzy" if kenpom_match else None

        if kenpom_match:
            matches.append(
                {
                    "kenpom_name": kenpom_match,
                    "odds_api_name": odds_api_name,
                    "match_type": match_type,
                }
            )
        else:
            unmatched.append(odds_api_name)

    logger.info(f"Matched {len(matches)} Odds API teams")
    logger.info(f"  Manual matches: {sum(1 for m in matches if m['match_type'] == 'manual')}")
    logger.info(f"  Fuzzy matches: {sum(1 for m in matches if m['match_type'] == 'fuzzy')}")

    if unmatched:
        logger.warning(f"Unmatched Odds API teams ({len(unmatched)}): {unmatched}")

    # Update mapping DataFrame
    matches_df = pd.DataFrame(matches)
    mapping_df = mapping_df.merge(
        matches_df[["kenpom_name", "odds_api_name"]],
        on="kenpom_name",
        how="left",
        suffixes=("_old", ""),
    )

    # Drop old columns
    cols_to_drop = [c for c in mapping_df.columns if c.endswith("_old")]
    mapping_df = mapping_df.drop(columns=cols_to_drop)

    return mapping_df


def save_team_mapping(mapping_df: pd.DataFrame, output_path: Path) -> None:
    """Save updated team mapping table."""
    write_parquet(mapping_df, str(output_path), index=False)
    logger.info(f"Saved updated team mapping to {output_path}")


def main() -> None:
    """Map Odds API teams to canonical mapping."""
    logger.info("Starting Odds API team mapping...")

    # Load data
    mapping_df = load_team_mapping()
    odds_api_df = load_odds_api_teams()

    # Map Odds API to canonical
    mapping_df = map_odds_api_to_canonical(mapping_df, odds_api_df)

    # Summary
    odds_api_mapped = mapping_df["odds_api_name"].notna().sum()
    logger.info("\nOdds API Mapping Summary:")
    logger.info(f"  Teams with Odds API data: {odds_api_mapped} / {len(mapping_df)}")
    logger.info(f"  Coverage: {odds_api_mapped / len(mapping_df) * 100:.1f}%")

    # Save updated mapping
    output_path = Path("data/processed/team_mapping.parquet")
    save_team_mapping(mapping_df, output_path)

    logger.info("\nAll data sources mapped!")
    logger.info("Team mapping system is complete.")


if __name__ == "__main__":
    main()
