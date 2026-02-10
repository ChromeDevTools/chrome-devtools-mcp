#!/usr/bin/env python3
"""Plot overtime.ag line movements and save to artifacts/.

Usage:
  uv run python scripts/plot_overtime_line_movement.py --list-games
  uv run python scripts/plot_overtime_line_movement.py --list-games --date 2026-02-03
  uv run python scripts/plot_overtime_line_movement.py --plot-all --date 2026-02-04
  uv run python scripts/plot_overtime_line_movement.py --away "Kansas" --home "Texas Tech"
  uv run python scripts/plot_overtime_line_movement.py --away "Kansas" --home "Texas Tech" \
      --date 2026-02-03
  uv run python scripts/plot_overtime_line_movement.py --game-num 601
"""

from __future__ import annotations

import argparse
import logging
import re
import sqlite3
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import ensure_dir, save_matplotlib_figure

logger = logging.getLogger(__name__)

DEFAULT_DB_PATH = Path("data/overtime/overtime_lines.db")
DEFAULT_RAW_DIR = Path("data/raw")
DEFAULT_ARTIFACTS_DIR = Path("artifacts")


@dataclass(frozen=True)
class PlotConfig:
    output_path: Path
    title: str
    away_team: str | None = None
    home_team: str | None = None


def _slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_") or "plot"


def _build_output_path(label: str, output: Path | None) -> Path:
    if output is not None:
        return output
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"overtime_line_movement_{_slugify(label)}_{timestamp}.png"
    return DEFAULT_ARTIFACTS_DIR / filename


def _build_output_path_for_matchup(
    output_dir: Path,
    date_str: str,
    away: str,
    home: str,
) -> Path:
    base = f"{_slugify(away)}_at_{_slugify(home)}_{date_str}"
    candidate = output_dir / f"overtime_line_movement_{base}.png"
    if not candidate.exists():
        return candidate
    suffix = 2
    while True:
        candidate = output_dir / f"overtime_line_movement_{base}_{suffix}.png"
        if not candidate.exists():
            return candidate
        suffix += 1


def _load_snapshots(
    db_path: Path, away: str, home: str, date_str: str | None = None
) -> pd.DataFrame:
    query = """
        SELECT captured_at, spread_magnitude, total_points,
               spread_favorite_price, total_over_price, favorite_team
        FROM overtime_line_snapshots
        WHERE away_team = ? AND home_team = ?
        ORDER BY captured_at
    """
    params: tuple[str, str] | tuple[str, str, str]
    if date_str:
        query = query.replace("ORDER BY", "AND date(captured_at) = ? ORDER BY")
        params = (away, home, date_str)
    else:
        params = (away, home)

    with sqlite3.connect(db_path) as conn:
        df = pd.read_sql_query(query, conn, params=params)
    return df


def _get_latest_snapshot_date(db_path: Path) -> str | None:
    with sqlite3.connect(db_path) as conn:
        row = conn.execute("SELECT date(max(captured_at)) FROM overtime_line_snapshots").fetchone()
    return row[0] if row and row[0] else None


def _list_games(db_path: Path, date_str: str | None) -> tuple[str | None, list[tuple[str, str]]]:
    effective_date = date_str or _get_latest_snapshot_date(db_path)
    if effective_date is None:
        return None, []

    query = """
        SELECT away_team, home_team
        FROM overtime_line_snapshots
        WHERE date(captured_at) = ?
        GROUP BY away_team, home_team
        ORDER BY away_team, home_team
    """
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(query, (effective_date,)).fetchall()
    return effective_date, [(row[0], row[1]) for row in rows]


def _validate_date(date_str: str | None) -> str | None:
    if date_str is None:
        return None
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError as exc:
        raise SystemExit("Invalid --date format. Use YYYY-MM-DD.") from exc
    return date_str


def _find_latest_parquet(raw_dir: Path) -> Path | None:
    files = sorted(raw_dir.glob("overtime_lines_*.parquet"))
    return files[-1] if files else None


def _signed_spread_series(df: pd.DataFrame) -> pd.Series:
    if "raw_line" in df.columns and df["raw_line"].notna().any():
        return df["raw_line"].astype(float)
    sign = df.get("side_role").map({"FAVORITE": -1, "UNDERDOG": 1})
    return df["line_points"].astype(float) * sign.astype(float)


def _resolve_favorite_team(df: pd.DataFrame) -> str | None:
    if "favorite_team" not in df.columns:
        return None
    values = df["favorite_team"].dropna().astype(str).str.strip()
    values = values[values != ""]
    if values.empty:
        return None
    return values.value_counts().idxmax()


def _plot_snapshot_movements(df: pd.DataFrame, config: PlotConfig) -> Path:
    try:
        import matplotlib.pyplot as plt  # type: ignore
    except ImportError as exc:
        raise RuntimeError("matplotlib not installed. Install with: uv add matplotlib") from exc

    df = df.copy()
    df["captured_at"] = pd.to_datetime(df["captured_at"])

    fig, ax1 = plt.subplots(figsize=(10, 5))
    spread_values = pd.to_numeric(df["spread_magnitude"], errors="coerce")
    favorite = _resolve_favorite_team(df)
    away = config.away_team
    home = config.home_team
    underdog: str | None = None
    if favorite and away and home:
        if favorite == away:
            underdog = home
        elif favorite == home:
            underdog = away

    if favorite and underdog:
        ax1.plot(
            df["captured_at"],
            -spread_values,
            label=f"Spread (favorite: {favorite})",
            color="tab:blue",
        )
        ax1.plot(
            df["captured_at"],
            spread_values,
            label=f"Spread (underdog: {underdog})",
            color="tab:green",
        )
    else:
        ax1.plot(
            df["captured_at"],
            spread_values,
            label="Spread (magnitude)",
            color="tab:blue",
        )
    ax1.set_ylabel("Spread (pts)")

    ax2 = ax1.twinx()
    total_values = pd.to_numeric(df["total_points"], errors="coerce")
    ax2.plot(
        df["captured_at"],
        total_values,
        label="Total line",
        color="tab:orange",
    )
    ax2.set_ylabel("Total (pts)")

    ax1.set_title(config.title)
    handles1, labels1 = ax1.get_legend_handles_labels()
    handles2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(handles1 + handles2, labels1 + labels2, loc="best")
    fig.autofmt_xdate()
    fig.tight_layout()

    return save_matplotlib_figure(fig, config.output_path, dpi=200, bbox_inches="tight")


def _plot_signalr_movements(df: pd.DataFrame, config: PlotConfig) -> Path:
    try:
        import matplotlib.pyplot as plt  # type: ignore
    except ImportError as exc:
        raise RuntimeError("matplotlib not installed. Install with: uv add matplotlib") from exc

    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])

    spreads = df[df["market_type"] == "SPREAD"].copy()
    totals = df[df["market_type"].isin(["TOTAL", "L", "T"])].copy()

    fig, axes = plt.subplots(2, 1, figsize=(10, 6), sharex=True)

    if not spreads.empty:
        spreads["signed_line"] = _signed_spread_series(spreads)
        spread_label = "Spread line"
        if "team" in spreads.columns:
            teams = [t for t in spreads["team"].dropna().unique() if str(t).strip()]
            if len(teams) == 1:
                spread_label = f"Spread (team: {teams[0]})"
            elif len(teams) >= 2:
                spread_label = f"Spread (teams: {teams[0]} / {teams[1]})"
        axes[0].plot(
            spreads["timestamp"],
            spreads["signed_line"],
            marker="o",
            linewidth=1,
            label=spread_label,
            color="tab:blue",
        )
        axes[0].invert_yaxis()
        axes[0].legend(loc="best")
    axes[0].set_ylabel("Spread")
    axes[0].set_title(config.title)

    if not totals.empty:
        totals["line_points"] = totals["line_points"].astype(float)
        axes[1].plot(
            totals["timestamp"],
            totals["line_points"],
            marker="o",
            linewidth=1,
            label="Total line",
            color="tab:orange",
        )
        axes[1].legend(loc="best")
    axes[1].set_ylabel("Total")
    axes[1].set_xlabel("Time")

    fig.autofmt_xdate()
    fig.tight_layout()

    return save_matplotlib_figure(fig, config.output_path, dpi=200, bbox_inches="tight")


def _validate_pair(values: Iterable[str | None]) -> bool:
    return all(values) and any(values)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Plot Overtime.ag line movements to PNG.")
    parser.add_argument("--away", type=str, default=None, help="Away team name")
    parser.add_argument("--home", type=str, default=None, help="Home team name")
    parser.add_argument("--game-num", type=int, default=None, help="Overtime game number")
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Snapshot date filter (YYYY-MM-DD). Applies to --list-games and matchup plots.",
    )
    parser.add_argument(
        "--list-games",
        action="store_true",
        help="List matchups from the snapshots DB and exit",
    )
    parser.add_argument(
        "--plot-all",
        action="store_true",
        help="Plot all matchups for the date (or latest date) and exit",
    )
    parser.add_argument("--output", type=Path, default=None, help="PNG output path")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH, help="SQLite DB path")
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=DEFAULT_RAW_DIR,
        help="Directory containing overtime_lines_*.parquet",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Directory for --plot-all output (default: artifacts/)",
    )

    args = parser.parse_args()
    date_str = _validate_date(args.date)

    if args.plot_all and args.game_num:
        raise SystemExit("--plot-all cannot be combined with --game-num.")

    if args.list_games:
        if not args.db.exists():
            raise SystemExit(f"DB not found: {args.db}")
        latest_date, games = _list_games(args.db, date_str)
        if not games:
            raise SystemExit("No snapshot games found to list.")
        label = latest_date if date_str else f"{latest_date} (latest snapshot date)"
        print(f"Matchups for {label}:")
        for away, home in games:
            print(f"- {away} @ {home}")
        return

    if args.plot_all:
        if not args.db.exists():
            raise SystemExit(f"DB not found: {args.db}")
        effective_date, games = _list_games(args.db, date_str)
        if not games or effective_date is None:
            raise SystemExit("No snapshot games found to plot.")

        output_dir = args.output_dir or DEFAULT_ARTIFACTS_DIR
        ensure_dir(output_dir)
        logger.info(
            "Plotting %d matchups for %s into %s",
            len(games),
            effective_date,
            output_dir,
        )

        successes: list[Path] = []
        failures: list[str] = []
        for away, home in games:
            df = _load_snapshots(args.db, away, home, date_str=effective_date)
            if df.empty:
                failures.append(f"{away} @ {home} (no snapshots)")
                continue

            output_path = _build_output_path_for_matchup(output_dir, effective_date, away, home)
            config = PlotConfig(
                output_path=output_path,
                title=f"Overtime.ag Line Movement: {away} @ {home}",
                away_team=away,
                home_team=home,
            )
            try:
                saved = _plot_snapshot_movements(df, config)
                successes.append(saved)
            except Exception as exc:
                failures.append(f"{away} @ {home} ({exc})")

        logger.info("Saved %d plots.", len(successes))
        if failures:
            logger.warning("Failed to plot %d matchups.", len(failures))
            for failure in failures:
                logger.warning("  %s", failure)
        return

    if args.game_num and (args.away or args.home):
        raise SystemExit("Provide either --game-num or both --away/--home (not both).")
    if args.game_num is None and not _validate_pair([args.away, args.home]):
        raise SystemExit("Provide both --away and --home, or use --game-num.")

    if args.game_num is not None:
        latest = _find_latest_parquet(args.raw_dir)
        if latest is None:
            raise SystemExit(f"No SignalR parquet files found in {args.raw_dir}")
        df = pd.read_parquet(latest)
        df = df[df["game_num"] == args.game_num].copy()
        if df.empty:
            raise SystemExit(f"No line changes found for game_num={args.game_num} in {latest}")

        label = f"game_{args.game_num}"
        output_path = _build_output_path(label, args.output)
        ensure_dir(output_path.parent)
        config = PlotConfig(
            output_path=output_path,
            title=f"Overtime.ag Line Changes (Game {args.game_num})",
        )
        saved = _plot_signalr_movements(df, config)
    else:
        if not args.db.exists():
            raise SystemExit(f"DB not found: {args.db}")
        df = _load_snapshots(args.db, args.away, args.home, date_str=date_str)
        if df.empty:
            date_label = f" on {date_str}" if date_str else ""
            raise SystemExit(f"No snapshots found for {args.away} @ {args.home}{date_label}")

        label = f"{args.away}_at_{args.home}"
        output_path = _build_output_path(label, args.output)
        ensure_dir(output_path.parent)
        config = PlotConfig(
            output_path=output_path,
            title=f"Overtime.ag Line Movement: {args.away} @ {args.home}",
            away_team=args.away,
            home_team=args.home,
        )
        saved = _plot_snapshot_movements(df, config)

    logger.info("Saved plot to %s", saved)


if __name__ == "__main__":
    main()
