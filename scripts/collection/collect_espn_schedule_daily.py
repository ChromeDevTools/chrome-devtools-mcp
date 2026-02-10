"""Collect ESPN schedule for the current day (PST) and write to Parquet.

Usage:
    uv run python scripts/collect_espn_schedule_daily.py
    uv run python scripts/collect_espn_schedule_daily.py --date 2026-02-04
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from sports_betting_edge.services.espn_schedule_collection import collect_schedule_to_parquet

PST = ZoneInfo("America/Los_Angeles")


def _log_setup() -> None:
    log_dir = Path("data") / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "espn_schedule.log"
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


async def _run(target_date: date) -> int:
    return await collect_schedule_to_parquet(single_date=target_date)


def main() -> int:
    _log_setup()
    logger = logging.getLogger(__name__)

    parser = argparse.ArgumentParser(description="Collect ESPN schedule for a date")
    parser.add_argument("--date", type=_parse_date, help="Target date (YYYY-MM-DD)")
    args = parser.parse_args()

    target_date = args.date or _default_date()
    logger.info("Collecting ESPN schedule for %s", target_date.isoformat())

    try:
        count = asyncio.run(_run(target_date))
        logger.info("Collected %d game(s)", count)
        return 0
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to collect ESPN schedule: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
