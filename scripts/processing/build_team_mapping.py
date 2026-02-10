"""Build canonical team mapping table from multiple data sources.

This script creates a master team mapping table that allows us to join
data across KenPom, ESPN, Overtime.ag, and The Odds API by normalizing
team names to a single canonical identifier.

Usage:
    uv run python scripts/build_team_mapping.py

Output:
    data/processed/team_mapping.parquet - Canonical team mapping table
"""

import logging
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import read_parquet_df, write_parquet

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def load_kenpom_teams(season: int = 2026) -> pd.DataFrame:
    """Load KenPom team data for a given season.

    Args:
        season: The season year (default: 2026 for current season)

    Returns:
        DataFrame with KenPom team information
    """
    kenpom_path = Path(f"data/kenpom/teams/season/teams_{season}.parquet")
    if not kenpom_path.exists():
        raise FileNotFoundError(f"KenPom team data not found: {kenpom_path}")

    df = read_parquet_df(str(kenpom_path))
    logger.info(f"Loaded {len(df)} teams from KenPom {season} season")
    return df


def create_canonical_mapping(kenpom_df: pd.DataFrame) -> pd.DataFrame:
    """Create canonical team mapping table from KenPom base data.

    Args:
        kenpom_df: KenPom team DataFrame

    Returns:
        Canonical team mapping DataFrame
    """
    mapping = pd.DataFrame(
        {
            # Canonical identifiers (using KenPom as base)
            "canonical_team_id": kenpom_df["TeamID"],
            "canonical_name": kenpom_df["TeamName"],
            "conference": kenpom_df["ConfShort"],
            "division": "D1",  # All KenPom teams are D1
            # KenPom fields
            "kenpom_id": kenpom_df["TeamID"],
            "kenpom_name": kenpom_df["TeamName"],
            # ESPN fields (to be populated)
            "espn_id": pd.NA,
            "espn_display_name": pd.NA,
            "espn_abbreviation": pd.NA,
            "espn_slug": pd.NA,
            # Overtime.ag fields (to be populated)
            "overtime_name": pd.NA,
            # Odds API fields (to be populated)
            "odds_api_name": pd.NA,
        }
    )

    # Convert to appropriate dtypes
    mapping = mapping.astype(
        {
            "canonical_team_id": "int64",
            "canonical_name": "string",
            "conference": "string",
            "division": "string",
            "kenpom_id": "int64",
            "kenpom_name": "string",
            "espn_id": "Int64",  # Nullable integer
            "espn_display_name": "string",
            "espn_abbreviation": "string",
            "espn_slug": "string",
            "overtime_name": "string",
            "odds_api_name": "string",
        }
    )

    logger.info(f"Created canonical mapping with {len(mapping)} teams")
    return mapping


def save_team_mapping(mapping_df: pd.DataFrame, output_path: Path) -> None:
    """Save team mapping table to parquet.

    Args:
        mapping_df: Team mapping DataFrame
        output_path: Path to save the parquet file
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_parquet(mapping_df, str(output_path), index=False)
    logger.info(f"Saved team mapping to {output_path}")


def main() -> None:
    """Build canonical team mapping from KenPom data."""
    logger.info("Starting team mapping build process...")

    # Load KenPom data (base for canonical mapping)
    kenpom_df = load_kenpom_teams(season=2026)

    # Create canonical mapping table
    mapping_df = create_canonical_mapping(kenpom_df)

    # Display summary
    logger.info("\nTeam Mapping Summary:")
    logger.info(f"  Total teams: {len(mapping_df)}")
    logger.info(f"  Conferences: {mapping_df['conference'].nunique()}")
    logger.info(
        f"\nTop 5 conferences by team count:\n{mapping_df['conference'].value_counts().head()}"
    )

    # Save to parquet
    output_path = Path("data/processed/team_mapping.parquet")
    save_team_mapping(mapping_df, output_path)

    logger.info("\nNext steps:")
    logger.info("  1. Run: python scripts/map_espn_teams.py")
    logger.info("  2. Run: python scripts/map_overtime_teams.py")
    logger.info("  3. Run: python scripts/map_odds_api_teams.py")


if __name__ == "__main__":
    main()
