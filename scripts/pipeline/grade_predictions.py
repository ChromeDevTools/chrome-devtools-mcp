"""Grade predictions and generate daily performance report.

Runs daily after score collection completes. Grades all pending
predictions, generates performance metrics, and creates GitHub
issues if quality thresholds are breached.

Usage:
    uv run python scripts/pipeline/grade_predictions.py
    uv run python scripts/pipeline/grade_predictions.py --date 2026-02-06
    uv run python scripts/pipeline/grade_predictions.py --report-only
    uv run python scripts/pipeline/grade_predictions.py --create-issue
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from sports_betting_edge.adapters.odds_api_db import (
    OddsAPIDatabase,
)
from sports_betting_edge.services.prediction_grading import (
    PredictionGrader,
)

logger = logging.getLogger(__name__)


def create_github_issue(
    title: str,
    body: str,
    labels: list[str] | None = None,
) -> bool:
    """Create a GitHub issue via gh CLI.

    Args:
        title: Issue title.
        body: Issue body (markdown).
        labels: Optional list of labels.

    Returns:
        True if issue created successfully.
    """
    cmd = ["gh", "issue", "create", "--title", title, "--body", body]
    if labels:
        cmd.extend(["--label", ",".join(labels)])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            logger.info(
                "[OK] Created GitHub issue: %s",
                result.stdout.strip(),
            )
            return True
        logger.warning(
            "[WARNING] gh issue create failed: %s",
            result.stderr.strip(),
        )
        return False
    except FileNotFoundError:
        logger.warning("[WARNING] gh CLI not found - skipping issue")
        return False
    except subprocess.TimeoutExpired:
        logger.warning("[WARNING] gh issue create timed out")
        return False


def main() -> None:
    """Main entry point for daily grading pipeline."""
    parser = argparse.ArgumentParser(description="Grade predictions against actual results")
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Grade specific date (default: yesterday)",
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Skip grading, just generate report",
    )
    parser.add_argument(
        "--create-issue",
        action="store_true",
        help="Create GitHub issue on threshold breach",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Database path",
    )
    parser.add_argument(
        "--predictions-dir",
        type=Path,
        default=Path("predictions"),
        help="Predictions directory",
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

    # Determine target date
    if args.date:
        target_date = args.date
    else:
        yesterday = date.today() - timedelta(days=1)
        target_date = yesterday.isoformat()

    logger.info("=" * 60)
    logger.info("Prediction Grading Pipeline")
    logger.info("=" * 60)
    logger.info("Target date: %s", target_date)

    # Initialize
    db = OddsAPIDatabase(str(args.db_path))
    grader = PredictionGrader(db, args.predictions_dir)

    if not args.report_only:
        # Step 1: Store predictions if CSV exists
        logger.info("\n--- Step 1: Store Predictions ---")
        count = grader.store_predictions_from_csv(target_date)
        if count > 0:
            logger.info(
                "[OK] Stored %d predictions for %s",
                count,
                target_date,
            )
        else:
            logger.info(
                "No new predictions to store for %s",
                target_date,
            )

        # Step 2: Grade all pending predictions
        logger.info("\n--- Step 2: Grade Pending ---")
        result = grader.grade_pending()
        logger.info(
            "[OK] Graded %d/%d predictions (%d still pending)",
            result["graded"],
            result["total_pending"],
            result["still_pending"],
        )

        if result["graded"] > 0:
            spread_acc = (
                result["spread_correct"] / result["spread_total"]
                if result["spread_total"] > 0
                else 0
            )
            total_acc = (
                result["total_correct"] / result["total_total"] if result["total_total"] > 0 else 0
            )
            logger.info(
                "  Spreads: %d/%d (%.1f%%)",
                result["spread_correct"],
                result["spread_total"],
                spread_acc * 100,
            )
            logger.info(
                "  Totals: %d/%d (%.1f%%)",
                result["total_correct"],
                result["total_total"],
                total_acc * 100,
            )

    # Step 3: Generate performance reports
    logger.info("\n--- Step 3: Performance Reports ---")

    # 7-day report
    end = date.fromisoformat(target_date)
    start_7d = (end - timedelta(days=7)).isoformat()
    start_30d = (end - timedelta(days=30)).isoformat()
    start_season = "2025-11-01"

    reports: dict[str, dict[str, Any]] = {}
    for label, start in [
        ("7d", start_7d),
        ("30d", start_30d),
        ("season", start_season),
    ]:
        report = grader.get_performance_report(start, target_date)
        reports[label] = report
        graded = report.get("graded", 0)
        if graded > 0:
            logger.info(
                "  %s: %d graded, spread %.1f%%, total %.1f%%",
                label,
                graded,
                report.get("spread_accuracy", 0) * 100,
                report.get("total_accuracy", 0) * 100,
            )

    # Step 4: Check quality thresholds
    logger.info("\n--- Step 4: Quality Thresholds ---")
    latest_report = reports.get("7d", {})
    alerts = grader.check_quality_thresholds(latest_report)

    if alerts:
        logger.warning(
            "[WARNING] %d quality threshold(s) breached:",
            len(alerts),
        )
        for alert in alerts:
            logger.warning("  -> %s", alert)

        if args.create_issue:
            body_lines = [
                "## Quality Threshold Breach",
                f"\n**Date:** {target_date}",
                f"**7-day graded:** {latest_report.get('graded', 0)}",
                "\n### Alerts",
            ]
            for alert in alerts:
                body_lines.append(f"- {alert}")

            body_lines.append("\n### 7-Day Metrics")
            for key in [
                "spread_accuracy",
                "total_accuracy",
                "spread_roi",
                "total_roi",
            ]:
                if key in latest_report:
                    val = latest_report[key]
                    if "accuracy" in key:
                        body_lines.append(f"- {key}: {val:.1%}")
                    else:
                        body_lines.append(f"- {key}: {val:.1f}%")

            create_github_issue(
                title=(f"Model Quality Alert - {target_date}"),
                body="\n".join(body_lines),
                labels=["automation", "alert"],
            )
    else:
        logger.info("[OK] All quality thresholds within bounds")

    # Step 5: Save report
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.output_dir / f"grades_{target_date}.json"
    output = {
        "date": target_date,
        "windows": reports,
        "alerts": alerts,
    }
    with open(report_path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    logger.info("\n[OK] Report saved to %s", report_path)

    logger.info("\n" + "=" * 60)
    logger.info("Grading pipeline complete")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
