#!/usr/bin/env python3
"""Simplified deployment using only KenPom baseline features.

Uses KenPom efficiency margins as the primary predictor, which has
shown strong performance in our edge analysis.
"""

import sys
from datetime import date
from pathlib import Path

import pandas as pd

ANALYSIS_DIR = Path("data/analysis")
MIN_KENPOM_EDGE = 3.5  # Minimum KenPom vs market discrepancy


def american_to_prob(odds: int) -> float:
    """Convert American odds to implied probability."""
    if odds < 0:
        return abs(odds) / (abs(odds) + 100)
    return 100 / (odds + 100)


def prob_to_american(prob: float) -> int:
    """Convert probability to American odds."""
    if prob >= 0.5:
        return int(-prob / (1 - prob) * 100)
    return int((1 - prob) / prob * 100)


print("=" * 80)
print("KENPOM-BASED DEPLOYMENT - TODAY'S GAMES")
print("=" * 80)

# Load today's edge analysis (use CORRECTED file)
today = date.today().isoformat()
edges_path = ANALYSIS_DIR / f"edge_analysis_{today}_CORRECTED.csv"

if not edges_path.exists():
    print(f"\n[ERROR] Edge analysis not found: {edges_path}")
    print("Run edge finding first")
    sys.exit(1)

df = pd.read_csv(edges_path)
print(f"\n[OK] Loaded {len(df)} games with KenPom analysis")

# Calculate market margin (convert spread to same convention as KenPom)
df["market_margin"] = -1 * df["home_spread_num"]

# Recalculate discrepancy (KenPom - Market)
df["discrepancy"] = df["kenpom_margin"] - df["market_margin"]
df["abs_discrepancy"] = df["discrepancy"].abs()

# Filter to actionable edges (KenPom disagrees with market by 3.5+ points)
edges = df[df["abs_discrepancy"] >= MIN_KENPOM_EDGE].copy()

print(f"[OK] Found {len(edges)} games with {MIN_KENPOM_EDGE}+ point KenPom edges")

if len(edges) == 0:
    print("\n[INFO] No strong edges found today")
    sys.exit(0)

# Sort by edge magnitude
edges = edges.sort_values("abs_discrepancy", ascending=False)

print("\n" + "=" * 80)
print("RECOMMENDED PLAYS (Based on KenPom Analysis)")
print("=" * 80)

for _idx, game in edges.iterrows():
    print(f"\n{game['game_time']}")
    print(f"{game['away_team']} @ {game['home_team']}")

    disc = game["discrepancy"]
    abs_disc = game["abs_discrepancy"]

    if disc > 0:
        # KenPom favors home more than market
        pick = game["home_team"]
        line = game["home_spread_num"]
        odds = game["home_spread_juice"]
        reason = f"KenPom projects {pick} by {game['kenpom_margin']:+.1f}, market only {line:+.1f}"
    else:
        # KenPom favors away more than market
        pick = game["away_team"]
        line = -game["home_spread_num"]
        odds = game["away_spread_juice"]
        kp_margin = abs(game["kenpom_margin"])
        market_line = abs(line)
        reason = f"KenPom projects {pick} by {kp_margin:.1f}, market only {market_line:.1f}"

    # Calculate implied edge
    # Assume KenPom is "true" probability
    # Edge = difference in point spread / typical point value (~2.5 pts = 10% prob)
    prob_edge = abs_disc / 2.5 * 0.10  # Rough conversion

    print(f"  PLAY: {pick} {line:+.1f} ({odds:+.0f})")
    print(f"  Reason: {reason}")
    print(f"  KenPom Edge: {abs_disc:.1f} points")
    print(f"  Est. Probability Edge: ~{prob_edge:.1%}")
    print(f"  Strength: {game['edge_strength']}")

# Summary
print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)
print(f"Total recommended plays: {len(edges)}")
print(f"Average KenPom edge: {edges['abs_discrepancy'].mean():.1f} points")
print(f"Largest edge: {edges['abs_discrepancy'].max():.1f} points")

print("\n[APPROACH]")
print("These plays are based on KenPom efficiency margins vs market spreads.")
print("KenPom has historically been more accurate than opening lines.")
print("Edges of 3.5+ points represent significant market inefficiencies.")

print("\n[RISK MANAGEMENT]")
print("- Start with small units (0.5-1% bankroll)")
print("- Track results to validate approach")
print("- Focus on games with 5+ point edges for highest confidence")
print("- Monitor line movements (sharp money confirmation)")
