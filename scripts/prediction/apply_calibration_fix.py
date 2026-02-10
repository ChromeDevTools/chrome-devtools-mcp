"""
Apply calibration bias correction to score model predictions.

This script adds a +4.5 point adjustment to total predictions to correct
for systematic underprediction identified on 2026-02-07.

Usage:
    uv run python scripts/prediction/apply_calibration_fix.py \\
        --input predictions/2026-02-07_raw.csv \\
        --output predictions/2026-02-07_calibrated.csv

See: docs/MODEL_CALIBRATION_FINDINGS.md for analysis
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

# Calibration constants (validated on 2026-02-07)
TOTAL_BIAS_CORRECTION = 4.5  # Model underpredicts by ~4.5 points
SPREAD_BIAS_CORRECTION = 0.0  # Spread predictions appear unbiased

# Validation thresholds
MAX_KENPOM_DIFF = 15.0  # Flag if >15 pts from KenPom
MAX_MARKET_DIFF = 10.0  # Flag if >10 pts from market
MAX_RECENT_DIFF = 8.0  # Flag if >8 pts from recent avg


def apply_calibration(
    df: pd.DataFrame,
    total_bias: float = TOTAL_BIAS_CORRECTION,
) -> pd.DataFrame:
    """
    Apply bias correction to predictions.

    Args:
        df: Predictions DataFrame with predicted_total column
        total_bias: Points to add to total predictions

    Returns:
        DataFrame with calibrated predictions and warnings
    """
    df = df.copy()

    # Store original predictions
    df["predicted_total_raw"] = df["predicted_total"]
    df["predicted_home_score_raw"] = df["predicted_home_score"]
    df["predicted_away_score_raw"] = df["predicted_away_score"]

    # Apply calibration to total
    df["predicted_total"] = df["predicted_total_raw"] + total_bias

    # Distribute correction to home/away scores proportionally
    total_raw = df["predicted_home_score_raw"] + df["predicted_away_score_raw"]
    home_ratio = df["predicted_home_score_raw"] / total_raw
    away_ratio = df["predicted_away_score_raw"] / total_raw

    df["predicted_home_score"] = df["predicted_home_score_raw"] + (total_bias * home_ratio)
    df["predicted_away_score"] = df["predicted_away_score_raw"] + (total_bias * away_ratio)

    # Recalculate margin (stays same, just scores shift up)
    df["predicted_margin"] = df["predicted_home_score"] - df["predicted_away_score"]

    # Add calibration metadata
    df["calibration_applied"] = True
    df["total_bias_correction"] = total_bias

    logger.info(f"Applied calibration: +{total_bias:.1f} points to {len(df)} predictions")

    return df


def add_validation_warnings(
    df: pd.DataFrame,
    kenpom_col: str | None = "kenpom_total",
    market_col: str | None = "market_total",
    recent_col: str | None = "recent_avg_total",
) -> pd.DataFrame:
    """
    Add warning flags for predictions that deviate significantly from benchmarks.

    Args:
        df: Calibrated predictions
        kenpom_col: Column with KenPom formula totals (optional)
        market_col: Column with market totals (optional)
        recent_col: Column with recent game averages (optional)

    Returns:
        DataFrame with warning columns added
    """
    df = df.copy()
    warnings = []

    # Check KenPom divergence
    if kenpom_col and kenpom_col in df.columns:
        kenpom_diff = abs(df["predicted_total"] - df[kenpom_col])
        df["kenpom_diff"] = kenpom_diff
        df["kenpom_warning"] = kenpom_diff > MAX_KENPOM_DIFF

        kenpom_flags = df["kenpom_warning"].sum()
        if kenpom_flags > 0:
            warnings.append(f"{kenpom_flags} games >15pts from KenPom")

    # Check market divergence
    if market_col and market_col in df.columns:
        market_diff = abs(df["predicted_total"] - df[market_col])
        df["market_diff"] = market_diff
        df["market_warning"] = market_diff > MAX_MARKET_DIFF

        market_flags = df["market_warning"].sum()
        if market_flags > 0:
            warnings.append(f"{market_flags} games >10pts from market")

    # Check recent average divergence
    if recent_col and recent_col in df.columns:
        recent_diff = abs(df["predicted_total"] - df[recent_col])
        df["recent_diff"] = recent_diff
        df["recent_warning"] = recent_diff > MAX_RECENT_DIFF

        recent_flags = df["recent_warning"].sum()
        if recent_flags > 0:
            warnings.append(f"{recent_flags} games >8pts from recent avg")

    # Overall warning flag (any benchmark triggered)
    warning_cols = [c for c in df.columns if c.endswith("_warning")]
    if warning_cols:
        df["any_warning"] = df[warning_cols].any(axis=1)
        total_warnings = df["any_warning"].sum()

        if total_warnings > 0:
            logger.warning(f"Validation warnings: {total_warnings}/{len(df)} games flagged")
            for w in warnings:
                logger.warning(f"  - {w}")
    else:
        df["any_warning"] = False
        logger.info("No validation columns available, skipping warning checks")

    return df


def main() -> None:
    """Main execution."""
    parser = argparse.ArgumentParser(description="Apply calibration correction to predictions")
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Input predictions CSV (raw model output)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output predictions CSV (calibrated)",
    )
    parser.add_argument(
        "--bias",
        type=float,
        default=TOTAL_BIAS_CORRECTION,
        help=f"Total bias correction (default: {TOTAL_BIAS_CORRECTION})",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Add validation warnings (requires benchmark columns)",
    )

    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

    # Load predictions
    logger.info(f"Loading predictions from {args.input}")
    df = pd.read_csv(args.input)

    logger.info(f"Loaded {len(df)} predictions (avg total: {df['predicted_total'].mean():.1f})")

    # Apply calibration
    df_calibrated = apply_calibration(df, total_bias=args.bias)

    logger.info(f"After calibration: avg total = {df_calibrated['predicted_total'].mean():.1f}")

    # Add validation warnings if requested
    if args.validate:
        df_calibrated = add_validation_warnings(df_calibrated)

    # Save output
    args.output.parent.mkdir(parents=True, exist_ok=True)
    df_calibrated.to_csv(args.output, index=False)

    logger.info(f"Saved calibrated predictions to {args.output}")

    # Summary statistics
    print("\n=== CALIBRATION SUMMARY ===")
    print(f"Input file: {args.input}")
    print(f"Output file: {args.output}")
    print(f"Games processed: {len(df_calibrated)}")
    print(f"Bias correction applied: +{args.bias:.1f} points")
    print(f"\nOriginal avg total: {df['predicted_total'].mean():.1f}")
    print(f"Calibrated avg total: {df_calibrated['predicted_total'].mean():.1f}")

    if args.validate and "any_warning" in df_calibrated.columns:
        warnings = df_calibrated["any_warning"].sum()
        print(f"\nValidation warnings: {warnings}/{len(df_calibrated)} games flagged")

        if warnings > 0:
            print("\nGames with warnings:")
            flagged = df_calibrated[df_calibrated["any_warning"]]
            for _, game in flagged.iterrows():
                matchup = f"{game['away_team']} @ {game['home_team']}"
                pred = game["predicted_total"]
                reasons = []
                if game.get("kenpom_warning", False):
                    reasons.append(f"KenPom diff: {game['kenpom_diff']:.1f}")
                if game.get("market_warning", False):
                    reasons.append(f"Market diff: {game['market_diff']:.1f}")
                if game.get("recent_warning", False):
                    reasons.append(f"Recent diff: {game['recent_diff']:.1f}")

                print(f"  {matchup[:50]:50s} | Total: {pred:5.1f} | {', '.join(reasons)}")


if __name__ == "__main__":
    main()
