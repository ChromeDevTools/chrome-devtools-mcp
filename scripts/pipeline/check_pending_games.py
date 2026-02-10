"""
Quick check for pending games that need results entered.

Shows which games still need scores and summary of tracked performance.
"""

import logging
from datetime import datetime
from pathlib import Path

from betting_tracker import BettingTracker

logger = logging.getLogger(__name__)


def main() -> None:
    """Check pending games and show progress."""
    import argparse

    parser = argparse.ArgumentParser(description="Check pending games and tracking progress")
    parser.add_argument(
        "--predictions",
        type=Path,
        help="Path to predictions CSV (default: today's file)",
    )
    parser.add_argument(
        "--unit-size",
        type=float,
        default=100.0,
        help="Dollar value of 1 unit",
    )

    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    # Find predictions file
    if args.predictions:
        predictions_path = args.predictions
    else:
        # Look for today's predictions
        today_str = datetime.now().strftime("%Y-%m-%d")
        predictions_path = Path(f"data/analysis/combined_predictions_{today_str}.csv")

        if not predictions_path.exists():
            print(f"[ERROR] No predictions file found for today ({today_str})")
            print("  Run: uv run python scripts/deploy_today_predictions.py")
            return

    # Initialize tracker
    tracker = BettingTracker(predictions_path, unit_size=args.unit_size)

    # Get pending games
    pending = tracker.get_pending_games()
    total_games = len(tracker.predictions_df)
    graded_games = total_games - len(pending)

    print("\n" + "=" * 70)
    print("BETTING TRACKER STATUS")
    print("=" * 70)
    print(f"File: {predictions_path.name}")
    print(f"Total Games: {total_games}")
    print(f"Graded: {graded_games}")
    print(f"Pending: {len(pending)}")
    print()

    if len(pending) > 0:
        print("-" * 70)
        print("PENDING GAMES")
        print("-" * 70)
        for _, game in pending.iterrows():
            print(f"  {game['Game_Time']}: {game['Away_Team']} @ {game['Home_Team']}")
        print()
        print("[INFO] To enter results:")
        print("  uv run python scripts/enter_results.py --show-summary")
    else:
        print("[OK] All games have been graded!")

    # Show summary if we have any results
    if graded_games > 0:
        print()
        tracker.print_summary()
    else:
        print("\n[INFO] No games graded yet - enter results to see summary")

    print("=" * 70)


if __name__ == "__main__":
    main()
