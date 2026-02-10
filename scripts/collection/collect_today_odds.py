"""Collect today's NCAAB odds for spreads and totals.

This script fetches current odds from The Odds API and normalizes them according
to the betting data normalization standards:
- One canonical spread per game (not separate favorite/underdog rows)
- One total per game (not separate over/under rows)
- Proper favorite/underdog decomposition

Usage:
    uv run python scripts/collect_today_odds.py
    uv run python scripts/collect_today_odds.py --output data/odds_api/today_odds.parquet
"""

import asyncio
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from sports_betting_edge.adapters.odds_api import OddsAPIAdapter
from sports_betting_edge.config.settings import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def normalize_spread_data(
    event: dict[str, Any], bookmaker: dict[str, Any], market: dict[str, Any]
) -> dict[str, Any] | None:
    """Normalize spread market to one canonical row per game.

    Args:
        event: Event data from API
        bookmaker: Bookmaker data
        market: Market data containing outcomes

    Returns:
        Normalized spread record with single magnitude value, or None if invalid
    """
    outcomes = market.get("outcomes", [])
    if len(outcomes) != 2:
        logger.warning(f"Expected 2 outcomes for spread, got {len(outcomes)}")
        return None

    # Find favorite (negative spread) and underdog (positive spread)
    favorite = None
    underdog = None

    for outcome in outcomes:
        point = outcome.get("point")
        if point is None:
            continue

        if point < 0:
            favorite = outcome
        elif point > 0:
            underdog = outcome
        # Skip point == 0 (pick'em) for now - handle separately if needed

    if not favorite or not underdog:
        logger.warning(f"Could not identify favorite/underdog for event {event['id']}")
        return None

    # Verify magnitudes match (should be equal)
    fav_mag = abs(favorite["point"])
    dog_mag = abs(underdog["point"])
    if fav_mag != dog_mag:
        logger.warning(f"Spread magnitude mismatch: {fav_mag} vs {dog_mag} for event {event['id']}")

    return {
        "event_id": event["id"],
        "sport_key": event["sport_key"],
        "commence_time": event["commence_time"],
        "home_team": event["home_team"],
        "away_team": event["away_team"],
        "bookmaker_key": bookmaker["key"],
        "bookmaker_title": bookmaker["title"],
        "market_key": "spreads",
        "favorite_team": favorite["name"],
        "underdog_team": underdog["name"],
        "spread_magnitude": fav_mag,
        "favorite_price": favorite.get("price"),
        "underdog_price": underdog.get("price"),
        "captured_at": datetime.now(UTC).isoformat(),
    }


def normalize_total_data(
    event: dict[str, Any], bookmaker: dict[str, Any], market: dict[str, Any]
) -> dict[str, Any] | None:
    """Normalize total market to one canonical row per game.

    Args:
        event: Event data from API
        bookmaker: Bookmaker data
        market: Market data containing outcomes

    Returns:
        Normalized total record with single total value, or None if invalid
    """
    outcomes = market.get("outcomes", [])
    if len(outcomes) != 2:
        logger.warning(f"Expected 2 outcomes for total, got {len(outcomes)}")
        return None

    # Find over and under
    over = None
    under = None

    for outcome in outcomes:
        name = outcome.get("name", "").lower()
        if name == "over":
            over = outcome
        elif name == "under":
            under = outcome

    if not over or not under:
        logger.warning(f"Could not identify over/under for event {event['id']}")
        return None

    # Verify totals match (should be equal)
    over_total = over.get("point")
    under_total = under.get("point")

    if over_total is None or under_total is None:
        logger.warning(f"Missing total value for event {event['id']}")
        return None

    if over_total != under_total:
        logger.warning(f"Total mismatch: {over_total} vs {under_total} for event {event['id']}")

    return {
        "event_id": event["id"],
        "sport_key": event["sport_key"],
        "commence_time": event["commence_time"],
        "home_team": event["home_team"],
        "away_team": event["away_team"],
        "bookmaker_key": bookmaker["key"],
        "bookmaker_title": bookmaker["title"],
        "market_key": "totals",
        "total": over_total,
        "over_price": over.get("price"),
        "under_price": under.get("price"),
        "captured_at": datetime.now(UTC).isoformat(),
    }


async def collect_and_normalize_odds() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Collect and normalize today's NCAAB odds.

    Returns:
        Tuple of (spreads_df, totals_df)
    """
    logger.info("Initializing Odds API adapter...")
    adapter = OddsAPIAdapter()

    try:
        logger.info("Fetching NCAAB odds for spreads and totals...")
        odds_data = await adapter.get_ncaab_odds(markets="spreads,totals")

        logger.info(f"Retrieved {len(odds_data)} events from Odds API")

        # Process each event and bookmaker
        spread_records = []
        total_records = []

        for event in odds_data:
            bookmakers = event.get("bookmakers", [])

            for bookmaker in bookmakers:
                markets = bookmaker.get("markets", [])

                for market in markets:
                    market_key = market.get("key")

                    if market_key == "spreads":
                        record = normalize_spread_data(event, bookmaker, market)
                        if record:
                            spread_records.append(record)

                    elif market_key == "totals":
                        record = normalize_total_data(event, bookmaker, market)
                        if record:
                            total_records.append(record)

        spreads_df = pd.DataFrame(spread_records)
        totals_df = pd.DataFrame(total_records)

        logger.info(f"Normalized {len(spreads_df)} spread records")
        logger.info(f"Normalized {len(totals_df)} total records")

        # Log quota usage
        quota_remaining = adapter.get_quota_remaining()
        quota_used = adapter.get_quota_used()
        if quota_remaining is not None:
            logger.info(f"API quota remaining: {quota_remaining:,}")
        if quota_used is not None:
            logger.info(f"API quota used: {quota_used:,}")

        return spreads_df, totals_df

    finally:
        await adapter.close()


def validate_normalized_data(spreads_df: pd.DataFrame, totals_df: pd.DataFrame) -> None:
    """Validate normalized betting data.

    Args:
        spreads_df: Normalized spreads DataFrame
        totals_df: Normalized totals DataFrame
    """
    logger.info("Validating normalized data...")
    errors = []

    # Validate spreads
    if not spreads_df.empty:
        # Check for extreme spreads
        extreme = spreads_df[spreads_df["spread_magnitude"] > 50]
        if len(extreme) > 0:
            errors.append(f"WARNING: {len(extreme)} extreme spreads (>50 points)")

        # Check spread magnitude is always positive
        negative = spreads_df[spreads_df["spread_magnitude"] < 0]
        if len(negative) > 0:
            errors.append(f"FATAL: {len(negative)} negative spread magnitudes")

        # Check no duplicate spreads per game per bookmaker
        dupes = spreads_df.groupby(["event_id", "bookmaker_key"]).size()
        if (dupes > 1).any():
            errors.append(f"FATAL: Duplicate spreads detected - {(dupes > 1).sum()} games affected")

    # Validate totals
    if not totals_df.empty:
        # Check for extreme totals
        extreme_low = totals_df[totals_df["total"] < 100]
        extreme_high = totals_df[totals_df["total"] > 200]
        if len(extreme_low) > 0:
            errors.append(f"WARNING: {len(extreme_low)} unusually low totals (<100)")
        if len(extreme_high) > 0:
            errors.append(f"WARNING: {len(extreme_high)} unusually high totals (>200)")

        # Check no duplicate totals per game per bookmaker
        dupes = totals_df.groupby(["event_id", "bookmaker_key"]).size()
        if (dupes > 1).any():
            errors.append(f"FATAL: Duplicate totals detected - {(dupes > 1).sum()} games affected")

    if errors:
        for error in errors:
            if error.startswith("FATAL"):
                logger.error(error)
            else:
                logger.warning(error)
    else:
        logger.info("[OK] All validation checks passed")


def main() -> None:
    """Collect and save today's NCAAB odds."""
    import sys

    # Parse optional output path
    output_dir = settings.daily_odds_dir
    if len(sys.argv) > 2 and sys.argv[1] == "--output":
        output_dir = Path(sys.argv[2]).parent

    logger.info("Starting NCAAB odds collection for today...")

    # Collect and normalize
    spreads_df, totals_df = asyncio.run(collect_and_normalize_odds())

    if spreads_df.empty and totals_df.empty:
        logger.warning("No odds data collected - no games scheduled?")
        return

    # Validate
    validate_normalized_data(spreads_df, totals_df)

    # Save to parquet
    output_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")

    if not spreads_df.empty:
        spreads_path = output_dir / f"{today}_spreads.parquet"
        spreads_df.to_parquet(spreads_path, index=False)
        logger.info(f"[OK] Saved {len(spreads_df)} spreads to {spreads_path}")

        # Summary stats
        unique_games = spreads_df["event_id"].nunique()
        unique_bookmakers = spreads_df["bookmaker_key"].nunique()
        logger.info(f"     {unique_games} unique games, {unique_bookmakers} bookmakers")

    if not totals_df.empty:
        totals_path = output_dir / f"{today}_totals.parquet"
        totals_df.to_parquet(totals_path, index=False)
        logger.info(f"[OK] Saved {len(totals_df)} totals to {totals_path}")

        # Summary stats
        unique_games = totals_df["event_id"].nunique()
        unique_bookmakers = totals_df["bookmaker_key"].nunique()
        logger.info(f"     {unique_games} unique games, {unique_bookmakers} bookmakers")

    # Show sample data
    if not spreads_df.empty:
        logger.info("\nSample spread data:")
        sample = spreads_df.head(3)[
            [
                "commence_time",
                "favorite_team",
                "underdog_team",
                "spread_magnitude",
                "bookmaker_title",
            ]
        ]
        print(sample.to_string(index=False))

    if not totals_df.empty:
        logger.info("\nSample total data:")
        sample = totals_df.head(3)[
            ["commence_time", "home_team", "away_team", "total", "bookmaker_title"]
        ]
        print(sample.to_string(index=False))


if __name__ == "__main__":
    main()
