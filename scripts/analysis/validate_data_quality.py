"""Validate data quality across all sources for CLV tracking and backtesting.

Checks:
1. Team name mapping coverage (Odds API, ESPN, KenPom)
2. Temporal field consistency (timezone, format, data types)
3. Database schema alignment
4. Data integrity (orphaned records, missing scores)
5. Date range coverage

Usage:
    uv run python scripts/validate_data_quality.py

    # Check specific date range
    uv run python scripts/validate_data_quality.py --start 2025-12-01 --end 2026-01-31

    # Export detailed report
    uv run python scripts/validate_data_quality.py --output data/validation_report.txt
"""

from __future__ import annotations

import argparse
import logging
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.core.team_mapper import TeamMapper

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


class DataQualityValidator:
    """Validate data quality across all sources."""

    def __init__(
        self,
        odds_db_path: Path,
        kenpom_path: Path,
        team_mapping_path: Path,
    ):
        """Initialize validator.

        Args:
            odds_db_path: Path to Odds API SQLite database
            kenpom_path: Path to KenPom data directory
            team_mapping_path: Path to team mapping parquet file
        """
        self.odds_db_path = odds_db_path
        self.kenpom_path = kenpom_path
        self.team_mapping_path = team_mapping_path
        self.db = OddsAPIDatabase(str(odds_db_path))

        self.issues: dict[str, list[str]] = defaultdict(list)
        self.stats: dict[str, int | float | str] = {}

    def validate_all(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        """Run all validation checks.

        Args:
            start_date: Optional start date for temporal checks (YYYY-MM-DD)
            end_date: Optional end date for temporal checks (YYYY-MM-DD)

        Returns:
            Dictionary with validation results
        """
        logger.info("=" * 80)
        logger.info("DATA QUALITY VALIDATION")
        logger.info("=" * 80)

        # 1. Database schema validation
        logger.info("\n[1/6] Validating database schema...")
        self._validate_database_schema()

        # 2. Temporal field validation
        logger.info("\n[2/6] Validating temporal fields...")
        self._validate_temporal_fields(start_date, end_date)

        # 3. Team name mapping validation
        logger.info("\n[3/6] Validating team name mappings...")
        self._validate_team_mappings()

        # 4. Data integrity checks
        logger.info("\n[4/6] Checking data integrity...")
        self._validate_data_integrity()

        # 5. KenPom data validation
        logger.info("\n[5/6] Validating KenPom data...")
        self._validate_kenpom_data()

        # 6. Date range coverage
        logger.info("\n[6/6] Checking date range coverage...")
        self._validate_date_coverage()

        # Generate summary
        self._print_summary()

        return {
            "issues": dict(self.issues),
            "stats": self.stats,
            "passed": len(self.issues) == 0,
        }

    def _validate_database_schema(self) -> None:
        """Validate SQLite database schema matches expectations."""
        # Check events table
        events_schema = pd.read_sql_query("PRAGMA table_info(events)", self.db.conn).set_index(
            "name"
        )

        expected_events = {
            "event_id": "TEXT",
            "sport_key": "TEXT",
            "home_team": "TEXT",
            "away_team": "TEXT",
            "commence_time": "TEXT",
        }

        for col, dtype in expected_events.items():
            if col not in events_schema.index:
                self.issues["schema"].append(f"Missing column in events: {col}")
            elif events_schema.loc[col, "type"] != dtype:
                self.issues["schema"].append(
                    f"Wrong type for events.{col}: "
                    f"expected {dtype}, got {events_schema.loc[col, 'type']}"
                )

        # Check observations table
        obs_schema = pd.read_sql_query("PRAGMA table_info(observations)", self.db.conn).set_index(
            "name"
        )

        expected_obs = {
            "event_id": "TEXT",
            "book_key": "TEXT",
            "market_key": "TEXT",
            "outcome_name": "TEXT",
            "price_american": "INTEGER",
            "point": "REAL",
            "as_of": "TEXT",
            "sport_key": "TEXT",
        }

        for col, _dtype in expected_obs.items():
            if col not in obs_schema.index:
                self.issues["schema"].append(f"Missing column in observations: {col}")

        # Check scores table
        scores_schema = pd.read_sql_query("PRAGMA table_info(scores)", self.db.conn).set_index(
            "name"
        )

        expected_scores = {
            "event_id": "TEXT",
            "sport_key": "TEXT",
            "completed": "INTEGER",
            "home_score": "INTEGER",
            "away_score": "INTEGER",
        }

        for col, _dtype in expected_scores.items():
            if col not in scores_schema.index:
                self.issues["schema"].append(f"Missing column in scores: {col}")

        self.stats["events_columns"] = len(events_schema)
        self.stats["observations_columns"] = len(obs_schema)
        self.stats["scores_columns"] = len(scores_schema)

        logger.info(f"  Events table: {len(events_schema)} columns")
        logger.info(f"  Observations table: {len(obs_schema)} columns")
        logger.info(f"  Scores table: {len(scores_schema)} columns")

    def _validate_temporal_fields(
        self, start_date: str | None = None, end_date: str | None = None
    ) -> None:
        """Validate temporal fields for timezone and format consistency."""
        # Check commence_time format and timezone
        query = "SELECT event_id, commence_time FROM events LIMIT 1000"
        if start_date and end_date:
            query = f"""
                SELECT event_id, commence_time
                FROM events
                WHERE DATE(commence_time) BETWEEN '{start_date}' AND '{end_date}'
            """

        events_df = pd.read_sql_query(query, self.db.conn)

        # Parse commence_time
        invalid_times = []
        timezones_found = set()

        for _idx, row in events_df.iterrows():
            try:
                dt = datetime.fromisoformat(row["commence_time"].replace("Z", "+00:00"))
                # Check if timezone-aware
                if dt.tzinfo is None:
                    self.issues["temporal"].append(
                        f"commence_time is timezone-naive: {row['event_id']}"
                    )
                else:
                    timezones_found.add(str(dt.tzinfo))
            except (ValueError, AttributeError) as e:
                invalid_times.append((row["event_id"], str(e)))

        if invalid_times:
            self.issues["temporal"].append(
                f"Invalid commence_time format in {len(invalid_times)} events"
            )
            for event_id, error in invalid_times[:5]:  # Show first 5
                self.issues["temporal"].append(f"  {event_id}: {error}")

        # Check if all times are in same timezone
        if len(timezones_found) > 1:
            self.issues["temporal"].append(
                f"Multiple timezones found in commence_time: {timezones_found}"
            )

        self.stats["commence_time_timezone"] = (
            list(timezones_found)[0] if len(timezones_found) == 1 else "MIXED"
        )

        # Check as_of in observations
        obs_query = "SELECT DISTINCT as_of FROM observations LIMIT 1000"
        obs_df = pd.read_sql_query(obs_query, self.db.conn)

        obs_timezones = set()
        for as_of in obs_df["as_of"]:
            try:
                dt = datetime.fromisoformat(as_of.replace("Z", "+00:00"))
                if dt.tzinfo:
                    obs_timezones.add(str(dt.tzinfo))
            except (ValueError, AttributeError):
                pass

        if len(obs_timezones) > 1:
            self.issues["temporal"].append(
                f"Multiple timezones in observations.as_of: {obs_timezones}"
            )

        self.stats["as_of_timezone"] = (
            list(obs_timezones)[0] if len(obs_timezones) == 1 else "MIXED"
        )

        logger.info(f"  Commence time timezone: {self.stats['commence_time_timezone']}")
        logger.info(f"  Observations timezone: {self.stats['as_of_timezone']}")

    def _validate_team_mappings(self) -> None:
        """Validate team name mappings across sources."""
        # Load team mapping
        try:
            mapper = TeamMapper(read_parquet_df(self.team_mapping_path))
            mapping_df = mapper.mapping
            self.stats["mapped_teams"] = len(mapping_df)
            logger.info(f"  Team mapping loaded: {len(mapping_df)} teams")
        except FileNotFoundError:
            self.issues["team_mapping"].append(
                f"Team mapping file not found: {self.team_mapping_path}"
            )
            return

        # Get unique teams from Odds API
        odds_teams_query = """
            SELECT DISTINCT home_team as team FROM events
            UNION
            SELECT DISTINCT away_team as team FROM events
        """
        odds_teams = pd.read_sql_query(odds_teams_query, self.db.conn)["team"].tolist()

        self.stats["odds_api_teams"] = len(odds_teams)
        logger.info(f"  Odds API teams: {len(odds_teams)}")

        # Check mapping coverage
        unmapped_odds = []
        for team in odds_teams:
            kenpom_name = mapper.get_kenpom_name(team, source="odds_api")
            # If kenpom_name equals team, it means no mapping was found
            if kenpom_name == team and team not in mapping_df["kenpom_name"].values:
                unmapped_odds.append(team)

        if unmapped_odds:
            self.issues["team_mapping"].append(
                f"Unmapped Odds API teams ({len(unmapped_odds)}): {unmapped_odds[:10]}"
            )
            self.stats["unmapped_odds_teams"] = len(unmapped_odds)
        else:
            logger.info("  [OK] All Odds API teams are mapped")
            self.stats["unmapped_odds_teams"] = 0

        # Check for KenPom teams not in mapping
        kenpom_ratings_path = self.kenpom_path / "ratings" / "season" / "ratings_2026.parquet"
        if kenpom_ratings_path.exists():
            kenpom_df = read_parquet_df(kenpom_ratings_path)
            kenpom_teams = kenpom_df["TeamName"].unique().tolist()

            self.stats["kenpom_teams"] = len(kenpom_teams)
            logger.info(f"  KenPom teams: {len(kenpom_teams)}")

            # Teams in KenPom but not in mapping
            unmapped_kenpom = [t for t in kenpom_teams if t not in mapping_df["kenpom_name"].values]

            if unmapped_kenpom:
                self.issues["team_mapping"].append(
                    f"KenPom teams not in mapping ({len(unmapped_kenpom)}): {unmapped_kenpom[:10]}"
                )
                self.stats["unmapped_kenpom_teams"] = len(unmapped_kenpom)
            else:
                logger.info("  [OK] All KenPom teams are in mapping")
                self.stats["unmapped_kenpom_teams"] = 0

    def _validate_data_integrity(self) -> None:
        """Check for orphaned records and data consistency."""
        # Count records
        events_count = pd.read_sql_query("SELECT COUNT(*) as cnt FROM events", self.db.conn)["cnt"][
            0
        ]
        obs_count = pd.read_sql_query("SELECT COUNT(*) as cnt FROM observations", self.db.conn)[
            "cnt"
        ][0]
        scores_count = pd.read_sql_query("SELECT COUNT(*) as cnt FROM scores", self.db.conn)["cnt"][
            0
        ]

        self.stats["total_events"] = events_count
        self.stats["total_observations"] = obs_count
        self.stats["total_scores"] = scores_count

        logger.info(f"  Events: {events_count:,}")
        logger.info(f"  Observations: {obs_count:,}")
        logger.info(f"  Scores: {scores_count:,}")

        # Check for observations without events
        orphaned_obs_query = """
            SELECT COUNT(*) as cnt
            FROM observations o
            LEFT JOIN events e ON o.event_id = e.event_id
            WHERE e.event_id IS NULL
        """
        orphaned_obs = pd.read_sql_query(orphaned_obs_query, self.db.conn)["cnt"][0]

        if orphaned_obs > 0:
            self.issues["integrity"].append(
                f"Orphaned observations (no matching event): {orphaned_obs}"
            )
            self.stats["orphaned_observations"] = orphaned_obs
        else:
            self.stats["orphaned_observations"] = 0

        # Check for scores without events
        orphaned_scores_query = """
            SELECT COUNT(*) as cnt
            FROM scores s
            LEFT JOIN events e ON s.event_id = e.event_id
            WHERE e.event_id IS NULL
        """
        orphaned_scores = pd.read_sql_query(orphaned_scores_query, self.db.conn)["cnt"][0]

        if orphaned_scores > 0:
            self.issues["integrity"].append(
                f"Orphaned scores (no matching event): {orphaned_scores}"
            )
            self.stats["orphaned_scores"] = orphaned_scores
        else:
            self.stats["orphaned_scores"] = 0

        # Check for events with scores but no odds
        events_with_scores_no_odds_query = """
            SELECT COUNT(DISTINCT s.event_id) as cnt
            FROM scores s
            INNER JOIN events e ON s.event_id = e.event_id
            LEFT JOIN observations o ON s.event_id = o.event_id
            WHERE o.event_id IS NULL
            AND s.completed = 1
        """
        no_odds = pd.read_sql_query(events_with_scores_no_odds_query, self.db.conn)["cnt"][0]

        if no_odds > 0:
            self.issues["integrity"].append(f"Completed games with scores but no odds: {no_odds}")
            self.stats["scores_without_odds"] = no_odds
        else:
            self.stats["scores_without_odds"] = 0

        # Check for events with odds but no scores (expected for future games)
        events_with_odds_no_scores_query = """
            SELECT COUNT(DISTINCT e.event_id) as cnt
            FROM events e
            INNER JOIN observations o ON e.event_id = o.event_id
            LEFT JOIN scores s ON e.event_id = s.event_id
            WHERE s.event_id IS NULL
            AND DATE(e.commence_time) < DATE('now')
        """
        past_no_scores = pd.read_sql_query(events_with_odds_no_scores_query, self.db.conn)["cnt"][0]

        if past_no_scores > 0:
            self.issues["integrity"].append(f"Past games with odds but no scores: {past_no_scores}")
            self.stats["past_games_no_scores"] = past_no_scores
        else:
            self.stats["past_games_no_scores"] = 0

    def _validate_kenpom_data(self) -> None:
        """Validate KenPom data availability and quality."""
        # Check for ratings file
        ratings_path = self.kenpom_path / "ratings" / "season" / "ratings_2026.parquet"
        if not ratings_path.exists():
            self.issues["kenpom"].append(f"KenPom ratings not found: {ratings_path}")
            return

        ratings_df = read_parquet_df(ratings_path)
        self.stats["kenpom_teams_with_ratings"] = len(ratings_df)

        # Check for required columns
        required_cols = ["TeamName", "AdjEM", "AdjOE", "AdjDE", "AdjTempo"]
        missing_cols = [col for col in required_cols if col not in ratings_df.columns]

        if missing_cols:
            self.issues["kenpom"].append(f"Missing KenPom columns: {missing_cols}")

        # Check for NaN values in key metrics
        for col in ["AdjEM", "AdjOE", "AdjDE"]:
            if col in ratings_df.columns:
                nan_count = ratings_df[col].isna().sum()
                if nan_count > 0:
                    self.issues["kenpom"].append(f"NaN values in {col}: {nan_count} teams")

        logger.info(f"  KenPom teams with ratings: {len(ratings_df)}")

        # Check four factors
        ff_path = self.kenpom_path / "four-factors" / "season" / "four-factors_2026.parquet"
        if not ff_path.exists():
            self.issues["kenpom"].append(f"Four factors not found: {ff_path}")
        else:
            ff_df = read_parquet_df(ff_path)
            self.stats["kenpom_teams_with_ff"] = len(ff_df)
            logger.info(f"  KenPom teams with four factors: {len(ff_df)}")

    def _validate_date_coverage(self) -> None:
        """Check date range coverage across sources."""
        # Events date range
        date_range_query = """
            SELECT
                MIN(DATE(commence_time)) as earliest,
                MAX(DATE(commence_time)) as latest,
                COUNT(DISTINCT DATE(commence_time)) as unique_dates
            FROM events
        """
        date_range = pd.read_sql_query(date_range_query, self.db.conn).iloc[0]

        self.stats["earliest_event"] = date_range["earliest"]
        self.stats["latest_event"] = date_range["latest"]
        self.stats["unique_event_dates"] = date_range["unique_dates"]

        logger.info(f"  Events date range: {date_range['earliest']} to {date_range['latest']}")
        logger.info(f"  Unique dates with events: {date_range['unique_dates']}")

        # Scores date range
        scores_range_query = """
            SELECT
                MIN(DATE(e.commence_time)) as earliest,
                MAX(DATE(e.commence_time)) as latest,
                COUNT(DISTINCT DATE(e.commence_time)) as unique_dates
            FROM scores s
            INNER JOIN events e ON s.event_id = e.event_id
            WHERE s.completed = 1
        """
        scores_range = pd.read_sql_query(scores_range_query, self.db.conn).iloc[0]

        self.stats["earliest_score"] = scores_range["earliest"]
        self.stats["latest_score"] = scores_range["latest"]
        self.stats["unique_score_dates"] = scores_range["unique_dates"]

        logger.info(f"  Scores date range: {scores_range['earliest']} to {scores_range['latest']}")
        logger.info(f"  Unique dates with scores: {scores_range['unique_dates']}")

    def _print_summary(self) -> None:
        """Print validation summary."""
        logger.info("\n" + "=" * 80)
        logger.info("VALIDATION SUMMARY")
        logger.info("=" * 80)

        if len(self.issues) == 0:
            logger.info("\n[OK] All validation checks passed!")
        else:
            logger.info(f"\n[WARNING] Found {len(self.issues)} issue categories:")
            for category, issue_list in self.issues.items():
                logger.info(f"\n{category.upper()} ({len(issue_list)} issues):")
                for issue in issue_list:
                    logger.info(f"  - {issue}")

        logger.info("\n" + "=" * 80)

    def export_report(self, output_path: Path) -> None:
        """Export detailed validation report to file.

        Args:
            output_path: Path to save report
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w") as f:
            f.write("DATA QUALITY VALIDATION REPORT\n")
            f.write("=" * 80 + "\n")
            f.write(f"Generated: {datetime.now().isoformat()}\n\n")

            f.write("STATISTICS\n")
            f.write("-" * 80 + "\n")
            for key, value in sorted(self.stats.items()):
                f.write(f"{key}: {value}\n")

            f.write("\n\nISSUES\n")
            f.write("-" * 80 + "\n")
            if len(self.issues) == 0:
                f.write("No issues found!\n")
            else:
                for category, issue_list in self.issues.items():
                    f.write(f"\n{category.upper()}:\n")
                    for issue in issue_list:
                        f.write(f"  - {issue}\n")

        logger.info(f"\nReport exported to: {output_path}")


def main() -> None:
    """Run data quality validation."""
    parser = argparse.ArgumentParser(description="Validate data quality for CLV tracking")
    parser.add_argument(
        "--odds-db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to Odds API database",
    )
    parser.add_argument(
        "--kenpom-path",
        type=Path,
        default=Path("data/kenpom"),
        help="Path to KenPom data directory",
    )
    parser.add_argument(
        "--team-mapping",
        type=Path,
        default=Path("data/staging/mappings/team_mapping.parquet"),
        help="Path to team mapping file",
    )
    parser.add_argument(
        "--start",
        type=str,
        help="Start date for temporal checks (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end",
        type=str,
        help="End date for temporal checks (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Path to export detailed report",
    )

    args = parser.parse_args()

    # Initialize validator
    validator = DataQualityValidator(
        odds_db_path=args.odds_db,
        kenpom_path=args.kenpom_path,
        team_mapping_path=args.team_mapping,
    )

    # Run validation
    results = validator.validate_all(start_date=args.start, end_date=args.end)

    # Export report if requested
    if args.output:
        validator.export_report(args.output)

    # Exit with error if validation failed
    if not results["passed"]:
        logger.error("\n[ERROR] Validation failed! See issues above.")
        exit(1)
    else:
        logger.info("\n[OK] All validation checks passed!")


if __name__ == "__main__":
    main()
