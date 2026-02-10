"""Map ESPN team names to canonical team mapping.

This script matches ESPN team data to the canonical KenPom-based team mapping
table using fuzzy string matching and manual mappings for edge cases.

Usage:
    uv run python scripts/map_espn_teams.py

Output:
    Updates data/processed/team_mapping.parquet with ESPN fields
"""

import logging
from pathlib import Path

import pandas as pd
from thefuzz import fuzz

from sports_betting_edge.adapters.filesystem import read_parquet_df, write_parquet

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# Manual mappings for teams with name variations
MANUAL_ESPN_MAPPINGS = {
    # ESPN display_name -> KenPom TeamName
    "American University Eagles": "American",
    "Arizona State Sun Devils": "Arizona St.",
    "Arkansas Razorbacks": "Arkansas",
    "Bellarmine Knights": "Bellarmine",
    "Boise State Broncos": "Boise St.",
    "Bradley Braves": "Bradley",
    "Cal Poly Mustangs": "Cal Poly",
    "California Golden Bears": "California",
    "Central Florida Knights": "UCF",
    "Colorado Buffaloes": "Colorado",
    "Colorado State Rams": "Colorado St.",
    "Delaware Blue Hens": "Delaware",
    "Florida A&M Rattlers": "Florida A&M",
    "Florida Gators": "Florida",
    "Florida State Seminoles": "Florida St.",
    "George Washington Revolutionaries": "George Washington",
    "Georgetown Hoyas": "Georgetown",
    "Georgia Tech Yellow Jackets": "Georgia Tech",
    "Hawai'i Rainbow Warriors": "Hawaii",
    "Howard Bison": "Howard",
    "Idaho Vandals": "Idaho",
    "Indiana Hoosiers": "Indiana",
    "Iowa State Cyclones": "Iowa St.",
    "IU Indianapolis Jaguars": "IUPUI",
    "Jacksonville State Gamecocks": "Jacksonville St.",
    "Louisville Cardinals": "Louisville",
    "LSU Tigers": "Louisiana St.",
    "Miami Hurricanes": "Miami FL",
    "Murray State Racers": "Murray St.",
    "NC State Wolfpack": "N.C. State",
    "Notre Dame Fighting Irish": "Notre Dame",
    "Ole Miss Rebels": "Mississippi",
    "Pitt Panthers": "Pittsburgh",
    "Sacramento State Hornets": "Sacramento St.",
    "Saint Joseph's Hawks": "Saint Joseph's",
    "Saint Louis Billikens": "Saint Louis",
    "San Diego State Aztecs": "San Diego St.",
    "San José State Spartans": "San Jose St.",
    "SMU Mustangs": "SMU",
    "South Alabama Jaguars": "South Alabama",
    "South Florida Bulls": "South Florida",
    "Southern California Trojans": "USC",
    "Southern Illinois Salukis": "Southern Illinois",
    "Stanford Cardinal": "Stanford",
    "Stetson Hatters": "Stetson",
    "TCU Horned Frogs": "TCU",
    "UAB Blazers": "UAB",
    "UC Riverside Highlanders": "UC Riverside",
    "UC San Diego Tritons": "UC San Diego",
    "UCF Knights": "UCF",
    "UCLA Bruins": "UCLA",
    "UConn Huskies": "Connecticut",
    "UIC Flames": "UIC",
    "UNLV Rebels": "UNLV",
    "USC Trojans": "USC",
    "VCU Rams": "VCU",
    "Virginia Tech Hokies": "Virginia Tech",
    "Western Kentucky Hilltoppers": "Western Kentucky",
}


def load_team_mapping() -> pd.DataFrame:
    """Load the canonical team mapping table.

    Returns:
        Team mapping DataFrame
    """
    mapping_path = Path("data/processed/team_mapping.parquet")
    if not mapping_path.exists():
        raise FileNotFoundError(
            f"Team mapping not found: {mapping_path}. Run build_team_mapping.py first."
        )

    df = read_parquet_df(str(mapping_path))
    logger.info(f"Loaded team mapping with {len(df)} teams")
    return df


def load_espn_teams(season: int = 2026) -> pd.DataFrame:
    """Load ESPN team data.

    Args:
        season: The season year

    Returns:
        ESPN teams DataFrame
    """
    espn_path = Path(f"data/espn/teams/espn_team_names_{season}.parquet")
    if not espn_path.exists():
        raise FileNotFoundError(f"ESPN team data not found: {espn_path}")

    df = read_parquet_df(str(espn_path))
    logger.info(f"Loaded {len(df)} teams from ESPN")
    return df


def fuzzy_match_team(espn_name: str, kenpom_names: list[str], threshold: int = 85) -> str | None:
    """Find best matching KenPom team name using fuzzy string matching.

    Args:
        espn_name: ESPN team display name
        kenpom_names: List of KenPom team names
        threshold: Minimum similarity score (0-100)

    Returns:
        Best matching KenPom name or None if no good match
    """
    # Extract core team name (remove mascot/common suffixes)
    espn_core = (
        espn_name.replace(" University", "")
        .replace(" State", "")
        .replace(" College", "")
        .replace(" Eagles", "")
        .replace(" Wildcats", "")
        .replace(" Tigers", "")
        .replace(" Bears", "")
        .replace(" Bulldogs", "")
        .strip()
    )

    best_score = 0
    best_match = None

    for kenpom_name in kenpom_names:
        # Compare full names
        score_full = fuzz.ratio(espn_name.lower(), kenpom_name.lower())

        # Compare core names
        kenpom_core = kenpom_name.replace(" St.", "").replace(" A&M", "").strip()
        score_core = fuzz.ratio(espn_core.lower(), kenpom_core.lower())

        # Use best score
        score = max(score_full, score_core)

        if score > best_score:
            best_score = score
            best_match = kenpom_name

    if best_score >= threshold:
        return best_match
    return None


def map_espn_to_canonical(mapping_df: pd.DataFrame, espn_df: pd.DataFrame) -> pd.DataFrame:
    """Map ESPN teams to canonical team mapping.

    Args:
        mapping_df: Canonical team mapping DataFrame
        espn_df: ESPN teams DataFrame

    Returns:
        Updated mapping DataFrame with ESPN fields populated
    """
    kenpom_names = mapping_df["kenpom_name"].tolist()
    matches = []
    unmatched = []

    for _, espn_row in espn_df.iterrows():
        espn_name = espn_row["display_name"]

        # Try manual mapping first
        if espn_name in MANUAL_ESPN_MAPPINGS:
            kenpom_match = MANUAL_ESPN_MAPPINGS[espn_name]
            match_type = "manual"
        else:
            # Try fuzzy matching
            kenpom_match = fuzzy_match_team(espn_name, kenpom_names)
            match_type = "fuzzy" if kenpom_match else None

        if kenpom_match:
            matches.append(
                {
                    "kenpom_name": kenpom_match,
                    "espn_id": espn_row["team_id"],
                    "espn_display_name": espn_row["display_name"],
                    "espn_abbreviation": espn_row["abbreviation"],
                    "espn_slug": espn_row["slug"],
                    "match_type": match_type,
                }
            )
        else:
            unmatched.append(espn_name)

    logger.info(f"Matched {len(matches)} ESPN teams")
    logger.info(f"  Manual matches: {sum(1 for m in matches if m['match_type'] == 'manual')}")
    logger.info(f"  Fuzzy matches: {sum(1 for m in matches if m['match_type'] == 'fuzzy')}")

    if unmatched:
        logger.warning(f"Unmatched ESPN teams ({len(unmatched)}): {unmatched}")

    # Update mapping DataFrame
    matches_df = pd.DataFrame(matches)
    mapping_df = mapping_df.merge(
        matches_df[
            [
                "kenpom_name",
                "espn_id",
                "espn_display_name",
                "espn_abbreviation",
                "espn_slug",
            ]
        ],
        on="kenpom_name",
        how="left",
        suffixes=("_old", ""),
    )

    # Drop old columns and rename
    cols_to_drop = [c for c in mapping_df.columns if c.endswith("_old")]
    mapping_df = mapping_df.drop(columns=cols_to_drop)

    return mapping_df


def save_team_mapping(mapping_df: pd.DataFrame, output_path: Path) -> None:
    """Save updated team mapping table.

    Args:
        mapping_df: Team mapping DataFrame
        output_path: Path to save the parquet file
    """
    write_parquet(mapping_df, str(output_path), index=False)
    logger.info(f"Saved updated team mapping to {output_path}")


def main() -> None:
    """Map ESPN teams to canonical mapping."""
    logger.info("Starting ESPN team mapping...")

    # Load data
    mapping_df = load_team_mapping()
    espn_df = load_espn_teams(season=2026)

    # Map ESPN to canonical
    mapping_df = map_espn_to_canonical(mapping_df, espn_df)

    # Summary
    espn_mapped = mapping_df["espn_id"].notna().sum()
    logger.info("\nESPN Mapping Summary:")
    logger.info(f"  Teams with ESPN data: {espn_mapped} / {len(mapping_df)}")
    logger.info(f"  Coverage: {espn_mapped / len(mapping_df) * 100:.1f}%")

    # Save updated mapping
    output_path = Path("data/processed/team_mapping.parquet")
    save_team_mapping(mapping_df, output_path)

    logger.info("\nNext step: Run python scripts/map_overtime_teams.py")


if __name__ == "__main__":
    main()
