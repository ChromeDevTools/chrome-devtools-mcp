"""
Overtime.ag Sports Betting Data Scraper

Demonstrates two approaches for scraping overtime.ag:
1. REST API - Simple HTTP requests to get current odds
2. WebSocket - Real-time updates via SignalR

SignalR Hub Details (discovered via chrome-devtools MCP server):
- Hub name: "gbshub" (lowercase in connection, gbsHub in proxy)
- Available methods: subscribeSport, subscribeSports, getGame, getGameLines, etc.
- Subscription format: { SportType, SportSubType, Store, Type }
- Type: 1 = sport updates, 2 = contest updates
"""

import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
import pandas as pd
import websockets

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Data storage paths
DATA_DIR = Path("data/overtime_ag")
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
LIVE_UPDATES_DIR = DATA_DIR / "live_updates"


def ensure_data_dirs() -> None:
    """Create data directories if they don't exist."""
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    LIVE_UPDATES_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Data directories ready: {DATA_DIR}")


def save_snapshot(data: dict[str, Any], sport_type: str, sport_subtype: str) -> Path:
    """Save REST API snapshot to Parquet."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    game_lines = data.get("GameLines", [])

    if not game_lines:
        logger.warning("No game lines to save")
        return None

    # Convert to DataFrame
    df = pd.DataFrame(game_lines)

    # Add metadata columns
    df["captured_at"] = datetime.now()
    df["sport_type"] = sport_type
    df["sport_subtype"] = sport_subtype
    df["source"] = "overtime_ag_rest"

    # Save to Parquet
    filename = f"{sport_subtype.replace(' ', '_')}_{timestamp}.parquet"
    filepath = SNAPSHOTS_DIR / filename
    df.to_parquet(filepath, index=False)

    logger.info(f"Saved {len(df)} games to {filepath}")
    return filepath


class LiveUpdateWriter:
    """Handles writing live updates to JSONL file for a session."""

    def __init__(self) -> None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"live_updates_{timestamp}.jsonl"
        self.filepath = LIVE_UPDATES_DIR / filename
        self.update_count = 0

    def write(self, update: dict[str, Any], sport_type: str, sport_subtype: str) -> None:
        """Append update to JSONL file."""
        # Add metadata
        update["captured_at"] = datetime.now().isoformat()
        update["sport_type"] = sport_type
        update["sport_subtype"] = sport_subtype
        update["source"] = "overtime_ag_websocket"

        # Append to JSONL
        with open(self.filepath, "a") as f:
            f.write(json.dumps(update) + "\n")

        self.update_count += 1
        logger.debug(f"Appended update #{self.update_count} to {self.filepath}")


class OvertimeAgRESTScraper:
    """Scraper using REST API endpoints."""

    BASE_URL = "https://www.overtime.ag"
    API_BASE = f"{BASE_URL}/sports/Api"

    def __init__(self) -> None:
        self.client = httpx.AsyncClient(
            headers={
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                "Origin": self.BASE_URL,
                "Referer": f"{self.BASE_URL}/sports",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }
        )

    async def get_sport_offering(
        self,
        sport_type: str,
        sport_subtype: str,
        wager_type: str = "Straight Bet",
    ) -> dict[str, Any]:
        """
        Get current odds for a sport.

        Args:
            sport_type: Sport category (e.g., "Basketball", "Football")
            sport_subtype: Specific league (e.g., "College Basketball", "NFL")
            wager_type: Type of wager (default: "Straight Bet")

        Returns:
            Dictionary containing game lines and odds data
        """
        url = f"{self.API_BASE}/Offering.asmx/GetSportOffering"

        payload = {
            "sportType": sport_type,
            "sportSubType": sport_subtype,
            "wagerType": wager_type,
            "hoursAdjustment": 0,
            "periodNumber": None,
            "gameNum": None,
            "parentGameNum": None,
            "teaserName": "",
            "requestMode": None,
        }

        logger.info(f"Fetching {sport_type} - {sport_subtype} odds...")
        response = await self.client.post(url, json=payload)
        response.raise_for_status()

        data = response.json()
        return data.get("d", {}).get("Data", {})

    async def get_available_sports(self) -> list[dict[str, Any]]:
        """Get list of available sports."""
        url = f"{self.API_BASE}/Offering.asmx/GetSports"
        response = await self.client.post(url, json={})
        response.raise_for_status()
        return response.json().get("d", {}).get("Data", [])

    async def close(self) -> None:
        """Close HTTP client."""
        await self.client.aclose()


class OvertimeAgWebSocketScraper:
    """Scraper using SignalR WebSocket for real-time updates."""

    SIGNALR_BASE = "https://ws.ticosports.com/signalr"
    WS_BASE = "wss://ws.ticosports.com/signalr"

    def __init__(self) -> None:
        self.connection_token: str | None = None
        self.connection_id: str | None = None
        self.client = httpx.AsyncClient(
            headers={
                "Accept": "text/plain, */*; q=0.01",
                "Origin": "https://www.overtime.ag",
                "Referer": "https://www.overtime.ag/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            }
        )

    async def negotiate(self) -> dict[str, Any]:
        """Negotiate SignalR connection and get connection token."""
        url = f"{self.SIGNALR_BASE}/negotiate"
        params = {
            "clientProtocol": "1.5",
            "connectionData": '[{"name":"gbshub"}]',
            "_": str(int(datetime.now().timestamp() * 1000)),
        }

        logger.info("Negotiating SignalR connection...")
        response = await self.client.get(url, params=params)
        response.raise_for_status()

        data = response.json()
        self.connection_token = data["ConnectionToken"]
        self.connection_id = data["ConnectionId"]

        logger.info(f"Connection ID: {self.connection_id}")
        return data

    async def start_connection(self) -> dict[str, Any]:
        """Start SignalR connection."""
        if not self.connection_token:
            raise ValueError("Must call negotiate() first")

        url = f"{self.SIGNALR_BASE}/start"
        params = {
            "transport": "webSockets",
            "clientProtocol": "1.5",
            "connectionToken": self.connection_token,
            "connectionData": '[{"name":"gbshub"}]',
            "_": str(int(datetime.now().timestamp() * 1000)),
        }

        logger.info("Starting SignalR connection...")
        response = await self.client.get(url, params=params)
        response.raise_for_status()

        return response.json()

    async def connect_websocket(
        self, subscriptions: list[dict[str, Any]], writer: LiveUpdateWriter
    ) -> dict[str, int]:
        """
        Connect to WebSocket and listen for real-time updates.

        Args:
            subscriptions: List of subscription dicts with SportType, SportSubType, etc.
            writer: LiveUpdateWriter instance for saving updates

        Returns:
            Dict with message and update counts
        """
        if not self.connection_token:
            raise ValueError("Must call negotiate() and start_connection() first")

        # Properly URL-encode parameters
        connection_data = '[{"name":"gbshub"}]'
        ws_url = (
            f"{self.WS_BASE}/connect"
            f"?transport=webSockets"
            f"&clientProtocol=1.5"
            f"&connectionToken={quote(self.connection_token, safe='')}"
            f"&connectionData={quote(connection_data, safe='')}"
            f"&tid=7"
        )

        logger.info("Connecting to WebSocket...")
        logger.debug(f"WebSocket URL: {ws_url}")

        # Add headers that SignalR expects
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Origin": "https://www.overtime.ag",
        }

        async with websockets.connect(ws_url, additional_headers=headers) as websocket:
            logger.info("WebSocket connected! Listening for updates...")

            # Subscribe to multiple basketball categories
            # Format: subscribeSport({ SportType, SportSubType, Store, Type })
            subscriptions = [
                {
                    "SportType": "Basketball",
                    "SportSubType": "College Basketball",
                    "Store": "",
                    "Type": 1,
                },
                {
                    "SportType": "Basketball",
                    "SportSubType": "College Extra",
                    "Store": "",
                    "Type": 1,
                },
            ]

            # Send subscription requests
            for idx, sub in enumerate(subscriptions, start=1):
                subscribe_msg = json.dumps(
                    {"H": "gbshub", "M": "subscribeSport", "A": [sub], "I": idx}
                )
                await websocket.send(subscribe_msg)
                logger.info(f"Sent subscription request for {sub['SportSubType']}...")
                await asyncio.sleep(0.2)  # Small delay between subscriptions

            # Wait for subscription confirmations
            await asyncio.sleep(1)

            # Listen for messages
            message_count = 0
            odds_updates = 0
            subscriptions_confirmed = set()

            async for message in websocket:
                message_count += 1

                # Parse message
                try:
                    data = json.loads(message)

                    # Check for subscription confirmation
                    if "I" in data and "E" not in data and data.get("I") in ["1", "2"]:
                        sub_id = data["I"]
                        subscriptions_confirmed.add(sub_id)
                        logger.info(f"✓ Subscription {sub_id} confirmed!")
                        if len(subscriptions_confirmed) == len(subscriptions):
                            logger.info("All subscriptions active. Waiting for odds updates...")
                        continue

                    # Check for errors
                    if "E" in data:
                        logger.error(f"SignalR Error: {data['E']}")
                        continue

                    # Check for SignalR hub messages (odds updates)
                    if "M" in data and data["M"]:
                        odds_updates += 1
                        logger.info(f"\n[Odds Update {odds_updates}]")
                        for msg in data["M"]:
                            hub_method = msg.get("M")
                            hub_data = msg.get("A", [])

                            logger.info(f"  Hub: {msg.get('H')}, Method: {hub_method}")
                            logger.info(f"  Data: {json.dumps(hub_data, indent=4)}")

                            # Save update to storage
                            update_record = {
                                "hub": msg.get("H"),
                                "method": hub_method,
                                "data": hub_data,
                                "raw_message": data,
                            }
                            # Save with first subscription's metadata (could be enhanced)
                            writer.write(
                                update_record,
                                subscriptions[0]["SportType"],
                                subscriptions[0]["SportSubType"],
                            )

                    # Log keepalive messages quietly
                    elif data == {}:
                        logger.debug(f"[Keepalive {message_count}]")

                    # Log connection messages
                    elif "C" in data:
                        logger.debug(f"[Connection message: {data.get('C')}]")

                    # Unknown message format
                    else:
                        logger.info(f"\n[Message {message_count}] {json.dumps(data, indent=2)}")

                except json.JSONDecodeError:
                    logger.warning(f"Could not parse as JSON: {message[:200]}...")

            # Return stats
            return {"messages": message_count, "odds_updates": odds_updates}

    async def close(self) -> None:
        """Close HTTP client."""
        await self.client.aclose()


async def demo_rest_scraper() -> None:
    """Demonstrate REST API scraping."""
    scraper = OvertimeAgRESTScraper()

    try:
        # Get College Basketball odds
        sport_type = "Basketball"
        sport_subtype = "College Basketball"
        ncaa_data = await scraper.get_sport_offering(
            sport_type=sport_type,
            sport_subtype=sport_subtype,
        )

        game_lines = ncaa_data.get("GameLines", [])
        logger.info(f"\n{'=' * 80}")
        logger.info(f"Found {len(game_lines)} College Basketball games")
        logger.info(f"{'=' * 80}\n")

        # Save snapshot to Parquet
        filepath = save_snapshot(ncaa_data, sport_type, sport_subtype)

        # Display first game as example
        if game_lines:
            game = game_lines[0]
            logger.info(f"Game: {game['Team1ID']} @ {game['Team2ID']}")
            logger.info(f"Time: {game['GameDateTimeString']}")
            logger.info(f"Spread: {game['Team1ID']} {game['Spread1']} ({game['SpreadAdj1']})")
            logger.info(f"        {game['Team2ID']} {game['Spread2']} ({game['SpreadAdj2']})")
            logger.info(f"Moneyline: {game['Team1ID']} {game['MoneyLine1']}")
            logger.info(f"           {game['Team2ID']} {game['MoneyLine2']}")
            logger.info(
                f"Total: {game['TotalPoints']} (O/U: {game['TtlPtsAdj1']}/{game['TtlPtsAdj2']})"
            )
            logger.info(f"Rotation: {game['Team1RotNum']} / {game['Team2RotNum']}")

        if filepath:
            logger.info(f"\n[OK] Snapshot saved: {filepath}")

    finally:
        await scraper.close()


async def demo_websocket_scraper(duration_seconds: int = 300) -> None:
    """
    Demonstrate WebSocket scraping.

    Args:
        duration_seconds: How long to listen for updates
    """
    scraper = OvertimeAgWebSocketScraper()
    stats = {"messages": 0, "odds_updates": 0}

    # Define subscriptions
    subscriptions = [
        {"SportType": "Basketball", "SportSubType": "College Basketball", "Store": "", "Type": 1},
        {"SportType": "Basketball", "SportSubType": "College Extra", "Store": "", "Type": 1},
    ]

    # Create writer for this session
    writer = LiveUpdateWriter()
    logger.info(f"Live updates will be saved to: {writer.filepath}")

    try:
        # Establish connection
        await scraper.negotiate()
        await scraper.start_connection()

        # Listen for updates with timeout
        try:
            stats = await asyncio.wait_for(
                scraper.connect_websocket(subscriptions, writer),
                timeout=duration_seconds,
            )
        except TimeoutError:
            logger.info(f"\n{'=' * 80}")
            logger.info(f"Stopped after {duration_seconds} seconds")
            logger.info(f"Messages received: {stats['messages']}")
            logger.info(f"Odds updates: {stats['odds_updates']}")
            if stats["odds_updates"] == 0:
                logger.info("(No odds changed during monitoring period)")
            else:
                logger.info(f"[OK] Updates saved to {LIVE_UPDATES_DIR}")
            logger.info(f"{'=' * 80}")

    finally:
        await scraper.close()


async def main() -> None:
    """Run both scrapers."""
    # Initialize data storage
    ensure_data_dirs()

    logger.info("=" * 80)
    logger.info("Overtime.ag Scraper Demo")
    logger.info("=" * 80)

    # Demo 1: REST API
    logger.info("\n1. REST API Scraper")
    logger.info("-" * 80)
    await demo_rest_scraper()

    # Demo 2: WebSocket (5 minutes to catch live updates)
    logger.info("\n\n2. WebSocket Scraper (Real-time updates)")
    logger.info("-" * 80)
    await demo_websocket_scraper(duration_seconds=300)


if __name__ == "__main__":
    asyncio.run(main())
