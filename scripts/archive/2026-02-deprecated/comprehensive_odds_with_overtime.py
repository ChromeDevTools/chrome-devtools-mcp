"""Comprehensive odds report with overtime.ag comparison.

Compares:
- KenPom FanMatch predictions
- Odds API bookmakers (DraftKings, FanDuel, BetMGM)
- Overtime.ag live odds (from SignalR stream)
"""

import re
import sqlite3
from datetime import datetime
from pathlib import Path

import pandas as pd


def parse_overtime_log(log_file: Path) -> dict[str, dict[str, dict]]:
    """Parse overtime.ag log file for latest odds by team/market.

    Returns:
        Dict mapping (team, market) -> {line, money1, money2, timestamp}
    """
    if not log_file.exists():
        return {}

    current_lines = {}

    with open(log_file) as f:
        for line in f:
            if "|" not in line or "Monitor" in line or "Game#" in line:
                continue

            parts = [p.strip() for p in line.split("|")]
            if len(parts) < 5:
                continue

            timestamp = parts[0]
            team = parts[1]
            market = parts[2]
            line_val = parts[3]
            odds = parts[4]

            # Parse odds (format: money1/money2)
            odds_match = re.search(r"(-?\d+)/(-?\d+)", odds)
            if odds_match:
                money1 = int(odds_match.group(1))
                money2 = int(odds_match.group(2))
            else:
                money1 = None
                money2 = None

            # Store latest line for each team/market combo
            key = (team, market)
            current_lines[key] = {
                "timestamp": timestamp,
                "line": line_val,
                "money1": money1,
                "money2": money2,
            }

    return current_lines


def match_overtime_team(overtime_team: str, away_team: str, home_team: str) -> tuple[bool, str]:
    """Match overtime.ag team name to prediction team names.

    Returns:
        (is_match, matched_team_name)
    """
    # Try various matching strategies
    overtime_lower = overtime_team.lower()
    away_lower = away_team.lower()
    home_lower = home_team.lower()

    # Exact match
    if overtime_lower in away_lower or away_lower in overtime_lower:
        return True, away_team
    if overtime_lower in home_lower or home_lower in overtime_lower:
        return True, home_team

    # Word-level matching (handle "North Carolina" vs "UNC")
    overtime_words = set(overtime_lower.split())
    away_words = set(away_lower.split())
    home_words = set(home_lower.split())

    if overtime_words & away_words:
        return True, away_team
    if overtime_words & home_words:
        return True, home_team

    return False, ""


print("=" * 120)
print(
    f"COMPREHENSIVE ODDS & PREDICTIONS REPORT - "
    f"{datetime.now().strftime('%A, %B %d, %Y - %I:%M %p')}"
)
print("=" * 120)

# Load predictions (includes KenPom data)
print("\n[1/4] Loading predictions with KenPom data...")
preds = pd.read_csv("data/outputs/predictions/2026-02-02.csv")
print(f"      Loaded {len(preds)} games")

# Load odds from database
print("[2/4] Loading latest odds from all bookmakers...")
conn = sqlite3.connect("data/odds_api/odds_api.sqlite3")

# Get today's events
events = pd.read_sql(
    """
    SELECT event_id, home_team, away_team, commence_time
    FROM events
    WHERE DATE(commence_time) >= '2026-02-02'
    ORDER BY commence_time
""",
    conn,
)

# Get latest observations for all markets
if len(events) > 0:
    event_ids = "','".join(events["event_id"].tolist())

    # Get latest odds (most recent update per event/book/market/outcome)
    latest_odds = pd.read_sql(
        f"""
        SELECT
            event_id,
            book_key,
            market_key,
            outcome_name,
            point,
            price_american,
            MAX(book_last_update) as last_update
        FROM observations
        WHERE event_id IN ('{event_ids}')
        GROUP BY event_id, book_key, market_key, outcome_name
    """,
        conn,
    )

    print(f"      Loaded {len(latest_odds)} odds observations")
else:
    latest_odds = pd.DataFrame()

conn.close()

# Parse overtime.ag log
print("[3/4] Parsing overtime.ag log file...")
log_file = Path("data/logs/line_movements_2026-02-02.log")
overtime_lines = parse_overtime_log(log_file)
print(f"      Found {len(overtime_lines)} overtime.ag line entries")

print("[4/4] Generating comprehensive report...\n")

# Generate report
print("=" * 120)
print("TODAY'S GAMES - COMPLETE ODDS & PREDICTIONS")
print("=" * 120)

for idx, pred_game in preds.iterrows():
    away = pred_game["away_team"]
    home = pred_game["home_team"]
    tip_time = pred_game["commence_time"]

    print(f"\n{'=' * 120}")
    print(f"GAME #{idx + 1}: {away} @ {home}")
    print(f"Tip-off: {tip_time}")
    print(f"{'=' * 120}")

    # Match to odds database event
    matching_event = events[
        (
            (events["away_team"].str.contains(away.split()[0], case=False, na=False))
            & (events["home_team"].str.contains(home.split()[0], case=False, na=False))
        )
        | (
            (events["home_team"].str.contains(away.split()[0], case=False, na=False))
            & (events["away_team"].str.contains(home.split()[0], case=False, na=False))
        )
    ]

    # KENPOM PREDICTIONS
    print("\nKENPOM PREDICTIONS:")
    print(
        f"  Favorite: {pred_game['favorite_team'][:35]:35} "
        f"Spread: {pred_game['spread_magnitude']:+.1f}"
    )
    print(f"  Underdog: {pred_game['underdog_team'][:35]:35}")
    print(f"  Total: {pred_game['total_points']:.1f}")
    print(
        f"  Model Probabilities: Favorite Cover: {pred_game['favorite_cover_prob']:.1%} "
        f"| Over: {pred_game['over_prob']:.1%}"
    )

    # VALUE INDICATORS
    spread_edge = pred_game["spread_edge"]
    total_edge = pred_game["total_edge"]

    value_str = ""
    if abs(spread_edge) >= 0.05:
        side = "Favorite" if spread_edge > 0 else "Underdog"
        value_str += f"  [VALUE] Spread {side}: {spread_edge:+.1%} edge | "
    if abs(total_edge) >= 0.05:
        side = "Over" if total_edge > 0 else "Under"
        value_str += f"[VALUE] Total {side}: {total_edge:+.1%} edge"

    if value_str:
        print(f"\n{value_str}")

    # BOOKMAKER ODDS
    print("\nBOOKMAKER ODDS:")

    has_any_odds = False

    if len(matching_event) > 0:
        event_id = matching_event.iloc[0]["event_id"]
        event_odds = latest_odds[latest_odds["event_id"] == event_id]

        if len(event_odds) > 0:
            has_any_odds = True

            # Show odds for major books
            for book in ["draftkings", "fanduel", "betmgm"]:
                book_odds = event_odds[event_odds["book_key"] == book]

                if len(book_odds) == 0:
                    continue

                print(f"\n  {book.upper()}:")

                # SPREAD
                spread_odds = book_odds[book_odds["market_key"] == "spreads"]
                if len(spread_odds) >= 2:
                    home_spread = spread_odds[
                        spread_odds["outcome_name"] == matching_event.iloc[0]["home_team"]
                    ]
                    away_spread = spread_odds[
                        spread_odds["outcome_name"] == matching_event.iloc[0]["away_team"]
                    ]

                    if len(home_spread) > 0 and len(away_spread) > 0:
                        h_line = home_spread.iloc[0]["point"]
                        h_price = home_spread.iloc[0]["price_american"]
                        a_line = away_spread.iloc[0]["point"]
                        a_price = away_spread.iloc[0]["price_american"]

                        print(
                            f"    Spread: {home[:20]:20} {h_line:+.1f} ({h_price:+d}) | "
                            f"{away[:20]:20} {a_line:+.1f} ({a_price:+d})"
                        )

                # MONEYLINE
                ml_odds = book_odds[book_odds["market_key"] == "h2h"]
                if len(ml_odds) >= 2:
                    home_ml = ml_odds[
                        ml_odds["outcome_name"] == matching_event.iloc[0]["home_team"]
                    ]
                    away_ml = ml_odds[
                        ml_odds["outcome_name"] == matching_event.iloc[0]["away_team"]
                    ]

                    if len(home_ml) > 0 and len(away_ml) > 0:
                        h_ml = home_ml.iloc[0]["price_american"]
                        a_ml = away_ml.iloc[0]["price_american"]

                        print(
                            f"    Moneyline: {home[:20]:20} {h_ml:+5d}     | "
                            f"{away[:20]:20} {a_ml:+5d}"
                        )

                # TOTAL
                total_odds = book_odds[book_odds["market_key"] == "totals"]
                if len(total_odds) >= 2:
                    over = total_odds[total_odds["outcome_name"] == "Over"]
                    under = total_odds[total_odds["outcome_name"] == "Under"]

                    if len(over) > 0 and len(under) > 0:
                        total_line = over.iloc[0]["point"]
                        over_price = over.iloc[0]["price_american"]
                        under_price = under.iloc[0]["price_american"]

                        print(
                            f"    Total: O {total_line:.1f} ({over_price:+d}) | "
                            f"U {total_line:.1f} ({under_price:+d})"
                        )

    # OVERTIME.AG ODDS
    # Try to find overtime.ag lines for this game
    overtime_spread = None
    overtime_total = None
    overtime_ml = None

    for (team, market), data in overtime_lines.items():
        is_match, matched_team = match_overtime_team(team, away, home)

        if not is_match:
            continue

        if market == "SPREAD":
            overtime_spread = (team, data)
        elif market == "TOTAL":
            overtime_total = (team, data)
        elif market == "MONEYLINE":
            overtime_ml = (team, data)

    # Display overtime.ag odds if found
    if overtime_spread or overtime_total or overtime_ml:
        has_any_odds = True
        print("\n  OVERTIME.AG:")

        if overtime_spread:
            team, data = overtime_spread
            line = data["line"]
            odds = f"{data['money1']:+d}/{data['money2']:+d}" if data["money1"] else "N/A"
            print(f"    Spread: {team[:20]:20} {line} ({odds})")

        if overtime_ml:
            team, data = overtime_ml
            odds = f"{data['money1']:+d}/{data['money2']:+d}" if data["money1"] else "N/A"
            print(f"    Moneyline: {team[:20]:20} {odds}")

        if overtime_total:
            team, data = overtime_total
            line = data["line"]
            odds = f"O:{data['money1']:+d}/U:{data['money2']:+d}" if data["money1"] else "N/A"
            print(f"    Total: {line} ({odds})")

    if not has_any_odds:
        print("\n  [No bookmaker odds available yet]")

print("\n" + "=" * 120)
print("SUMMARY")
print("=" * 120)
print(f"Total games: {len(preds)}")
print(
    f"Games with 5%+ edge: "
    f"{len(preds[(abs(preds['spread_edge']) >= 0.05) | (abs(preds['total_edge']) >= 0.05)])}"
)
print("Bookmakers tracked: DraftKings, FanDuel, BetMGM, Overtime.ag")
print("Markets: Spreads, Moneylines, Totals")
print("=" * 120)
