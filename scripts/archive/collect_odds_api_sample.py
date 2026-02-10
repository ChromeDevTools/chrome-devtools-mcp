"""Collect sample Odds API data for team name mapping.

This script fetches current NCAA Men's Basketball odds from The Odds API
and extracts unique team names for mapping to the canonical team table.

Usage:
    uv run python scripts/collect_odds_api_sample.py

Output:
    - data/odds_api/sample/ncaab_odds_YYYY-MM-DD.parquet
    - Prints unique team names for mapping
"""

import asyncio
import logging
from datetime import datetime
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.odds_api import OddsAPIAdapter

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


async def collect_odds_sample() -> pd.DataFrame:
    """Collect current NCAAB odds from The Odds API.

    Returns:
        DataFrame with odds data
    """
    logger.info("Initializing Odds API adapter...")
    adapter = OddsAPIAdapter()

    try:
        logger.info("Fetching NCAA Men's Basketball odds...")
        odds_data = await adapter.get_ncaab_odds()

        logger.info(f"Retrieved {len(odds_data)} events from Odds API")

        # Extract team names and event info
        events = []
        for event in odds_data:
            events.append(
                {
                    "event_id": event["id"],
                    "sport_key": event["sport_key"],
                    "commence_time": event["commence_time"],
                    "home_team": event["home_team"],
                    "away_team": event["away_team"],
                    "bookmaker_count": len(event.get("bookmakers", [])),
                }
            )

        df = pd.DataFrame(events)
        logger.info(f"Processed {len(df)} events")

        # Log quota usage
        quota_remaining = adapter.get_quota_remaining()
        quota_used = adapter.get_quota_used()
        if quota_remaining is not None:
            logger.info(f"API quota remaining: {quota_remaining:,}")
        if quota_used is not None:
            logger.info(f"API quota used: {quota_used:,}")

        return df

    finally:
        await adapter.close()


def extract_unique_teams(df: pd.DataFrame) -> list[str]:
    """Extract unique team names from odds data.

    Args:
        df: Odds data DataFrame

    Returns:
        Sorted list of unique team names
    """
    home_teams = df["home_team"].unique()
    away_teams = df["away_team"].unique()
    all_teams = sorted(set(list(home_teams) + list(away_teams)))
    return all_teams


def save_sample_data(df: pd.DataFrame, output_dir: Path) -> None:
    """Save sample odds data to parquet.

    Args:
        df: Odds data DataFrame
        output_dir: Directory to save data
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    output_path = output_dir / f"ncaab_odds_{today}.parquet"

    df.to_parquet(output_path, index=False)
    logger.info(f"Saved sample data to {output_path}")


def main() -> None:
    """Collect Odds API sample data and extract team names."""
    logger.info("Starting Odds API sample collection...")

    # Collect data
    df = asyncio.run(collect_odds_sample())

    if len(df) == 0:
        logger.warning("No events returned from Odds API")
        logger.info("This may be normal if no games are scheduled soon")
        return

    # Extract unique team names
    teams = extract_unique_teams(df)
    logger.info(f"\nFound {len(teams)} unique teams in Odds API data:")
    logger.info("=" * 80)
    for i, team in enumerate(teams, 1):
        print(f"{i:3}. {team}")
    logger.info("=" * 80)

    # Save sample data
    output_dir = Path("data/odds_api/sample")
    save_sample_data(df, output_dir)

    # Summary
    logger.info("\nSummary:")
    logger.info(f"  Events: {len(df)}")
    logger.info(f"  Unique teams: {len(teams)}")
    logger.info(f"  Date range: {df['commence_time'].min()} to {df['commence_time'].max()}")

    logger.info("\nNext step: Run python scripts/map_odds_api_teams.py")


if __name__ == "__main__":
    main()
