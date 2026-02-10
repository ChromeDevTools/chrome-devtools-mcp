#!/usr/bin/env python3
"""Run Overtime.ag College Basketball odds capture and write today's matchups to CSV.

Uses the Puppeteer capture script to scrape Overtime.ag (Basketball > College Basketball
and College Extra), parses spread and total odds per the DOM structure, and writes one
row per game to a CSV file. Requires Node.js, Puppeteer, and an authenticated
Overtime.ag session (log in manually or use --user-data-dir with a persistent profile).

Output columns (per betting-data-normalizing):
  category, game_date_str, game_time_str, away_team, home_team, away_rotation,
  home_rotation, away_spread_raw, home_spread_raw, total_over_raw, total_under_raw,
  spread_magnitude, favorite_team, spread_favorite_price, spread_underdog_price,
  total_points, total_over_price, total_under_price, raw_matchup

Usage:
  uv run python scripts/collect_overtime_odds_csv.py
  uv run python scripts/collect_overtime_odds_csv.py --output data/overtime/todays_odds.csv
  uv run python scripts/collect_overtime_odds_csv.py --headless false \\
      --user-data-dir ./overtime-profile
"""

from __future__ import annotations

import argparse
import logging
import subprocess  # nosec B404
from datetime import date
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_PATH = _REPO_ROOT / "puppeteer" / "capture_overtime_college_basketball_odds.js"
DEFAULT_OUTPUT_DIR = _REPO_ROOT / "data" / "overtime"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Capture Overtime.ag NCAAB odds and write CSV of today's matchups."
    )
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help=(
            "Output CSV path "
            "(default: data/overtime/overtime_college_basketball_odds_YYYY-MM-DD.csv)"
        ),
    )
    parser.add_argument(
        "--headless",
        choices=("true", "false"),
        default="true",
        help="Run browser headless (default: true)",
    )
    parser.add_argument(
        "--user-data-dir",
        type=str,
        default=None,
        help="Chrome user data dir for persisted Overtime.ag login",
    )
    args = parser.parse_args()

    if args.output is not None:
        out_path = Path(args.output)
    else:
        DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        out_path = (
            DEFAULT_OUTPUT_DIR / f"overtime_college_basketball_odds_{date.today().isoformat()}.csv"
        )

    out_path = out_path.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if not SCRIPT_PATH.exists():
        logger.error("Capture script not found: %s", SCRIPT_PATH)
        raise SystemExit(1)

    cmd: list[str] = [
        "node",
        str(SCRIPT_PATH),
        "--output",
        str(out_path),
        "--headless",
        args.headless,
    ]
    if args.user_data_dir:
        cmd.extend(["--user-data-dir", args.user_data_dir])

    logger.info("Running capture (output=%s)...", out_path)
    result = subprocess.run(  # nosec B603
        cmd,
        cwd=str(_REPO_ROOT),
        timeout=120,
    )
    if result.returncode != 0:
        logger.error("Capture failed with exit code %s", result.returncode)
        raise SystemExit(result.returncode)

    logger.info("CSV written: %s", out_path)


if __name__ == "__main__":
    main()
