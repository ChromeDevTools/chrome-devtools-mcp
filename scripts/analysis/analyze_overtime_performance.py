"""Analyze overtime.ag betting performance.

This script loads saved parquet data and generates performance reports.

Usage:
    uv run python scripts/analyze_overtime_performance.py
"""

import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.config.logging import configure_logging

configure_logging()

pd.set_option("display.max_columns", None)
pd.set_option("display.width", None)
pd.set_option("display.max_colwidth", 50)


def load_latest_data(data_dir: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Load the most recent data files.

    Returns:
        Tuple of (account_df, bets_df, figures_df)
    """
    account_files = sorted((data_dir / "account_balance").glob("*.parquet"))
    bets_files = sorted((data_dir / "open_bets").glob("*.parquet"))
    figures_files = sorted((data_dir / "daily_figures").glob("*.parquet"))

    account_df = read_parquet_df(str(account_files[-1])) if account_files else pd.DataFrame()
    bets_df = read_parquet_df(str(bets_files[-1])) if bets_files else pd.DataFrame()
    figures_df = read_parquet_df(str(figures_files[-1])) if figures_files else pd.DataFrame()

    return account_df, bets_df, figures_df


def print_section(title: str):
    """Print a section header."""
    print("\n" + "=" * 80)
    print(title.center(80))
    print("=" * 80 + "\n")


def analyze_account(account_df: pd.DataFrame):
    """Analyze account balance."""
    if account_df.empty:
        print("[WARNING] No account data found")
        return

    latest = account_df.iloc[-1]

    print(f"Current Balance:      ${latest['balance']:,.2f}")
    print(f"Credit Limit:         ${latest['credit_limit']:,.2f}")
    print(f"Pending Bets:         ${latest['pending']:,.2f}")
    print(f"Available Balance:    ${latest['available_balance']:,.2f}")
    print(f"Casino Balance:       ${latest['casino_balance']:,.2f}")

    # Calculate utilization
    utilization = (latest["pending"] / latest["available_balance"]) * 100
    print(f"\nBankroll Utilization: {utilization:.1f}%")

    if utilization > 20:
        print("[WARNING] High bankroll utilization - consider reducing exposure")


def analyze_open_bets(bets_df: pd.DataFrame):
    """Analyze open bets."""
    if bets_df.empty:
        print("[INFO] No open bets")
        return

    print(f"Total Open Bets: {len(bets_df)}")
    print(f"Total at Risk:   ${bets_df['risk_amount'].sum():,.2f}")
    print(f"Potential Win:   ${bets_df['to_win_amount'].sum():,.2f}")

    # Breakdown by bet type
    print("\nBet Type Breakdown:")
    type_summary = bets_df.groupby("bet_type").agg(
        {
            "risk_amount": ["count", "sum"],
            "to_win_amount": "sum",
        }
    )
    print(type_summary)

    # Show individual bets
    print("\nOpen Bets Details:")
    display_cols = ["team", "line", "odds", "risk_amount", "to_win_amount"]
    available_cols = [col for col in display_cols if col in bets_df.columns]

    if available_cols:
        print(bets_df[available_cols].to_string(index=False))
    else:
        print(
            bets_df[["bet_type", "details", "risk_amount", "to_win_amount"]].to_string(index=False)
        )


def analyze_performance(figures_df: pd.DataFrame):
    """Analyze betting performance."""
    if figures_df.empty:
        print("[WARNING] No performance data found")
        return

    # Sort by date descending
    figures_df["date"] = pd.to_datetime(figures_df["date"])
    figures_df = figures_df.sort_values("date", ascending=False)

    # Current week analysis
    current_week = figures_df[figures_df["period"] == "current_week"].iloc[0]
    print("Current Week:")
    print(f"  Starting Balance: ${current_week['starting_balance']:,.2f}")
    print(f"  Week Total P&L:   ${current_week['week_total']:,.2f}")
    print(f"  Ending Balance:   ${current_week['ending_balance']:,.2f}")

    if current_week["starting_balance"] != 0:
        roi = (current_week["week_total"] / abs(current_week["starting_balance"])) * 100
        print(f"  ROI:              {roi:+.2f}%")

    # Last week analysis
    last_week_data = figures_df[figures_df["period"] == "last_week"]
    if not last_week_data.empty:
        last_week = last_week_data.iloc[0]
        print("\nLast Week:")
        print(f"  Week Total P&L:   ${last_week['week_total']:,.2f}")
        print(f"  Ending Balance:   ${last_week['ending_balance']:,.2f}")

        if last_week["starting_balance"] != 0:
            roi = (last_week["week_total"] / abs(last_week["starting_balance"])) * 100
            print(f"  ROI:              {roi:+.2f}%")

    # Overall performance
    past_weeks = figures_df[figures_df["period"] == "past_week"]
    if not past_weeks.empty:
        print(f"\nHistorical Performance ({len(past_weeks)} weeks):")
        total_pnl = past_weeks["week_total"].sum()
        avg_weekly = past_weeks["week_total"].mean()
        win_rate = (past_weeks["week_total"] > 0).sum() / len(past_weeks) * 100

        print(f"  Total P&L:        ${total_pnl:,.2f}")
        print(f"  Avg Weekly P&L:   ${avg_weekly:,.2f}")
        print(f"  Win Rate:         {win_rate:.1f}%")

        # Best and worst weeks
        best_week = past_weeks.loc[past_weeks["week_total"].idxmax()]
        worst_week = past_weeks.loc[past_weeks["week_total"].idxmin()]

        print(f"\n  Best Week:        ${best_week['week_total']:,.2f} ({best_week['date'].date()})")
        print(f"  Worst Week:       ${worst_week['week_total']:,.2f} ({worst_week['date'].date()})")


def generate_recommendations(
    account_df: pd.DataFrame, bets_df: pd.DataFrame, figures_df: pd.DataFrame
):
    """Generate betting recommendations based on performance."""
    print_section("RECOMMENDATIONS")

    if account_df.empty or figures_df.empty:
        print("[INFO] Insufficient data for recommendations")
        return

    latest_account = account_df.iloc[-1]
    current_week = figures_df[figures_df["period"] == "current_week"].iloc[0]

    # Check current week performance
    if current_week["week_total"] < 0:
        loss_pct = (current_week["week_total"] / abs(current_week["starting_balance"])) * 100
        if loss_pct < -10:
            print("[ALERT] Current week down >10% - consider reducing unit size")

    # Check pending exposure
    if not bets_df.empty:
        pending_ratio = latest_account["pending"] / latest_account["available_balance"]
        if pending_ratio > 0.25:
            print("[ALERT] High pending exposure (>25% of bankroll) - avoid adding more bets")

    # Check recent trend
    past_weeks = figures_df[figures_df["period"] == "past_week"]
    if len(past_weeks) >= 3:
        recent_three = past_weeks.head(3)["week_total"]
        if (recent_three < 0).all():
            print("[ALERT] Three consecutive losing weeks - review betting strategy")

    # Positive indicators
    last_week = figures_df[figures_df["period"] == "last_week"]
    if not last_week.empty and last_week.iloc[0]["week_total"] > 0:
        print("[OK] Positive momentum from last week")

    print("\n[TIP] Focus on Closing Line Value (CLV) rather than win rate")
    print("[TIP] Track line movements to validate model predictions")


def main():
    """Main execution function."""
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "data" / "overtime"

    if not data_dir.exists():
        print(f"[ERROR] Data directory not found: {data_dir}")
        print("Run the snapshot script first to collect data")
        return

    print_section("OVERTIME.AG PERFORMANCE ANALYSIS")
    print(f"Data Directory: {data_dir}")
    print(f"Analysis Date:  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Load data
    account_df, bets_df, figures_df = load_latest_data(data_dir)

    # Account analysis
    print_section("ACCOUNT STATUS")
    analyze_account(account_df)

    # Open bets analysis
    print_section("OPEN BETS")
    analyze_open_bets(bets_df)

    # Performance analysis
    print_section("PERFORMANCE ANALYSIS")
    analyze_performance(figures_df)

    # Recommendations
    generate_recommendations(account_df, bets_df, figures_df)

    print("\n" + "=" * 80)


if __name__ == "__main__":
    main()
