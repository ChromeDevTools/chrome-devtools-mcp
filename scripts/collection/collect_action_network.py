"""Collect Action Network NCAAB scoreboard data to Parquet.

Fetches public betting percentages, multi-book odds, and game data
from Action Network's public API (no auth required).

Usage:
    uv run python scripts/collection/collect_action_network.py
    uv run python scripts/collection/collect_action_network.py --date 2026-02-07
    uv run python scripts/collection/collect_action_network.py \
        --start-date 2025-11-04 --end-date 2026-02-08
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from sports_betting_edge.services.action_network_collection import (
    collect_to_parquet,
)

PST = ZoneInfo("America/Los_Angeles")


def _log_setup() -> None:
    log_dir = Path("data") / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "action_network.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )


def _parse_date(value: str) -> date:
    return datetime.fromisoformat(value).date()


def _default_date() -> date:
    return datetime.now(PST).date()


async def _run(
    single_date: date | None,
    start_date: date | None,
    end_date: date | None,
) -> int:
    return await collect_to_parquet(
        single_date=single_date,
        start_date=start_date,
        end_date=end_date,
    )


def main() -> int:
    _log_setup()
    logger = logging.getLogger(__name__)

    parser = argparse.ArgumentParser(description="Collect Action Network NCAAB scoreboard data")
    parser.add_argument(
        "--date",
        type=_parse_date,
        help="Single date to collect (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--start-date",
        type=_parse_date,
        help="Start of date range (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end-date",
        type=_parse_date,
        help="End of date range (YYYY-MM-DD)",
    )
    args = parser.parse_args()

    # Determine mode
    if args.start_date and args.end_date:
        logger.info(
            "Collecting Action Network data: %s to %s",
            args.start_date.isoformat(),
            args.end_date.isoformat(),
        )
        single_date = None
        start_date = args.start_date
        end_date = args.end_date
    elif args.date:
        logger.info(
            "Collecting Action Network data for %s",
            args.date.isoformat(),
        )
        single_date = args.date
        start_date = None
        end_date = None
    else:
        target = _default_date()
        logger.info(
            "Collecting Action Network data for today: %s",
            target.isoformat(),
        )
        single_date = target
        start_date = None
        end_date = None

    try:
        count = asyncio.run(_run(single_date, start_date, end_date))
        logger.info("Collected %d game(s)", count)
        return 0
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to collect Action Network data: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
