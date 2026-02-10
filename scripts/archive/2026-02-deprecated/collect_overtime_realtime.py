"""Collect real-time odds from Overtime.ag via SignalR WebSocket.

This script connects to Overtime.ag's SignalR hub via Chrome DevTools Protocol
and streams live line changes. Data is saved to Parquet for analysis.

Prerequisites:
    1. Launch Chrome with remote debugging:
       chrome.exe --remote-debugging-port=9222 \
           --user-data-dir=%USERPROFILE%\\.chrome-profiles\\overtime-ag

    2. Open https://www.overtime.ag/sports#/ and log in

    3. Navigate to Basketball -> College Basketball

    4. Run this script:
       uv run python scripts/collect_overtime_realtime.py --duration 3600

Usage:
    # Collect for 1 hour
    uv run python scripts/collect_overtime_realtime.py --duration 3600

    # Collect for full game window (3 hours)
    uv run python scripts/collect_overtime_realtime.py --duration 10800

    # Collect indefinitely (Ctrl+C to stop)
    uv run python scripts/collect_overtime_realtime.py

    # Custom output location
    uv run python scripts/collect_overtime_realtime.py --output data/raw/overtime_lines.parquet

Output:
    Parquet file with columns:
        - timestamp: When line changed (UTC)
        - game_num: Overtime.ag game number
        - market_type: SPREAD, TOTAL, MONEYLINE
        - line_points: Magnitude only (positive)
        - side_role: FAVORITE/UNDERDOG or OVER/UNDER
        - team: Team name (if available)
        - money1, money2: American odds both sides
        - is_steam: True if AutoMover
        - captured_at: When we captured it
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime
from pathlib import Path

# Add project root to path (must be before imports from sports_betting_edge)
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


async def collect_line_changes(
    duration_seconds: int | None,
    output_path: Path,
) -> int:
    """Collect line changes and save to Parquet.

    Args:
        duration_seconds: How long to collect (None = indefinite)
        output_path: Where to save Parquet file

    Returns:
        Number of line changes collected
    """
    logger.info("Starting Overtime.ag SignalR collection")
    logger.info("Duration: %s", f"{duration_seconds}s" if duration_seconds else "indefinite")
    logger.info("Output: %s", output_path)

    # Create output directory
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Collect line changes
    line_changes = []

    try:
        async with OvertimeSignalRClient() as client:
            logger.info("Connected to SignalR stream")

            async for change in client.stream_line_changes(duration_seconds):
                # Log each change
                team_or_game = change.team or f"Game#{change.game_num}"
                line_display = f"{change.line_points:+.1f}" if change.line_points else "ML"
                steam_flag = " [STEAM]" if change.is_steam else ""

                logger.info(
                    "%s: %s %s (%s)%s",
                    change.sport_sub_type,
                    team_or_game,
                    line_display,
                    change.market_type.value,
                    steam_flag,
                )

                # Collect for Parquet export
                line_changes.append(change.model_dump())

    except ConfigurationError as e:
        logger.error("Configuration error: %s", e)
        logger.error(
            "Make sure Chrome is running with remote debugging and overtime.ag tab is open"
        )
        return 0
    except KeyboardInterrupt:
        logger.info("Collection interrupted by user")
    except Exception as e:
        logger.exception("Unexpected error: %s", e)
        return 0

    # Save to Parquet
    if line_changes:
        try:
            import polars as pl

            df = pl.DataFrame(line_changes)
            df.write_parquet(output_path)
            logger.info("Saved %d line changes to %s", len(line_changes), output_path)
        except ImportError:
            logger.warning("polars not installed, skipping Parquet export")
            logger.info("Install with: uv add polars")
        except Exception as e:
            logger.error("Failed to save Parquet: %s", e)
    else:
        logger.warning("No line changes collected")

    return len(line_changes)


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Collect real-time odds from Overtime.ag SignalR WebSocket"
    )
    parser.add_argument(
        "--duration",
        "-d",
        type=int,
        default=None,
        help="Collection duration in seconds (default: indefinite)",
    )
    default_filename = f"overtime_lines_{datetime.now():%Y%m%d_%H%M%S}.parquet"
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=PROJECT_ROOT / "data" / "raw" / default_filename,
        help="Output Parquet file path",
    )

    args = parser.parse_args()

    # Run collection
    count = asyncio.run(collect_line_changes(args.duration, args.output))

    if count > 0:
        logger.info("Collection complete: %d line changes", count)
        sys.exit(0)
    else:
        logger.error("Collection failed or no data collected")
        sys.exit(1)


if __name__ == "__main__":
    main()
