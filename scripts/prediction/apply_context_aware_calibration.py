"""
Apply context-aware calibration to predictions based on game characteristics.

Instead of blanket adjustment, calibrates based on:
- Scoring range (low/mid/high)
- Pace (slow/moderate/fast)
- Team quality (elite defense, mismatches)

Usage:
    uv run python scripts/prediction/apply_context_aware_calibration.py \\
        --input predictions/2026-02-08_fresh.csv \\
        --output predictions/2026-02-08_context_calibrated.csv

See: docs/CALIBRATION_EXPERT_GUIDE.md for methodology
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

# Calibration constants (from validation data)
# These will be updated monthly based on empirical results

# Scoring range adjustments
BIAS_LOW_SCORING = -10.0  # Model overpredicts low-scoring games (<135)
BIAS_MID_SCORING = -1.5  # Slight overall overprediction (135-155)
BIAS_HIGH_SCORING = +5.0  # Model underpredicts high-scoring games (>160)

# Pace adjustments
BIAS_FAST_PACE = +1.0  # Fast games (>70 tempo) run higher
BIAS_SLOW_PACE = -2.0  # Slow games (<65 tempo) grind lower

# Team quality adjustments
BIAS_ELITE_DEFENSE = -3.0  # Both teams AdjD < 95 (elite defense suppresses)
BIAS_MISMATCH = +2.0  # AdjEM diff > 15 (blowouts run higher)

# Thresholds
LOW_SCORING_THRESHOLD = 135
HIGH_SCORING_THRESHOLD = 160
SLOW_PACE_THRESHOLD = 65
FAST_PACE_THRESHOLD = 70
ELITE_DEFENSE_THRESHOLD = 95
MISMATCH_THRESHOLD = 15


def calculate_context_adjustment(row: pd.Series, calibration_config: dict | None = None) -> float:
    """
    Calculate calibration adjustment based on game context.

    Args:
        row: Prediction row with game features
        calibration_config: Optional dict to override default constants

    Returns:
        Adjustment to add to predicted_total (can be negative)
    """
    if calibration_config is None:
        calibration_config = {}

    adjustment = 0.0
    reasons = []

    predicted_total = row["predicted_total"]

    # 1. Scoring range adjustment (most important)
    if predicted_total < LOW_SCORING_THRESHOLD:
        bias = calibration_config.get("bias_low_scoring", BIAS_LOW_SCORING)
        adjustment += bias
        reasons.append(f"low_scoring:{bias:+.1f}")
    elif predicted_total > HIGH_SCORING_THRESHOLD:
        bias = calibration_config.get("bias_high_scoring", BIAS_HIGH_SCORING)
        adjustment += bias
        reasons.append(f"high_scoring:{bias:+.1f}")
    else:
        bias = calibration_config.get("bias_mid_scoring", BIAS_MID_SCORING)
        adjustment += bias
        reasons.append(f"mid_scoring:{bias:+.1f}")

    # 2. Pace adjustment (if tempo features available)
    if "avg_tempo" in row.index and pd.notna(row["avg_tempo"]):
        avg_tempo = row["avg_tempo"]
        if avg_tempo > FAST_PACE_THRESHOLD:
            bias = calibration_config.get("bias_fast_pace", BIAS_FAST_PACE)
            adjustment += bias
            reasons.append(f"fast_pace:{bias:+.1f}")
        elif avg_tempo < SLOW_PACE_THRESHOLD:
            bias = calibration_config.get("bias_slow_pace", BIAS_SLOW_PACE)
            adjustment += bias
            reasons.append(f"slow_pace:{bias:+.1f}")

    # 3. Elite defense adjustment (if defense features available)
    if (
        "home_adj_d" in row.index
        and "away_adj_d" in row.index
        and pd.notna(row["home_adj_d"])
        and pd.notna(row["away_adj_d"])
    ):
        both_elite_defense = (
            row["home_adj_d"] < ELITE_DEFENSE_THRESHOLD
            and row["away_adj_d"] < ELITE_DEFENSE_THRESHOLD
        )
        if both_elite_defense:
            bias = calibration_config.get("bias_elite_defense", BIAS_ELITE_DEFENSE)
            adjustment += bias
            reasons.append(f"elite_defense:{bias:+.1f}")

    # 4. Mismatch adjustment (if EM diff available)
    if (
        "home_adj_em" in row.index
        and "away_adj_em" in row.index
        and pd.notna(row["home_adj_em"])
        and pd.notna(row["away_adj_em"])
    ):
        em_diff = abs(row["home_adj_em"] - row["away_adj_em"])
        if em_diff > MISMATCH_THRESHOLD:
            bias = calibration_config.get("bias_mismatch", BIAS_MISMATCH)
            adjustment += bias
            reasons.append(f"mismatch:{bias:+.1f}")

    return adjustment, reasons


def apply_context_aware_calibration(
    df: pd.DataFrame, calibration_config: dict | None = None
) -> pd.DataFrame:
    """
    Apply context-aware calibration to all predictions.

    Args:
        df: Predictions DataFrame
        calibration_config: Optional calibration constants override

    Returns:
        DataFrame with calibrated predictions and adjustment details
    """
    df = df.copy()

    # Store original predictions
    df["predicted_total_raw"] = df["predicted_total"]
    df["predicted_home_score_raw"] = df["predicted_home_score"]
    df["predicted_away_score_raw"] = df["predicted_away_score"]

    # Calculate adjustments
    adjustments = []
    adjustment_reasons = []

    for _idx, row in df.iterrows():
        adj, reasons = calculate_context_adjustment(row, calibration_config)
        adjustments.append(adj)
        adjustment_reasons.append(" | ".join(reasons) if reasons else "baseline")

    df["calibration_adjustment"] = adjustments
    df["calibration_reasons"] = adjustment_reasons

    # Apply calibration to total
    df["predicted_total"] = df["predicted_total_raw"] + df["calibration_adjustment"]

    # Distribute adjustment to home/away scores proportionally
    total_raw = df["predicted_home_score_raw"] + df["predicted_away_score_raw"]
    home_ratio = df["predicted_home_score_raw"] / total_raw
    away_ratio = df["predicted_away_score_raw"] / total_raw

    df["predicted_home_score"] = df["predicted_home_score_raw"] + (
        df["calibration_adjustment"] * home_ratio
    )
    df["predicted_away_score"] = df["predicted_away_score_raw"] + (
        df["calibration_adjustment"] * away_ratio
    )

    # Recalculate margin (stays same, just scores shift)
    df["predicted_margin"] = df["predicted_home_score"] - df["predicted_away_score"]

    # Summary statistics
    logger.info(f"Applied context-aware calibration to {len(df)} predictions")
    logger.info(f"Average adjustment: {df['calibration_adjustment'].mean():+.2f} points")
    logger.info(
        f"Adjustment range: {df['calibration_adjustment'].min():+.1f} to "
        f"{df['calibration_adjustment'].max():+.1f}"
    )

    # Breakdown by adjustment type
    low_scoring_count = (df["predicted_total_raw"] < LOW_SCORING_THRESHOLD).sum()
    high_scoring_count = (df["predicted_total_raw"] > HIGH_SCORING_THRESHOLD).sum()
    mid_scoring_count = len(df) - low_scoring_count - high_scoring_count

    logger.info(
        f"Scoring breakdown: {low_scoring_count} low, "
        f"{mid_scoring_count} mid, {high_scoring_count} high"
    )

    return df


def main() -> None:
    """Main execution."""
    parser = argparse.ArgumentParser(description="Apply context-aware calibration to predictions")
    parser.add_argument("--input", type=Path, required=True, help="Input predictions CSV (raw)")
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output predictions CSV (context-calibrated)",
    )
    parser.add_argument(
        "--config",
        type=Path,
        help="Optional JSON config file with calibration constants",
    )
    parser.add_argument("--verbose", action="store_true", help="Show detailed adjustment breakdown")

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO if not args.verbose else logging.DEBUG,
        format="%(levelname)s - %(message)s",
    )

    # Load predictions
    logger.info(f"Loading predictions from {args.input}")
    df = pd.read_csv(args.input)
    logger.info(f"Loaded {len(df)} predictions (avg total: {df['predicted_total'].mean():.1f})")

    # Load calibration config if provided
    calibration_config = None
    if args.config:
        import json

        with open(args.config) as f:
            calibration_config = json.load(f)
        logger.info(f"Loaded calibration config from {args.config}")

    # Apply calibration
    df_calibrated = apply_context_aware_calibration(df, calibration_config)

    logger.info(f"After calibration: avg total = {df_calibrated['predicted_total'].mean():.1f}")

    # Save output
    args.output.parent.mkdir(parents=True, exist_ok=True)
    df_calibrated.to_csv(args.output, index=False)
    logger.info(f"Saved calibrated predictions to {args.output}")

    # Print summary
    print("\n=== CONTEXT-AWARE CALIBRATION SUMMARY ===")
    print(f"Input file: {args.input}")
    print(f"Output file: {args.output}")
    print(f"Games processed: {len(df_calibrated)}")
    print(f"\nOriginal avg total: {df['predicted_total'].mean():.1f}")
    print(f"Calibrated avg total: {df_calibrated['predicted_total'].mean():.1f}")
    print(f"Average adjustment: {df_calibrated['calibration_adjustment'].mean():+.2f}")

    if args.verbose:
        print("\n=== SAMPLE ADJUSTMENTS ===")
        # Show a few examples from each category
        for category, threshold_low, threshold_high in [
            ("Low Scoring", 0, LOW_SCORING_THRESHOLD),
            ("Mid Scoring", LOW_SCORING_THRESHOLD, HIGH_SCORING_THRESHOLD),
            ("High Scoring", HIGH_SCORING_THRESHOLD, 300),
        ]:
            subset = df_calibrated[
                (df_calibrated["predicted_total_raw"] >= threshold_low)
                & (df_calibrated["predicted_total_raw"] < threshold_high)
            ]
            if len(subset) > 0:
                print(f"\n{category} Games (N={len(subset)}):")
                sample = subset.head(3)
                for _, game in sample.iterrows():
                    matchup = f"{game['away_team']} @ {game['home_team']}"
                    print(f"  {matchup[:50]:50s}")
                    print(
                        f"    Raw: {game['predicted_total_raw']:.1f} | "
                        f"Calibrated: {game['predicted_total']:.1f} | "
                        f"Adjustment: {game['calibration_adjustment']:+.1f}"
                    )
                    print(f"    Reasons: {game['calibration_reasons']}")


if __name__ == "__main__":
    main()
