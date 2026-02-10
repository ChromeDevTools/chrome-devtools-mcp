"""Collect Overtime.ag open bets and store to Parquet (scheduled run).

Usage:
    uv run python scripts/collect_open_bets_scheduled.py --user-data-dir <path>
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from sports_betting_edge.adapters.overtime import run_capture_open_bets
from sports_betting_edge.services.overtime_open_bets import collect_open_bets_to_parquet
from sports_betting_edge.utils.time import utc_now


def _log_setup() -> None:
    log_dir = Path("data") / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "open_bets.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )


def _build_output_path() -> Path:
    stamp = utc_now().strftime("%Y-%m-%d_%H-%M-%S")
    out_dir = Path("data") / "overtime" / "raw" / "open_bets"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"open_bets_{stamp}.json"


def main() -> int:
    _log_setup()
    logger = logging.getLogger(__name__)

    parser = argparse.ArgumentParser(description="Collect Overtime.ag open bets")
    parser.add_argument("--user-data-dir", type=str, required=True)
    parser.add_argument("--headless", type=str, default="true")
    args = parser.parse_args()

    headless = args.headless.lower() not in {"false", "0", "no"}
    output_path = _build_output_path()

    try:
        logger.info("Starting open bets capture")
        run_capture_open_bets(
            output_path=output_path,
            headless=headless,
            user_data_dir=args.user_data_dir,
        )
        count = collect_open_bets_to_parquet(output_path)
        logger.info("Captured %d open bet(s)", count)
        return 0
    except Exception as exc:  # noqa: BLE001
        logger.exception("Open bets collection failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
