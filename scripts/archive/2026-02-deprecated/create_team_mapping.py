"""Create team name mapping across KenPom, ESPN, and Odds API.

Uses fuzzy string matching to map team names across different data sources.

Usage:
    uv run python scripts/create_team_mapping.py
"""

import logging
from pathlib import Path

import pandas as pd
from thefuzz import fuzz, process

from sports_betting_edge.adapters.filesystem import write_parquet

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def load_kenpom_teams(season: int = 2026) -> set[str]:
    """Load unique KenPom team names.

    Args:
        season: Season year

    Returns:
        Set of team names from KenPom
    """
    kenpom_file = Path(f"data/kenpom/ratings/season/ratings_{season}.parquet")
    if not kenpom_file.exists():
        logger.warning(f"KenPom ratings not found: {kenpom_file}")
        return set()

    df = pd.read_parquet(kenpom_file)
    teams = set(df["TeamName"].unique())
    logger.info(f"Loaded {len(teams)} teams from KenPom")
    return teams


def load_espn_teams() -> set[str]:
    """Load unique ESPN team names from schedule files.

    Returns:
        Set of team names from ESPN
    """
    espn_dir = Path("data/espn/schedule")
    if not espn_dir.exists():
        logger.warning(f"ESPN schedule directory not found: {espn_dir}")
        return set()

    teams = set()
    parquet_files = list(espn_dir.glob("*.parquet"))

    for file in parquet_files:
        try:
            df = pd.read_parquet(file)
            teams.update(df["home_team"].unique())
            teams.update(df["away_team"].unique())
        except Exception as e:
            logger.warning(f"Error reading {file}: {e}")

    logger.info(f"Loaded {len(teams)} teams from ESPN ({len(parquet_files)} files)")
    return teams


def load_odds_api_teams() -> set[str]:
    """Load unique Odds API team names from database.

    Returns:
        Set of team names from Odds API
    """
    import sqlite3

    db_path = Path("data/odds_api/odds_api.sqlite3")
    if not db_path.exists():
        logger.warning(f"Odds API database not found: {db_path}")
        return set()

    conn = sqlite3.connect(str(db_path))

    # Get teams from events table
    query = """
    SELECT DISTINCT home_team FROM events
    UNION
    SELECT DISTINCT away_team FROM events
    """

    teams_df = pd.read_sql_query(query, conn)
    conn.close()

    teams = set(teams_df.iloc[:, 0].unique())
    logger.info(f"Loaded {len(teams)} teams from Odds API")
    return teams


def fuzzy_match_team(
    team_name: str, candidates: list[str], threshold: int = 70
) -> tuple[str | None, int]:
    """Find best fuzzy match for a team name.

    Prioritizes exact matches and prefix matches over fuzzy matches.

    Args:
        team_name: Team name to match
        candidates: List of candidate team names
        threshold: Minimum match score (0-100)

    Returns:
        (best_match, score) or (None, 0) if no match above threshold
    """
    if not candidates:
        return None, 0

    # Step 1: Try exact match
    for candidate in candidates:
        if team_name.lower() == candidate.lower():
            return candidate, 100

    # Step 2: Try exact match with normalized spaces/punctuation
    normalized_team = team_name.lower().replace(".", "").replace("  ", " ").strip()
    for candidate in candidates:
        normalized_candidate = candidate.lower().replace(".", "").replace("  ", " ").strip()
        if normalized_team == normalized_candidate:
            return candidate, 100

    # Step 3: Try prefix match (e.g., "Kentucky" at start of "Kentucky Wildcats")
    for candidate in candidates:
        if candidate.lower().startswith(team_name.lower() + " "):
            # Verify it's not a different school with similar name
            # e.g., "Alabama" shouldn't match "Alabama A&M"
            words_after = candidate[len(team_name) :].strip().split()
            # If next word is A&M, State, Tech, etc., different school
            exclusions = ["a&m", "state", "tech", "international"]
            if words_after and words_after[0].lower() not in exclusions:
                return candidate, 95

    # Step 4: Use fuzzy matching (but be careful)
    result = process.extractOne(team_name, candidates, scorer=fuzz.token_sort_ratio)

    if result and result[1] >= threshold:
        # Extra validation: check it's not a completely different school
        match_text = result[0].lower()
        team_lower = team_name.lower()

        # Don't match if the team name appears in the middle of another school's name
        # e.g., "Duke" shouldn't match "James Madison Dukes"
        if team_lower in match_text and not match_text.startswith(team_lower):
            return None, 0

        return result[0], result[1]

    return None, 0


def create_team_mapping() -> pd.DataFrame:
    """Create comprehensive team name mapping.

    Returns:
        DataFrame with columns: kenpom_name, espn_name, odds_api_name, match_confidence
    """
    logger.info("Loading team names from all sources...")

    kenpom_teams = load_kenpom_teams()
    espn_teams = load_espn_teams()
    odds_api_teams = load_odds_api_teams()

    # Use KenPom as the canonical source (most standardized names)
    mappings = []

    for kenpom_name in sorted(kenpom_teams):
        mapping = {
            "kenpom_name": kenpom_name,
            "espn_name": None,
            "espn_match_score": 0,
            "odds_api_name": None,
            "odds_api_match_score": 0,
        }

        # Match to ESPN (lower threshold since ESPN has fewer teams)
        espn_match, espn_score = fuzzy_match_team(kenpom_name, list(espn_teams), threshold=70)
        if espn_match:
            mapping["espn_name"] = espn_match
            mapping["espn_match_score"] = espn_score

        # Match to Odds API (lower threshold, Odds API has mascots)
        odds_match, odds_score = fuzzy_match_team(
            kenpom_name,
            list(odds_api_teams),
            threshold=60,  # Lower because "Kentucky" vs "Kentucky Wildcats"
        )
        if odds_match:
            mapping["odds_api_name"] = odds_match
            mapping["odds_api_match_score"] = odds_score

        mappings.append(mapping)

    df = pd.DataFrame(mappings)

    # Calculate overall match confidence
    df["avg_match_score"] = (df["espn_match_score"] + df["odds_api_match_score"]) / 2

    return df


def validate_mappings(df: pd.DataFrame) -> None:
    """Validate and report on mapping quality.

    Args:
        df: Team mapping DataFrame
    """
    total = len(df)

    # Count matches
    espn_matched = df["espn_name"].notna().sum()
    odds_matched = df["odds_api_name"].notna().sum()
    both_matched = ((df["espn_name"].notna()) & (df["odds_api_name"].notna())).sum()

    logger.info("\n=== Mapping Quality ===")
    logger.info(f"Total KenPom teams: {total}")
    logger.info(f"Matched to ESPN: {espn_matched} ({espn_matched / total:.1%})")
    logger.info(f"Matched to Odds API: {odds_matched} ({odds_matched / total:.1%})")
    logger.info(f"Matched to both: {both_matched} ({both_matched / total:.1%})")

    # Show low-confidence matches
    low_confidence = df[
        ((df["espn_match_score"] > 0) & (df["espn_match_score"] < 90))
        | ((df["odds_api_match_score"] > 0) & (df["odds_api_match_score"] < 90))
    ].sort_values("avg_match_score")

    if len(low_confidence) > 0:
        logger.info("\n=== Low Confidence Matches (score < 90) ===")
        for _, row in low_confidence.head(10).iterrows():
            logger.info(f"\nKenPom: {row['kenpom_name']}")
            if row["espn_name"]:
                logger.info(f"  ESPN: {row['espn_name']} (score: {row['espn_match_score']})")
            if row["odds_api_name"]:
                logger.info(
                    f"  Odds API: {row['odds_api_name']} (score: {row['odds_api_match_score']})"
                )

    # Show unmatched teams
    unmatched = df[(df["espn_name"].isna()) & (df["odds_api_name"].isna())]

    if len(unmatched) > 0:
        logger.info(f"\n=== Unmatched Teams ({len(unmatched)}) ===")
        for name in unmatched["kenpom_name"].head(10):
            logger.info(f"  - {name}")


def main() -> None:
    """Create and save team name mapping."""
    logger.info("Creating team name mapping...")

    # Create mapping
    df = create_team_mapping()

    # Validate
    validate_mappings(df)

    # Save to parquet (fill NaN with empty string for pyarrow compatibility)
    output_path = Path("data/staging/mappings/team_mapping.parquet")
    df_clean = df.fillna("")  # Replace NaN with empty string
    write_parquet(df_clean.to_dict(orient="records"), output_path)

    logger.info(f"\n[OK] Team mapping saved to {output_path}")
    logger.info(f"Total mappings: {len(df)}")

    # Show sample
    logger.info("\n=== Sample Mappings ===")
    sample = df[df["odds_api_name"].notna()].head(5)
    for _, row in sample.iterrows():
        logger.info(f"\nKenPom: {row['kenpom_name']}")
        logger.info(f"  ESPN: {row['espn_name']} (score: {row['espn_match_score']})")
        logger.info(f"  Odds API: {row['odds_api_name']} (score: {row['odds_api_match_score']})")


if __name__ == "__main__":
    main()
