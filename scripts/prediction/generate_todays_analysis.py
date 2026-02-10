#!/usr/bin/env python3
"""Generate today's betting analysis with verified KenPom data.

Properly filters by season 2026 and validates all team matches.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd
from rich.console import Console

from sports_betting_edge.adapters.filesystem import write_csv
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.utils.team_matching import match_to_kenpom

DB_PATH = Path("data/odds_api/odds_api.sqlite3")
OUTPUT_DIR = Path("data/analysis")
SEASON = 2026

console = Console()


def generate_analysis() -> pd.DataFrame | None:
    """Generate today's analysis with proper season filtering."""
    today = datetime.now().date().isoformat()
    console.print(f"\n[bold cyan]Generating Analysis for {today}[/bold cyan]\n")

    db = OddsAPIDatabase(str(DB_PATH))

    # Load KenPom ratings for current season ONLY
    console.print(f"[1/4] Loading KenPom ratings (season {SEASON})...")
    kenpom_query = f"""
        SELECT team, adj_em, adj_o, adj_d, adj_t, rank
        FROM kp_pomeroy_ratings
        WHERE season = {SEASON}
        ORDER BY team
    """
    kenpom_df = pd.read_sql_query(kenpom_query, db.conn)
    console.print(f"  [OK] Loaded {len(kenpom_df)} teams")

    # Create KenPom lookup
    kenpom_teams = kenpom_df["team"].tolist()
    kenpom_lookup = kenpom_df.set_index("team").to_dict(orient="index")

    # Load today's games from overtime.ag data
    console.print("\n[2/4] Loading today's odds from overtime.ag...")

    # First, check the most recent overtime data
    overtime_query = """
    SELECT DISTINCT
        game_id,
        game_time,
        away_team,
        home_team,
        away_spread,
        home_spread,
        away_spread_juice,
        home_spread_juice,
        total,
        over_juice,
        under_juice
    FROM (
        SELECT *
        FROM overtime_lines
        WHERE DATE(game_time) = DATE('now')
        ORDER BY collected_at DESC
    )
    GROUP BY game_id
    """

    try:
        odds_df = pd.read_sql_query(overtime_query, db.conn)
        console.print(f"  [OK] Loaded {len(odds_df)} games from overtime.ag")
    except Exception as e:
        console.print(f"  [ERROR] Failed to load from overtime_lines: {e}")
        console.print("  Trying alternative source...")

        # Fallback: try to load from observations table
        odds_query = """
        WITH latest_obs AS (
            SELECT
                e.event_id,
                e.away_team,
                e.home_team,
                e.commence_time as game_time,
                o.market_key,
                o.outcome_name,
                o.point,
                o.price_american,
                ROW_NUMBER() OVER (
                    PARTITION BY e.event_id, o.market_key, o.outcome_name
                    ORDER BY o.fetched_at DESC
                ) as rn
            FROM events e
            JOIN observations o ON e.event_id = o.event_id
            WHERE e.sport_key = 'basketball_ncaab'
                AND DATE(e.commence_time) = DATE('now')
                AND o.market_key IN ('spreads', 'totals')
        )
        SELECT DISTINCT
            event_id as game_id,
            game_time,
            away_team,
            home_team
        FROM latest_obs
        WHERE rn = 1
        """
        odds_df = pd.read_sql_query(odds_query, db.conn)
        console.print(f"  [OK] Loaded {len(odds_df)} games from observations table")

    if len(odds_df) == 0:
        console.print("[red][ERROR] No games found for today![/red]")
        return None

    # Match teams to KenPom
    console.print("\n[3/4] Matching teams to KenPom...")
    matched_games = []
    failed_matches = []

    for _, game in odds_df.iterrows():
        away_team = game["away_team"]
        home_team = game["home_team"]

        # Match away team
        away_kp = match_to_kenpom(away_team, kenpom_teams)
        home_kp = match_to_kenpom(home_team, kenpom_teams)

        if away_kp is None or home_kp is None:
            failed_matches.append((away_team, home_team))
            continue

        # Get KenPom data
        away_data = kenpom_lookup.get(away_kp, {})
        home_data = kenpom_lookup.get(home_kp, {})

        if not away_data or not home_data:
            failed_matches.append((away_team, home_team))
            continue

        # Calculate KenPom margin (home perspective)
        kenpom_margin = home_data.get("adj_em", 0) - away_data.get("adj_em", 0)

        # Build result
        result = {
            "game_id": game.get("game_id", f"{away_team}@{home_team}"),
            "game_time": game["game_time"],
            "away_team": away_team,
            "home_team": home_team,
            "away_kenpom_name": away_kp,
            "home_kenpom_name": home_kp,
            # Away KenPom
            "away_adjoe": away_data.get("adj_o"),
            "away_adjde": away_data.get("adj_d"),
            "away_adjem": away_data.get("adj_em"),
            "away_tempo": away_data.get("adj_t"),
            "away_rank": away_data.get("rank"),
            # Home KenPom
            "home_adjoe": home_data.get("adj_o"),
            "home_adjde": home_data.get("adj_d"),
            "home_adjem": home_data.get("adj_em"),
            "home_tempo": home_data.get("adj_t"),
            "home_rank": home_data.get("rank"),
            # KenPom prediction
            "kenpom_margin": kenpom_margin,
            # Market lines
            "home_spread": game.get("home_spread"),
            "home_spread_juice": game.get("home_spread_juice"),
            "away_spread": game.get("away_spread"),
            "away_spread_juice": game.get("away_spread_juice"),
            "total": game.get("total"),
            "over_juice": game.get("over_juice"),
            "under_juice": game.get("under_juice"),
        }

        # Calculate edge (KenPom margin vs market spread)
        if result["home_spread"] is not None:
            market_margin = -result["home_spread"]  # Negative spread means favored
            discrepancy = kenpom_margin - market_margin
            result["market_margin"] = market_margin
            result["discrepancy"] = discrepancy
            result["abs_discrepancy"] = abs(discrepancy)

        matched_games.append(result)

    console.print(f"  [OK] Matched {len(matched_games)} games")

    if failed_matches:
        console.print(f"  [WARN] Failed to match {len(failed_matches)} games:")
        for away, home in failed_matches:
            console.print(f"    - {away} @ {home}")

    # Create DataFrame
    analysis_df = pd.DataFrame(matched_games)

    # Sort by absolute discrepancy (largest edges first)
    if "abs_discrepancy" in analysis_df.columns:
        analysis_df = analysis_df.sort_values("abs_discrepancy", ascending=False)

    # Save output
    console.print("\n[4/4] Saving analysis...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    output_path = OUTPUT_DIR / f"analysis_{today}_verified.csv"
    write_csv(analysis_df, output_path, index=False)

    console.print(f"  [OK] Saved to {output_path}")

    # Summary
    console.print("\n" + "=" * 80)
    console.print("[bold]SUMMARY[/bold]")
    console.print("=" * 80)

    console.print(f"\nTotal games analyzed: {len(analysis_df)}")
    console.print(f"Games with KenPom edges: {analysis_df['abs_discrepancy'].notna().sum()}")

    if "abs_discrepancy" in analysis_df.columns:
        edges_df = analysis_df[analysis_df["abs_discrepancy"] >= 3.5]
        console.print(f"Games with 3.5+ point edges: {len(edges_df)}")

        if len(edges_df) > 0:
            console.print("\n[bold]Top 5 Edges:[/bold]")
            for _, game in edges_df.head(5).iterrows():
                console.print(
                    f"  {game['away_team']} @ {game['home_team']}: "
                    f"{game['abs_discrepancy']:.1f} pts (KenPom: {game['kenpom_margin']:+.1f}, "
                    f"Market: {game['home_spread']:+.1f})"
                )

    console.print("\n[bold green][OK] Analysis complete![/bold green]\n")

    return analysis_df


if __name__ == "__main__":
    generate_analysis()
