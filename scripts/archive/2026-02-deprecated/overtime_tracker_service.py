"""Service for tracking overtime.ag betting data."""

import logging
from datetime import datetime
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import (
    append_to_parquet,
    ensure_dir,
    read_parquet_df,
    write_json,
)
from sports_betting_edge.adapters.overtime_scraper import OvertimeScraperAdapter
from sports_betting_edge.core.tracking.overtime import OvertimeSnapshot

logger = logging.getLogger(__name__)


class OvertimeTrackerService:
    """Service for tracking and persisting overtime.ag betting data."""

    def __init__(
        self,
        scraper: OvertimeScraperAdapter,
        data_dir: Path,
    ) -> None:
        """Initialize the tracker service.

        Args:
            scraper: The overtime.ag scraper adapter
            data_dir: Base directory to store tracker parquet files (uses data_dir/tracker)
        """
        self.scraper = scraper
        self.data_dir = ensure_dir(data_dir)
        self.tracker_dir = ensure_dir(self.data_dir / "tracker")

    def _get_snapshot_dir(self, snapshot_type: str, date: datetime | None = None) -> Path:
        """Get the directory for a snapshot file.

        Args:
            snapshot_type: Type of snapshot (account_balance, open_bets, daily_figures, full)
            date: Date for the snapshot (defaults to today)

        Returns:
            Path to the snapshot directory
        """
        if date is None:
            date = datetime.now()

        date_partition = date.strftime("%Y-%m-%d")
        return self.tracker_dir / snapshot_type / date_partition

    def _get_snapshot_path(
        self,
        snapshot_type: str,
        date: datetime | None = None,
        filename: str | None = None,
    ) -> Path:
        """Get the path for a snapshot file."""
        base_dir = self._get_snapshot_dir(snapshot_type, date)
        name = filename or f"{snapshot_type}.parquet"
        return base_dir / name

    def _save_to_parquet(
        self,
        data: list[dict[str, object]],
        snapshot_type: str,
        date: datetime | None = None,
    ) -> Path:
        """Save data to parquet file (append if exists).

        Args:
            data: List of dicts to save
            snapshot_type: Type of snapshot
            date: Date for the snapshot

        Returns:
            Path to saved file
        """
        path = self._get_snapshot_path(snapshot_type, date)
        append_to_parquet(data, path)
        logger.info(f"Saved {len(data)} records to {path}")

        return path

    async def save_full_snapshot(self, snapshot: OvertimeSnapshot) -> dict[str, Path]:
        """Save a complete snapshot to parquet files.

        Args:
            snapshot: Complete overtime snapshot

        Returns:
            Dict mapping snapshot type to saved file path
        """
        saved_paths: dict[str, Path] = {}

        # Save account balance
        account_data = [snapshot.account_balance.model_dump()]
        saved_paths["account"] = self._save_to_parquet(
            account_data, "account_balance", snapshot.snapshot_time
        )

        # Save open bets
        if snapshot.open_bets.bets:
            open_bets_data = [
                {
                    "snapshot_time": snapshot.snapshot_time,
                    **bet.model_dump(),
                }
                for bet in snapshot.open_bets.bets
            ]
            saved_paths["open_bets"] = self._save_to_parquet(
                open_bets_data, "open_bets", snapshot.snapshot_time
            )

        # Save daily figures - current week
        current_week_data = [
            {
                "snapshot_time": snapshot.snapshot_time,
                "period": "current_week",
                **snapshot.daily_figures.current_week.model_dump(),
            }
        ]
        saved_paths["daily_current"] = self._save_to_parquet(
            current_week_data, "daily_figures", snapshot.snapshot_time
        )

        # Save daily figures - last week
        last_week_data = [
            {
                "snapshot_time": snapshot.snapshot_time,
                "period": "last_week",
                **snapshot.daily_figures.last_week.model_dump(),
            }
        ]
        saved_paths["daily_last"] = self._save_to_parquet(
            last_week_data, "daily_figures", snapshot.snapshot_time
        )

        # Save daily figures - past weeks
        if snapshot.daily_figures.past_weeks:
            past_weeks_data = [
                {
                    "snapshot_time": snapshot.snapshot_time,
                    "period": "past_week",
                    **week.model_dump(),
                }
                for week in snapshot.daily_figures.past_weeks
            ]
            saved_paths["daily_past"] = self._save_to_parquet(
                past_weeks_data, "daily_figures", snapshot.snapshot_time
            )

        # Save complete snapshot as JSON for reference
        full_snapshot_dir = ensure_dir(
            self._get_snapshot_dir("full_snapshot", snapshot.snapshot_time)
        )
        timestamp = snapshot.snapshot_time.strftime("%H-%M-%S")
        full_snapshot_path = full_snapshot_dir / f"full_snapshot_{timestamp}.json"
        write_json(snapshot.model_dump(mode="json"), full_snapshot_path)
        saved_paths["full"] = full_snapshot_path

        logger.info(f"Saved complete snapshot with {len(saved_paths)} files")
        return saved_paths

    def get_latest_balance(self) -> dict[str, object] | None:
        """Get the most recent account balance.

        Returns:
            Latest balance data or None if no data exists
        """
        balance_dir = self.tracker_dir / "account_balance"
        if not balance_dir.exists():
            return None

        # Find most recent file
        files = sorted(balance_dir.rglob("account_balance.parquet"))
        if not files:
            return None

        df = read_parquet_df(files[-1])
        if df.empty:
            return None

        result = df.iloc[-1].to_dict()
        return {str(k): v for k, v in result.items()}

    def get_open_bets_summary(self, date: datetime | None = None) -> pd.DataFrame | None:
        """Get summary of open bets for a date.

        Args:
            date: Date to get bets for (defaults to today)

        Returns:
            DataFrame with open bets or None
        """
        bets_path = self._get_snapshot_path("open_bets", date)
        if not bets_path.exists():
            return None

        return read_parquet_df(bets_path)

    def get_performance_summary(self, weeks: int = 4) -> pd.DataFrame | None:
        """Get performance summary for recent weeks.

        Args:
            weeks: Number of weeks to include

        Returns:
            DataFrame with weekly performance
        """
        figures_dir = self.tracker_dir / "daily_figures"
        if not figures_dir.exists():
            return None

        # Get most recent file
        files = sorted(figures_dir.rglob("daily_figures.parquet"))
        if not files:
            return None

        df = read_parquet_df(files[-1])

        # Filter to recent weeks and calculate metrics
        df["win_rate"] = df.apply(
            lambda row: (
                sum(
                    1
                    for day in [
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                        "sunday",
                    ]
                    if row.get(day, 0) > 0
                )
                / sum(
                    1
                    for day in [
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                        "sunday",
                    ]
                    if row.get(day, 0) != 0
                )
                if sum(
                    1
                    for day in [
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                        "sunday",
                    ]
                    if row.get(day, 0) != 0
                )
                > 0
                else 0
            ),
            axis=1,
        )

        df["roi"] = (df["week_total"] / df["starting_balance"]) * 100

        return df.head(weeks)
