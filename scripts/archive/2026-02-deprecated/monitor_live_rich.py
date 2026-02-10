"""Monitor live Overtime.ag line movements with Rich formatting.

Beautiful terminal display with colors, tables, and live updates for monitoring
sports betting lines alongside ML predictions.

Prerequisites:
    1. Chrome with remote debugging (port 9222)
    2. overtime.ag logged in, navigated to College Basketball
    3. Today's predictions generated

Usage:
    uv run python scripts/monitor_live_rich.py
    uv run python scripts/monitor_live_rich.py --min-edge 0.10
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sports_betting_edge.adapters.overtime_ag import (  # noqa: E402
    OvertimeSignalRClient,
)
from sports_betting_edge.core.exceptions import ConfigurationError  # noqa: E402
from sports_betting_edge.core.types import MarketType  # noqa: E402

console = Console()


class RichLineMonitor:
    """Monitors live lines with Rich terminal display."""

    def __init__(
        self,
        predictions_path: Path,
        min_edge: float = 0.05,
    ):
        """Initialize the monitor.

        Args:
            predictions_path: Path to predictions CSV
            min_edge: Minimum edge for value alerts
        """
        self.predictions_path = predictions_path
        self.min_edge = min_edge
        self.predictions = self._load_predictions()

        # Tracking
        self.recent_lines: list[dict[str, Any]] = []
        self.max_recent = 15
        self.total_changes = 0
        self.steam_count = 0
        self.value_alerts = 0
        self.value_opportunities: list[dict[str, Any]] = []

        # Track opening and current lines by game
        # Key: (game_num, market_type)
        self.opening_lines: dict[tuple[int, MarketType], dict[str, Any]] = {}
        self.current_lines: dict[tuple[int, MarketType], dict[str, Any]] = {}

        # Game metadata: game_num -> {team, game_time, etc}
        self.games: dict[int, dict[str, Any]] = {}

    def _load_predictions(self) -> pd.DataFrame:
        """Load predictions."""
        if not self.predictions_path.exists():
            raise FileNotFoundError(
                f"Predictions not found: {self.predictions_path}\n"
                f"Run: uv run python scripts/predict_today.py"
            )
        return pd.read_csv(self.predictions_path)

    def get_prediction_for_team(
        self, team_name: str, market_type: MarketType
    ) -> dict[str, Any] | None:
        """Get prediction for team/game."""
        games_df = self.predictions[
            (self.predictions["home_team"] == team_name)
            | (self.predictions["away_team"] == team_name)
            | (self.predictions["favorite_team"] == team_name)
            | (self.predictions["underdog_team"] == team_name)
        ]

        if len(games_df) == 0:
            return None

        game = games_df.iloc[0]

        if market_type == MarketType.SPREAD:
            return {
                "favorite_team": game["favorite_team"],
                "spread_magnitude": game["spread_magnitude"],
                "favorite_cover_prob": game["favorite_cover_prob"],
                "spread_edge": game["spread_edge"],
            }
        elif market_type == MarketType.TOTAL:
            return {
                "total_points": game["total_points"],
                "over_prob": game["over_prob"],
                "total_edge": game["total_edge"],
            }
        return None

    def calculate_edge(self, model_prob: float, american_odds: int) -> float:
        """Calculate edge."""
        if american_odds < 0:
            implied_prob = abs(american_odds) / (abs(american_odds) + 100)
        else:
            implied_prob = 100 / (american_odds + 100)
        return model_prob - implied_prob

    def _get_market_label(self, change: Any) -> str:
        """Determine proper market label based on market type, period, and line value.

        Args:
            change: Line change object

        Returns:
            Market label string (e.g., "SPREAD", "1H TOTAL", "TEAM TOTAL")
        """
        market_type = change.market_type
        period = getattr(change, "period_number", 0)
        line_points = change.line_points

        # Period-based classification
        if period == 1:
            return "1H SPREAD" if market_type == MarketType.SPREAD else "1H TOTAL"
        elif period == 2:
            return "2H SPREAD" if market_type == MarketType.SPREAD else "2H TOTAL"

        # Full game - check for team totals based on line value
        if market_type == MarketType.SPREAD:
            if line_points and line_points > 50:
                return "TEAM TOTAL"
            return "SPREAD"
        elif market_type == MarketType.TOTAL:
            if line_points and (line_points < 110 or line_points > 210):
                return "TEAM TOTAL"
            return "TOTAL"
        elif market_type == MarketType.MONEYLINE:
            return "ML"

        return market_type.value

    def create_header(self) -> Panel:
        """Create header panel."""
        header_text = Text()
        header_text.append("LIVE LINE MONITOR", style="bold cyan")
        header_text.append(" | ", style="white")
        header_text.append(f"Games: {len(self.predictions)}", style="yellow")
        header_text.append(" | ", style="white")
        header_text.append(f"Changes: {self.total_changes}", style="green")
        header_text.append(" | ", style="white")
        header_text.append(f"Steam: {self.steam_count}", style="red")
        header_text.append(" | ", style="white")
        header_text.append(f"Value Alerts: {self.value_alerts}", style="magenta")
        header_text.append(" | ", style="white")
        header_text.append(f"Edge: {self.min_edge:.1%}+", style="blue")

        return Panel(
            header_text,
            border_style="cyan",
        )

    def create_recent_lines_table(self) -> Table:
        """Create table of recent line changes."""
        table = Table(title="Recent Line Movements", show_header=True, header_style="bold")
        table.add_column("Time", style="cyan", width=8)
        table.add_column("Team/Game", style="white", width=22)
        table.add_column("Market", style="yellow", width=8)
        table.add_column("Line", style="green", width=12)
        table.add_column("Odds", style="magenta", width=15)
        table.add_column("Steam", style="red", width=15)

        for line in reversed(self.recent_lines[-self.max_recent :]):
            time_str = line["time"]
            team = line["team"][:22] if len(line["team"]) > 22 else line["team"]
            market = line["market"]
            line_str = line["line"]

            # Format odds (both sides)
            odds_str = ""
            if "money1" in line and "money2" in line:
                m1 = line["money1"]
                m2 = line["money2"]
                if m1 and m2:
                    odds_str = f"{m1:+d}/{m2:+d}"

            steam_info = ""
            if line["is_steam"]:
                changed_by = line.get("changed_by", "AutoMover")
                steam_info = f"[S] {changed_by[:10]}"

            table.add_row(time_str, team, market, line_str, odds_str, steam_info)

        return table

    def create_value_table(self) -> Table:
        """Create table of value opportunities."""
        table = Table(title="Value Opportunities", show_header=True, header_style="bold green")
        table.add_column("Time", style="cyan", width=8)
        table.add_column("Game", style="white", width=30)
        table.add_column("Market", style="yellow", width=10)
        table.add_column("Side", style="green", width=12)
        table.add_column("Edge", style="magenta", width=8)

        for opp in reversed(self.value_opportunities[-10:]):
            table.add_row(
                opp["time"],
                opp["game"][:30],
                opp["market"],
                opp["side"],
                f"{opp['edge']:+.1%}",
            )

        if len(self.value_opportunities) == 0:
            table.add_row("-", "No value opportunities detected yet", "-", "-", "-")

        return table

    def create_predictions_table(self) -> Table:
        """Create table of top predictions."""
        table = Table(
            title="Today's Top Predictions",
            show_header=True,
            header_style="bold blue",
            caption="Spread = P(Favorite Covers) | Total = P(Over)",
            caption_style="dim italic",
        )
        table.add_column("Game", style="white", width=35)
        table.add_column("Spread", style="yellow", width=15)
        table.add_column("Total", style="green", width=15)

        # Show games with strongest predictions
        for _, game in self.predictions.head(8).iterrows():
            game_str = f"{game['away_team'][:15]} @ {game['home_team'][:15]}"
            spread_str = f"{game['favorite_cover_prob']:.0%}"
            total_str = f"O {game['over_prob']:.0%}"

            table.add_row(game_str, spread_str, total_str)

        return table

    def create_all_games_table(self) -> Table:
        """Create table showing all tracked games with current and opening odds."""
        table = Table(
            title="Live Games - Current vs Opening (Movement)",
            show_header=True,
            header_style="bold cyan",
        )
        table.add_column("Rot#", style="cyan", width=7)
        table.add_column("Team", style="white", width=16)
        table.add_column("Time", style="magenta", width=10)
        table.add_column("Spread", style="yellow", width=26)
        table.add_column("Total", style="green", width=26)

        if not self.games:
            table.add_row("-", "No games tracked yet", "-", "-", "-")
            return table

        # Show all tracked games sorted by game_num
        for game_num in sorted(self.games.keys()):
            game_info = self.games[game_num]
            team = game_info.get("team", f"Game {game_num}")

            # Get rotation numbers
            rot1 = game_info.get("team1_rot_num")
            rot2 = game_info.get("team2_rot_num")
            rot_str = f"{rot1}/{rot2}" if rot1 and rot2 else "-"

            # Get game time
            game_time = game_info.get("game_time")
            time_str = game_time.strftime("%I:%M %p") if game_time else "-"

            # Get current and opening for each market
            spread_key = (game_num, MarketType.SPREAD)
            total_key = (game_num, MarketType.TOTAL)

            # Format spread with both sides and movement
            spread_str = "-"
            if spread_key in self.current_lines:
                curr = self.current_lines[spread_key]
                open_line = self.opening_lines.get(spread_key)
                curr_pts = curr.get("line_points", 0) or 0
                curr_m1 = curr.get("money1", 0) or 0
                curr_m2 = curr.get("money2", 0) or 0

                # Current line
                spread_str = f"{curr_pts:+.1f} ({curr_m1:+d}/{curr_m2:+d})"

                # Show movement if we have opening line
                if open_line:
                    open_pts = open_line.get("line_points", 0) or 0
                    pts_diff = curr_pts - open_pts

                    if pts_diff != 0:
                        arrow = "↑" if pts_diff > 0 else "↓"
                        spread_str += f" {arrow}{abs(pts_diff):.1f}"
                    else:
                        spread_str += f" (open: {open_pts:+.1f})"

            # Format total with both sides and movement
            total_str = "-"
            if total_key in self.current_lines:
                curr = self.current_lines[total_key]
                open_line = self.opening_lines.get(total_key)
                curr_pts = curr.get("line_points", 0) or 0
                curr_m1 = curr.get("money1", 0) or 0
                curr_m2 = curr.get("money2", 0) or 0

                # Current line
                total_str = f"{curr_pts:.1f} (O:{curr_m1:+d}/U:{curr_m2:+d})"

                # Show movement if we have opening line
                if open_line:
                    open_pts = open_line.get("line_points", 0) or 0
                    pts_diff = curr_pts - open_pts

                    if pts_diff != 0:
                        arrow = "↑" if pts_diff > 0 else "↓"
                        total_str += f" {arrow}{abs(pts_diff):.1f}"
                    else:
                        total_str += f" (open: {open_pts:.1f})"

            table.add_row(
                rot_str,
                team[:16],
                time_str,
                spread_str,
                total_str,
            )

        return table

    def generate_layout(self) -> Layout:
        """Generate rich layout."""
        layout = Layout()

        layout.split_column(
            Layout(name="header", size=3),
            Layout(name="main"),
        )

        layout["header"].update(self.create_header())

        layout["main"].split_column(
            Layout(name="top", ratio=2),
            Layout(name="bottom", ratio=3),
        )

        # Top: All games table
        layout["top"].update(Panel(self.create_all_games_table()))

        # Bottom: Recent changes and value opportunities
        layout["bottom"].split_row(
            Layout(name="left", ratio=2),
            Layout(name="right", ratio=1),
        )

        layout["bottom"]["left"].split_column(
            Layout(name="recent", ratio=2),
            Layout(name="value", ratio=1),
        )

        layout["bottom"]["left"]["recent"].update(Panel(self.create_recent_lines_table()))
        layout["bottom"]["left"]["value"].update(Panel(self.create_value_table()))
        layout["bottom"]["right"].update(Panel(self.create_predictions_table()))

        return layout

    async def monitor(self, duration_seconds: int | None = None) -> None:
        """Start monitoring with Rich live display."""
        console.clear()
        console.print("[bold cyan]Starting Live Monitor...[/bold cyan]")
        console.print(f"Loaded predictions for {len(self.predictions)} games")
        console.print(f"Value threshold: {self.min_edge:.1%}\n")

        with Live(self.generate_layout(), refresh_per_second=2, console=console) as live:
            try:
                async with OvertimeSignalRClient() as client:
                    async for change in client.stream_line_changes(duration_seconds):
                        # Filter out team totals and derivatives
                        if change.line_points:
                            # Skip spreads > 50 (team totals misclassified as spreads)
                            if change.market_type == MarketType.SPREAD and change.line_points > 50:
                                continue

                            # Skip totals outside normal game total range (120-200)
                            # This filters: team totals (~70-90), 1H totals (~60-80), quarters, etc.
                            if change.market_type == MarketType.TOTAL and (
                                change.line_points < 110 or change.line_points > 210
                            ):
                                continue

                        self.total_changes += 1

                        if change.is_steam:
                            self.steam_count += 1

                        # Track game metadata
                        if change.game_num not in self.games:
                            self.games[change.game_num] = {
                                "team": change.team or f"Game {change.game_num}",
                                "game_time": change.game_time,
                                "team1_rot_num": change.team1_rot_num,
                                "team2_rot_num": change.team2_rot_num,
                            }

                        # Track opening and current lines
                        line_key = (change.game_num, change.market_type)
                        line_data = {
                            "line_points": change.line_points,
                            "money1": change.money1,
                            "money2": change.money2,
                            "timestamp": change.timestamp,
                        }

                        # Set opening line if first time seeing this game/market
                        if line_key not in self.opening_lines:
                            self.opening_lines[line_key] = line_data

                        # Always update current line
                        self.current_lines[line_key] = line_data

                        # Determine market display label
                        market_label = self._get_market_label(change)

                        # Add to recent lines
                        team_display = change.team or f"Game#{change.game_num}"
                        line_display = f"{change.line_points:+.1f}" if change.line_points else "ML"

                        self.recent_lines.append(
                            {
                                "time": datetime.now().strftime("%H:%M:%S"),
                                "team": team_display,
                                "market": market_label,
                                "line": line_display,
                                "money1": change.money1,
                                "money2": change.money2,
                                "is_steam": change.is_steam,
                                "changed_by": change.changed_by,
                            }
                        )

                        # Check for value
                        if change.team:
                            prediction = self.get_prediction_for_team(
                                change.team, change.market_type
                            )

                            if prediction:
                                edge = 0.0
                                side = ""
                                game_str = ""

                                if change.market_type == MarketType.SPREAD:
                                    if change.team == prediction["favorite_team"] and change.money1:
                                        edge = self.calculate_edge(
                                            prediction["favorite_cover_prob"],
                                            change.money1,
                                        )
                                        side = "Favorite"
                                    elif change.money2:
                                        edge = self.calculate_edge(
                                            1 - prediction["favorite_cover_prob"],
                                            change.money2,
                                        )
                                        side = "Underdog"
                                    game_str = f"{change.team} {change.line_points:+.1f}"

                                elif change.market_type == MarketType.TOTAL:
                                    if change.money1 and change.money2:
                                        over_edge = self.calculate_edge(
                                            prediction["over_prob"], change.money1
                                        )
                                        under_edge = self.calculate_edge(
                                            1 - prediction["over_prob"], change.money2
                                        )

                                        if abs(over_edge) > abs(under_edge):
                                            edge = over_edge
                                            side = "Over"
                                        else:
                                            edge = under_edge
                                            side = "Under"
                                        game_str = f"{change.team} {prediction['total_points']}"

                                # Value alert
                                if abs(edge) >= self.min_edge:
                                    self.value_alerts += 1
                                    self.value_opportunities.append(
                                        {
                                            "time": datetime.now().strftime("%H:%M:%S"),
                                            "game": game_str,
                                            "market": change.market_type.value,
                                            "side": side,
                                            "edge": edge,
                                        }
                                    )

                        # Update display
                        live.update(self.generate_layout())

            except ConfigurationError as e:
                console.print(f"[bold red]Error:[/bold red] {e}")
                console.print("Make sure Chrome and overtime.ag are running")
            except KeyboardInterrupt:
                console.print("\n[yellow]Monitoring stopped[/yellow]")

        # Final summary
        console.print("\n[bold cyan]Monitoring Summary[/bold cyan]")
        console.print(f"Total changes: {self.total_changes}")
        console.print(f"Steam moves: {self.steam_count}")
        console.print(f"Value alerts: {self.value_alerts}")


async def main_async(args: argparse.Namespace) -> None:
    """Async main."""
    target_date = date.fromisoformat(args.date) if args.date else date.today()
    predictions_path = (
        Path(args.predictions)
        if args.predictions
        else Path("predictions") / f"{target_date.isoformat()}.csv"
    )

    monitor = RichLineMonitor(
        predictions_path=predictions_path,
        min_edge=args.min_edge,
    )

    await monitor.monitor(duration_seconds=args.duration)


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Live monitor with Rich formatting")
    parser.add_argument("--date", type=str, default=None)
    parser.add_argument("--predictions", type=str, default=None)
    parser.add_argument("--duration", "-d", type=int, default=None)
    parser.add_argument("--min-edge", type=float, default=0.05)

    args = parser.parse_args()

    try:
        asyncio.run(main_async(args))
    except Exception as e:
        console.print(f"[bold red]Error:[/bold red] {e}", style="red")
        sys.exit(1)


if __name__ == "__main__":
    main()
