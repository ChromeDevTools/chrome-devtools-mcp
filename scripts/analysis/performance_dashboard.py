"""CLI script for prediction performance dashboard.

Displays cumulative performance, rolling metrics, calibration,
CLV, and model health in a formatted terminal report.

Usage:
    uv run python scripts/analysis/performance_dashboard.py
    uv run python scripts/analysis/performance_dashboard.py --as-of 2026-02-09
    uv run python scripts/analysis/performance_dashboard.py --json data/reports/dashboard.json
"""

from __future__ import annotations

import argparse
import logging
from datetime import date
from pathlib import Path

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.services.performance_dashboard import (
    PerformanceDashboard,
)

logger = logging.getLogger(__name__)


def main() -> None:
    """Entry point for performance dashboard CLI."""
    parser = argparse.ArgumentParser(description="Prediction performance dashboard")
    parser.add_argument(
        "--as-of",
        type=str,
        default=None,
        help="Dashboard as-of date (default: today)",
    )
    parser.add_argument(
        "--json",
        type=Path,
        default=None,
        help="Export dashboard data to JSON file",
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
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    as_of = args.as_of or date.today().isoformat()

    db = OddsAPIDatabase(str(args.db_path))
    dashboard = PerformanceDashboard(db)

    # JSON export mode
    if args.json:
        dashboard.export_json(as_of, args.json)
        print(f"[OK] Dashboard exported to {args.json}")
        return

    # Build all dashboard components
    snapshots = dashboard.build_snapshots(as_of)
    calibration = dashboard.build_calibration_curve("2025-11-01", as_of)
    confidence = dashboard.build_confidence_breakdown("2025-11-01", as_of)
    model_health = dashboard.build_model_health(args.models_dir)

    # Render and print
    report = dashboard.render_cli_report(
        snapshots=snapshots,
        calibration=calibration,
        confidence=confidence,
        model_health=model_health,
    )
    print(report)


if __name__ == "__main__":
    main()
