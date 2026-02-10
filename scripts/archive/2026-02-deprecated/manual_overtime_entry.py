"""Manual entry script for overtime.ag daily data.

Use this for quick manual data entry until full automation is implemented.

Usage:
    uv run python scripts/manual_overtime_entry.py
"""

import logging
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sports_betting_edge.adapters.overtime_scraper import OvertimeScraperAdapter
from sports_betting_edge.config.logging import configure_logging
from sports_betting_edge.core.tracking.overtime import (
    AccountBalance,
    DailyFigure,
    DailyFiguresSnapshot,
    OpenBet,
    OpenBetsSnapshot,
    OvertimeSnapshot,
)
from sports_betting_edge.services.overtime_tracker import OvertimeTrackerService

configure_logging()
logger = logging.getLogger(__name__)


def get_decimal_input(prompt: str) -> Decimal:
    """Get decimal input from user."""
    while True:
        try:
            value = input(prompt).strip().replace("$", "").replace(",", "")
            return Decimal(value)
        except Exception as e:
            print(f"Invalid input: {e}. Please try again.")


def get_int_input(prompt: str) -> int:
    """Get integer input from user."""
    while True:
        try:
            return int(input(prompt).strip())
        except Exception:
            print("Invalid input. Please enter a number.")


def manual_entry() -> OvertimeSnapshot:
    """Manually enter overtime.ag data."""
    print("\n" + "=" * 80)
    print("OVERTIME.AG MANUAL DATA ENTRY")
    print("=" * 80)
    print("")

    # Account Balance
    print("[1/3] ACCOUNT BALANCE")
    print("-" * 40)
    balance = get_decimal_input("Current Balance: $")
    credit_limit = get_decimal_input("Credit Limit: $")
    pending = get_decimal_input("Pending: $")
    available = get_decimal_input("Available Balance: $")
    casino = get_decimal_input("Casino Balance (press Enter for $0): $") or Decimal("0.00")

    account_balance = AccountBalance(
        balance=balance,
        credit_limit=credit_limit,
        pending=pending,
        available_balance=available,
        casino_balance=casino,
    )

    # Open Bets
    print("\n[2/3] OPEN BETS")
    print("-" * 40)
    num_bets = get_int_input("Number of open bets: ")

    bets = []
    for i in range(num_bets):
        print(f"\nBet #{i + 1}:")
        ticket = input("  Ticket Number: ").strip()
        bet_type = input("  Type (Spread/Total Points/Money Line): ").strip()
        details = input("  Details (full string): ").strip()
        risk = get_decimal_input("  Risk Amount: $")
        to_win = get_decimal_input("  To Win: $")

        bet = OpenBet(
            ticket_number=ticket,
            accepted_date=datetime.now(),  # Use current time
            bet_type=bet_type,
            details=details,
            risk_amount=risk,
            to_win_amount=to_win,
        )
        bets.append(bet)

    total_risk = sum(bet.risk_amount for bet in bets)
    total_to_win = sum(bet.to_win_amount for bet in bets)

    open_bets = OpenBetsSnapshot(
        bets=bets,
        total_risk=total_risk,
        total_to_win=total_to_win,
    )

    # Daily Figures - Current Week
    print("\n[3/3] DAILY FIGURES - CURRENT WEEK")
    print("-" * 40)
    starting_bal = get_decimal_input("Starting Balance: $")
    monday = get_decimal_input("Monday P&L: $")
    tuesday = get_decimal_input("Tuesday P&L (press Enter for $0): $") or Decimal("0.00")
    wednesday = get_decimal_input("Wednesday P&L (press Enter for $0): $") or Decimal("0.00")
    thursday = get_decimal_input("Thursday P&L (press Enter for $0): $") or Decimal("0.00")
    friday = get_decimal_input("Friday P&L (press Enter for $0): $") or Decimal("0.00")
    saturday = get_decimal_input("Saturday P&L (press Enter for $0): $") or Decimal("0.00")
    sunday = get_decimal_input("Sunday P&L (press Enter for $0): $") or Decimal("0.00")

    week_total = monday + tuesday + wednesday + thursday + friday + saturday + sunday
    payments = get_decimal_input("Payments (press Enter for $0): $") or Decimal("0.00")
    ending_bal = starting_bal + week_total + payments

    current_week = DailyFigure(
        date=datetime.now(),
        starting_balance=starting_bal,
        monday=monday,
        tuesday=tuesday,
        wednesday=wednesday,
        thursday=thursday,
        friday=friday,
        saturday=saturday,
        sunday=sunday,
        week_total=week_total,
        payments=payments,
        ending_balance=ending_bal,
    )

    # For simplicity, create empty last week data
    last_week = DailyFigure(
        date=datetime.now(),
        starting_balance=Decimal("0.00"),
        week_total=Decimal("0.00"),
        ending_balance=Decimal("0.00"),
    )

    daily_figures = DailyFiguresSnapshot(
        current_week=current_week,
        last_week=last_week,
        past_weeks=[],
    )

    # Create complete snapshot
    snapshot = OvertimeSnapshot(
        account_balance=account_balance,
        open_bets=open_bets,
        daily_figures=daily_figures,
    )

    return snapshot


def main():
    """Main execution function."""
    print("\nThis script allows you to manually enter overtime.ag data")
    print("and save it to parquet files for analysis.")
    print("\nPress Ctrl+C at any time to cancel.\n")

    try:
        snapshot = manual_entry()

        # Setup service
        project_root = Path(__file__).parent.parent
        data_dir = project_root / "data" / "overtime"

        # Note: OvertimeScraperAdapter is not needed for manual entry
        # We create a dummy adapter
        class DummyClient:
            pass

        scraper = OvertimeScraperAdapter(DummyClient())
        service = OvertimeTrackerService(scraper, data_dir)

        # Save snapshot
        print("\n" + "=" * 80)
        print("SAVING DATA...")
        print("=" * 80)

        saved_paths = asyncio.run(service.save_full_snapshot(snapshot))

        print("\n[OK] Data saved successfully!")
        print("\nFiles created:")
        for snap_type, path in saved_paths.items():
            print(f"  - {snap_type}: {path}")

        print("\n" + "=" * 80)
        print("SUMMARY")
        print("=" * 80)
        print(f"Account Balance: ${snapshot.account_balance.balance}")
        print(
            f"Open Bets: {len(snapshot.open_bets.bets)} ({snapshot.open_bets.total_risk} at risk)"
        )
        print(f"Week Total P&L: ${snapshot.daily_figures.current_week.week_total}")
        print("=" * 80)

    except KeyboardInterrupt:
        print("\n\n[CANCELLED] Data entry cancelled by user.")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Error during manual entry: {e}", exc_info=True)
        print(f"\n[ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    import asyncio

    main()
