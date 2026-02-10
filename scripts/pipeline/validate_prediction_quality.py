"""Validate that daily predictions CSV is reasonable before deployment.

Checks:
- File exists and is non-empty
- Expected columns present
- Game count is reasonable (warn if < 3 or > 30)
- Score ranges are plausible (30-120 per team)
- Probabilities in [0, 1]
- No NaN values in critical columns
- Total points between 80 and 200

Exit code 0 = pass, 1 = fail.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = [
    "home_team",
    "away_team",
    "predicted_home_score",
    "predicted_away_score",
    "predicted_margin",
]

SCORE_COLUMNS = ["predicted_home_score", "predicted_away_score"]
PROB_COLUMNS = [
    "favorite_cover_prob",
    "underdog_cover_prob",
    "over_prob",
    "under_prob",
]
TOTAL_COLUMNS = ["predicted_total", "score_derived_total"]

MIN_SCORE = 30
MAX_SCORE = 120
MIN_TOTAL = 80
MAX_TOTAL = 200


def _parse_prob_column(series: pd.Series[str]) -> pd.Series[float]:
    """Convert probability column to float, handling '74%' style strings."""
    if len(series) > 0 and "%" in str(series.iloc[0]):
        return series.str.rstrip("%").astype(float) / 100.0
    return pd.to_numeric(series, errors="coerce")


def validate(csv_path: Path) -> list[str]:
    """Run all validation checks and return list of failure messages."""
    failures: list[str] = []

    if not csv_path.exists():
        failures.append(f"File not found: {csv_path}")
        return failures

    df = pd.read_csv(csv_path)

    if df.empty:
        failures.append("Predictions file is empty (0 rows)")
        return failures

    # Column check
    missing = set(REQUIRED_COLUMNS) - set(df.columns)
    if missing:
        failures.append(f"Missing required columns: {missing}")
        return failures

    game_count = len(df)
    logger.info("Game count: %d", game_count)
    if game_count < 3:
        logger.warning("Low game count: %d (expected >= 3)", game_count)
    if game_count > 30:
        logger.warning("High game count: %d (expected <= 30)", game_count)

    # NaN check on critical columns (before type conversion)
    critical = REQUIRED_COLUMNS + [c for c in PROB_COLUMNS if c in df.columns]
    nan_counts = df[critical].isna().sum()
    nan_cols = nan_counts[nan_counts > 0]
    if not nan_cols.empty:
        failures.append(f"NaN values in critical columns: {nan_cols.to_dict()}")

    # Score range
    for col in SCORE_COLUMNS:
        if col not in df.columns:
            continue
        lo = df[col].min()
        hi = df[col].max()
        if lo < MIN_SCORE:
            failures.append(f"{col} has value {lo:.1f} below minimum {MIN_SCORE}")
        if hi > MAX_SCORE:
            failures.append(f"{col} has value {hi:.1f} above maximum {MAX_SCORE}")

    # Probability range [0, 1] - handles both float and "74%" string formats
    for col in PROB_COLUMNS:
        if col not in df.columns:
            continue
        parsed = _parse_prob_column(df[col].dropna())
        if parsed.empty:
            continue
        lo = parsed.min()
        hi = parsed.max()
        if lo < 0.0 or hi > 1.0:
            failures.append(f"{col} out of [0, 1] range: [{lo:.4f}, {hi:.4f}]")

    # Total range
    for col in TOTAL_COLUMNS:
        if col not in df.columns:
            continue
        lo = df[col].min()
        hi = df[col].max()
        if lo < MIN_TOTAL:
            failures.append(f"{col} has value {lo:.1f} below minimum {MIN_TOTAL}")
        if hi > MAX_TOTAL:
            failures.append(f"{col} has value {hi:.1f} above maximum {MAX_TOTAL}")

    return failures


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate daily prediction quality")
    parser.add_argument(
        "--date",
        default=date.today().isoformat(),
        help="Date in YYYY-MM-DD format (default: today)",
    )
    parser.add_argument(
        "--predictions-dir",
        default="predictions",
        help="Predictions directory (default: predictions/)",
    )
    args = parser.parse_args()

    predictions_dir = Path(args.predictions_dir)

    # Try calibrated first, then raw
    calibrated = predictions_dir / f"{args.date}_calibrated.csv"
    raw = predictions_dir / f"{args.date}.csv"
    csv_path = calibrated if calibrated.exists() else raw

    logger.info("Validating: %s", csv_path)
    failures = validate(csv_path)

    if failures:
        for f in failures:
            logger.error("FAIL: %s", f)
        logger.error("Validation FAILED with %d issue(s)", len(failures))
        sys.exit(1)
    else:
        logger.info("Validation PASSED")
        sys.exit(0)


if __name__ == "__main__":
    main()
