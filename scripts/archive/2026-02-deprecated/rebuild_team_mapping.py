"""Rebuild team name mapping with proper normalization.

Handles common team name variations:
1. St/St./Saint/State disambiguation
2. Mascot name removal (ESPN adds mascots)
3. Special character normalization (apostrophes, periods, hyphens)
4. Abbreviation expansion (CSUN, CSU, etc.)
5. Case-insensitive matching

Usage:
    uv run python scripts/rebuild_team_mapping.py

    # Review matches before saving
    uv run python scripts/rebuild_team_mapping.py --review

    # Save to custom path
    uv run python scripts/rebuild_team_mapping.py --output data/team_mapping_v2.parquet
"""

import argparse
import json
import logging
import re
import sqlite3
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def normalize_team_name(name: str, remove_mascot: bool = False) -> str:
    """Normalize team name for matching.

    Args:
        name: Raw team name
        remove_mascot: If True, remove common mascot words

    Returns:
        Normalized name (lowercase, no special chars, standardized abbreviations)
    """
    if not name:
        return ""

    # Convert to lowercase
    normalized = name.lower()

    # Remove possessive apostrophes: "st. john's" -> "st. johns"
    normalized = normalized.replace("'s ", "s ").replace("'s", "s")

    # Standardize St./Saint/State
    # Rule: "st." or "st" at start of name = Saint, otherwise = State
    # "st. john" -> "saint john", "kansas st" -> "kansas state"
    if normalized.startswith("st. ") or normalized.startswith("st "):
        normalized = "saint " + normalized[normalized.index(" ") + 1 :]
    else:
        # State abbreviations (not at start)
        normalized = re.sub(r"\bst\.?\s", " state ", normalized)
        normalized = re.sub(r"\bst\.?$", " state", normalized)

    # Expand common abbreviations
    abbreviations = {
        r"\bcsun\b": "cal state northridge",
        r"\bcsu\s": "cal state ",
        r"\bcal\s": "california ",
        r"\bunc\b": "north carolina",
        r"\bunc\s": "north carolina ",
        r"\bu\.?c\.?\s": "university of california ",
        r"\bucf\b": "central florida",
        r"\busc\b": "southern california",
        r"\busf\b": "south florida",
        r"\buab\b": "alabama birmingham",
        r"\butep\b": "texas el paso",
        r"\butsa\b": "texas san antonio",
        r"\bfiu\b": "florida international",
        r"\bliu\b": "long island",
        r"\bvcu\b": "virginia commonwealth",
        r"\bsmu\b": "southern methodist",
        r"\btcu\b": "texas christian",
        r"\bbyu\b": "brigham young",
        r"\blsu\b": "louisiana state",
        r"\bnjit\b": "new jersey tech",
        r"\bsiue\b": "southern illinois edwardsville",
        r"\bumbc\b": "maryland baltimore county",
        r"\bumkc\b": "missouri kansas city",
        r"\bul\s": "louisiana ",
        r"\bgw\b": "george washington",
        r"\bappalachian\b": "app",
    }

    for abbr, expansion in abbreviations.items():
        normalized = re.sub(abbr, expansion, normalized)

    # Remove "university" and "college" (redundant institutional words)
    normalized = re.sub(r"\buniversity\b", "", normalized)
    normalized = re.sub(r"\bcollege\b", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    # Remove common mascot words (if requested)
    if remove_mascot:
        mascots = [
            # Compound mascots (must come before single-word mascots)
            "black knights",
            "golden lions",
            "golden eagles",
            "red wolves",
            "blue hens",
            "great danes",
            "sea wolves",
            "river hawks",
            "mountain hawks",
            "rainbow warriors",
            "nittany lions",
            "crimson tide",
            "fighting illini",
            "tar heels",
            "blue devils",
            "golden gophers",
            "scarlet knights",
            "demon deacons",
            "yellow jackets",
            "red raiders",
            "horned frogs",
            "runnin rebels",
            "fighting camels",
            "golden griffins",
            "purple aces",
            "big red",
            "big green",
            "red foxes",
            "thundering herd",
            "black bears",
            "blue demons",
            # Common animal mascots
            "wildcats",
            "bulldogs",
            "eagles",
            "tigers",
            "bears",
            "cougars",
            "panthers",
            "hawks",
            "huskies",
            "aggies",
            "cardinals",
            "pirates",
            "terriers",
            "warriors",
            "raiders",
            "spartans",
            "trojans",
            "badgers",
            "wolverines",
            "bruins",
            "ducks",
            "buffaloes",
            "utes",
            "falcons",
            "owls",
            "lions",
            "rams",
            "broncos",
            "mustangs",
            "jaguars",
            "leopards",
            "bobcats",
            "grizzlies",
            "phoenix",
            "seawolves",
            "golden eagles",
            "seahawks",
            "redhawks",
            "blackbirds",
            "roadrunners",
            "retrievers",
            "greyhounds",
            "peacocks",
            "penguins",
            "griffins",
            "mastodons",
            "bison",
            "antelopes",
            "jackrabbits",
            "bearcats",
            "braves",
            "bulls",
            "bluejays",
            "dragons",
            "dukes",
            "gators",
            "vandals",
            "flames",
            "lancers",
            "jaspers",
            "terrapins",
            "ospreys",
            "bengals",
            "paladins",
            # Unique/creative mascots
            "volunteers",
            "mountaineers",
            "orange",
            "hoosiers",
            "jayhawks",
            "sooners",
            "buckeyes",
            "boilermakers",
            "cornhuskers",
            "razorbacks",
            "gamecocks",
            "seminoles",
            "cavaliers",
            "hokies",
            "hurricanes",
            "longhorns",
            "cyclones",
            "cowboys",
            "sun devils",
            "matadors",
            "revolutionaries",
            "zips",
            "flyers",
            "crimson",
            "minutemen",
            "racers",
            "miners",
            "hilltoppers",
            "governors",
            "colonels",
            "privateers",
            "explorers",
            "navigators",
            "crusaders",
            "friars",
            "musketeers",
            "raiders",
            "runnin rebels",
            "rebels",
            "ramblers",
            "redbirds",
            "river hawks",
            "royals",
            "statesmen",
            "vikings",
            "gaels",
            "saints",
            "pioneers",
            "knights",
            "49ers",
            "lightning",
            "thunder",
            "fire",
            "pride",
            "lumberjacks",
            "bearkats",
            "chanticleers",
            "catamounts",
            "blazers",
            "wave",
            "rainbow warriors",
        ]

        for mascot in mascots:
            normalized = normalized.replace(f" {mascot}", "")

    # Remove special characters and extra spaces
    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    return normalized


def similarity_score(name1: str, name2: str) -> float:
    """Calculate similarity between two team names.

    Args:
        name1: First team name (normalized)
        name2: Second team name (normalized)

    Returns:
        Similarity score (0.0 to 1.0)
    """
    return SequenceMatcher(None, name1, name2).ratio()


def find_best_match(
    target_name: str,
    candidates: list[tuple[str, str]],
    threshold: float = 0.75,
) -> tuple[str, float] | None:
    """Find best matching team name from candidates.

    Args:
        target_name: Team name to match (from source A)
        candidates: List of (original_name, normalized_name) tuples (from source B)
        threshold: Minimum similarity score to accept

    Returns:
        (matched_name, score) or None if no good match
    """
    target_normalized = normalize_team_name(target_name)
    target_no_mascot = normalize_team_name(target_name, remove_mascot=True)

    best_match = None
    best_score = 0.0

    for original, normalized in candidates:
        # Try exact match first
        if target_normalized == normalized:
            return (original, 1.0)

        # Try without mascot
        normalized_no_mascot = normalize_team_name(original, remove_mascot=True)
        if target_no_mascot == normalized_no_mascot:
            return (original, 0.95)

        # Calculate similarity
        score1 = similarity_score(target_normalized, normalized)
        score2 = similarity_score(target_no_mascot, normalized_no_mascot)
        score = max(score1, score2)

        if score > best_score:
            best_score = score
            best_match = original

    if best_score >= threshold:
        return (best_match, best_score)

    return None


def load_kenpom_teams(kenpom_path: Path) -> pd.DataFrame:
    """Load KenPom team names.

    Args:
        kenpom_path: Path to KenPom data directory

    Returns:
        DataFrame with TeamName column
    """
    ratings_file = kenpom_path / "ratings" / "season" / "ratings_2026.parquet"
    if not ratings_file.exists():
        raise FileNotFoundError(f"KenPom ratings not found: {ratings_file}")

    df = pd.read_parquet(ratings_file)
    return df[["TeamName"]].drop_duplicates().sort_values("TeamName")


def load_odds_api_teams(db_path: Path) -> pd.DataFrame:
    """Load Odds API team names from database.

    Args:
        db_path: Path to Odds API database

    Returns:
        DataFrame with team_name column
    """
    conn = sqlite3.connect(str(db_path))
    try:
        query = """
            SELECT DISTINCT home_team as team_name FROM events
            UNION
            SELECT DISTINCT away_team as team_name FROM events
            ORDER BY team_name
        """
        return pd.read_sql_query(query, conn)
    finally:
        conn.close()


def load_espn_teams(team_logos_dir: Path) -> pd.DataFrame:
    """Load ESPN team names from team logo filenames.

    Args:
        team_logos_dir: Path to ESPN team logos directory

    Returns:
        DataFrame with espn_name column
    """
    if not team_logos_dir.exists():
        logger.warning(f"ESPN team logos directory not found: {team_logos_dir}")
        return pd.DataFrame(columns=["espn_name"])

    # Extract team names from logo filenames
    # Format: "{team-slug}-{mascot}.png" -> "Team Name Mascot"
    espn_names = []
    for logo_file in team_logos_dir.glob("*.png"):
        # Remove .png extension
        filename = logo_file.stem

        # Convert kebab-case to Title Case
        # "abilene-christian-wildcats" -> "Abilene Christian Wildcats"
        team_name = filename.replace("-", " ").title()
        espn_names.append(team_name)

    logger.info(f"  Extracted {len(espn_names)} team names from logo filenames")
    return pd.DataFrame({"espn_name": sorted(espn_names)})


def load_manual_overrides(overrides_path: Path) -> dict[str, dict[str, str]]:
    """Load manual team name mapping overrides.

    Args:
        overrides_path: Path to JSON file with manual overrides

    Returns:
        Dictionary mapping kenpom_name to {odds_api_name, espn_name}
    """
    if not overrides_path.exists():
        logger.warning(f"No overrides file found at {overrides_path}")
        return {}

    with open(overrides_path, encoding="utf-8") as f:
        data = json.load(f)

    overrides = data.get("overrides", {})
    logger.info(f"Loaded {len(overrides)} manual overrides")
    return overrides


def build_team_mapping(
    kenpom_df: pd.DataFrame,
    odds_api_df: pd.DataFrame,
    espn_df: pd.DataFrame,
    manual_overrides: dict[str, dict[str, str]] | None = None,
    threshold: float = 0.75,
) -> pd.DataFrame:
    """Build comprehensive team name mapping.

    Args:
        kenpom_df: KenPom teams (TeamName column)
        odds_api_df: Odds API teams (team_name column)
        espn_df: ESPN teams (espn_name column)
        manual_overrides: Optional manual mappings to apply first
        threshold: Minimum similarity score for matching

    Returns:
        DataFrame with kenpom_name, odds_api_name, espn_name, match scores
    """
    kenpom_teams = kenpom_df["TeamName"].tolist()

    # Prepare candidate lists with normalized names
    odds_candidates = [
        (name, normalize_team_name(name)) for name in odds_api_df["team_name"].tolist()
    ]
    espn_candidates = [(name, normalize_team_name(name)) for name in espn_df["espn_name"].tolist()]

    if manual_overrides is None:
        manual_overrides = {}

    mappings = []

    for kenpom_name in kenpom_teams:
        logger.debug(f"Matching: {kenpom_name}")

        # Check manual overrides first
        if kenpom_name in manual_overrides:
            override = manual_overrides[kenpom_name]
            odds_name = override.get("odds_api_name", "")
            espn_name = override.get("espn_name", "")
            odds_score = 1.0 if odds_name else 0.0
            espn_score = 1.0 if espn_name else 0.0
            logger.debug(f"  Applied manual override: odds={odds_name}, espn={espn_name}")
        else:
            # Find best Odds API match
            odds_match = find_best_match(kenpom_name, odds_candidates, threshold)
            odds_name = odds_match[0] if odds_match else ""
            odds_score = odds_match[1] if odds_match else 0.0

            # Find best ESPN match
            espn_match = find_best_match(kenpom_name, espn_candidates, threshold)
            espn_name = espn_match[0] if espn_match else ""
            espn_score = espn_match[1] if espn_match else 0.0

        mappings.append(
            {
                "kenpom_name": kenpom_name,
                "odds_api_name": odds_name,
                "odds_api_score": round(odds_score, 3),
                "espn_name": espn_name,
                "espn_score": round(espn_score, 3),
            }
        )

        if odds_name:
            logger.debug(f"  Odds API: {odds_name} (score: {odds_score:.3f})")
        if espn_name:
            logger.debug(f"  ESPN: {espn_name} (score: {espn_score:.3f})")

    return pd.DataFrame(mappings)


def main() -> None:
    """Rebuild team mapping with proper normalization."""
    parser = argparse.ArgumentParser(description="Rebuild team name mapping")
    parser.add_argument(
        "--kenpom-path",
        type=Path,
        default=Path("data/kenpom"),
        help="Path to KenPom data directory",
    )
    parser.add_argument(
        "--odds-db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to Odds API database",
    )
    parser.add_argument(
        "--espn-logos",
        type=Path,
        default=Path("data/espn/team_logos"),
        help="Path to ESPN team logos directory",
    )
    parser.add_argument(
        "--overrides",
        type=Path,
        default=Path("data/staging/mappings/team_mapping_overrides.json"),
        help="Path to manual overrides JSON file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/team_mapping_fixed.parquet"),
        help="Output path for new mapping",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.75,
        help="Minimum similarity score for matching (0.0-1.0)",
    )
    parser.add_argument(
        "--review",
        action="store_true",
        help="Review matches before saving",
    )

    args = parser.parse_args()

    logger.info("=" * 80)
    logger.info("REBUILDING TEAM NAME MAPPING")
    logger.info("=" * 80)

    # Load team lists
    logger.info("\n[1/4] Loading team names from sources...")
    kenpom_df = load_kenpom_teams(args.kenpom_path)
    logger.info(f"  KenPom: {len(kenpom_df)} teams")

    odds_api_df = load_odds_api_teams(args.odds_db)
    logger.info(f"  Odds API: {len(odds_api_df)} teams")

    espn_df = load_espn_teams(args.espn_logos)
    logger.info(f"  ESPN: {len(espn_df)} teams")

    # Load manual overrides
    logger.info("\n[2/5] Loading manual overrides...")
    manual_overrides = load_manual_overrides(args.overrides)

    # Build mapping
    logger.info(f"\n[3/5] Building mappings (threshold: {args.threshold})...")
    mapping_df = build_team_mapping(
        kenpom_df, odds_api_df, espn_df, manual_overrides, args.threshold
    )

    # Statistics
    logger.info("\n[4/5] Mapping statistics:")
    odds_matched = (mapping_df["odds_api_name"] != "").sum()
    espn_matched = (mapping_df["espn_name"] != "").sum()

    odds_pct = odds_matched / len(mapping_df) * 100
    espn_pct = espn_matched / len(mapping_df) * 100
    logger.info(f"  Odds API matches: {odds_matched}/{len(mapping_df)} ({odds_pct:.1f}%)")
    logger.info(f"  ESPN matches: {espn_matched}/{len(mapping_df)} ({espn_pct:.1f}%)")

    # Show unmatched teams
    odds_unmatched = mapping_df[mapping_df["odds_api_name"] == ""]
    if len(odds_unmatched) > 0:
        logger.warning(f"\n  Unmatched Odds API teams ({len(odds_unmatched)}):")
        for _, row in odds_unmatched.head(10).iterrows():
            logger.warning(f"    - {row['kenpom_name']}")

    espn_unmatched = mapping_df[mapping_df["espn_name"] == ""]
    if len(espn_unmatched) > 0:
        logger.warning(f"\n  Unmatched ESPN teams ({len(espn_unmatched)}):")
        for _, row in espn_unmatched.head(10).iterrows():
            logger.warning(f"    - {row['kenpom_name']}")

    # Review mode
    if args.review:
        logger.info("\n[REVIEW MODE] Sample of low-confidence matches:")
        low_confidence = mapping_df[
            ((mapping_df["odds_api_score"] > 0) & (mapping_df["odds_api_score"] < 0.9))
            | ((mapping_df["espn_score"] > 0) & (mapping_df["espn_score"] < 0.9))
        ]

        for _, row in low_confidence.head(20).iterrows():
            logger.info(f"\n  KenPom: {row['kenpom_name']}")
            if row["odds_api_name"]:
                logger.info(
                    f"    → Odds API: {row['odds_api_name']} (score: {row['odds_api_score']})"
                )
            if row["espn_name"]:
                logger.info(f"    → ESPN: {row['espn_name']} (score: {row['espn_score']})")

        confirm = input("\nProceed with saving? (y/n): ").strip().lower()
        if confirm != "y":
            logger.info("Aborted by user")
            return

    # Save
    logger.info(f"\n[5/5] Saving mapping to {args.output}...")
    args.output.parent.mkdir(parents=True, exist_ok=True)

    # Backup old mapping if it exists
    if args.output.exists():
        backup_path = args.output.with_suffix(".backup.parquet")
        import shutil

        shutil.copy(args.output, backup_path)
        logger.info(f"  Backed up old mapping to {backup_path}")

    mapping_df.to_parquet(args.output, index=False)

    logger.info("\n" + "=" * 80)
    logger.info("[OK] Team mapping rebuilt successfully!")
    logger.info(f"Saved to: {args.output}")
    logger.info(f"Total teams: {len(mapping_df)}")
    odds_coverage_pct = odds_matched / len(mapping_df) * 100
    espn_coverage_pct = espn_matched / len(mapping_df) * 100
    logger.info(f"Odds API coverage: {odds_matched}/{len(mapping_df)} ({odds_coverage_pct:.1f}%)")
    logger.info(f"ESPN coverage: {espn_matched}/{len(mapping_df)} ({espn_coverage_pct:.1f}%)")
    logger.info("=" * 80)


if __name__ == "__main__":
    main()
