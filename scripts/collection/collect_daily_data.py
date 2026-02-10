"""Collect daily KenPom and ESPN data.

Usage:
    uv run python scripts/collect_daily_data.py
    uv run python scripts/collect_daily_data.py --date 2026-02-01
"""

import asyncio
import json
import logging
import subprocess
from datetime import date
from pathlib import Path

from sports_betting_edge.adapters.filesystem import write_parquet
from sports_betting_edge.core.models import ESPNGame
from sports_betting_edge.services.kenpom_collection import (
    collect_kenpom_four_factors,
    collect_kenpom_misc_stats,
    collect_kenpom_ratings,
)
from sports_betting_edge.utils.time import utc_now

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


async def collect_kenpom_daily(season: int = 2026) -> None:
    """Collect fresh KenPom data for current season.

    Args:
        season: Season year
    """
    logger.info(f"Collecting KenPom data for season {season}...")

    # Collect ratings
    try:
        count = await collect_kenpom_ratings(season=season)
        logger.info(f"[OK] Collected {count} team ratings")
    except Exception as e:
        logger.error(f"[ERROR] Failed to collect ratings: {e}")

    # Collect four factors
    try:
        count = await collect_kenpom_four_factors(season=season)
        logger.info(f"[OK] Collected {count} four factors records")
    except Exception as e:
        logger.error(f"[ERROR] Failed to collect four factors: {e}")

    # Collect misc stats
    try:
        count = await collect_kenpom_misc_stats(season=season)
        logger.info(f"[OK] Collected {count} misc stats records")
    except Exception as e:
        logger.error(f"[ERROR] Failed to collect misc stats: {e}")


def collect_espn_schedule(target_date: date | None = None) -> None:
    """Collect ESPN schedule for a specific date using web scraper.

    Uses Puppeteer scraper to get complete schedule (25+ games) instead of
    limited API (4 games).

    Args:
        target_date: Date to collect (default: today)
    """
    if target_date is None:
        target_date = date.today()

    logger.info(f"Collecting ESPN schedule for {target_date}...")

    try:
        # Format date for ESPN (YYYYMMDD)
        date_str = target_date.strftime("%Y%m%d")

        # Create temp file for scraper output
        temp_json = Path(f"data/espn/schedule/{target_date}-temp.json")
        temp_json.parent.mkdir(parents=True, exist_ok=True)

        # Run Puppeteer scraper
        puppeteer_script = Path("puppeteer/capture_espn_full_schedule.js")
        cmd = ["node", str(puppeteer_script), "--date", date_str, "--output", str(temp_json)]

        logger.info(f"Running ESPN scraper: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

        if result.returncode != 0:
            logger.error(f"Scraper failed: {result.stderr}")
            return

        # Load scraped data
        with open(temp_json) as f:
            scraped = json.load(f)

        games_raw = scraped.get("games", [])
        if not games_raw:
            logger.warning(f"No games found for {target_date}")
            return

        # Convert to ESPNGame models
        captured_at = utc_now()
        games = []
        for g in games_raw:
            # Construct game_id from team IDs (ESPN doesn't provide it)
            game_id = (
                f"{g.get('away_team_id', 'unknown')}-{g.get('home_team_id', 'unknown')}-{date_str}"
            )

            game = ESPNGame(
                game_id=game_id,
                home_team_id=g.get("home_team_id", ""),
                away_team_id=g.get("away_team_id", ""),
                home_team=g.get("home_team", ""),
                away_team=g.get("away_team", ""),
                game_date=captured_at,  # Scheduled date
                status="Scheduled",
                home_score=None,
                away_score=None,
                captured_at=captured_at,
            )
            games.append(game)

        # Write to Parquet
        output_dir = Path("data/espn/schedule")
        output_path = output_dir / f"{target_date}.parquet"

        data = [game.model_dump(mode="json") for game in games]
        write_parquet(data, output_path)

        # Clean up temp file
        temp_json.unlink()

        logger.info(f"[OK] Collected {len(games)} games to {output_path}")

    except subprocess.TimeoutExpired:
        logger.error("ESPN scraper timed out after 60 seconds")
    except Exception as e:
        logger.error(f"[ERROR] Failed to collect ESPN schedule: {e}")


async def main() -> None:
    """Collect all daily data."""
    import sys

    # Parse optional date argument
    target_date = None
    if len(sys.argv) > 2 and sys.argv[1] == "--date":
        date_str = sys.argv[2]
        target_date = date.fromisoformat(date_str)

    logger.info("Starting daily data collection...")

    # Collect KenPom data (async)
    await collect_kenpom_daily(season=2026)

    # Collect ESPN schedule (sync - uses Puppeteer)
    collect_espn_schedule(target_date=target_date)

    logger.info("Daily data collection complete!")


if __name__ == "__main__":
    asyncio.run(main())
