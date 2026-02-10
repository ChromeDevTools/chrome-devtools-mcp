#!/usr/bin/env python3
"""Live line movement monitor using overtime.ag data.

Tracks all games from overtime.ag parquet files and highlights movements.
"""

import json
import logging
import time
from datetime import datetime
from glob import glob
from pathlib import Path

import pandas as pd
from rich.console import Console
from rich.live import Live
from rich.table import Table
from rich.text import Text

# Configuration
OVERTIME_DATA_DIR = Path("data/raw")
REFRESH_INTERVAL = 15  # seconds
STEAM_THRESHOLD = 1.0  # Point movement to highlight as "steam"
EDGE_THRESHOLD = 3.5  # KenPom edge to highlight
LOG_DIR = Path("data/logs")

# Setup logging
LOG_DIR.mkdir(parents=True, exist_ok=True)
log_file = LOG_DIR / f"line_movements_overtime_{datetime.now().date().isoformat()}.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[logging.FileHandler(log_file, mode="a")],
)
logger = logging.getLogger(__name__)


class OvertimeLineMonitor:
    """Monitor overtime.ag line movements."""

    def __init__(self):
        self.console = Console()
        self.previous_lines: dict[str, dict] = {}
        self.kenpom_edges: dict[str, float] = {}
        self.load_kenpom_edges()

    def log_movement(
        self,
        game_id: str,
        away_team: str,
        home_team: str,
        game_time: str,
        market_type: str,
        old_value: float,
        new_value: float,
        movement: float,
        kenpom_edge: float = 0.0,
    ):
        """Log a line movement event to file."""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "game_id": game_id,
            "game": f"{away_team} @ {home_team}",
            "game_time": game_time,
            "market_type": market_type,
            "old_value": old_value,
            "new_value": new_value,
            "movement": movement,
            "is_steam": abs(movement) >= STEAM_THRESHOLD,
            "kenpom_edge": kenpom_edge,
            "is_edge_opportunity": kenpom_edge >= EDGE_THRESHOLD,
            "book": "overtime.ag",
        }
        logger.info(json.dumps(log_entry))

    def load_kenpom_edges(self):
        """Load KenPom edges from today's analysis."""
        today = datetime.now().date().isoformat()
        edges_path = Path(f"data/analysis/edge_analysis_{today}.csv")

        if edges_path.exists():
            df = pd.read_csv(edges_path)
            for _, row in df.iterrows():
                # Create multiple key formats for matching
                key1 = f"{row['away_team']}@{row['home_team']}"
                key2 = f"{row['away_team']} @ {row['home_team']}"
                edge = row.get("abs_discrepancy", 0)
                self.kenpom_edges[key1] = edge
                self.kenpom_edges[key2] = edge

    def get_latest_overtime_data(self) -> pd.DataFrame | None:
        """Get latest overtime.ag data from parquet files."""
        # Find latest parquet file
        pattern = str(OVERTIME_DATA_DIR / "overtime_lines_*.parquet")
        files = sorted(glob(pattern), reverse=True)

        if not files:
            return None

        # Load most recent file
        df = pd.read_parquet(files[0])

        # Filter to NCAAB and today's games
        if "sport" in df.columns:
            df = df[df["sport"].str.contains("Basketball", case=False, na=False)]

        return df

    def calculate_movements(self, current: pd.DataFrame) -> dict[str, dict]:
        """Calculate line movements from previous snapshot."""
        movements = {}

        for game_id in current["game_id"].unique():
            game_data = current[current["game_id"] == game_id].iloc[0]

            if game_id not in self.previous_lines:
                continue

            prev = self.previous_lines[game_id]
            game_movements = {}

            # Get game info for logging
            away_team = game_data.get("away_team", "Unknown")
            home_team = game_data.get("home_team", "Unknown")
            game_time = game_data.get("game_time", "")
            game_key = f"{away_team}@{home_team}"
            kenpom_edge = self.kenpom_edges.get(game_key, 0.0)

            # Check spread movement
            if "home_spread" in game_data and "home_spread" in prev:
                current_spread = game_data["home_spread"]
                prev_spread = prev["home_spread"]

                if pd.notna(current_spread) and pd.notna(prev_spread):
                    old_value = float(prev_spread)
                    new_value = float(current_spread)
                    movement = new_value - old_value

                    # Log all movements (not just steam)
                    if movement != 0:
                        self.log_movement(
                            game_id=game_id,
                            away_team=away_team,
                            home_team=home_team,
                            game_time=str(game_time),
                            market_type="spread",
                            old_value=old_value,
                            new_value=new_value,
                            movement=movement,
                            kenpom_edge=kenpom_edge,
                        )

                    # Track steam for display
                    if abs(movement) >= STEAM_THRESHOLD:
                        game_movements["spread"] = movement

            # Check total movement
            if "total" in game_data and "total" in prev:
                current_total = game_data["total"]
                prev_total = prev["total"]

                if pd.notna(current_total) and pd.notna(prev_total):
                    old_value = float(prev_total)
                    new_value = float(current_total)
                    movement = new_value - old_value

                    # Log all movements (not just steam)
                    if movement != 0:
                        self.log_movement(
                            game_id=game_id,
                            away_team=away_team,
                            home_team=home_team,
                            game_time=str(game_time),
                            market_type="total",
                            old_value=old_value,
                            new_value=new_value,
                            movement=movement,
                            kenpom_edge=kenpom_edge,
                        )

                    # Track steam for display
                    if abs(movement) >= STEAM_THRESHOLD:
                        game_movements["total"] = movement

            if game_movements:
                movements[game_id] = game_movements

        return movements

    def store_current_lines(self, current: pd.DataFrame):
        """Store current lines for movement tracking."""
        for game_id in current["game_id"].unique():
            game_data = current[current["game_id"] == game_id].iloc[0]

            self.previous_lines[game_id] = {
                "home_spread": game_data.get("home_spread"),
                "total": game_data.get("total"),
            }

    def create_display_table(self, games: pd.DataFrame, movements: dict[str, dict]) -> Table:
        """Create rich table for display."""
        timestamp = datetime.now().strftime("%I:%M:%S %p")
        table = Table(
            title=f"[bold]LIVE LINE MONITOR - overtime.ag[/bold] - {timestamp}",
            show_header=True,
            header_style="bold cyan",
            title_style="bold cyan",
        )

        table.add_column("Time", style="dim", width=8)
        table.add_column("Game", width=40)
        table.add_column("Spread", justify="right", width=15)
        table.add_column("Move", justify="center", width=8)
        table.add_column("Total", justify="right", width=12)
        table.add_column("Move", justify="center", width=8)
        table.add_column("Edge", justify="right", width=8)

        for _, game in games.iterrows():
            game_id = game["game_id"]
            away_team = game.get("away_team", "Unknown")
            home_team = game.get("home_team", "Unknown")

            # Get game time
            game_time = game.get("game_time", "")
            if isinstance(game_time, str) and game_time:
                try:
                    dt = pd.to_datetime(game_time)
                    time_str = dt.strftime("%I:%M %p")
                except (ValueError, TypeError):
                    time_str = game_time[:8] if len(game_time) >= 8 else game_time
            else:
                time_str = "N/A"

            # Get KenPom edge
            game_key = f"{away_team}@{home_team}"
            kp_edge = self.kenpom_edges.get(game_key, 0)

            # Format spread
            home_spread = game.get("home_spread")
            home_juice = game.get("home_spread_juice")
            spread_str = "N/A"
            if pd.notna(home_spread) and pd.notna(home_juice):
                spread_str = f"{home_spread:+.1f} ({home_juice:+.0f})"
            elif pd.notna(home_spread):
                spread_str = f"{home_spread:+.1f}"

            # Format total
            total = game.get("total")
            over_juice = game.get("over_juice")
            total_str = "N/A"
            if pd.notna(total) and pd.notna(over_juice):
                total_str = f"{total:.1f} ({over_juice:+.0f})"
            elif pd.notna(total):
                total_str = f"{total:.1f}"

            # Check movements
            spread_move = ""
            total_move = ""
            if game_id in movements:
                mvts = movements[game_id]
                if "spread" in mvts:
                    move = mvts["spread"]
                    spread_move = Text(
                        f"{move:+.1f}",
                        style="bold red" if abs(move) >= 2 else "yellow",
                    )
                if "total" in mvts:
                    move = mvts["total"]
                    total_move = Text(
                        f"{move:+.1f}",
                        style="bold red" if abs(move) >= 2 else "yellow",
                    )

            # Format edge
            edge_str = ""
            edge_style = "white"
            if kp_edge >= 7:
                edge_str = f"{kp_edge:.1f}"
                edge_style = "bold green"
            elif kp_edge >= EDGE_THRESHOLD:
                edge_str = f"{kp_edge:.1f}"
                edge_style = "green"

            # Add row
            game_str = f"{away_team}\n@ {home_team}"
            table.add_row(
                time_str,
                game_str,
                spread_str,
                spread_move or "-",
                total_str,
                total_move or "-",
                Text(edge_str, style=edge_style) if edge_str else "-",
            )

        return table

    def run(self):
        """Run live monitor."""
        self.console.print("\n[bold cyan]Starting Live Line Monitor - overtime.ag[/bold cyan]")
        self.console.print(f"Refresh interval: {REFRESH_INTERVAL}s")
        self.console.print(f"Steam threshold: {STEAM_THRESHOLD} points")
        self.console.print(f"Edge threshold: {EDGE_THRESHOLD}+ points")
        self.console.print(f"KenPom edges loaded: {len(self.kenpom_edges) // 2} games")
        self.console.print(f"Logging to: {log_file}\n")

        # Log monitoring session start
        logger.info(
            json.dumps(
                {
                    "timestamp": datetime.now().isoformat(),
                    "event": "monitor_started",
                    "config": {
                        "refresh_interval": REFRESH_INTERVAL,
                        "steam_threshold": STEAM_THRESHOLD,
                        "edge_threshold": EDGE_THRESHOLD,
                        "book": "overtime.ag",
                    },
                }
            )
        )

        with Live(console=self.console, refresh_per_second=1) as live:
            while True:
                try:
                    # Get current lines
                    current = self.get_latest_overtime_data()

                    if current is None or len(current) == 0:
                        live.update(
                            Text(
                                "No overtime.ag data found - check collection is running",
                                style="yellow",
                            )
                        )
                        time.sleep(REFRESH_INTERVAL)
                        continue

                    # Calculate movements
                    movements = self.calculate_movements(current)

                    # Create display
                    table = self.create_display_table(current, movements)

                    # Add legend and stats
                    legend = Text("\n")
                    legend.append("Legend: ", style="dim")
                    legend.append("GREEN", style="bold green")
                    legend.append(" = KenPom edge | ", style="dim")
                    legend.append("RED/YELLOW", style="bold red")
                    legend.append(" = Line movement | ", style="dim")

                    if movements:
                        legend.append(f"\n{len(movements)} STEAM MOVES DETECTED", style="bold red")

                    # Update display
                    live.update(table)
                    live.console.print(legend)

                    # Store for next iteration
                    self.store_current_lines(current)

                    # Wait
                    time.sleep(REFRESH_INTERVAL)

                except KeyboardInterrupt:
                    self.console.print("\n[yellow]Shutting down monitor...[/yellow]")
                    break
                except Exception as e:
                    self.console.print(f"[red]Error: {e}[/red]")
                    time.sleep(REFRESH_INTERVAL)


def main():
    """Main entry point."""
    monitor = OvertimeLineMonitor()
    monitor.run()


if __name__ == "__main__":
    main()
