"""Fix team mapping issues by finding unmapped teams and suggesting mappings.

Usage:
    # List unmapped teams
    uv run python scripts/fix_team_mapping.py --list

    # Auto-fix simple cases (exact matches with different formatting)
    uv run python scripts/fix_team_mapping.py --auto-fix

    # Interactive mode for manual mapping
    uv run python scripts/fix_team_mapping.py --interactive
"""

import argparse
import logging
import sqlite3
from pathlib import Path

import pandas as pd

from sports_betting_edge.core.team_mapper import TeamMapper

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def get_unmapped_teams(
    odds_db_path: Path,
    team_mapping_path: Path,
) -> tuple[list[str], TeamMapper]:
    """Get list of unmapped teams from Odds API.

    Args:
        odds_db_path: Path to Odds API database
        team_mapping_path: Path to team mapping parquet

    Returns:
        (unmapped_teams, team_mapper)
    """
    # Load team mapping
    mapping_df = pd.read_parquet(team_mapping_path)
    mapper = TeamMapper(mapping_df)

    # Get all teams from Odds API
    conn = sqlite3.connect(str(odds_db_path))
    query = """
        SELECT DISTINCT home_team as team FROM events
        UNION
        SELECT DISTINCT away_team as team FROM events
        ORDER BY team
    """
    odds_teams = pd.read_sql_query(query, conn)["team"].tolist()
    conn.close()

    # Find unmapped teams
    unmapped = []
    for team in odds_teams:
        kenpom_name = mapper.get_kenpom_name(team, source="odds_api")
        # If kenpom_name equals team, it means no mapping was found
        if kenpom_name == team and team not in mapping_df["kenpom_name"].values:
            unmapped.append(team)

    return unmapped, mapper


def suggest_kenpom_match(
    odds_team: str,
    kenpom_teams: list[str],
) -> list[tuple[str, float]]:
    """Suggest potential KenPom matches for an Odds API team.

    Args:
        odds_team: Odds API team name
        kenpom_teams: List of KenPom team names

    Returns:
        List of (kenpom_name, similarity_score) tuples, sorted by score
    """
    from difflib import SequenceMatcher

    matches = []
    for kenpom_team in kenpom_teams:
        # Calculate similarity
        ratio = SequenceMatcher(None, odds_team.lower(), kenpom_team.lower()).ratio()
        matches.append((kenpom_team, ratio))

    # Sort by similarity (highest first)
    matches.sort(key=lambda x: x[1], reverse=True)

    return matches[:5]  # Top 5 matches


def auto_fix_mappings(
    unmapped_teams: list[str],
    kenpom_teams: list[str],
    mapping_df: pd.DataFrame,
    threshold: float = 0.8,
) -> pd.DataFrame:
    """Automatically fix mappings with high similarity scores.

    Args:
        unmapped_teams: List of unmapped Odds API teams
        kenpom_teams: List of KenPom team names
        mapping_df: Current mapping DataFrame
        threshold: Minimum similarity score to auto-fix

    Returns:
        Updated mapping DataFrame
    """
    new_mappings = []

    for odds_team in unmapped_teams:
        matches = suggest_kenpom_match(odds_team, kenpom_teams)
        best_match, score = matches[0]

        if score >= threshold:
            logger.info(f"Auto-mapping: {odds_team} -> {best_match} (score: {score:.3f})")
            new_mappings.append(
                {
                    "kenpom_name": best_match,
                    "odds_api_name": odds_team,
                    "espn_name": "",  # Will need to be filled manually
                }
            )
        else:
            logger.warning(
                f"No confident match for: {odds_team} (best: {best_match}, score: {score:.3f})"
            )

    if new_mappings:
        new_df = pd.DataFrame(new_mappings)
        updated_df = pd.concat([mapping_df, new_df], ignore_index=True)
        logger.info(f"Added {len(new_mappings)} automatic mappings")
        return updated_df
    else:
        logger.info("No automatic mappings added (no matches above threshold)")
        return mapping_df


def interactive_mapping(
    unmapped_teams: list[str],
    kenpom_teams: list[str],
    mapping_df: pd.DataFrame,
) -> pd.DataFrame:
    """Interactively map teams with user input.

    Args:
        unmapped_teams: List of unmapped Odds API teams
        kenpom_teams: List of KenPom team names
        mapping_df: Current mapping DataFrame

    Returns:
        Updated mapping DataFrame
    """
    new_mappings = []

    for odds_team in unmapped_teams:
        print(f"\n{'=' * 80}")
        print(f"Odds API team: {odds_team}")
        print(f"{'=' * 80}")

        # Show suggestions
        matches = suggest_kenpom_match(odds_team, kenpom_teams)
        print("\nSuggested KenPom matches:")
        for i, (kenpom_team, score) in enumerate(matches):
            print(f"  {i + 1}. {kenpom_team} (similarity: {score:.3f})")

        print("  s. Skip this team")
        print("  q. Quit and save")

        choice = input("\nEnter choice (1-5, s, q): ").strip().lower()

        if choice == "q":
            break
        elif choice == "s":
            continue
        elif choice.isdigit() and 1 <= int(choice) <= 5:
            kenpom_name = matches[int(choice) - 1][0]
            print(f"\nMapping: {odds_team} -> {kenpom_name}")
            confirm = input("Confirm? (y/n): ").strip().lower()
            if confirm == "y":
                new_mappings.append(
                    {
                        "kenpom_name": kenpom_name,
                        "odds_api_name": odds_team,
                        "espn_name": "",  # Will need to be filled manually
                    }
                )
                logger.info(f"Added mapping: {odds_team} -> {kenpom_name}")

    if new_mappings:
        new_df = pd.DataFrame(new_mappings)
        updated_df = pd.concat([mapping_df, new_df], ignore_index=True)
        logger.info(f"Added {len(new_mappings)} manual mappings")
        return updated_df
    else:
        logger.info("No new mappings added")
        return mapping_df


def main() -> None:
    """Fix team mapping issues."""
    parser = argparse.ArgumentParser(description="Fix team mapping issues")
    parser.add_argument(
        "--odds-db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to Odds API database",
    )
    parser.add_argument(
        "--team-mapping",
        type=Path,
        default=Path("data/staging/mappings/team_mapping.parquet"),
        help="Path to team mapping file",
    )
    parser.add_argument(
        "--kenpom-path",
        type=Path,
        default=Path("data/kenpom"),
        help="Path to KenPom data directory",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List unmapped teams",
    )
    parser.add_argument(
        "--auto-fix",
        action="store_true",
        help="Automatically fix high-confidence matches",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Interactive mapping mode",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.8,
        help="Similarity threshold for auto-fix (0-1)",
    )

    args = parser.parse_args()

    # Get unmapped teams
    unmapped, mapper = get_unmapped_teams(args.odds_db, args.team_mapping)

    if len(unmapped) == 0:
        logger.info("[OK] All teams are mapped!")
        return

    logger.info(f"Found {len(unmapped)} unmapped teams")

    # Load KenPom teams
    kenpom_ratings_path = args.kenpom_path / "ratings" / "season" / "ratings_2026.parquet"
    if not kenpom_ratings_path.exists():
        logger.error(f"KenPom ratings not found: {kenpom_ratings_path}")
        return

    kenpom_df = pd.read_parquet(kenpom_ratings_path)
    kenpom_teams = kenpom_df["TeamName"].unique().tolist()

    # List mode
    if args.list:
        logger.info("\nUnmapped Odds API teams:")
        for team in sorted(unmapped):
            # Show suggestions
            matches = suggest_kenpom_match(team, kenpom_teams)
            best_match, score = matches[0]
            logger.info(f"  {team:40s} -> {best_match} (score: {score:.3f})")
        return

    # Load current mapping
    mapping_df = pd.read_parquet(args.team_mapping)

    # Auto-fix mode
    if args.auto_fix:
        updated_df = auto_fix_mappings(unmapped, kenpom_teams, mapping_df, args.threshold)
        if len(updated_df) > len(mapping_df):
            # Save backup
            backup_path = args.team_mapping.with_suffix(".backup.parquet")
            mapping_df.to_parquet(backup_path)
            logger.info(f"Backup saved to: {backup_path}")

            # Save updated mapping
            updated_df.to_parquet(args.team_mapping)
            logger.info(f"Updated mapping saved to: {args.team_mapping}")
            logger.info(f"Added {len(updated_df) - len(mapping_df)} new mappings")
        return

    # Interactive mode
    if args.interactive:
        updated_df = interactive_mapping(unmapped, kenpom_teams, mapping_df)
        if len(updated_df) > len(mapping_df):
            # Save backup
            backup_path = args.team_mapping.with_suffix(".backup.parquet")
            mapping_df.to_parquet(backup_path)
            logger.info(f"Backup saved to: {backup_path}")

            # Save updated mapping
            updated_df.to_parquet(args.team_mapping)
            logger.info(f"Updated mapping saved to: {args.team_mapping}")
            logger.info(f"Added {len(updated_df) - len(mapping_df)} new mappings")
        return

    # Default: just list
    logger.info("\nUnmapped Odds API teams:")
    for team in sorted(unmapped):
        logger.info(f"  {team}")

    logger.info(
        "\nUse --list to see suggestions, --auto-fix to fix automatically, "
        "or --interactive for manual mapping"
    )


if __name__ == "__main__":
    main()
