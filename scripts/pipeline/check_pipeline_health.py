"""Unified pipeline health check - monitors all data sources and training readiness.

This script consolidates validation checks from Phases 1-5 into a single dashboard.
Run daily to ensure data pipeline is functioning correctly.

Usage:
    python scripts/check_pipeline_health.py
    python scripts/check_pipeline_health.py --output data/outputs/reports/health_check.txt
    python scripts/check_pipeline_health.py --alert-on-critical
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sports_betting_edge.adapters.filesystem import read_parquet_df


class PipelineHealthChecker:
    """Monitors data pipeline health across all sources."""

    def __init__(self) -> None:
        """Initialize health checker."""
        self.issues: list[dict[str, Any]] = []
        self.warnings: list[dict[str, Any]] = []
        self.stats: dict[str, Any] = {}

    def check_data_recency(self) -> None:
        """Check if data sources are up-to-date."""
        print("\n[1/6] Data Recency Check")
        print("-" * 60)

        # KenPom ratings
        kenpom_file = Path("data/kenpom/ratings/season/ratings_2026.parquet")
        if kenpom_file.exists():
            age_hours = (
                datetime.now() - datetime.fromtimestamp(kenpom_file.stat().st_mtime)
            ).total_seconds() / 3600
            status = "[OK]" if age_hours < 24 else "[WARNING]" if age_hours < 48 else "[ERROR]"
            print(f"  KenPom Ratings: {age_hours:.1f}h ago {status}")
            if age_hours >= 24:
                self._add_warning("KenPom ratings", f"{age_hours:.1f}h old (should update daily)")
            self.stats["kenpom_age_hours"] = age_hours
        else:
            print("  KenPom Ratings: MISSING [ERROR]")
            self._add_issue("KenPom ratings", "File missing")

        # Odds API database
        odds_db = Path("data/odds_api/odds_api.sqlite3")
        if odds_db.exists():
            age_hours = (
                datetime.now() - datetime.fromtimestamp(odds_db.stat().st_mtime)
            ).total_seconds() / 3600
            status = "[OK]" if age_hours < 1 else "[WARNING]"
            print(f"  Odds API Database: {age_hours:.1f}h ago {status}")
            if age_hours >= 1:
                self._add_warning(
                    "Odds API", f"{age_hours:.1f}h old (real-time collection may be down)"
                )
            self.stats["odds_api_age_hours"] = age_hours
        else:
            print("  Odds API Database: MISSING [ERROR]")
            self._add_issue("Odds API database", "File missing")

        # ESPN schedule
        espn_dir = Path("data/espn/schedule")
        if espn_dir.exists():
            files = sorted(
                espn_dir.glob("*.parquet"), key=lambda x: x.stat().st_mtime, reverse=True
            )
            if files:
                latest = files[0]
                age_hours = (
                    datetime.now() - datetime.fromtimestamp(latest.stat().st_mtime)
                ).total_seconds() / 3600
                status = "[OK]" if age_hours < 24 else "[WARNING]" if age_hours < 48 else "[ERROR]"
                print(f"  ESPN Schedule: {age_hours:.1f}h ago (latest: {latest.stem}) {status}")
                if age_hours >= 24:
                    self._add_warning(
                        "ESPN schedule", f"{age_hours:.1f}h old (should update daily)"
                    )
                self.stats["espn_age_hours"] = age_hours
            else:
                print("  ESPN Schedule: NO FILES [ERROR]")
                self._add_issue("ESPN schedule", "No schedule files found")
        else:
            print("  ESPN Schedule: MISSING [ERROR]")
            self._add_issue("ESPN schedule", "Directory missing")

        # ML datasets
        ml_dir = Path("data/ml")
        if ml_dir.exists():
            spreads = ml_dir / "spreads_2025-12-01_2026-02-03.parquet"
            if spreads.exists():
                age_hours = (
                    datetime.now() - datetime.fromtimestamp(spreads.stat().st_mtime)
                ).total_seconds() / 3600
                status = "[OK]" if age_hours < 24 else "[WARNING]"
                print(f"  ML Datasets: {age_hours:.1f}h ago {status}")
                self.stats["ml_age_hours"] = age_hours
            else:
                print("  ML Datasets: MISSING [WARNING]")
                self._add_warning("ML datasets", "Latest spreads file missing")

    def check_team_mappings(self) -> None:
        """Check team mapping coverage."""
        print("\n[2/6] Team Mapping Coverage")
        print("-" * 60)

        mapping_path = Path("data/staging/mappings/team_mapping.parquet")
        if not mapping_path.exists():
            print("  [ERROR] Team mapping file missing")
            self._add_issue("Team mappings", "File missing")
            return

        try:
            mapping_df = read_parquet_df(str(mapping_path))
            total_mappings = len(mapping_df)
            print(f"  Total mappings: {total_mappings}")
            self.stats["total_team_mappings"] = total_mappings

            # Check for unmapped teams in database
            odds_db = Path("data/odds_api/odds_api.sqlite3")
            if odds_db.exists():
                conn = sqlite3.connect(str(odds_db))
                cursor = conn.cursor()
                cursor.execute(
                    """SELECT DISTINCT home_team FROM events
                       UNION SELECT DISTINCT away_team FROM events"""
                )
                all_teams = {row[0] for row in cursor.fetchall()}
                conn.close()

                mapped_teams = set(mapping_df["odds_api_name"].dropna().unique())
                unmapped = all_teams - mapped_teams
                unmapped_count = len(unmapped)

                if unmapped_count == 0:
                    print("  [OK] All teams mapped")
                elif unmapped_count <= 5:
                    print(f"  [WARNING] {unmapped_count} unmapped teams (likely non-D1)")
                    for team in list(unmapped)[:5]:
                        print(f"    - {team}")
                    self._add_warning("Team mappings", f"{unmapped_count} unmapped teams")
                else:
                    print(f"  [ERROR] {unmapped_count} unmapped teams")
                    self._add_issue("Team mappings", f"{unmapped_count} teams unmapped")

                self.stats["unmapped_teams"] = unmapped_count
        except Exception as e:
            print(f"  [ERROR] Failed to check mappings: {e}")
            self._add_issue("Team mappings", str(e))

    def check_score_coverage(self) -> None:
        """Check if scores are being collected for completed games."""
        print("\n[3/6] Score Collection Coverage")
        print("-" * 60)

        odds_db = Path("data/odds_api/odds_api.sqlite3")
        if not odds_db.exists():
            print("  [ERROR] Odds API database missing")
            return

        try:
            conn = sqlite3.connect(str(odds_db))
            cursor = conn.cursor()

            # Check last 3 days for missing scores
            today = datetime.now().date()
            for days_back in range(1, 4):
                check_date = today - timedelta(days=days_back)
                date_str = check_date.strftime("%Y-%m-%d")

                cursor.execute(
                    """
                    SELECT COUNT(*) as total,
                           SUM(CASE WHEN s.event_id IS NOT NULL THEN 1 ELSE 0 END) as with_scores
                    FROM events e
                    LEFT JOIN scores s ON e.event_id = s.event_id
                    WHERE DATE(e.commence_time) = ?
                """,
                    (date_str,),
                )
                row = cursor.fetchone()
                total, with_scores = row if row else (0, 0)
                with_scores = with_scores or 0

                if total == 0:
                    continue

                coverage_pct = (with_scores / total * 100) if total > 0 else 0
                missing = total - with_scores

                if coverage_pct >= 95:
                    status = "[OK]"
                elif coverage_pct >= 80:
                    status = "[WARNING]"
                else:
                    status = "[ERROR]"

                print(f"  {date_str}: {with_scores}/{total} games ({coverage_pct:.0f}%) {status}")

                if missing > 0 and days_back <= 2 and coverage_pct < 95:
                    self._add_issue(
                        "Score collection", f"{missing} games on {date_str} missing scores"
                    )

            conn.close()
        except Exception as e:
            print(f"  [ERROR] Failed to check scores: {e}")
            self._add_issue("Score collection", str(e))

    def check_feature_engineering(self) -> None:
        """Check if feature engineering is working."""
        print("\n[4/6] Feature Engineering Health")
        print("-" * 60)

        # Check latest ML dataset
        ml_file = Path("data/ml/spreads_2025-12-01_2026-02-03.parquet")
        if not ml_file.exists():
            print("  [ERROR] Latest spreads dataset missing")
            self._add_issue("Feature engineering", "Latest dataset file missing")
            return

        try:
            df = read_parquet_df(str(ml_file))
            total_features = len(df.columns)
            total_rows = len(df)
            nan_pct = (df.isna().sum().sum() / (total_rows * total_features)) * 100

            print(f"  Total games: {total_rows}")
            print(f"  Total features: {total_features}")
            print(f"  NaN percentage: {nan_pct:.2f}%")

            self.stats["ml_total_games"] = total_rows
            self.stats["ml_total_features"] = total_features
            self.stats["ml_nan_pct"] = nan_pct

            # Check for sharp book data (lowvig)
            if "sharp_closing_spread" in df.columns:
                sharp_coverage = df["sharp_closing_spread"].notna().sum() / total_rows * 100
                if sharp_coverage == 0:
                    print("  [ERROR] Sharp book data: 0% coverage (lowvig missing)")
                    self._add_issue("Sharp book data", "100% missing (lowvig unavailable)")
                elif sharp_coverage < 50:
                    print(f"  [WARNING] Sharp book data: {sharp_coverage:.0f}% coverage")
                    self._add_warning("Sharp book data", f"Only {sharp_coverage:.0f}% coverage")
                else:
                    print(f"  [OK] Sharp book data (lowvig): {sharp_coverage:.0f}% coverage")

            # Check expected feature count
            if total_features < 50:
                print(f"  [WARNING] Only {total_features} features (expected ~54)")
                self._add_warning("Features", f"Only {total_features} features generated")
            else:
                print(f"  [OK] Feature count: {total_features}")

        except Exception as e:
            print(f"  [ERROR] Failed to check features: {e}")
            self._add_issue("Feature engineering", str(e))

    def check_model_freshness(self) -> None:
        """Check if models have been retrained recently."""
        print("\n[5/6] Model Artifact Freshness")
        print("-" * 60)

        models_dir = Path("models")
        if not models_dir.exists():
            print("  [ERROR] models/ directory missing")
            self._add_issue("Models", "Directory missing")
            return

        model_files = ["spreads_model.json", "totals_model.json"]
        for model_name in model_files:
            model_path = models_dir / model_name
            if model_path.exists():
                age_days = (
                    datetime.now() - datetime.fromtimestamp(model_path.stat().st_mtime)
                ).days
                if age_days == 0:
                    age_str = "today"
                    status = "[OK]"
                elif age_days < 7:
                    age_str = f"{age_days}d ago"
                    status = "[OK]"
                elif age_days < 30:
                    age_str = f"{age_days}d ago"
                    status = "[WARNING]"
                else:
                    age_str = f"{age_days}d ago"
                    status = "[ERROR]"

                print(f"  {model_name:30} {age_str:15} {status}")

                if age_days >= 7:
                    self._add_warning("Model freshness", f"{model_name} is {age_days}d old")
            else:
                print(f"  {model_name:30} MISSING [ERROR]")
                self._add_issue("Models", f"{model_name} missing")

    def check_database_health(self) -> None:
        """Check Odds API database health."""
        print("\n[6/6] Database Health")
        print("-" * 60)

        odds_db = Path("data/odds_api/odds_api.sqlite3")
        if not odds_db.exists():
            print("  [ERROR] Database file missing")
            return

        try:
            size_mb = odds_db.stat().st_size / (1024 * 1024)
            print(f"  Database size: {size_mb:.1f} MB")
            self.stats["db_size_mb"] = size_mb

            conn = sqlite3.connect(str(odds_db))
            cursor = conn.cursor()

            # Check table counts
            cursor.execute("SELECT COUNT(*) FROM events")
            event_count = cursor.fetchone()[0]
            print(f"  Events: {event_count:,}")
            self.stats["total_events"] = event_count

            cursor.execute("SELECT COUNT(*) FROM observations")
            obs_count = cursor.fetchone()[0]
            print(f"  Observations: {obs_count:,}")
            self.stats["total_observations"] = obs_count

            cursor.execute("SELECT COUNT(*) FROM scores WHERE completed = 1")
            score_count = cursor.fetchone()[0]
            print(f"  Completed games: {score_count:,}")
            self.stats["completed_games"] = score_count

            # Check observation density
            if event_count > 0:
                obs_per_event = obs_count / event_count
                if obs_per_event < 1000:
                    print(f"  [WARNING] Only {obs_per_event:.0f} obs/event (low granularity)")
                    self._add_warning("Observations", f"Low density: {obs_per_event:.0f} obs/event")
                else:
                    print(f"  [OK] {obs_per_event:.0f} obs/event (good granularity)")

            conn.close()

        except Exception as e:
            print(f"  [ERROR] Database check failed: {e}")
            self._add_issue("Database", str(e))

    def _add_issue(self, category: str, message: str) -> None:
        """Add a critical issue."""
        self.issues.append({"category": category, "message": message})

    def _add_warning(self, category: str, message: str) -> None:
        """Add a warning."""
        self.warnings.append({"category": category, "message": message})

    def print_summary(self) -> None:
        """Print health check summary."""
        print("\n" + "=" * 60)
        print("PIPELINE HEALTH SUMMARY")
        print("=" * 60)

        if len(self.issues) == 0 and len(self.warnings) == 0:
            print("\n[OK] All checks passed - pipeline is healthy!")
        else:
            if self.issues:
                print(f"\n[ERROR] {len(self.issues)} critical issue(s):")
                for issue in self.issues:
                    print(f"  - {issue['category']}: {issue['message']}")

            if self.warnings:
                print(f"\n[WARNING] {len(self.warnings)} warning(s):")
                for warning in self.warnings:
                    print(f"  - {warning['category']}: {warning['message']}")

        print()

    def get_exit_code(self) -> int:
        """Get exit code based on health status."""
        if self.issues:
            return 1  # Critical issues
        elif self.warnings:
            return 2  # Warnings only
        else:
            return 0  # All good


def main() -> None:
    """Run pipeline health check."""
    parser = argparse.ArgumentParser(description="Check data pipeline health")
    parser.add_argument("--output", help="Save report to file")
    parser.add_argument(
        "--alert-on-critical", action="store_true", help="Exit with code 1 on critical issues"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("SPORTS BETTING DATA PIPELINE HEALTH CHECK")
    print("=" * 60)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    checker = PipelineHealthChecker()

    # Run all checks
    checker.check_data_recency()
    checker.check_team_mappings()
    checker.check_score_coverage()
    checker.check_feature_engineering()
    checker.check_model_freshness()
    checker.check_database_health()

    # Print summary
    checker.print_summary()

    # Save to file if requested
    if args.output:
        # TODO: Implement file output
        print(f"Note: Report would be saved to {args.output}")

    # Exit with appropriate code
    if args.alert_on_critical:
        sys.exit(checker.get_exit_code())


if __name__ == "__main__":
    main()
