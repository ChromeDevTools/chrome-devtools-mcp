"""Save overtime.ag snapshot from JSON data.

This script takes JSON data (extracted manually or via browser automation)
and saves it to parquet files.

Usage:
    uv run python scripts/save_overtime_snapshot.py <json_file>

Example JSON structure:
{
    "account_balance": {
        "balance": "1821.01",
        "credit_limit": "10000.00",
        "pending": "800.00",
        "available_balance": "11021.01",
        "casino_balance": "0.00"
    },
    "open_bets": [
        {
            "ticket_number": "133002387-1",
            "date": "MON 2/2",
            "time": "7:17 PM",
            "bet_type": "Spread",
            "details": "Basketball - 306513 Houston Christian +9½ -120 for Game",
            "risk": "120.00",
            "to_win": "100.00"
        }
    ],
    "daily_figures": {
        "current_week": {
            "starting_date": "02/02/2026",
            "starting_balance": "1941.01",
            "monday": "-120.00",
            "tuesday": "0.00",
            "wednesday": "0.00",
            "thursday": "0.00",
            "friday": "0.00",
            "saturday": "0.00",
            "sunday": "0.00",
            "week_total": "-120.00",
            "payments": "0.00",
            "balance": "1821.01"
        },
        "last_week": { ... }
    }
}
"""

import asyncio
import json
import logging
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sports_betting_edge.adapters.overtime_scraper import OvertimeScraperAdapter
from sports_betting_edge.config.logging import configure_logging
from sports_betting_edge.services.overtime_tracker import OvertimeTrackerService

configure_logging()
logger = logging.getLogger(__name__)


async def main():
    """Main execution function."""
    if len(sys.argv) < 2:
        print("Usage: uv run python scripts/save_overtime_snapshot.py <json_file>")
        print("\nExample:")
        print("  uv run python scripts/save_overtime_snapshot.py data/overtime_snapshot.json")
        sys.exit(1)

    json_file = Path(sys.argv[1])

    if not json_file.exists():
        print(f"[ERROR] File not found: {json_file}")
        sys.exit(1)

    logger.info(f"Loading data from {json_file}")

    with open(json_file) as f:
        data = json.load(f)

    # Setup service
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "data" / "overtime"

    class DummyClient:
        pass

    scraper = OvertimeScraperAdapter(DummyClient())
    service = OvertimeTrackerService(scraper, data_dir)

    # Parse the JSON data using the scraper adapter
    logger.info("Parsing data...")

    balance_data = {
        "balance": f"${data['account_balance']['balance']}",
        "credit_limit": f"${data['account_balance']['credit_limit']}",
        "pending": f"${data['account_balance']['pending']}",
        "available_balance": f"${data['account_balance']['available_balance']}",
        "casino_balance": f"${data['account_balance'].get('casino_balance', '0.00')}",
    }

    open_bets_data = data.get("open_bets", [])
    daily_figures_data = data.get("daily_figures", {})

    # Create snapshot
    snapshot = await scraper.scrape_full_snapshot(
        balance_data,
        open_bets_data,
        daily_figures_data,
    )

    # Save snapshot
    logger.info("Saving to parquet files...")
    saved_paths = await service.save_full_snapshot(snapshot)

    print("\n" + "=" * 80)
    print("[OK] SNAPSHOT SAVED SUCCESSFULLY")
    print("=" * 80)
    print(f"\nAccount Balance: ${snapshot.account_balance.balance}")
    print(f"Open Bets: {len(snapshot.open_bets.bets)} totaling ${snapshot.open_bets.total_risk}")
    print(f"Current Week P&L: ${snapshot.daily_figures.current_week.week_total}")
    print("\nFiles saved:")
    for snap_type, path in saved_paths.items():
        print(f"  - {snap_type}: {path}")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
