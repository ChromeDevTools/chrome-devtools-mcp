"""Adapter for scraping overtime.ag betting data using chrome-devtools MCP."""

import logging
import re
from datetime import datetime
from decimal import Decimal
from typing import Any

from sports_betting_edge.core.tracking.overtime import (
    AccountBalance,
    DailyFigure,
    DailyFiguresSnapshot,
    OpenBet,
    OpenBetsSnapshot,
    OvertimeSnapshot,
)

logger = logging.getLogger(__name__)


class OvertimeScraperAdapter:
    """Adapter for scraping overtime.ag data via chrome-devtools MCP."""

    BASE_URL = "https://overtime.ag/sports#/"
    OPEN_BETS_URL = "https://overtime.ag/sports#/openBets"
    DAILY_FIGURES_URL = "https://overtime.ag/sports#/dailyFigures"

    def __init__(self, chrome_devtools_client: object) -> None:
        """Initialize the scraper with a chrome-devtools MCP client.

        Args:
            chrome_devtools_client: The MCP client for chrome-devtools operations
        """
        self.client = chrome_devtools_client

    def _parse_currency(self, value: str) -> Decimal:
        """Parse a currency string to Decimal.

        Args:
            value: Currency string like "$1,821.01" or "$-120.00"

        Returns:
            Decimal value
        """
        # Remove $ and commas, keep negative sign
        cleaned = value.replace("$", "").replace(",", "").strip()
        return Decimal(cleaned)

    def _parse_bet_details(self, details: str) -> dict[str, str | None]:
        """Parse bet details string into components.

        Args:
            details: String like "Basketball - 306513 Houston Christian +9½ -120 for Game"

        Returns:
            Dict with rotation_number, team, line, odds
        """
        # Pattern: "Sport - RotNum Team Line Odds for Game"
        pattern = r"^.*?-\s*(\d+)\s+(.+?)\s+([\+\-][\d½\.]+)\s+([\+\-]\d+)"
        match = re.search(pattern, details)

        if match:
            return {
                "rotation_number": match.group(1),
                "team": match.group(2).strip(),
                "line": match.group(3),
                "odds": match.group(4),
            }

        # For totals: "Basketball - 871 Syracuse/North Carolina over 158 -110 for Game"
        total_pattern = r"^.*?-\s*(\d+)\s+(.+?)\s+(over|under)\s+([\d\.]+)\s+([\+\-]\d+)"
        total_match = re.search(total_pattern, details)

        if total_match:
            return {
                "rotation_number": total_match.group(1),
                "team": total_match.group(2).strip(),
                "line": f"{total_match.group(3)} {total_match.group(4)}",
                "odds": total_match.group(5),
            }

        return {
            "rotation_number": None,
            "team": None,
            "line": None,
            "odds": None,
        }

    def _parse_date_time(self, date_str: str, time_str: str) -> datetime:
        """Parse date and time strings into datetime.

        Args:
            date_str: Date string like "MON 2/2"
            time_str: Time string like "7:17 PM"

        Returns:
            Datetime object (uses current year)
        """
        # Extract month and day from "MON 2/2"
        date_match = re.search(r"(\d+)/(\d+)", date_str)
        if not date_match:
            raise ValueError(f"Could not parse date: {date_str}")

        month = int(date_match.group(1))
        day = int(date_match.group(2))
        current_year = datetime.now().year

        # Parse time "7:17 PM"
        time_obj = datetime.strptime(time_str, "%I:%M %p")

        return datetime(
            current_year,
            month,
            day,
            time_obj.hour,
            time_obj.minute,
        )

    async def scrape_account_balance(self, snapshot_data: dict[str, str]) -> AccountBalance:
        """Extract account balance from menu snapshot data.

        Args:
            snapshot_data: Dict with balance, credit_limit, pending, etc.

        Returns:
            AccountBalance model
        """
        return AccountBalance(
            balance=self._parse_currency(snapshot_data["balance"]),
            credit_limit=self._parse_currency(snapshot_data["credit_limit"]),
            pending=self._parse_currency(snapshot_data["pending"]),
            available_balance=self._parse_currency(snapshot_data["available_balance"]),
            casino_balance=self._parse_currency(snapshot_data.get("casino_balance", "$0.00")),
        )

    async def scrape_open_bets(self, snapshot_data: list[dict[str, str]]) -> OpenBetsSnapshot:
        """Extract open bets from page snapshot data.

        Args:
            snapshot_data: List of dicts with bet information

        Returns:
            OpenBetsSnapshot model
        """
        bets: list[OpenBet] = []

        for bet_data in snapshot_data:
            # Parse date and time
            accepted_date = self._parse_date_time(bet_data["date"], bet_data["time"])

            # Parse bet details
            details_parsed = self._parse_bet_details(bet_data["details"])

            bet = OpenBet(
                ticket_number=bet_data["ticket_number"],
                accepted_date=accepted_date,
                bet_type=bet_data["bet_type"],
                details=bet_data["details"],
                rotation_number=details_parsed["rotation_number"],
                team=details_parsed["team"],
                line=details_parsed["line"],
                odds=details_parsed["odds"],
                risk_amount=self._parse_currency(bet_data["risk"]),
                to_win_amount=self._parse_currency(bet_data["to_win"]),
            )
            bets.append(bet)

        total_risk = sum(bet.risk_amount for bet in bets) or Decimal("0.00")
        total_to_win = sum(bet.to_win_amount for bet in bets) or Decimal("0.00")

        return OpenBetsSnapshot(
            bets=bets,
            total_risk=total_risk,
            total_to_win=total_to_win,
        )

    async def scrape_daily_figures(self, snapshot_data: dict[str, Any]) -> DailyFiguresSnapshot:
        """Extract daily figures from page snapshot data.

        Args:
            snapshot_data: Dict with current_week, last_week, past_weeks data

        Returns:
            DailyFiguresSnapshot model
        """

        def parse_week(week_data: dict[str, str]) -> DailyFigure:
            # Parse starting date "02/02/2026"
            date_obj = datetime.strptime(week_data["starting_date"], "%m/%d/%Y")

            return DailyFigure(
                date=date_obj,
                starting_balance=self._parse_currency(week_data["starting_balance"]),
                monday=self._parse_currency(week_data.get("monday", "$0.00")),
                tuesday=self._parse_currency(week_data.get("tuesday", "$0.00")),
                wednesday=self._parse_currency(week_data.get("wednesday", "$0.00")),
                thursday=self._parse_currency(week_data.get("thursday", "$0.00")),
                friday=self._parse_currency(week_data.get("friday", "$0.00")),
                saturday=self._parse_currency(week_data.get("saturday", "$0.00")),
                sunday=self._parse_currency(week_data.get("sunday", "$0.00")),
                week_total=self._parse_currency(week_data["week_total"]),
                payments=self._parse_currency(week_data.get("payments", "$0.00")),
                ending_balance=self._parse_currency(week_data["balance"]),
            )

        current_week = parse_week(snapshot_data["current_week"])
        last_week = parse_week(snapshot_data["last_week"])
        past_weeks = [parse_week(week) for week in snapshot_data.get("past_weeks", [])]

        return DailyFiguresSnapshot(
            current_week=current_week,
            last_week=last_week,
            past_weeks=past_weeks,
        )

    async def scrape_full_snapshot(
        self,
        balance_data: dict[str, str],
        open_bets_data: list[dict[str, str]],
        daily_figures_data: dict[str, dict[str, str]],
    ) -> OvertimeSnapshot:
        """Create a complete snapshot from all scraped data.

        Args:
            balance_data: Account balance information
            open_bets_data: Open bets information
            daily_figures_data: Daily figures information

        Returns:
            Complete OvertimeSnapshot
        """
        account_balance = await self.scrape_account_balance(balance_data)
        open_bets = await self.scrape_open_bets(open_bets_data)
        daily_figures = await self.scrape_daily_figures(daily_figures_data)

        return OvertimeSnapshot(
            account_balance=account_balance,
            open_bets=open_bets,
            daily_figures=daily_figures,
        )
