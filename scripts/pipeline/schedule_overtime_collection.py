"""Scheduled Overtime.ag odds collection with timezone-aware game time checks.

Collects odds at 10-minute intervals starting at 4 AM PST, continuing until
each game starts. Handles timezone conversions between:
- Overtime.ag: EST (UTC-5)
- ESPN: PST (UTC-8)
- System: UTC

Usage:
    # Run once (check if it's time to collect)
    uv run python scripts/schedule_overtime_collection.py --once

    # Run continuously (daemon mode)
    uv run python scripts/schedule_overtime_collection.py --daemon

    # Dry run (show what would happen)
    uv run python scripts/schedule_overtime_collection.py --dry-run
"""

import argparse
import json
import logging
import subprocess
import time
from datetime import UTC, datetime, timedelta
from datetime import time as dt_time
from pathlib import Path
from zoneinfo import ZoneInfo

from sports_betting_edge.adapters.filesystem import read_parquet_df

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Timezone definitions
PST = ZoneInfo("America/Los_Angeles")
EST = ZoneInfo("America/New_York")
UTC = UTC

# Schedule configuration
COLLECTION_START_TIME = dt_time(4, 0)  # 4:00 AM PST
COLLECTION_INTERVAL_MINUTES = 10
STOP_BEFORE_GAME_MINUTES = 5  # Stop collecting 5 min before tipoff


def get_current_time_pst() -> datetime:
    """Get current time in PST."""
    return datetime.now(PST)


def parse_overtime_game_time(game_time_str: str, game_date_str: str) -> datetime | None:
    """Parse Overtime.ag game time strings to datetime in PST.

    Overtime.ag shows times like "7:00 PM" (EST) with dates like "Sat Feb 1".

    Args:
        game_time_str: Time string (e.g., "7:00 PM")
        game_date_str: Date string (e.g., "Sat Feb 1")

    Returns:
        Game datetime in PST, or None if parsing fails
    """
    try:
        # Parse the date and time in EST
        current_year = datetime.now().year
        date_with_year = f"{game_date_str} {current_year}"

        # Parse datetime string
        datetime_str = f"{date_with_year} {game_time_str}"

        # Try common formats
        for fmt in [
            "%a %b %d %Y %I:%M %p",  # "Sat Feb 1 2026 7:00 PM"
            "%a %b %d %Y %I %p",  # "Sat Feb 1 2026 7 PM"
        ]:
            try:
                # Parse as EST, then convert to PST
                dt_est = datetime.strptime(datetime_str, fmt).replace(tzinfo=EST)
                dt_pst = dt_est.astimezone(PST)
                return dt_pst
            except ValueError:
                continue

        logger.warning(f"Could not parse game time: {game_time_str} {game_date_str}")
        return None

    except Exception as e:
        logger.warning(f"Error parsing game time: {e}")
        return None


def should_collect_now() -> bool:
    """Check if current time is within collection window (4 AM - 11:59 PM PST)."""
    now = get_current_time_pst()
    current_time = now.time()

    # Collect between 4 AM and midnight
    return not current_time < COLLECTION_START_TIME


def get_upcoming_games(overtime_data_path: Path) -> list[dict]:
    """Load most recent Overtime data and filter for upcoming games.

    Args:
        overtime_data_path: Path to most recent Overtime parquet file

    Returns:
        List of games that haven't started yet
    """
    try:
        df = read_parquet_df(str(overtime_data_path))
        now_pst = get_current_time_pst()

        upcoming = []
        for _, row in df.iterrows():
            game_time = parse_overtime_game_time(
                row.get("game_time_str", ""), row.get("game_date_str", "")
            )

            if game_time and game_time > now_pst:
                # Game hasn't started yet
                time_until_game = (game_time - now_pst).total_seconds() / 60
                upcoming.append(
                    {
                        "home_team": row["home_team"],
                        "away_team": row["away_team"],
                        "game_time_pst": game_time,
                        "minutes_until_game": time_until_game,
                    }
                )

        return upcoming

    except Exception as e:
        logger.error(f"Error loading upcoming games: {e}")
        return []


def run_overtime_collection() -> bool:
    """Run Puppeteer script to collect Overtime.ag odds.

    Returns:
        True if collection succeeded, False otherwise
    """
    try:
        # Generate output filename with timestamp
        now = get_current_time_pst()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H%M")

        output_dir = Path("data/overtime/snapshots")
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file = output_dir / f"{date_str}_{time_str}.json"

        # Run Puppeteer scraper
        puppeteer_script = Path("puppeteer/capture_overtime_college_basketball_odds.js")
        cmd = ["node", str(puppeteer_script), "--output", str(output_file)]

        logger.info(f"Collecting Overtime.ag odds at {now.strftime('%I:%M %p PST')}...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

        if result.returncode != 0:
            logger.error(f"Collection failed: {result.stderr}")
            return False

        # Check if any games were collected
        with open(output_file) as f:
            data = json.load(f)
            game_count = data.get("game_count", 0)

        if game_count == 0:
            logger.warning("No games found (may be too early or all games finished)")
            output_file.unlink()  # Remove empty file
            return False

        logger.info(f"[OK] Collected {game_count} games -> {output_file.name}")
        return True

    except subprocess.TimeoutExpired:
        logger.error("Collection timed out after 60 seconds")
        return False
    except Exception as e:
        logger.error(f"Collection error: {e}")
        return False


def wait_until_next_interval(interval_minutes: int = COLLECTION_INTERVAL_MINUTES) -> None:
    """Wait until the next collection interval.

    Args:
        interval_minutes: Minutes between collections
    """
    now = get_current_time_pst()

    # Calculate next collection time (round up to next interval)
    minutes_since_hour = now.minute
    minutes_until_next = interval_minutes - (minutes_since_hour % interval_minutes)

    if minutes_until_next == 0:
        minutes_until_next = interval_minutes

    next_collection = now + timedelta(minutes=minutes_until_next)
    next_collection = next_collection.replace(second=0, microsecond=0)

    wait_seconds = (next_collection - now).total_seconds()

    logger.info(
        f"Next collection at {next_collection.strftime('%I:%M %p PST')} "
        f"({int(wait_seconds / 60)} minutes)"
    )

    time.sleep(wait_seconds)


def run_once(dry_run: bool = False) -> None:
    """Run single collection check.

    Args:
        dry_run: If True, only show what would happen without collecting
    """
    if not should_collect_now():
        now = get_current_time_pst()
        logger.info(
            f"Outside collection window (current: {now.strftime('%I:%M %p PST')}, "
            f"starts: {COLLECTION_START_TIME.strftime('%I:%M %p')})"
        )
        return

    if dry_run:
        now = get_current_time_pst()
        logger.info(f"[DRY RUN] Would collect at {now.strftime('%I:%M %p PST')}")

        # Check for upcoming games
        overtime_dir = Path("data/overtime")
        parquet_files = list(overtime_dir.glob("*.parquet"))
        if parquet_files:
            latest = max(parquet_files, key=lambda p: p.stat().st_mtime)
            upcoming = get_upcoming_games(latest)
            logger.info(f"Found {len(upcoming)} upcoming games")
            for game in upcoming[:5]:
                logger.info(
                    f"  {game['away_team']} @ {game['home_team']} "
                    f"(in {int(game['minutes_until_game'])} min)"
                )
        return

    # Run actual collection
    run_overtime_collection()


def run_daemon() -> None:
    """Run continuous collection daemon.

    Collects every 10 minutes from 4 AM PST until midnight.
    Stops collecting for games that have already started.
    """
    logger.info("Starting Overtime.ag collection daemon")
    logger.info(f"Schedule: Every {COLLECTION_INTERVAL_MINUTES} minutes from 4:00 AM PST")
    logger.info(f"Stops {STOP_BEFORE_GAME_MINUTES} minutes before each game")

    while True:
        try:
            if should_collect_now():
                run_overtime_collection()
                wait_until_next_interval()
            else:
                # Wait until 4 AM
                now = get_current_time_pst()
                next_start = now.replace(
                    hour=COLLECTION_START_TIME.hour,
                    minute=COLLECTION_START_TIME.minute,
                    second=0,
                    microsecond=0,
                )

                if next_start <= now:
                    # Already past 4 AM today, wait until tomorrow
                    next_start += timedelta(days=1)

                wait_seconds = (next_start - now).total_seconds()
                logger.info(
                    f"Waiting until {next_start.strftime('%I:%M %p PST')} "
                    f"({int(wait_seconds / 3600)} hours)"
                )
                time.sleep(wait_seconds)

        except KeyboardInterrupt:
            logger.info("Daemon stopped by user")
            break
        except Exception as e:
            logger.error(f"Daemon error: {e}")
            time.sleep(60)  # Wait 1 minute before retrying


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Scheduled Overtime.ag odds collection")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run single collection check (for cron)",
    )
    parser.add_argument(
        "--daemon",
        action="store_true",
        help="Run continuous daemon mode",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would happen without collecting",
    )

    args = parser.parse_args()

    if args.daemon:
        run_daemon()
    elif args.once or args.dry_run:
        run_once(dry_run=args.dry_run)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
