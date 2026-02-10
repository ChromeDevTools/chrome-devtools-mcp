#!/usr/bin/env python3
"""Validate team name matching across all data sources.

Checks every team in today's games against KenPom database and reports:
- Successful matches
- Failed matches (no KenPom data)
- Suspicious matches (fuzzy matched to wrong team)
- Confidence scores for all matches

Usage:
    uv run python scripts/validate_team_matching.py
    uv run python scripts/validate_team_matching.py --fix-mappings
"""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from rich.console import Console
from rich.table import Table

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.utils.team_matching import (
    MANUAL_MAPPINGS,
    find_best_match,
)

DB_PATH = Path("data/odds_api/odds_api.sqlite3")
console = Console()


def load_kenpom_teams() -> list[str]:
    """Load all team names from KenPom database."""
    db = OddsAPIDatabase(str(DB_PATH))
    df = pd.read_sql_query("SELECT DISTINCT team FROM kp_pomeroy_ratings ORDER BY team", db.conn)
    return df["team"].tolist()


def load_todays_games() -> pd.DataFrame:
    """Load today's games from analysis file."""
    today = datetime.now().date().isoformat()
    analysis_path = Path(f"data/analysis/complete_analysis_{today}_main_lines.csv")

    if not analysis_path.exists():
        console.print(f"[red]No analysis file found for {today}[/red]")
        return pd.DataFrame()

    # Note: Using pd.read_csv directly for CSV files (not Parquet)
    # FilesystemAdapter doesn't have read_csv yet
    return pd.read_csv(analysis_path)


def validate_matches() -> dict[str, list[Any]]:
    """Validate all team matches and return results."""
    console.print("\n[bold cyan]TEAM MATCHING VALIDATION[/bold cyan]\n")

    # Load data
    kenpom_teams = load_kenpom_teams()
    games = load_todays_games()

    if len(games) == 0:
        return {}

    console.print(f"[OK] Loaded {len(kenpom_teams)} KenPom teams")
    console.print(f"[OK] Loaded {len(games)} games\n")

    # Get all unique teams
    all_teams: set[str] = set()
    if "away_team" in games.columns:
        all_teams.update(games["away_team"].dropna().unique())
    if "home_team" in games.columns:
        all_teams.update(games["home_team"].dropna().unique())

    console.print(f"[OK] Found {len(all_teams)} unique teams\n")

    # Validate each team
    results: dict[str, list[Any]] = {
        "exact_manual": [],
        "fuzzy_high": [],
        "fuzzy_medium": [],
        "fuzzy_low": [],
        "failed": [],
        "suspicious": [],
    }

    for team in sorted(all_teams):
        # Check manual mapping
        if team in MANUAL_MAPPINGS:
            kp_name = MANUAL_MAPPINGS[team]
            if kp_name in kenpom_teams:
                results["exact_manual"].append((team, kp_name, 1.0))
                continue
            else:
                results["failed"].append((team, f"Manual mapping broken: {kp_name}"))
                continue

        # Try fuzzy matching
        match, score = find_best_match(team, kenpom_teams, threshold=0.0)

        if match is None or score < 0.85:
            results["failed"].append((team, f"No match (score: {score:.2f})"))
        elif score >= 0.95:
            results["fuzzy_high"].append((team, match, score))
        elif score >= 0.90:
            results["fuzzy_medium"].append((team, match, score))
            # Check for suspicious matches
            if _is_suspicious_match(team, match):
                results["suspicious"].append((team, match, score))
        else:
            results["fuzzy_low"].append((team, match, score))
            results["suspicious"].append((team, match, score))

    return results


def _is_suspicious_match(source: str, kenpom: str) -> bool:
    """Check if match is suspicious (common false positives)."""
    suspicious_pairs = [
        ("Ohio", "Ohio St."),
        ("Miami", "Miami FL"),
        ("Miami", "Miami OH"),
        ("Western", "Northwestern"),
        ("Eastern", "Northeastern"),
        ("Central", "North Central"),
        ("Southern", "Northwestern"),
        ("Illinois", "Illinois Chicago"),
        ("Indiana", "Indiana St."),
    ]

    source_lower = source.lower()
    kenpom_lower = kenpom.lower()

    for s, k in suspicious_pairs:
        if s.lower() in source_lower and k.lower() in kenpom_lower and source_lower != k.lower():
            return True

    return False


def display_results(results: dict[str, list[Any]]) -> None:
    """Display validation results in rich tables."""
    console.print("\n" + "=" * 80)
    console.print("[bold]VALIDATION RESULTS[/bold]")
    console.print("=" * 80 + "\n")

    # Exact manual mappings
    if results["exact_manual"]:
        table = Table(title="[green]Exact Manual Mappings[/green]", show_header=True)
        table.add_column("Source Name", style="cyan")
        table.add_column("KenPom Name", style="green")
        table.add_column("Score", justify="right")

        for source, kenpom, score in results["exact_manual"]:
            table.add_row(source, kenpom, f"{score:.2f}")

        console.print(table)
        console.print(f"\n[green][OK] {len(results['exact_manual'])} exact matches[/green]\n")

    # High confidence fuzzy
    if results["fuzzy_high"]:
        table = Table(title="[green]High Confidence Fuzzy Matches (0.95+)[/green]")
        table.add_column("Source Name", style="cyan")
        table.add_column("KenPom Name", style="green")
        table.add_column("Score", justify="right")

        for source, kenpom, score in results["fuzzy_high"]:
            table.add_row(source, kenpom, f"{score:.2f}")

        console.print(table)
        high_count = len(results["fuzzy_high"])
        console.print(f"\n[green][OK] {high_count} high confidence matches[/green]\n")

    # Medium confidence fuzzy
    if results["fuzzy_medium"]:
        table = Table(title="[yellow]Medium Confidence Fuzzy Matches (0.90-0.95)[/yellow]")
        table.add_column("Source Name", style="cyan")
        table.add_column("KenPom Name", style="yellow")
        table.add_column("Score", justify="right")

        for source, kenpom, score in results["fuzzy_medium"]:
            table.add_row(source, kenpom, f"{score:.2f}")

        console.print(table)
        med_count = len(results["fuzzy_medium"])
        console.print(f"\n[yellow][WARN] {med_count} medium confidence matches[/yellow]\n")

    # Low confidence fuzzy
    if results["fuzzy_low"]:
        table = Table(title="[red]Low Confidence Fuzzy Matches (0.85-0.90)[/red]")
        table.add_column("Source Name", style="cyan")
        table.add_column("KenPom Name", style="red")
        table.add_column("Score", justify="right")

        for source, kenpom, score in results["fuzzy_low"]:
            table.add_row(source, kenpom, f"{score:.2f}")

        console.print(table)
        console.print(f"\n[red][WARN] {len(results['fuzzy_low'])} low confidence matches[/red]\n")

    # Suspicious matches
    if results["suspicious"]:
        table = Table(title="[bold red]SUSPICIOUS MATCHES - LIKELY ERRORS[/bold red]")
        table.add_column("Source Name", style="cyan")
        table.add_column("Matched To", style="red")
        table.add_column("Score", justify="right")

        for source, kenpom, score in results["suspicious"]:
            table.add_row(source, kenpom, f"{score:.2f}")

        console.print(table)
        suspicious_count = len(results["suspicious"])
        console.print(
            f"\n[bold red][ERROR] {suspicious_count} SUSPICIOUS matches found![/bold red]\n"
        )

    # Failed matches
    if results["failed"]:
        table = Table(title="[bold red]FAILED MATCHES[/bold red]")
        table.add_column("Source Name", style="cyan")
        table.add_column("Reason", style="red")

        for source, reason in results["failed"]:
            table.add_row(source, reason)

        console.print(table)
        console.print(f"\n[bold red][ERROR] {len(results['failed'])} failed matches![/bold red]\n")

    # Summary
    console.print("=" * 80)
    console.print("[bold]SUMMARY[/bold]")
    console.print("=" * 80)

    total_teams = (
        len(results["exact_manual"])
        + len(results["fuzzy_high"])
        + len(results["fuzzy_medium"])
        + len(results["fuzzy_low"])
        + len(results["failed"])
    )

    console.print(f"\nTotal teams validated: {total_teams}")
    exact_high = len(results["exact_manual"]) + len(results["fuzzy_high"])
    console.print(f"[green]Exact/High confidence: {exact_high}[/green]")
    console.print(f"[yellow]Medium confidence: {len(results['fuzzy_medium'])}[/yellow]")
    console.print(f"[red]Low confidence: {len(results['fuzzy_low'])}[/red]")
    console.print(f"[bold red]Suspicious: {len(results['suspicious'])}[/bold red]")
    console.print(f"[bold red]Failed: {len(results['failed'])}[/bold red]")

    if results["suspicious"] or results["failed"] or results["fuzzy_low"]:
        console.print(
            "\n[bold red][ERROR] Team matching has issues - DO NOT use for betting![/bold red]"
        )
        console.print("Add manual mappings to fix suspicious/failed matches.\n")
    else:
        console.print("\n[bold green][OK] All teams matched successfully![/bold green]\n")


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Validate team name matching")
    parser.add_argument(
        "--fix-mappings",
        action="store_true",
        help="Generate manual mapping entries for failed/suspicious matches",
    )
    args = parser.parse_args()

    results = validate_matches()

    if not results:
        return 1

    display_results(results)

    if args.fix_mappings:
        console.print("\n[bold cyan]SUGGESTED MANUAL MAPPINGS:[/bold cyan]\n")
        for source, kenpom, score in results["suspicious"]:
            console.print(f'    "{source}": "{kenpom}",  # VERIFY THIS - score: {score:.2f}')
        for source, reason in results["failed"]:
            console.print(f'    "{source}": "???",  # {reason}')

    return 0


if __name__ == "__main__":
    exit(main())
