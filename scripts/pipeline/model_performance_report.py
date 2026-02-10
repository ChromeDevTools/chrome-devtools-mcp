"""Generate model performance report with drift detection.

Aggregates graded predictions over rolling windows and checks
for model drift that would trigger retraining.

Usage:
    uv run python scripts/pipeline/model_performance_report.py
    uv run python scripts/pipeline/model_performance_report.py --window 30
    uv run python scripts/pipeline/model_performance_report.py --alert
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from sports_betting_edge.adapters.odds_api_db import (
    OddsAPIDatabase,
)
from sports_betting_edge.core.prediction_metrics import (
    detect_model_drift,
)
from sports_betting_edge.services.prediction_grading import (
    PredictionGrader,
)

logger = logging.getLogger(__name__)


def get_model_age_days(models_dir: Path) -> float:
    """Get age of newest model file in days.

    Args:
        models_dir: Directory containing model .pkl files.

    Returns:
        Age in days of the most recently modified model.
    """
    model_files = list(models_dir.glob("*_score_2026.pkl"))
    if not model_files:
        return 999.0  # No models found

    newest = max(f.stat().st_mtime for f in model_files)
    import time

    age_seconds = time.time() - newest
    return age_seconds / 86400.0


def load_retraining_triggers(
    config_path: Path,
) -> dict[str, float]:
    """Load retraining triggers from team_config.json.

    Args:
        config_path: Path to team config file.

    Returns:
        Dict of threshold names to values.
    """
    if not config_path.exists():
        return {
            "model_age_days": 7,
            "auc_drop_threshold": 0.05,
            "ece_drift_threshold": 0.01,
            "consecutive_losses_threshold": 7,
            "win_rate_threshold": 0.52,
        }

    with open(config_path) as f:
        config = json.load(f)

    triggers: dict[str, float] = config.get("performance_monitoring", {}).get(
        "retraining_triggers", {}
    )
    triggers["win_rate_threshold"] = config.get("quality_standards", {}).get(
        "win_rate_threshold", 0.52
    )
    return triggers


def compute_trend(
    recent: dict[str, Any],
    baseline: dict[str, Any],
) -> dict[str, str]:
    """Compare recent vs baseline metrics to detect trends.

    Args:
        recent: 7-day metrics.
        baseline: 30-day metrics.

    Returns:
        Dict mapping metric name to trend direction.
    """
    trends: dict[str, str] = {}

    for key in [
        "spread_accuracy",
        "total_accuracy",
    ]:
        r_val = recent.get(key, 0)
        b_val = baseline.get(key, 0)
        if b_val == 0:
            trends[key] = "insufficient_data"
            continue
        diff = r_val - b_val
        if diff > 0.03:
            trends[key] = "improving"
        elif diff < -0.03:
            trends[key] = "degrading"
        else:
            trends[key] = "stable"

    for key in ["brier_spread", "brier_total"]:
        r_val = recent.get(key, 0)
        b_val = baseline.get(key, 0)
        if b_val == 0:
            trends[key] = "insufficient_data"
            continue
        # Lower Brier is better
        diff = r_val - b_val
        if diff < -0.02:
            trends[key] = "improving"
        elif diff > 0.02:
            trends[key] = "degrading"
        else:
            trends[key] = "stable"

    return trends


def main() -> None:
    """Main entry point for performance report."""
    parser = argparse.ArgumentParser(description="Generate model performance report")
    parser.add_argument(
        "--as-of",
        type=str,
        default=None,
        help="Report as-of date (default: today)",
    )
    parser.add_argument(
        "--alert",
        action="store_true",
        help="Create GitHub issue on drift detection",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Database path",
    )
    parser.add_argument(
        "--models-dir",
        type=Path,
        default=Path("models"),
        help="Models directory",
    )
    parser.add_argument(
        "--config-path",
        type=Path,
        default=Path(".claude/team_config.json"),
        help="Team config path",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/reports"),
        help="Report output directory",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    as_of = date.fromisoformat(args.as_of) if args.as_of else date.today()

    logger.info("=" * 60)
    logger.info("Model Performance Report")
    logger.info("=" * 60)
    logger.info("As of: %s", as_of)

    # Initialize
    db = OddsAPIDatabase(str(args.db_path))
    grader = PredictionGrader(db)
    triggers = load_retraining_triggers(args.config_path)

    # Generate rolling window reports
    windows: dict[str, dict[str, Any]] = {}
    for label, days in [
        ("last_7d", 7),
        ("last_30d", 30),
        ("season", 120),
    ]:
        start = (as_of - timedelta(days=days)).isoformat()
        end = as_of.isoformat()
        report = grader.get_performance_report(start, end)
        windows[label] = report

        graded = report.get("graded", 0)
        if graded > 0:
            logger.info("\n%s (%d games graded):", label, graded)
            logger.info(
                "  Spread: %.1f%% accuracy, %.1f%% ROI",
                report.get("spread_accuracy", 0) * 100,
                report.get("spread_roi", 0),
            )
            logger.info(
                "  Total:  %.1f%% accuracy, %.1f%% ROI",
                report.get("total_accuracy", 0) * 100,
                report.get("total_roi", 0),
            )
            if "brier_spread" in report:
                logger.info(
                    "  Brier:  spread=%.4f, total=%.4f",
                    report.get("brier_spread", 0),
                    report.get("brier_total", 0),
                )
            if "ece_spread" in report:
                logger.info(
                    "  ECE:    spread=%.4f, total=%.4f",
                    report.get("ece_spread", 0),
                    report.get("ece_total", 0),
                )
        else:
            logger.info("\n%s: No graded predictions", label)

    # Trend detection
    recent = windows.get("last_7d", {})
    baseline = windows.get("last_30d", {})
    trends = compute_trend(recent, baseline)

    logger.info("\n--- Trends (7d vs 30d) ---")
    for metric, direction in trends.items():
        indicator = {
            "improving": "[OK]",
            "stable": "[OK]",
            "degrading": "[WARNING]",
            "insufficient_data": "[-]",
        }.get(direction, "[-]")
        logger.info("  %s %s: %s", indicator, metric, direction)

    # Model drift detection
    model_age = get_model_age_days(args.models_dir)
    recent_with_age = {**recent, "model_age_days": model_age}

    drift_alerts = detect_model_drift(
        recent_metrics=recent_with_age,
        baseline_metrics=baseline,
        thresholds=triggers,
    )

    retraining_recommended = len(drift_alerts) > 0

    logger.info("\n--- Drift Detection ---")
    if drift_alerts:
        logger.warning("[WARNING] %d drift alert(s):", len(drift_alerts))
        for alert in drift_alerts:
            logger.warning("  -> %s", alert)
        logger.warning("[WARNING] Retraining recommended!")
    else:
        logger.info("[OK] No model drift detected")

    logger.info("  Model age: %.1f days", model_age)

    # Accuracy by confidence
    if "accuracy_by_confidence" in recent:
        logger.info("\n--- Accuracy by Confidence ---")
        for bucket, stats in recent["accuracy_by_confidence"].items():
            if stats["count"] > 0:
                logger.info(
                    "  %s: %d games, %.1f%% accuracy",
                    bucket,
                    stats["count"],
                    stats["accuracy"] * 100,
                )

    # Save report
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.output_dir / f"performance_{as_of.isoformat()}.json"

    output = {
        "report_date": as_of.isoformat(),
        "model_version": "score_v1",
        "model_age_days": round(model_age, 1),
        "windows": windows,
        "trends": trends,
        "drift_alerts": drift_alerts,
        "retraining_recommended": retraining_recommended,
    }

    with open(report_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    logger.info("\n[OK] Report saved to %s", report_path)

    # Create GitHub issue if drift detected
    if drift_alerts and args.alert:
        body_lines = [
            "## Model Drift Detected",
            f"\n**Date:** {as_of.isoformat()}",
            f"**Model age:** {model_age:.1f} days",
            "\n### Drift Alerts",
        ]
        for alert in drift_alerts:
            body_lines.append(f"- {alert}")

        body_lines.append("\n### Trends (7d vs 30d)")
        for metric, direction in trends.items():
            body_lines.append(f"- {metric}: {direction}")

        body_lines.append("\n### Recommendation")
        body_lines.append("Retrain models using:")
        body_lines.append("```bash")
        body_lines.append("uv run python scripts/training/train_score_models.py")
        body_lines.append("```")

        try:
            subprocess.run(
                [
                    "gh",
                    "issue",
                    "create",
                    "--title",
                    f"Model Drift Alert - {as_of.isoformat()}",
                    "--body",
                    "\n".join(body_lines),
                    "--label",
                    "automation,alert",
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
            logger.info("[OK] Created GitHub drift alert")
        except (FileNotFoundError, subprocess.TimeoutExpired):
            logger.warning("[WARNING] Could not create GitHub issue")

    logger.info("\n" + "=" * 60)
    logger.info("Performance report complete")
    logger.info("=" * 60)

    # Exit with non-zero if retraining recommended
    if retraining_recommended:
        sys.exit(1)


if __name__ == "__main__":
    main()
