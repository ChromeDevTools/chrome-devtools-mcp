"""Collect ESPN game results for 2026 NCAA Basketball season.

Fetches completed games from ESPN scoreboard API for the full season
(November 2025 - March 2026) and saves to parquet for matching with Odds API.

Usage:
    uv run python scripts/collect_espn_season_results.py \\
        --start 2025-11-01 \\
        --end 2026-03-31 \\
        --output data/espn/season_results_2026.parquet
"""

import argparse
import asyncio
import logging
from datetime import date, datetime
from pathlib import Path

from sports_betting_edge.adapters.filesystem import write_parquet
from sports_betting_edge.services.espn_schedule_collection import collect_schedule_range

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


async def collect_season_results(
    start_date: date,
    end_date: date,
    output_path: Path,
) -> None:
    """Collect all game results for a date range from ESPN.

    Args:
        start_date: First date to collect
        end_date: Last date to collect
        output_path: Path to save parquet file
    """
    logger.info(f"Collecting ESPN results from {start_date} to {end_date}...")

    # Collect games for date range
    games = await collect_schedule_range(
        start_date=start_date,
        end_date=end_date,
        use_calendar=False,  # Check every day for comprehensive coverage
    )

    logger.info(f"Collected {len(games)} total games")

    # Filter to completed games only (have final scores)
    completed_games = [g for g in games if g.home_score is not None and g.away_score is not None]

    logger.info(f"Found {len(completed_games)} completed games with scores")

    if not completed_games:
        logger.warning("No completed games found in date range")
        return

    # Convert to dict format for parquet
    games_data = []
    for game in completed_games:
        games_data.append(
            {
                "game_id": game.game_id,
                "game_date": game.game_date.isoformat(),
                "home_team": game.home_team,
                "away_team": game.away_team,
                "home_team_id": game.home_team_id,
                "away_team_id": game.away_team_id,
                "home_score": game.home_score,
                "away_score": game.away_score,
                "status": game.status,
                "conference_id": game.conference_id,
                "conference_name": game.conference_name,
                "venue": game.venue,
                "neutral_site": game.neutral_site,
                "captured_at": game.captured_at.isoformat(),
            }
        )

    # Save to parquet
    output_path.parent.mkdir(parents=True, exist_ok=True)
    write_parquet(games_data, output_path)

    logger.info(f"[OK] Saved {len(games_data)} completed games to {output_path}")

    # Show sample statistics
    logger.info("\n=== Collection Statistics ===")
    logger.info(f"Date range: {start_date} to {end_date}")
    logger.info(f"Total games collected: {len(games)}")
    logger.info(f"Completed games: {len(completed_games)}")
    logger.info(f"Scheduled/in-progress: {len(games) - len(completed_games)}")

    # Show date distribution
    if completed_games:
        dates = [g.game_date.date() for g in completed_games]
        logger.info(f"First game: {min(dates)}")
        logger.info(f"Last game: {max(dates)}")


def main() -> None:
    """Collect ESPN season results."""
    parser = argparse.ArgumentParser(description="Collect ESPN game results for season")
    parser.add_argument(
        "--start",
        type=lambda s: datetime.fromisoformat(s).date(),
        default=date(2025, 11, 1),
        help="Start date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end",
        type=lambda s: datetime.fromisoformat(s).date(),
        default=date(2026, 3, 31),
        help="End date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/espn/season_results_2026.parquet"),
        help="Output parquet file path",
    )

    args = parser.parse_args()

    asyncio.run(collect_season_results(args.start, args.end, args.output))


if __name__ == "__main__":
    main()
