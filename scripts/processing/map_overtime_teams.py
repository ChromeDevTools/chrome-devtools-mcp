"""Map Overtime.ag team names to canonical team mapping.

This script matches Overtime.ag team names to the canonical KenPom-based
team mapping table. Overtime uses simpler naming conventions.

Usage:
    uv run python scripts/map_overtime_teams.py

Output:
    Updates data/processed/team_mapping.parquet with Overtime fields
"""

import logging
from pathlib import Path

import pandas as pd
from thefuzz import fuzz

from sports_betting_edge.adapters.filesystem import read_parquet_df, write_parquet

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# Manual mappings for Overtime.ag name variations
MANUAL_OVERTIME_MAPPINGS = {
    # Overtime name -> KenPom TeamName
    "Alabama A&M": "Alabama A&M",
    "Alabama State": "Alabama St.",
    "Appalachian State": "Appalachian St.",
    "Arizona State": "Arizona St.",
    "Arkansas Little Rock": "Little Rock",
    "Arkansas State": "Arkansas St.",
    "Arkansas-Pine Bluff": "Arkansas Pine Bluff",
    "Ball State": "Ball St.",
    "Bethune-Cookman": "Bethune Cookman",
    "Boise State": "Boise St.",
    "Bowling Green": "Bowling Green",
    "Cal Poly": "Cal Poly",
    "Cal Poly SLO": "Cal Poly",
    "Cal Riverside": "UC Riverside",
    "Cal State Bakersfield": "CS Bakersfield",
    "Cal State Fullerton": "CS Fullerton",
    "Cal State Northridge": "CS Northridge",
    "California Baptist": "Cal Baptist",
    "Coll Of Charleston": "Charleston",
    "CS Bakersfield": "Cal St. Bakersfield",
    "CS Fullerton": "Cal St. Fullerton",
    "CS Northridge": "CSUN",
    "East Tenn State": "East Tennessee St.",
    "Idaho State": "Idaho St.",
    "IPFW": "Purdue Fort Wayne",
    "Central Connecticut": "Central Connecticut St.",
    "Central Florida": "UCF",
    "Coastal Carolina": "Coastal Carolina",
    "Colorado State": "Colorado St.",
    "Delaware State": "Delaware St.",
    "Eastern Illinois": "Eastern Illinois",
    "Eastern Kentucky": "Eastern Kentucky",
    "Eastern Michigan": "Eastern Michigan",
    "Eastern Washington": "Eastern Washington",
    "Florida A&M": "Florida A&M",
    "Florida Atlantic": "Florida Atlantic",
    "Florida Gulf Coast": "Florida Gulf Coast",
    "Florida International": "FIU",
    "Florida State": "Florida St.",
    "Fresno State": "Fresno St.",
    "Georgia Southern": "Georgia Southern",
    "Georgia State": "Georgia St.",
    "Georgia Tech": "Georgia Tech",
    "Grambling State": "Grambling",
    "Grand Canyon": "Grand Canyon",
    "Illinois State": "Illinois St.",
    "Indiana State": "Indiana St.",
    "Iowa State": "Iowa St.",
    "Jackson State": "Jackson St.",
    "Jacksonville State": "Jacksonville St.",
    "Kansas State": "Kansas St.",
    "Kent State": "Kent St.",
    "Long Beach State": "Long Beach St.",
    "Louisiana State": "Louisiana St.",
    "Miami (FL)": "Miami FL",
    "Miami Florida": "Miami FL",
    "Miami (OH)": "Miami OH",
    "Miami Ohio": "Miami OH",
    "Michigan State": "Michigan St.",
    "Middle Tennessee": "Middle Tennessee",
    "Middle Tenn St": "Middle Tennessee",
    "Mississippi State": "Mississippi St.",
    "Missouri State": "Missouri St.",
    "Montana State": "Montana St.",
    "Morehead State": "Morehead St.",
    "Morgan State": "Morgan St.",
    "Murray State": "Murray St.",
    "New Mexico State": "New Mexico St.",
    "Norfolk State": "Norfolk St.",
    "North Carolina A&T": "North Carolina A&T",
    "North Carolina Central": "N.C. Central",
    "NC State": "N.C. State",
    "North Carolina State": "N.C. State",
    "No. Colorado": "Northern Colorado",
    "North Dakota State": "North Dakota St.",
    "Northern Arizona": "Northern Arizona",
    "Northern Colorado": "Northern Colorado",
    "Northern Illinois": "Northern Illinois",
    "Northern Iowa": "Northern Iowa",
    "Northern Kentucky": "Northern Kentucky",
    "Northwestern State": "Northwestern St.",
    "Ohio State": "Ohio St.",
    "Oklahoma State": "Oklahoma St.",
    "Old Dominion": "Old Dominion",
    "Oral Roberts": "Oral Roberts",
    "Oregon State": "Oregon St.",
    "Penn State": "Penn St.",
    "Portland State": "Portland St.",
    "Prairie View A&M": "Prairie View",
    "Sacramento State": "Sacramento St.",
    "Saint Marys CA": "Saint Mary's",
    "Sam Houston": "Sam Houston St.",
    "Sam Houston State": "Sam Houston St.",
    "San Diego": "San Diego",
    "SE Missouri State": "Southeast Missouri",
    "SIU Edwardsville": "SIUE",
    "San Diego State": "San Diego St.",
    "San Francisco": "San Francisco",
    "San Jose State": "San Jose St.",
    "South Alabama": "South Alabama",
    "South Carolina": "South Carolina",
    "South Carolina State": "South Carolina St.",
    "South Dakota": "South Dakota",
    "South Dakota State": "South Dakota St.",
    "South Florida": "South Florida",
    "Southeast Missouri State": "Southeast Missouri St.",
    "Southeastern Louisiana": "SE Louisiana",
    "Southern Illinois": "Southern Illinois",
    "Southern Miss": "Southern Miss",
    "St. Bonaventure": "St. Bonaventure",
    "St. John's": "St. John's",
    "St. Josephs": "Saint Joseph's",
    "Stephen F. Austin": "Stephen F. Austin",
    "Tarleton State": "Tarleton St.",
    "Stony Brook": "Stony Brook",
    "Tennessee State": "Tennessee St.",
    "Tennessee Tech": "Tennessee Tech",
    "Texas A&M": "Texas A&M",
    "Texas A&M-Corpus Christi": "Texas A&M Corpus Chris",
    "Texas State": "Texas St.",
    "Texas Tech": "Texas Tech",
    "UC Davis": "UC Davis",
    "UC Irvine": "UC Irvine",
    "UC Riverside": "UC Riverside",
    "UC San Diego": "UC San Diego",
    "UC Santa Barbara": "UC Santa Barbara",
    "UConn": "Connecticut",
    "UL": "Louisiana",
    "UMass Lowell": "UMass Lowell",
    "UNC Asheville": "UNC Asheville",
    "UNC Greensboro": "UNC Greensboro",
    "UNC Wilmington": "UNC Wilmington",
    "USC": "USC",
    "UT Arlington": "UT Arlington",
    "UT Rio Grande Valley": "UT Rio Grande Valley",
    "UT San Antonio": "UT San Antonio",
    "Utah State": "Utah St.",
    "Utah Valley": "Utah Valley",
    "VCU": "VCU",
    "Virginia Tech": "Virginia Tech",
    "Washington State": "Washington St.",
    "Weber State": "Weber St.",
    "Western Carolina": "Western Carolina",
    "Western Illinois": "Western Illinois",
    "Western Kentucky": "Western Kentucky",
    "Western Michigan": "Western Michigan",
    "Wichita State": "Wichita St.",
    "William & Mary": "William & Mary",
    "Winthrop": "Winthrop",
    "Wright State": "Wright St.",
    "Wyoming": "Wyoming",
}


def load_team_mapping() -> pd.DataFrame:
    """Load the canonical team mapping table."""
    mapping_path = Path("data/processed/team_mapping.parquet")
    if not mapping_path.exists():
        raise FileNotFoundError(f"Team mapping not found: {mapping_path}")

    df = read_parquet_df(str(mapping_path))
    logger.info(f"Loaded team mapping with {len(df)} teams")
    return df


def load_overtime_teams() -> pd.DataFrame:
    """Load Overtime.ag team names from all available data."""
    overtime_dir = Path("data/overtime")
    if not overtime_dir.exists():
        raise FileNotFoundError(f"Overtime directory not found: {overtime_dir}")

    # Find all parquet files
    parquet_files = list(overtime_dir.glob("*.parquet"))
    if not parquet_files:
        raise FileNotFoundError("No Overtime parquet files found")

    logger.info(f"Loading from {len(parquet_files)} Overtime files")

    # Collect all unique team names across all files
    all_teams = set()
    for file in parquet_files:
        df = read_parquet_df(str(file))
        home_teams = df["home_team"].unique()
        away_teams = df["away_team"].unique()
        all_teams.update(home_teams)
        all_teams.update(away_teams)

    all_teams_sorted = sorted(all_teams)
    logger.info(f"Found {len(all_teams_sorted)} unique teams across all Overtime data")
    return pd.DataFrame({"overtime_name": all_teams_sorted})


def map_overtime_to_canonical(mapping_df: pd.DataFrame, overtime_df: pd.DataFrame) -> pd.DataFrame:
    """Map Overtime teams to canonical team mapping."""
    kenpom_names = mapping_df["kenpom_name"].tolist()
    matches = []
    unmatched = []

    for overtime_name in overtime_df["overtime_name"]:
        # Try manual mapping first
        if overtime_name in MANUAL_OVERTIME_MAPPINGS:
            kenpom_match = MANUAL_OVERTIME_MAPPINGS[overtime_name]
            match_type = "manual"
        # Try exact match
        elif overtime_name in kenpom_names:
            kenpom_match = overtime_name
            match_type = "exact"
        # Try fuzzy match as last resort
        else:
            best_score = 0
            best_match = None
            for kenpom_name in kenpom_names:
                score = fuzz.ratio(overtime_name.lower(), kenpom_name.lower())
                if score > best_score:
                    best_score = score
                    best_match = kenpom_name

            if best_score >= 90:  # High threshold for auto-matching
                kenpom_match = best_match
                match_type = "fuzzy"
            else:
                kenpom_match = None
                match_type = None

        if kenpom_match:
            matches.append(
                {
                    "kenpom_name": kenpom_match,
                    "overtime_name": overtime_name,
                    "match_type": match_type,
                }
            )
        else:
            unmatched.append(overtime_name)

    logger.info(f"Matched {len(matches)} Overtime teams")
    logger.info(f"  Manual matches: {sum(1 for m in matches if m['match_type'] == 'manual')}")
    logger.info(f"  Exact matches: {sum(1 for m in matches if m['match_type'] == 'exact')}")
    logger.info(f"  Fuzzy matches: {sum(1 for m in matches if m['match_type'] == 'fuzzy')}")

    if unmatched:
        logger.warning(f"Unmatched Overtime teams ({len(unmatched)}): {unmatched}")

    # Update mapping DataFrame
    matches_df = pd.DataFrame(matches)
    mapping_df = mapping_df.merge(
        matches_df[["kenpom_name", "overtime_name"]],
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
    """Map Overtime.ag teams to canonical mapping."""
    logger.info("Starting Overtime.ag team mapping...")

    # Load data
    mapping_df = load_team_mapping()
    overtime_df = load_overtime_teams()

    # Map Overtime to canonical
    mapping_df = map_overtime_to_canonical(mapping_df, overtime_df)

    # Summary
    overtime_mapped = mapping_df["overtime_name"].notna().sum()
    logger.info("\nOvertime.ag Mapping Summary:")
    logger.info(f"  Teams with Overtime data: {overtime_mapped} / {len(mapping_df)}")
    logger.info(f"  Coverage: {overtime_mapped / len(mapping_df) * 100:.1f}%")

    # Save updated mapping
    output_path = Path("data/processed/team_mapping.parquet")
    save_team_mapping(mapping_df, output_path)

    logger.info("\nNext step: Collect Odds API data and run python scripts/map_odds_api_teams.py")


if __name__ == "__main__":
    main()
