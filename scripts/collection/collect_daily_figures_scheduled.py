"""Collect Overtime.ag daily figures and store to Parquet (scheduled run).

Usage:
    uv run python scripts/collect_daily_figures_scheduled.py --user-data-dir <path>
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from sports_betting_edge.adapters.overtime import run_capture_daily_figures
from sports_betting_edge.services.overtime_daily_figures import collect_daily_figures_to_parquet
from sports_betting_edge.utils.time import utc_now


def _log_setup() -> None:
    log_dir = Path("data") / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "daily_figures.log"
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
    out_dir = Path("data") / "overtime" / "raw" / "daily_figures"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"daily_figures_{stamp}.json"


def main() -> int:
    _log_setup()
    logger = logging.getLogger(__name__)

    parser = argparse.ArgumentParser(description="Collect Overtime.ag daily figures")
    parser.add_argument("--user-data-dir", type=str, required=True)
    parser.add_argument("--headless", type=str, default="true")
    args = parser.parse_args()

    headless = args.headless.lower() not in {"false", "0", "no"}
    output_path = _build_output_path()

    try:
        logger.info("Starting daily figures capture")
        run_capture_daily_figures(
            output_path=output_path,
            headless=headless,
            user_data_dir=args.user_data_dir,
        )
        weeks, outcomes = collect_daily_figures_to_parquet(output_path)
        logger.info("Captured %d week summary row(s), %d bet outcome(s)", weeks, outcomes)
        return 0
    except Exception as exc:  # noqa: BLE001
        logger.exception("Daily figures collection failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
