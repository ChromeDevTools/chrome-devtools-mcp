"""Monitor live Overtime.ag line movements with ML predictions.

Combines real-time SignalR line streaming with XGBoost model predictions to identify
value betting opportunities. Displays side-by-side comparison of market lines vs
model predictions, highlighting edges.

Prerequisites:
    1. Chrome with remote debugging:
       chrome.exe --remote-debugging-port=9222 \
           --user-data-dir=%USERPROFILE%\.chrome-profiles\overtime-ag

    2. overtime.ag logged in and navigated to College Basketball

    3. Today's odds collected:
       uv run python scripts/collect_daily_data.py

Usage:
    # Monitor with today's predictions
    uv run python scripts/monitor_live_lines.py

    # Generate predictions first, then monitor
    uv run python scripts/predict_today.py && \
        uv run python scripts/monitor_live_lines.py

    # Monitor for specific duration (1 hour)
    uv run python scripts/monitor_live_lines.py --duration 3600

    # Custom minimum edge threshold (10%)
    uv run python scripts/monitor_live_lines.py --min-edge 0.10

Output:
    Live terminal display showing:
    - Line movements as they happen
    - Model predictions for each game
    - Edge calculation (model prob - market prob)
    - Value alerts when edge exceeds threshold
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from sports_betting_edge.adapters.overtime_ag import (  # noqa: E402
    OvertimeSignalRClient,
)
from sports_betting_edge.core.exceptions import ConfigurationError  # noqa: E402
from sports_betting_edge.core.models import MarketType  # noqa: E402

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


class LiveLineMonitor:
    """Monitors live lines and compares with model predictions."""

    def __init__(
        self,
        predictions_path: Path,
        min_edge: float = 0.05,
        team_mapper: dict[str, str] | None = None,
    ):
        """Initialize the monitor.

        Args:
            predictions_path: Path to today's predictions CSV
            min_edge: Minimum edge to trigger value alert (default: 5%)
            team_mapper: Overtime team name -> predictions team name mapping
        """
        self.predictions_path = predictions_path
        self.min_edge = min_edge
        self.team_mapper = team_mapper or {}

        # Load predictions
        self.predictions = self._load_predictions()

        # Track line history
        self.line_history: dict[int, list[dict[str, Any]]] = defaultdict(list)
        self.steam_count: dict[int, int] = defaultdict(int)
        self.total_changes = 0
        self.value_alerts = 0

    def _load_predictions(self) -> pd.DataFrame:
        """Load today's predictions.

        Returns:
            Predictions DataFrame

        Raises:
            FileNotFoundError: If predictions file doesn't exist
        """
        if not self.predictions_path.exists():
            raise FileNotFoundError(
                f"Predictions not found: {self.predictions_path}\n"
                f"Run: uv run python scripts/predict_today.py"
            )

        df = pd.read_csv(self.predictions_path)
        logger.info(f"Loaded predictions for {len(df)} games")

        # Display summary
        logger.info("\n" + "=" * 80)
        logger.info("TODAY'S PREDICTIONS LOADED")
        logger.info("=" * 80)

        for _, game in df.iterrows():
            logger.info(
                f"{game['away_team']} @ {game['home_team']} | "
                f"Spread: {game['favorite_team']} -{game['spread_magnitude']} "
                f"(Fav: {game['favorite_cover_prob']:.1%}) | "
                f"Total: {game['total_points']} (Over: {game['over_prob']:.1%})"
            )

        logger.info("=" * 80 + "\n")

        return df

    def get_prediction_for_team(
        self, team_name: str, market_type: MarketType
    ) -> dict[str, Any] | None:
        """Get prediction for a specific team/game.

        Args:
            team_name: Team name from Overtime.ag
            market_type: SPREAD, TOTAL, or MONEYLINE

        Returns:
            Prediction dict or None if not found
        """
        # Map Overtime team name to predictions team name
        mapped_name = self.team_mapper.get(team_name, team_name)

        # Find game involving this team
        game = self.predictions[
            (self.predictions["home_team"] == mapped_name)
            | (self.predictions["away_team"] == mapped_name)
            | (self.predictions["favorite_team"] == mapped_name)
            | (self.predictions["underdog_team"] == mapped_name)
        ]

        if len(game) == 0:
            return None

        game = game.iloc[0]

        if market_type == MarketType.SPREAD:
            return {
                "favorite_team": game["favorite_team"],
                "underdog_team": game["underdog_team"],
                "spread_magnitude": game["spread_magnitude"],
                "favorite_cover_prob": game["favorite_cover_prob"],
                "underdog_cover_prob": game["underdog_cover_prob"],
                "spread_edge": game["spread_edge"],
            }
        elif market_type == MarketType.TOTAL:
            return {
                "home_team": game["home_team"],
                "away_team": game["away_team"],
                "total_points": game["total_points"],
                "over_prob": game["over_prob"],
                "under_prob": game["under_prob"],
                "total_edge": game["total_edge"],
            }

        return None

    def calculate_edge(
        self,
        model_prob: float,
        american_odds: int,
    ) -> float:
        """Calculate edge (model prob - implied prob).

        Args:
            model_prob: Model probability (0-1)
            american_odds: American odds (e.g., -110, +150)

        Returns:
            Edge as decimal (e.g., 0.05 = 5% edge)
        """
        # Convert American odds to implied probability
        if american_odds < 0:
            implied_prob = abs(american_odds) / (abs(american_odds) + 100)
        else:
            implied_prob = 100 / (american_odds + 100)

        # Edge = model probability - implied probability
        return model_prob - implied_prob

    def format_line_change(self, change: dict[str, Any]) -> str:
        """Format line change for display.

        Args:
            change: Line change data

        Returns:
            Formatted string
        """
        team = change.get("team", f"Game#{change['game_num']}")
        market = change["market_type"].value
        line = change.get("line_points")
        line_display = f"{line:+.1f}" if line else "ML"
        steam_flag = " [STEAM]" if change.get("is_steam") else ""

        return f"{team} {market} {line_display}{steam_flag}"

    async def monitor(self, duration_seconds: int | None = None) -> None:
        """Start monitoring live lines.

        Args:
            duration_seconds: How long to monitor (None = indefinite)
        """
        logger.info("=" * 80)
        logger.info("LIVE LINE MONITORING STARTED")
        logger.info("=" * 80)
        logger.info(f"Duration: {duration_seconds}s" if duration_seconds else "Indefinite")
        logger.info(f"Value alert threshold: {self.min_edge:.1%}")
        logger.info("=" * 80 + "\n")

        try:
            async with OvertimeSignalRClient() as client:
                logger.info("[OK] Connected to Overtime.ag SignalR stream\n")

                async for change in client.stream_line_changes(duration_seconds):
                    # Filter out team totals and derivatives
                    if change.line_points:
                        # Skip spreads > 50 (team totals misclassified as spreads)
                        if change.market_type == MarketType.SPREAD and change.line_points > 50:
                            continue

                        # Skip totals outside normal game total range (110-210)
                        # This filters: team totals (~70-90), 1H totals (~60-80), quarters, etc.
                        if change.market_type == MarketType.TOTAL and (
                            change.line_points < 110 or change.line_points > 210
                        ):
                            continue

                    self.total_changes += 1
                    game_num = change.game_num

                    # Track steam moves
                    if change.is_steam:
                        self.steam_count[game_num] += 1

                    # Store in history
                    self.line_history[game_num].append(
                        {
                            "timestamp": change.timestamp,
                            "market_type": change.market_type,
                            "line_points": change.line_points,
                            "side_role": change.side_role,
                            "money1": change.money1,
                            "money2": change.money2,
                            "is_steam": change.is_steam,
                        }
                    )

                    # Display line change
                    line_str = self.format_line_change(change.model_dump())
                    logger.info(f"[LINE] {line_str}")

                    # Check for predictions and calculate edge
                    if change.team:
                        prediction = self.get_prediction_for_team(change.team, change.market_type)

                        if prediction:
                            # Calculate edge based on market type
                            if change.market_type == MarketType.SPREAD:
                                if change.team == prediction["favorite_team"]:
                                    model_prob = prediction["favorite_cover_prob"]
                                    odds = change.money1  # Favorite odds
                                else:
                                    model_prob = prediction["underdog_cover_prob"]
                                    odds = change.money2  # Underdog odds

                                edge = self.calculate_edge(model_prob, odds)

                                logger.info(
                                    f"  [MODEL] Fav cover prob: "
                                    f"{prediction['favorite_cover_prob']:.1%} | "
                                    f"Edge: {edge:+.1%}"
                                )

                                # Value alert
                                if abs(edge) >= self.min_edge:
                                    self.value_alerts += 1
                                    side = "FAVORITE" if edge > 0 else "UNDERDOG"
                                    logger.info(
                                        f"  [VALUE] ** {side} EDGE DETECTED: {edge:+.1%} **"
                                    )

                            elif change.market_type == MarketType.TOTAL:
                                # Determine if this is over or under side
                                # For totals, money1 is typically over, money2 is under
                                over_prob = prediction["over_prob"]
                                under_prob = prediction["under_prob"]

                                over_edge = self.calculate_edge(over_prob, change.money1)
                                under_edge = self.calculate_edge(under_prob, change.money2)

                                logger.info(
                                    f"  [MODEL] Over: {over_prob:.1%} "
                                    f"(edge: {over_edge:+.1%}) | "
                                    f"Under: {under_prob:.1%} (edge: {under_edge:+.1%})"
                                )

                                # Value alert for best edge
                                max_edge = max(abs(over_edge), abs(under_edge))
                                if max_edge >= self.min_edge:
                                    self.value_alerts += 1
                                    side = "OVER" if abs(over_edge) > abs(under_edge) else "UNDER"
                                    edge_val = over_edge if side == "OVER" else under_edge
                                    logger.info(
                                        f"  [VALUE] ** {side} EDGE DETECTED: {edge_val:+.1%} **"
                                    )

                    logger.info("")  # Blank line for readability

        except ConfigurationError as e:
            logger.error(f"Configuration error: {e}")
            logger.error(
                "Make sure Chrome is running with remote debugging and overtime.ag tab is open"
            )
            raise
        except KeyboardInterrupt:
            logger.info("\n\nMonitoring stopped by user")
        except Exception as e:
            logger.exception(f"Monitoring error: {e}")
            raise

        # Display summary
        logger.info("\n" + "=" * 80)
        logger.info("MONITORING SUMMARY")
        logger.info("=" * 80)
        logger.info(f"Total line changes: {self.total_changes}")
        logger.info(f"Games tracked: {len(self.line_history)}")
        logger.info(f"Steam moves: {sum(self.steam_count.values())}")
        logger.info(f"Value alerts: {self.value_alerts}")
        logger.info("=" * 80)


async def main_async(args: argparse.Namespace) -> None:
    """Async main function."""
    # Determine predictions path
    target_date = date.fromisoformat(args.date) if args.date else date.today()
    predictions_dir = Path(args.predictions_dir)

    if args.predictions:
        predictions_path = Path(args.predictions)
    else:
        predictions_path = predictions_dir / f"{target_date.isoformat()}.csv"

    # Create monitor
    monitor = LiveLineMonitor(
        predictions_path=predictions_path,
        min_edge=args.min_edge,
    )

    # Start monitoring
    await monitor.monitor(duration_seconds=args.duration)


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Monitor live Overtime.ag lines with ML predictions"
    )
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Target date for predictions (YYYY-MM-DD, default: today)",
    )
    parser.add_argument(
        "--predictions",
        type=str,
        default=None,
        help="Path to predictions CSV (default: data/outputs/predictions/YYYY-MM-DD.csv)",
    )
    parser.add_argument(
        "--predictions-dir",
        type=Path,
        default=Path("data/outputs/predictions"),
        help="Directory containing predictions (default: data/outputs/predictions/)",
    )
    parser.add_argument(
        "--duration",
        "-d",
        type=int,
        default=None,
        help="Monitoring duration in seconds (default: indefinite)",
    )
    parser.add_argument(
        "--min-edge",
        type=float,
        default=0.05,
        help="Minimum edge for value alerts (default: 0.05 = 5%%)",
    )

    args = parser.parse_args()

    try:
        asyncio.run(main_async(args))
    except ConfigurationError:
        logger.error("Configuration error - check Chrome and overtime.ag setup")
        sys.exit(1)
    except FileNotFoundError as e:
        logger.error(str(e))
        sys.exit(1)
    except Exception as e:
        logger.exception(f"Monitor failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
