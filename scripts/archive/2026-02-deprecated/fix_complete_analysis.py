#!/usr/bin/env python3
"""Fix complete_analysis file by replacing incorrect KenPom data.

Loads the existing analysis file and replaces all KenPom ratings with
correct season 2026 data from the database.
"""

import sqlite3
from datetime import datetime
from pathlib import Path

import pandas as pd
from rich.console import Console

from sports_betting_edge.utils.team_matching import match_to_kenpom

DB_PATH = Path("data/odds_api/odds_api.sqlite3")
SEASON = 2026

console = Console()


def fix_analysis():
    """Fix the complete analysis file."""
    today = datetime.now().date().isoformat()
    input_path = Path(f"data/analysis/complete_analysis_{today}_main_lines.csv")
    output_path = Path(f"data/analysis/complete_analysis_{today}_CORRECTED.csv")

    console.print(f"\n[bold cyan]Fixing Analysis for {today}[/bold cyan]\n")

    if not input_path.exists():
        console.print(f"[red][ERROR] File not found: {input_path}[/red]")
        return

    # Load existing analysis
    console.print(f"[1/3] Loading existing analysis from {input_path}...")
    df = pd.read_csv(input_path)
    console.print(f"  [OK] Loaded {len(df)} games")

    # Load correct KenPom data for season 2026
    console.print(f"\n[2/3] Loading correct KenPom ratings (season {SEASON})...")
    conn = sqlite3.connect(DB_PATH)
    kenpom_query = f"""
        SELECT team, adj_em, adj_o, adj_d, adj_t, rank
        FROM kp_pomeroy_ratings
        WHERE season = {SEASON}
        ORDER BY team
    """
    kenpom_df = pd.read_sql_query(kenpom_query, conn)
    conn.close()

    kenpom_teams = kenpom_df["team"].tolist()
    kenpom_lookup = kenpom_df.set_index("team").to_dict(orient="index")
    console.print(f"  [OK] Loaded {len(kenpom_df)} teams")

    # Fix each game
    console.print("\n[3/3] Replacing incorrect KenPom data...")
    fixed_count = 0
    failed_count = 0
    comparison = []

    for idx, row in df.iterrows():
        away_team = row["away_team"]
        home_team = row["home_team"]

        # Match to KenPom
        away_kp = match_to_kenpom(away_team, kenpom_teams)
        home_kp = match_to_kenpom(home_team, kenpom_teams)

        if away_kp is None or home_kp is None:
            console.print(f"  [WARN] Failed to match: {away_team} @ {home_team}")
            failed_count += 1
            continue

        # Get correct data
        away_data = kenpom_lookup.get(away_kp, {})
        home_data = kenpom_lookup.get(home_kp, {})

        if not away_data or not home_data:
            console.print(f"  [WARN] No KenPom data for: {away_team} @ {home_team}")
            failed_count += 1
            continue

        # Store old values for comparison
        old_home_em = row.get("home_adjem")
        old_away_em = row.get("away_adjem")
        old_margin = row.get("kenpom_margin")

        # Replace with correct data
        df.at[idx, "away_adjoe"] = away_data.get("adj_o")
        df.at[idx, "away_adjde"] = away_data.get("adj_d")
        df.at[idx, "away_adjem"] = away_data.get("adj_em")
        df.at[idx, "away_tempo"] = away_data.get("adj_t")

        df.at[idx, "home_adjoe"] = home_data.get("adj_o")
        df.at[idx, "home_adjde"] = home_data.get("adj_d")
        df.at[idx, "home_adjem"] = home_data.get("adj_em")
        df.at[idx, "home_tempo"] = home_data.get("adj_t")

        # Recalculate KenPom margin
        new_margin = home_data.get("adj_em", 0) - away_data.get("adj_em", 0)
        df.at[idx, "kenpom_margin"] = new_margin

        # Recalculate edge if we have spread
        if pd.notna(row.get("home_spread")):
            market_margin = -row["home_spread"]
            discrepancy = new_margin - market_margin
            df.at[idx, "discrepancy"] = discrepancy
            df.at[idx, "abs_discrepancy"] = abs(discrepancy)

        # Track significant changes
        if pd.notna(old_margin) and pd.notna(new_margin):
            margin_change = new_margin - old_margin
            if abs(margin_change) > 5:  # Changed by more than 5 points
                comparison.append(
                    {
                        "game": f"{away_team} @ {home_team}",
                        "old_away_em": old_away_em,
                        "new_away_em": away_data.get("adj_em"),
                        "old_home_em": old_home_em,
                        "new_home_em": home_data.get("adj_em"),
                        "old_margin": old_margin,
                        "new_margin": new_margin,
                        "change": margin_change,
                    }
                )

        fixed_count += 1

    console.print(f"  [OK] Fixed {fixed_count} games")
    if failed_count > 0:
        console.print(f"  [WARN] Failed to fix {failed_count} games")

    # Save corrected data
    df.to_csv(output_path, index=False)
    console.print(f"\n[OK] Saved corrected analysis to {output_path}")

    # Show significant changes
    if comparison:
        console.print("\n" + "=" * 80)
        console.print("[bold]SIGNIFICANT CORRECTIONS (>5 point margin change):[/bold]")
        console.print("=" * 80 + "\n")

        for c in comparison:
            console.print(f"\n{c['game']}")
            console.print(f"  Away AdjEM: {c['old_away_em']:+.1f} → {c['new_away_em']:+.1f}")
            console.print(f"  Home AdjEM: {c['old_home_em']:+.1f} → {c['new_home_em']:+.1f}")
            console.print(f"  KenPom Margin: {c['old_margin']:+.1f} → {c['new_margin']:+.1f}")
            console.print(f"  [bold]Change: {c['change']:+.1f} points[/bold]")

    # Summary
    console.print("\n" + "=" * 80)
    console.print("[bold]CORRECTED EDGES:[/bold]")
    console.print("=" * 80)

    if "abs_discrepancy" in df.columns:
        edges_df = df[df["abs_discrepancy"] >= 3.5].sort_values("abs_discrepancy", ascending=False)

        console.print(f"\nGames with 3.5+ point edges: {len(edges_df)}")

        if len(edges_df) > 0:
            console.print("\n[bold]Top 10 Edges:[/bold]\n")
            for i, (_, game) in enumerate(edges_df.head(10).iterrows(), 1):
                spread = game.get("home_spread", 0)
                kp_margin = game.get("kenpom_margin", 0)
                edge = game.get("abs_discrepancy", 0)

                console.print(f"{i:2d}. {game['away_team']:25s} @ {game['home_team']:25s}")
                console.print(
                    f"     Market: {spread:+.1f}  |  KenPom: {kp_margin:+.1f}  |  "
                    f"[bold green]Edge: {edge:.1f} pts[/bold green]"
                )

    console.print("\n[bold green][OK] Analysis corrected![/bold green]\n")


if __name__ == "__main__":
    fix_analysis()
