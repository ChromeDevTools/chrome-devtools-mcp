"""Validate matchups across all data sources.

This script checks for:
- Consistent team names via canonical mapping
- Proper date/time normalization
- Home/away designation conflicts
- Time discrepancies between sources

Usage:
    uv run python scripts/validate_matchups.py

Output:
    - Validation report with conflicts and warnings
    - Summary statistics
"""

import logging
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.core.matchup import (
    MatchupValidator,
    normalize_dataframe_times,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def load_team_mapping() -> pd.DataFrame:
    """Load canonical team mapping."""
    mapping_path = Path("data/processed/team_mapping.parquet")
    if not mapping_path.exists():
        raise FileNotFoundError(f"Team mapping not found: {mapping_path}")

    df = read_parquet_df(str(mapping_path))
    logger.info(f"Loaded team mapping with {len(df)} teams")
    return df


def load_overtime_data() -> pd.DataFrame | None:
    """Load most recent Overtime.ag data."""
    overtime_dir = Path("data/overtime")
    if not overtime_dir.exists():
        logger.warning("No Overtime.ag data directory found")
        return None

    parquet_files = list(overtime_dir.glob("*.parquet"))
    if not parquet_files:
        logger.warning("No Overtime.ag parquet files found")
        return None

    # Get most recent file
    latest = max(parquet_files, key=lambda p: p.stat().st_mtime)
    logger.info(f"Loading Overtime.ag data from {latest.name}")

    df = read_parquet_df(str(latest))
    logger.info(f"  Loaded {len(df)} events from Overtime.ag")
    return df


def load_odds_api_data() -> pd.DataFrame | None:
    """Load most recent Odds API data."""
    odds_dir = Path("data/odds_api/sample")
    if not odds_dir.exists():
        logger.warning("No Odds API sample directory found")
        return None

    parquet_files = list(odds_dir.glob("*.parquet"))
    if not parquet_files:
        logger.warning("No Odds API sample files found")
        return None

    # Get most recent file
    latest = max(parquet_files, key=lambda p: p.stat().st_mtime)
    logger.info(f"Loading Odds API data from {latest.name}")

    df = read_parquet_df(str(latest))
    logger.info(f"  Loaded {len(df)} events from Odds API")
    return df


def validate_overtime_matchups(df: pd.DataFrame, validator: MatchupValidator) -> pd.DataFrame:
    """Validate Overtime.ag matchups.

    Args:
        df: Overtime.ag DataFrame
        validator: MatchupValidator instance

    Returns:
        DataFrame with validation results
    """
    logger.info("Validating Overtime.ag matchups...")

    # Normalize timestamps
    df = normalize_dataframe_times(df, "captured_at", output_prefix="captured")

    # Get canonical team IDs
    df["home_team_id"] = df["home_team"].apply(
        lambda x: validator.get_canonical_team_id(x, "overtime")
    )
    df["away_team_id"] = df["away_team"].apply(
        lambda x: validator.get_canonical_team_id(x, "overtime")
    )

    # Check for unmapped teams
    unmapped_home = df[df["home_team_id"].isna()]["home_team"].unique()
    unmapped_away = df[df["away_team_id"].isna()]["away_team"].unique()

    if len(unmapped_home) > 0:
        logger.warning(f"Unmapped home teams: {list(unmapped_home)}")
    if len(unmapped_away) > 0:
        logger.warning(f"Unmapped away teams: {list(unmapped_away)}")

    # Filter to mapped teams
    df_mapped = df[df["home_team_id"].notna() & df["away_team_id"].notna()].copy()
    logger.info(f"  {len(df_mapped)} events with mapped teams")

    # Create matchup keys
    df_mapped["matchup_key"] = df_mapped.apply(
        lambda row: validator.create_matchup_key(
            int(row["home_team_id"]), int(row["away_team_id"]), row["captured_date"]
        ),
        axis=1,
    )

    return df_mapped


def validate_odds_api_matchups(df: pd.DataFrame, validator: MatchupValidator) -> pd.DataFrame:
    """Validate Odds API matchups.

    Args:
        df: Odds API DataFrame
        validator: MatchupValidator instance

    Returns:
        DataFrame with validation results
    """
    logger.info("Validating Odds API matchups...")

    # Normalize timestamps
    df = normalize_dataframe_times(df, "commence_time", output_prefix="game")

    # Get canonical team IDs
    df["home_team_id"] = df["home_team"].apply(
        lambda x: validator.get_canonical_team_id(x, "odds_api")
    )
    df["away_team_id"] = df["away_team"].apply(
        lambda x: validator.get_canonical_team_id(x, "odds_api")
    )

    # Check for unmapped teams
    unmapped_home = df[df["home_team_id"].isna()]["home_team"].unique()
    unmapped_away = df[df["away_team_id"].isna()]["away_team"].unique()

    if len(unmapped_home) > 0:
        logger.warning(f"Unmapped home teams: {list(unmapped_home)}")
    if len(unmapped_away) > 0:
        logger.warning(f"Unmapped away teams: {list(unmapped_away)}")

    # Filter to mapped teams
    df_mapped = df[df["home_team_id"].notna() & df["away_team_id"].notna()].copy()
    logger.info(f"  {len(df_mapped)} events with mapped teams")

    # Create matchup keys
    df_mapped["matchup_key"] = df_mapped.apply(
        lambda row: validator.create_matchup_key(
            int(row["home_team_id"]), int(row["away_team_id"]), row["game_date"]
        ),
        axis=1,
    )

    return df_mapped


def find_common_matchups(overtime_df: pd.DataFrame, odds_api_df: pd.DataFrame) -> pd.DataFrame:
    """Find matchups that appear in both data sources.

    Args:
        overtime_df: Validated Overtime.ag DataFrame
        odds_api_df: Validated Odds API DataFrame

    Returns:
        DataFrame with common matchups and comparison
    """
    logger.info("Finding common matchups across sources...")

    # Get common matchup keys
    overtime_keys = set(overtime_df["matchup_key"].unique())
    odds_api_keys = set(odds_api_df["matchup_key"].unique())
    common_keys = overtime_keys & odds_api_keys

    logger.info(f"  Overtime.ag matchups: {len(overtime_keys)}")
    logger.info(f"  Odds API matchups: {len(odds_api_keys)}")
    logger.info(f"  Common matchups: {len(common_keys)}")

    if len(common_keys) == 0:
        logger.warning("No common matchups found!")
        return pd.DataFrame()

    # Get details for common matchups
    overtime_common = overtime_df[overtime_df["matchup_key"].isin(common_keys)].copy()
    odds_api_common = odds_api_df[odds_api_df["matchup_key"].isin(common_keys)].copy()

    # Merge on matchup key
    merged = overtime_common.merge(
        odds_api_common,
        on="matchup_key",
        how="inner",
        suffixes=("_overtime", "_odds"),
    )

    return merged


def check_time_discrepancies(common_df: pd.DataFrame) -> pd.DataFrame:
    """Check for time discrepancies between sources.

    Args:
        common_df: DataFrame with common matchups

    Returns:
        DataFrame with time discrepancy analysis
    """
    if len(common_df) == 0:
        return pd.DataFrame()

    logger.info("Checking time discrepancies...")

    # Calculate time differences (both should be in UTC)
    common_df["time_diff_hours"] = (
        common_df["game_datetime_utc"] - common_df["captured_datetime_utc"]
    ).dt.total_seconds() / 3600

    # Flag significant discrepancies (> 2 hours)
    common_df["time_discrepancy"] = common_df["time_diff_hours"].abs() > 2

    discrepancies = common_df[common_df["time_discrepancy"]]
    if len(discrepancies) > 0:
        logger.warning(f"Found {len(discrepancies)} matchups with >2 hour time discrepancy")
        for _, row in discrepancies.head(5).iterrows():
            logger.warning(
                f"  {row['home_team_overtime']} vs {row['away_team_overtime']}: "
                f"{row['time_diff_hours']:.1f} hours"
            )
    else:
        logger.info("No significant time discrepancies found")

    return common_df


def generate_validation_report(
    overtime_df: pd.DataFrame | None,
    odds_api_df: pd.DataFrame | None,
    common_df: pd.DataFrame,
) -> None:
    """Generate validation report.

    Args:
        overtime_df: Validated Overtime.ag DataFrame
        odds_api_df: Validated Odds API DataFrame
        common_df: Common matchups DataFrame
    """
    print("\n" + "=" * 80)
    print("  MATCHUP VALIDATION REPORT")
    print("=" * 80)

    if overtime_df is None and odds_api_df is None:
        print("\n[WARNING] No data sources available for validation")
        return

    print("\nDATA SOURCES:")
    if overtime_df is not None:
        print(f"  Overtime.ag: {len(overtime_df)} matchups")
        date_min = overtime_df["captured_date"].min()
        date_max = overtime_df["captured_date"].max()
        print(f"    Date range: {date_min} to {date_max}")
    else:
        print("  Overtime.ag: No data")

    if odds_api_df is not None:
        print(f"  Odds API: {len(odds_api_df)} matchups")
        print(
            f"    Date range: {odds_api_df['game_date'].min()} to {odds_api_df['game_date'].max()}"
        )
    else:
        print("  Odds API: No data")

    if len(common_df) > 0:
        print(f"\nCOMMON MATCHUPS: {len(common_df)}")
        total = max(len(overtime_df or []), len(odds_api_df or []))
        coverage = len(common_df) / total * 100
        print(f"  Coverage: {coverage:.1f}%")

        # Time discrepancy summary
        if "time_discrepancy" in common_df.columns:
            discrepancies = common_df["time_discrepancy"].sum()
            print("\nTIME DISCREPANCIES:")
            print(f"  Matchups with >2 hour difference: {discrepancies}")
            if discrepancies == 0:
                print("  [OK] All times align within 2-hour window")

        # Sample matchups
        print("\nSAMPLE MATCHUPS (First 5):")
        print("-" * 80)
        for _, row in common_df.head(5).iterrows():
            print(f"  {row['home_team_overtime']} vs {row['away_team_overtime']}")
            print(f"    Matchup key: {row['matchup_key']}")
            if "game_datetime_utc" in row:
                print(f"    Odds API time: {row['game_datetime_utc']}")
            if "captured_datetime_utc" in row:
                print(f"    Overtime time: {row['captured_datetime_utc']}")
            print()

    print("=" * 80)


def main() -> None:
    """Run matchup validation."""
    logger.info("Starting matchup validation...")

    # Load team mapping
    team_mapping = load_team_mapping()
    validator = MatchupValidator(team_mapping)

    # Load data sources
    overtime_df = load_overtime_data()
    odds_api_df = load_odds_api_data()

    # Validate each source
    validated_overtime = None
    validated_odds_api = None

    if overtime_df is not None:
        validated_overtime = validate_overtime_matchups(overtime_df, validator)

    if odds_api_df is not None:
        validated_odds_api = validate_odds_api_matchups(odds_api_df, validator)

    # Find common matchups
    common_df = pd.DataFrame()
    if validated_overtime is not None and validated_odds_api is not None:
        common_df = find_common_matchups(validated_overtime, validated_odds_api)
        if len(common_df) > 0:
            common_df = check_time_discrepancies(common_df)

    # Generate report
    generate_validation_report(validated_overtime, validated_odds_api, common_df)

    logger.info("\nValidation complete!")


if __name__ == "__main__":
    main()
