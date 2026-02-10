"""Generate daily betting card with model predictions vs market lines.

Creates a clear, concise betting card showing:
- Game matchups with times
- Market lines (FanDuel odds)
- Model's projected spread and total
- Edge/value opportunities highlighted

Usage:
    uv run python scripts/generate_betting_card.py
    uv run python scripts/generate_betting_card.py --date 2026-02-01
    uv run python scripts/generate_betting_card.py --output betting-cards/2026-02-01.txt
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.filesystem import read_parquet_df

# ANSI color codes for terminal output
RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"


def estimate_model_spread(market_spread: float, fav_cover_prob: float) -> float:
    """Estimate the model's fair spread based on cover probability.

    Uses approximation: each 10% edge ≈ 2.5 points of spread difference.

    Args:
        market_spread: Current market spread (positive value)
        fav_cover_prob: Probability of favorite covering market spread

    Returns:
        Model's estimated fair spread (positive = favorite)
    """
    # Edge from break-even (52.4% at -110 odds)
    edge = fav_cover_prob - 0.524

    # Approximate point adjustment: 10% edge ≈ 2.5 points
    point_adjustment = edge * 25.0

    # Model's fair spread
    model_spread = market_spread + point_adjustment

    # Round to nearest 0.5
    return round(model_spread * 2) / 2


def get_model_pick(prob: float, threshold: float = 0.524) -> tuple[str, str]:
    """Determine model's pick based on probability vs break-even.

    Args:
        prob: Probability of favorite covering (0-1)
        threshold: Break-even probability at -110 odds (default: 0.524)

    Returns:
        (side, confidence) tuple where side is 'FAV', 'DOG', or 'PASS'
        and confidence is strength descriptor
    """
    if prob > threshold + 0.10:  # > 62.4%
        return "FAV", "STRONG"
    elif prob > threshold:  # > 52.4%
        return "FAV", "LEAN"
    elif prob < threshold - 0.10:  # < 42.4%
        return "DOG", "STRONG"
    elif prob < threshold:  # < 52.4%
        return "DOG", "LEAN"
    else:
        return "PASS", "NEUTRAL"


def estimate_model_total(market_total: float, over_prob: float) -> float:
    """Estimate the model's fair total based on over probability.

    Uses approximation: each 10% edge ≈ 3-4 points of total difference.

    Args:
        market_total: Current market total
        over_prob: Probability of going over market total

    Returns:
        Model's estimated fair total
    """
    # Edge from break-even (52.4% at -110 odds)
    edge = over_prob - 0.524

    # Approximate point adjustment: 10% edge ≈ 3.5 points
    point_adjustment = edge * 35.0

    # Model's fair total
    model_total = market_total + point_adjustment

    # Round to nearest 0.5
    return round(model_total * 2) / 2


def get_total_pick(prob: float, threshold: float = 0.524) -> tuple[str, str]:
    """Determine model's total pick based on probability vs break-even.

    Args:
        prob: Probability of going over (0-1)
        threshold: Break-even probability at -110 odds (default: 0.524)

    Returns:
        (side, confidence) tuple where side is 'OVER', 'UNDER', or 'PASS'
    """
    if prob > threshold + 0.10:  # > 62.4%
        return "OVER", "STRONG"
    elif prob > threshold:  # > 52.4%
        return "OVER", "LEAN"
    elif prob < threshold - 0.10:  # < 42.4%
        return "UNDER", "STRONG"
    elif prob < threshold:  # < 52.4%
        return "UNDER", "LEAN"
    else:
        return "PASS", "NEUTRAL"


def format_edge(edge: float, threshold: float = 0.05) -> str:
    """Format edge with color coding.

    Args:
        edge: Edge value (-1 to 1)
        threshold: Minimum edge to highlight

    Returns:
        Formatted string with color
    """
    edge_pct = edge * 100

    if abs(edge) < threshold:
        return f"{edge_pct:+5.1f}%"
    elif edge > 0:
        return f"{GREEN}{edge_pct:+5.1f}%{RESET}"
    else:
        return f"{RED}{edge_pct:+5.1f}%{RESET}"


def format_spread_comparison(
    favorite: str,
    underdog: str,
    market_spread: float,
    fav_prob: float,
    edge: float,
) -> str:
    """Format spread comparison line.

    Args:
        favorite: Favorite team name
        underdog: Underdog team name
        market_spread: Market spread magnitude
        fav_prob: Probability of favorite covering
        edge: Model edge

    Returns:
        Formatted comparison string
    """
    # Calculate model's estimated fair spread
    model_spread = estimate_model_spread(market_spread, fav_prob)

    # Determine model's pick
    pick_side, confidence = get_model_pick(fav_prob)

    if pick_side == "FAV":
        if confidence == "STRONG":
            color = GREEN
            indicator = "FAV**"
        else:
            color = CYAN
            indicator = "FAV*"
    elif pick_side == "DOG":
        if confidence == "STRONG":
            color = YELLOW
            indicator = "DOG**"
        else:
            color = ""
            indicator = "DOG*"
    else:
        color = ""
        indicator = "PASS"

    # Format model spread display
    if model_spread > 0:
        model_display = f"{favorite[:12]:12} -{model_spread:4.1f}"
    else:
        model_display = f"{underdog[:12]:12} -{abs(model_spread):4.1f}"

    return (
        f"  Spread: {favorite[:18]:18} -{market_spread:4.1f}  "
        f"Model: {color}{model_display:20}{RESET}  "
        f"({color}{indicator:6}{RESET})  "
        f"Edge: {format_edge(edge)}"
    )


def format_total_comparison(market_total: float, over_prob: float, edge: float) -> str:
    """Format total comparison line.

    Args:
        market_total: Market total
        over_prob: Probability of going over
        edge: Model edge

    Returns:
        Formatted comparison string
    """
    # Calculate model's estimated fair total
    model_total = estimate_model_total(market_total, over_prob)

    # Determine model's pick
    pick_side, confidence = get_total_pick(over_prob)

    if pick_side == "OVER":
        if confidence == "STRONG":
            color = GREEN
            indicator = "OVR**"
        else:
            color = CYAN
            indicator = "OVR*"
    elif pick_side == "UNDER":
        if confidence == "STRONG":
            color = YELLOW
            indicator = "UND**"
        else:
            color = ""
            indicator = "UND*"
    else:
        color = ""
        indicator = "PASS"

    return (
        f"  Total:  {market_total:5.1f}                  "
        f"Model: {color}{model_total:5.1f}{RESET}  "
        f"({color}{indicator:6}{RESET})  "
        f"Edge: {format_edge(edge)}"
    )


def generate_betting_card(
    target_date: date,
    odds_dir: Path,
    predictions_file: Path,
    output_file: Path | None = None,
) -> str:
    """Generate betting card for target date.

    Args:
        target_date: Date for betting card
        odds_dir: Directory containing odds files
        predictions_file: Path to predictions CSV
        output_file: Optional output file path

    Returns:
        Formatted betting card as string
    """
    # Load data
    date_str = target_date.isoformat()
    spreads_path = odds_dir / f"{date_str}_spreads.parquet"
    totals_path = odds_dir / f"{date_str}_totals.parquet"

    spreads = read_parquet_df(str(spreads_path))
    totals = read_parquet_df(str(totals_path))
    predictions = pd.read_csv(predictions_file)

    # Filter for FanDuel (canonical bookmaker)
    fanduel_spreads = spreads[spreads["bookmaker_key"] == "fanduel"].copy()
    fanduel_totals = totals[totals["bookmaker_key"] == "fanduel"].copy()

    # Sort games by time
    predictions["commence_dt"] = pd.to_datetime(predictions["commence_time"])
    predictions = predictions.sort_values("commence_dt")

    # Build betting card
    lines = []
    lines.append("")
    lines.append("=" * 100)
    lines.append(f"{BOLD}DAILY BETTING CARD - {target_date.strftime('%A, %B %d, %Y')}{RESET}")
    lines.append("=" * 100)
    lines.append("")
    lines.append(
        "Model Predictions vs Market Lines (FanDuel)  |  "
        "** = Strong Pick (>10% edge)  * = Lean (<10% edge)"
    )
    lines.append("-" * 100)
    lines.append("")

    # Track best opportunities
    best_spread_edges = []
    best_total_edges = []

    for _, game in predictions.iterrows():
        event_id = game["event_id"]
        game_time = game["commence_dt"].strftime("%I:%M %p ET")

        # Get market lines
        game_spread = fanduel_spreads[fanduel_spreads["event_id"] == event_id]
        game_total = fanduel_totals[fanduel_totals["event_id"] == event_id]

        if len(game_spread) == 0 or len(game_total) == 0:
            continue

        market_spread = game_spread.iloc[0]["spread_magnitude"]
        market_total = game_total.iloc[0]["total"]

        # Format game header
        lines.append(
            f"{BOLD}{game['away_team']}{RESET} @ {BOLD}{game['home_team']}{RESET} ({game_time})"
        )

        # Format spread comparison
        spread_line = format_spread_comparison(
            game["favorite_team"],
            game["underdog_team"],
            market_spread,
            game["favorite_cover_prob"],
            game["spread_edge"],
        )
        lines.append(spread_line)

        # Format total comparison
        total_line = format_total_comparison(market_total, game["over_prob"], game["total_edge"])
        lines.append(total_line)

        lines.append("")

        # Track best edges
        if abs(game["spread_edge"]) >= 0.10:
            best_spread_edges.append(
                {
                    "game": f"{game['away_team']} @ {game['home_team']}",
                    "time": game_time,
                    "pick": (
                        f"{game['favorite_team']} -{market_spread}"
                        if game["spread_edge"] > 0
                        else (
                            f"{'Away' if game['away_team'] != game['favorite_team'] else 'Home'}"
                            f" +{market_spread}"
                        )
                    ),
                    "edge": game["spread_edge"],
                    "prob": game["favorite_cover_prob"]
                    if game["spread_edge"] > 0
                    else 1 - game["favorite_cover_prob"],
                }
            )

        if abs(game["total_edge"]) >= 0.10:
            best_total_edges.append(
                {
                    "game": f"{game['away_team']} @ {game['home_team']}",
                    "time": game_time,
                    "pick": (
                        f"Over {market_total}"
                        if game["total_edge"] > 0
                        else f"Under {market_total}"
                    ),
                    "edge": game["total_edge"],
                    "prob": game["over_prob"] if game["total_edge"] > 0 else 1 - game["over_prob"],
                }
            )

    # Add best opportunities section
    lines.append("=" * 100)
    lines.append(f"{BOLD}TOP OPPORTUNITIES (Edge >= 10%){RESET}")
    lines.append("=" * 100)
    lines.append("")

    if best_spread_edges:
        lines.append(f"{BOLD}SPREAD PLAYS:{RESET}")
        for opp in sorted(best_spread_edges, key=lambda x: abs(x["edge"]), reverse=True)[:5]:
            lines.append(
                f"  {opp['pick']:35} ({opp['time']:12}) "
                f"Prob: {opp['prob']:5.1%}  Edge: {format_edge(opp['edge'], 0.0)}"
            )
        lines.append("")

    if best_total_edges:
        lines.append(f"{BOLD}TOTAL PLAYS:{RESET}")
        for opp in sorted(best_total_edges, key=lambda x: abs(x["edge"]), reverse=True)[:5]:
            lines.append(
                f"  {opp['pick']:35} ({opp['time']:12}) "
                f"Prob: {opp['prob']:5.1%}  Edge: {format_edge(opp['edge'], 0.0)}"
            )
        lines.append("")

    lines.append("=" * 100)
    lines.append(
        f"Total Games: {len(predictions)}  |  "
        f"Opportunities: {len(best_spread_edges)} spreads, {len(best_total_edges)} totals"
    )
    lines.append("=" * 100)
    lines.append("")

    # Join all lines
    card = "\n".join(lines)

    # Save to file if requested
    if output_file:
        output_file.parent.mkdir(parents=True, exist_ok=True)
        # Strip ANSI codes for file output
        import re

        ansi_escape = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
        clean_card = ansi_escape.sub("", card)
        output_file.write_text(clean_card)
        print(f"Betting card saved to: {output_file}")

    return card


def main() -> None:
    """Generate and display betting card."""
    parser = argparse.ArgumentParser(description="Generate daily betting card")
    parser.add_argument(
        "--date",
        type=str,
        default=None,
        help="Target date (YYYY-MM-DD, default: today)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output file path (default: display only)",
    )
    parser.add_argument(
        "--odds-dir",
        type=Path,
        default=Path("data/odds_api/daily"),
        help="Directory containing odds files",
    )
    parser.add_argument(
        "--predictions-dir",
        type=Path,
        default=Path("predictions"),
        help="Directory containing predictions",
    )

    args = parser.parse_args()

    # Determine target date
    target_date = date.fromisoformat(args.date) if args.date else date.today()

    # Find predictions file
    predictions_file = args.predictions_dir / f"{target_date.isoformat()}.csv"
    if not predictions_file.exists():
        # Try the -fixed version
        predictions_file = args.predictions_dir / f"{target_date.isoformat()}-fixed.csv"

    if not predictions_file.exists():
        print(f"Error: Predictions file not found: {predictions_file}")
        print(f"Run: uv run python scripts/predict_today.py --date {target_date.isoformat()}")
        raise SystemExit(1)

    # Generate betting card
    card = generate_betting_card(target_date, args.odds_dir, predictions_file, args.output)

    # Display card
    print(card)


if __name__ == "__main__":
    main()
