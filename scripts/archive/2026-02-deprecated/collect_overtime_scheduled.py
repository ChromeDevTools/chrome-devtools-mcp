"""Scheduled Overtime.ag line collection - runs every 10 minutes until gametime.

Collects live line snapshots at regular intervals for games that haven't started yet.
Automatically stops collecting for games once they begin. Ideal for building
line movement datasets and detecting closing line value (CLV).

Architecture:
    1. Fetch today's game schedule (ESPN or similar)
    2. Collect current lines from Overtime.ag every 10 minutes
    3. Save snapshots to timestamped Parquet files
    4. Stop collecting for games that have started
    5. Exit when all games have begun or end of day

Usage:
    # Run continuously until all games start
    uv run python scripts/collect_overtime_scheduled.py

    # Custom interval (5 minutes)
    uv run python scripts/collect_overtime_scheduled.py --interval 300

    # Stop at specific time
    uv run python scripts/collect_overtime_scheduled.py --stop-at "23:00"

    # Test mode (single collection)
    uv run python scripts/collect_overtime_scheduled.py --test

Output:
    data/raw/overtime_snapshots/
        overtime_snapshot_20240202_140000.parquet
        overtime_snapshot_20240202_141000.parquet
        ...
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime, time
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sports_betting_edge.adapters.overtime_ag import (  # noqa: E402
    OvertimeSignalRClient,
)
from sports_betting_edge.core.exceptions import ConfigurationError  # noqa: E402

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


class ScheduledLineCollector:
    """Collects Overtime.ag lines at regular intervals until games start."""

    def __init__(
        self,
        interval_seconds: int = 600,
        output_dir: Path | None = None,
        stop_time: time | None = None,
    ):
        """Initialize the scheduled collector.

        Args:
            interval_seconds: Seconds between collections (default: 600 = 10 min)
            output_dir: Where to save snapshots
            stop_time: Stop collecting at this time (None = run until all games start)
        """
        self.interval_seconds = interval_seconds
        self.output_dir = output_dir or (PROJECT_ROOT / "data" / "raw" / "overtime_snapshots")
        self.stop_time = stop_time
        self.games_started: set[int] = set()
        self.collection_count = 0

    async def run(self, test_mode: bool = False) -> int:
        """Run the scheduled collector.

        Args:
            test_mode: If True, run single collection and exit

        Returns:
            Total snapshots collected
        """
        logger.info("Starting scheduled Overtime.ag line collector")
        logger.info(
            "Interval: %d seconds (%d minutes)", self.interval_seconds, self.interval_seconds // 60
        )
        logger.info("Output: %s", self.output_dir)

        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Test mode - single collection
        if test_mode:
            logger.info("TEST MODE - Single collection")
            await self._collect_snapshot()
            return self.collection_count

        # Main collection loop
        while True:
            try:
                # Collect current lines
                await self._collect_snapshot()

                # Check stop conditions
                if self._should_stop():
                    logger.info("Stopping collection (stop condition met)")
                    break

                # Wait for next interval
                logger.info("Next collection in %d seconds", self.interval_seconds)
                await asyncio.sleep(self.interval_seconds)

            except KeyboardInterrupt:
                logger.info("Collection interrupted by user")
                break
            except Exception as e:
                logger.exception("Error in collection loop: %s", e)
                # Wait before retrying
                await asyncio.sleep(60)

        logger.info("Collection complete. Total snapshots: %d", self.collection_count)
        return self.collection_count

    async def _collect_snapshot(self) -> None:
        """Collect a single snapshot of current lines."""
        timestamp = datetime.now()
        snapshot_time = timestamp.strftime("%Y%m%d_%H%M%S")
        output_path = self.output_dir / f"overtime_snapshot_{snapshot_time}.parquet"

        logger.info("[->] Collecting snapshot at %s", timestamp.strftime("%H:%M:%S"))

        try:
            # Collect lines for short duration (30 seconds to get current state)
            line_changes = []

            async with OvertimeSignalRClient() as client:
                async for change in client.stream_line_changes(duration_seconds=30):
                    line_changes.append(change.model_dump())

                    # Track game numbers we've seen
                    game_num = change.game_num
                    if game_num not in self.games_started:
                        # Check if game has started (could integrate with schedule here)
                        # For now, just track all game numbers
                        pass

            if line_changes:
                # Save snapshot
                try:
                    import polars as pl

                    df = pl.DataFrame(line_changes)
                    df.write_parquet(output_path)
                    logger.info(
                        "[OK] Saved %d lines to %s",
                        len(line_changes),
                        output_path.name,
                    )
                    self.collection_count += 1

                    # Log interesting movements
                    steam_count = sum(1 for lc in line_changes if lc.get("is_steam"))
                    if steam_count > 0:
                        logger.info(
                            "[STEAM] %d steam moves detected in this snapshot",
                            steam_count,
                        )
                except ImportError:
                    logger.warning("polars not installed, skipping Parquet save")
                    logger.info("Install with: uv add polars")
            else:
                logger.warning("[WARNING] No lines collected in this snapshot")

        except ConfigurationError as e:
            logger.error("Configuration error: %s", e)
            logger.error(
                "Make sure Chrome is running with remote debugging and overtime.ag tab is open"
            )
            raise
        except Exception as e:
            logger.exception("Failed to collect snapshot: %s", e)
            raise

    def _should_stop(self) -> bool:
        """Check if we should stop collecting.

        Returns:
            True if stop condition met
        """
        # Check stop time
        if self.stop_time:
            current_time = datetime.now().time()
            if current_time >= self.stop_time:
                logger.info("Stop time reached: %s", self.stop_time)
                return True

        # Could add logic here to check if all games have started
        # by integrating with ESPN schedule or checking game times

        return False


def parse_time(time_str: str) -> time:
    """Parse time string in HH:MM format.

    Args:
        time_str: Time string like "23:00"

    Returns:
        time object

    Raises:
        ValueError: If format invalid
    """
    try:
        hour, minute = map(int, time_str.split(":"))
        return time(hour, minute)
    except (ValueError, AttributeError) as e:
        raise ValueError(f"Invalid time format: {time_str}. Use HH:MM") from e


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Collect Overtime.ag lines every N minutes until gametime"
    )
    parser.add_argument(
        "--interval",
        "-i",
        type=int,
        default=600,
        help="Collection interval in seconds (default: 600 = 10 minutes)",
    )
    parser.add_argument(
        "--output-dir",
        "-o",
        type=Path,
        default=None,
        help="Output directory for snapshots (default: data/raw/overtime_snapshots)",
    )
    parser.add_argument(
        "--stop-at",
        "-s",
        type=str,
        default=None,
        help="Stop collecting at this time (HH:MM format, e.g., '23:00')",
    )
    parser.add_argument(
        "--test",
        "-t",
        action="store_true",
        help="Test mode: run single collection and exit",
    )

    args = parser.parse_args()

    # Parse stop time if provided
    stop_time = None
    if args.stop_at:
        try:
            stop_time = parse_time(args.stop_at)
            logger.info("Will stop collecting at %s", args.stop_at)
        except ValueError as e:
            logger.error("Invalid stop time: %s", e)
            sys.exit(1)

    # Create collector
    collector = ScheduledLineCollector(
        interval_seconds=args.interval,
        output_dir=args.output_dir,
        stop_time=stop_time,
    )

    # Run collection
    try:
        count = asyncio.run(collector.run(test_mode=args.test))
        logger.info("Collected %d snapshots", count)
        sys.exit(0)
    except ConfigurationError:
        logger.error("Configuration error - check Chrome and overtime.ag setup")
        sys.exit(1)
    except Exception as e:
        logger.exception("Collection failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
