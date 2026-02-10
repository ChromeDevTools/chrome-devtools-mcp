"""
Demo script showing betting tracker functionality with sample results.

This demonstrates the full workflow with fictional game scores.
"""

import logging
from pathlib import Path

from betting_tracker import BettingTracker

logger = logging.getLogger(__name__)


def main() -> None:
    """Run demo with sample results."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    print("\n" + "=" * 70)
    print("BETTING TRACKER DEMO")
    print("=" * 70)

    # Initialize tracker
    predictions_path = Path("data/analysis/combined_predictions_2026-02-03.csv")
    tracker = BettingTracker(predictions_path, unit_size=100.0)

    print("\n[INFO] Loaded predictions. Adding sample results...\n")

    # Add some sample results (fictional scores for demo purposes)
    sample_results = [
        ("Miami Ohio", "Buffalo", 72, 85),  # Buffalo wins by 13
        ("Akron", "Eastern Michigan", 68, 82),  # EMU wins by 14
        ("Canisius", "Niagara", 75, 71),  # Canisius wins by 4
        ("Xavier", "Connecticut", 65, 88),  # UConn wins by 23
        ("Boston College", "Duke", 58, 92),  # Duke wins by 34
    ]

    for away, home, away_score, home_score in sample_results:
        tracker.add_game_result(away, home, away_score, home_score)

    print("\n" + "-" * 70)
    print("SAMPLE RESULTS ANALYSIS")
    print("-" * 70)

    # Show summary
    tracker.print_summary()

    # Save tracked results
    output_path = tracker.save_results()
    print(f"\n[OK] Demo results saved to {output_path}")

    print("\n[INFO] To continue tracking:")
    print("  1. Use enter_results.py for interactive entry")
    print("  2. Or create CSV with scores and use --import-csv")
    print("  3. Run betting_dashboard.py for detailed analytics")


if __name__ == "__main__":
    main()
