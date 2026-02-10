"""Compare Overtime.ag odds vs KenPom FanMatch predictions.

Loads Overtime closing lines and KenPom FanMatch predictions for a given
date, matches them by team names, and compares predicted spreads/totals
against each other and actual results.

Usage:
    uv run python scripts/analysis/compare_overtime_vs_kenpom.py --date 2026-02-08
    uv run python scripts/analysis/compare_overtime_vs_kenpom.py --date 2026-02-09
"""

from __future__ import annotations

import argparse
import asyncio
import glob
import logging
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.kenpom import KenPomAdapter
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.config.logging import configure_logging

configure_logging()
logger = logging.getLogger(__name__)


# ── Team name normalization for cross-source matching ──────────────────

TEAM_ALIASES: dict[str, str] = {
    # KenPom name -> Overtime/canonical name
    "South Fla.": "South Florida",
    "Penn St.": "Penn State",
    "Ohio St.": "Ohio State",
    "UNC Greensboro": "NC Greensboro",
    "UNCG": "NC Greensboro",
    "Wichita St.": "Wichita State",
    "Charlotte": "Charlotte U",
    "UCF": "Central Florida",
    "Mich. St.": "Michigan State",
    "N.C. State": "NC State",
    "Ill.": "Illinois",
}


def normalize_team(name: str) -> str:
    """Normalize team name for cross-source matching."""
    if name in TEAM_ALIASES:
        return TEAM_ALIASES[name]
    # Strip common suffixes
    for suffix in [
        " Bulldogs",
        " Tigers",
        " Bears",
        " Wolverines",
        " Buckeyes",
        " Red Raiders",
        " Mountaineers",
        " Paladins",
        " Spartans",
        " Shockers",
        " Green Wave",
        " 49ers",
        " Bearcats",
        " Knights",
        " Golden Gophers",
        " Terrapins",
        " Blazers",
        " Owls",
        " Hawkeyes",
        " Wildcats",
        " Bulls",
        " Golden Hurricane",
        " Nittany Lions",
        " Trojans",
        " Rainbow Warriors",
        " Tritons",
        " Cougars",
        " Gaels",
        " Dons",
    ]:
        if name.endswith(suffix):
            return name[: -len(suffix)].strip()
    return name


def fuzzy_match(name1: str, name2: str) -> bool:
    """Check if two team names likely refer to the same team."""
    n1 = normalize_team(name1).lower()
    n2 = normalize_team(name2).lower()
    # Exact match after normalization
    if n1 == n2:
        return True
    # One contains the other
    if n1 in n2 or n2 in n1:
        return True
    # Check key words overlap
    words1 = set(n1.split())
    words2 = set(n2.split())
    overlap = words1 & words2
    # If significant word overlap (excluding common words)
    common = {"st", "state", "u", "university"}
    meaningful = overlap - common
    return len(meaningful) >= 1


# ── Data loading ───────────────────────────────────────────────────────


def load_overtime_closing_lines(target_date: str) -> pd.DataFrame:
    """Load the last Overtime snapshot for each game on the target date.

    For each game, finds the most recent snapshot that still has a
    full-game line (before the game went live/in-progress). This gives
    the closing line for each game.

    Args:
        target_date: Date in YYYY-MM-DD format

    Returns:
        DataFrame with one row per game (full-game closing lines)
    """
    pattern = (
        f"data/source/overtime/api/college_basketball/college_basketball_{target_date}_*.parquet"
    )
    files = sorted(glob.glob(pattern))
    if not files:
        logger.warning(f"No Overtime files found for {target_date}")
        return pd.DataFrame()

    logger.info(f"Found {len(files)} Overtime snapshots for {target_date}")

    # Read ALL snapshots and find last full-game line per game
    closing_lines: dict[str, pd.Series] = {}  # game_key -> last row

    for f in files:
        df = pd.read_parquet(f)
        full_game = df[df["period_description"] == "Game"]
        for _, row in full_game.iterrows():
            game_key = f"{row['team1_id']}_{row['team2_id']}"
            closing_lines[game_key] = row

    if not closing_lines:
        logger.warning("No full-game lines found in any snapshot")
        return pd.DataFrame()

    full_game = pd.DataFrame(closing_lines.values())
    logger.info(f"  Closing lines: {len(full_game)} games (per-game latest)")

    # Rename for clarity
    full_game = full_game.rename(
        columns={
            "team1_id": "ot_away_team",
            "team2_id": "ot_home_team",
            "spread_magnitude": "ot_spread_magnitude",
            "favorite_team": "ot_favorite",
            "total_points": "ot_total",
        }
    )

    # Compute Overtime predicted margin (home perspective)
    # Positive = home wins, negative = away wins
    # If home is favored by 5, predicted margin = +5
    # If away is favored by 5, predicted margin = -5
    full_game["ot_predicted_margin"] = full_game.apply(
        lambda r: r["ot_spread_magnitude"]
        if fuzzy_match(r["ot_favorite"], r["ot_home_team"])
        else -r["ot_spread_magnitude"],
        axis=1,
    )

    return full_game[
        [
            "ot_away_team",
            "ot_home_team",
            "ot_spread_magnitude",
            "ot_favorite",
            "ot_total",
            "ot_predicted_margin",
            "game_datetime",
            "captured_at",
        ]
    ]


async def fetch_kenpom_fanmatch(target_date: str) -> pd.DataFrame:
    """Fetch KenPom FanMatch predictions for a date.

    Args:
        target_date: Date in YYYY-MM-DD format

    Returns:
        DataFrame with KenPom predictions per game
    """
    kenpom = KenPomAdapter()
    try:
        games = await kenpom.get_fanmatch(target_date)
        logger.info(f"KenPom FanMatch: {len(games)} games for {target_date}")
    finally:
        await kenpom.close()

    if not games:
        return pd.DataFrame()

    rows = []
    for g in games:
        home = g.get("Home") or g.get("Team2")
        visitor = g.get("Visitor") or g.get("Team1")
        home_pred = g.get("HomePred")
        visitor_pred = g.get("VisitorPred")

        # Some API responses use different field names
        if home_pred is None:
            # Try alternate field names
            predicted_score = g.get("PredictedScore", "")
            if predicted_score and "-" in str(predicted_score):
                parts = str(predicted_score).split("-")
                try:
                    s1, s2 = float(parts[0]), float(parts[1])
                    winner = g.get("PredictedWinner", "")
                    if winner and fuzzy_match(winner, home or ""):
                        home_pred, visitor_pred = s1, s2
                    else:
                        home_pred, visitor_pred = s2, s1
                except (ValueError, IndexError):
                    pass

        kp_spread = None
        kp_total = None
        if home_pred is not None and visitor_pred is not None:
            kp_spread = float(home_pred) - float(visitor_pred)
            kp_total = float(home_pred) + float(visitor_pred)

        rows.append(
            {
                "kp_home": home,
                "kp_visitor": visitor,
                "kp_home_pred": home_pred,
                "kp_visitor_pred": visitor_pred,
                "kp_home_spread": kp_spread,
                "kp_total": kp_total,
                "kp_home_wp": g.get("HomeWP"),
                "kp_pred_tempo": g.get("PredTempo"),
                "kp_thrill_score": g.get("ThrillScore"),
                "kp_predicted_winner": g.get("PredictedWinner"),
                "kp_predicted_mov": g.get("PredictedMOV"),
            }
        )

    return pd.DataFrame(rows)


def load_actual_results(
    target_date: str, db_path: str = "data/odds_api/odds_api.sqlite3"
) -> pd.DataFrame:
    """Load actual game results from Odds API database.

    Args:
        target_date: Date in YYYY-MM-DD format
        db_path: Path to Odds API SQLite database

    Returns:
        DataFrame with actual scores
    """
    db = OddsAPIDatabase(db_path)
    query = """
    SELECT
        e.event_id,
        e.home_team,
        e.away_team,
        e.commence_time,
        s.home_score,
        s.away_score
    FROM events e
    INNER JOIN scores s ON e.event_id = s.event_id
    WHERE DATE(e.commence_time) = ?
        AND s.completed = 1
        AND s.home_score IS NOT NULL
        AND e.sport_key = 'basketball_ncaab'
    ORDER BY e.commence_time
    """
    df = pd.read_sql_query(query, db.conn, params=[target_date])
    logger.info(f"Actual results: {len(df)} completed games for {target_date}")

    df["actual_home_score"] = df["home_score"].astype(float)
    df["actual_away_score"] = df["away_score"].astype(float)
    df["actual_margin"] = df["actual_home_score"] - df["actual_away_score"]
    df["actual_total"] = df["actual_home_score"] + df["actual_away_score"]

    return df


# ── Matching logic ─────────────────────────────────────────────────────


def match_games(
    overtime_df: pd.DataFrame,
    kenpom_df: pd.DataFrame,
    actuals_df: pd.DataFrame,
) -> pd.DataFrame:
    """Match games across Overtime, KenPom, and actual results.

    Uses fuzzy team name matching to join the three sources.

    Returns:
        Merged DataFrame with all available data per game
    """
    matched = []

    for _, ot in overtime_df.iterrows():
        ot_home = ot["ot_home_team"]
        ot_away = ot["ot_away_team"]

        row: dict = {**ot.to_dict()}

        # Match KenPom
        kp_match = None
        for _, kp in kenpom_df.iterrows():
            if fuzzy_match(kp["kp_home"], ot_home) and fuzzy_match(kp["kp_visitor"], ot_away):
                kp_match = kp
                break
            # Try reversed (sometimes home/away differ)
            if fuzzy_match(kp["kp_home"], ot_away) and fuzzy_match(kp["kp_visitor"], ot_home):
                kp_match = kp
                # Flip the spread since home/away reversed
                row["kp_home_flipped"] = True
                break

        if kp_match is not None:
            for col in kenpom_df.columns:
                row[col] = kp_match[col]
        else:
            logger.warning(f"  No KenPom match for: {ot_away} @ {ot_home}")

        # Match actual results
        act_match = None
        for _, act in actuals_df.iterrows():
            espn_home = normalize_team(act["home_team"])
            espn_away = normalize_team(act["away_team"])
            if fuzzy_match(espn_home, ot_home) and fuzzy_match(espn_away, ot_away):
                act_match = act
                break

        if act_match is not None:
            row["actual_home_score"] = act_match["actual_home_score"]
            row["actual_away_score"] = act_match["actual_away_score"]
            row["actual_margin"] = act_match["actual_margin"]
            row["actual_total"] = act_match["actual_total"]
        else:
            logger.warning(f"  No actual result for: {ot_away} @ {ot_home}")

        matched.append(row)

    return pd.DataFrame(matched)


# ── Analysis ───────────────────────────────────────────────────────────


def analyze_comparison(df: pd.DataFrame) -> None:
    """Print comparison analysis between Overtime and KenPom.

    All spread/margin values use score-difference convention:
      Positive = home team wins/favored
      Negative = away team wins/favored
    """
    has_kp = df["kp_home_spread"].notna()
    has_actual = df["actual_margin"].notna()
    both = has_kp & has_actual

    print("\n" + "=" * 110)
    print("OVERTIME vs KENPOM COMPARISON")
    print("=" * 110)
    print("(Spread = absolute pts, favorite team shown. Totals = predicted combined score.)")

    # ── Helper: format spread as "5.0 (TeamName)" ──
    def fmt_spread(margin: float | None, home: str, away: str) -> str:
        if margin is None or pd.isna(margin):
            return "N/A"
        magnitude = abs(margin)
        fav = home if margin > 0 else away
        # Shorten team name for display
        short_fav = fav.split()[-1] if len(fav) > 10 else fav
        return f"{magnitude:.1f} ({short_fav})"

    def fmt_winner(margin: float | None, home: str, away: str) -> str:
        if margin is None or pd.isna(margin):
            return "N/A"
        winner = home if margin > 0 else away
        short = winner.split()[-1] if len(winner) > 10 else winner
        return f"{abs(margin):.0f} ({short})"

    # ── Game-by-game comparison ──
    print(
        f"\n{'Game':<30} {'OT Spread':<18} {'KP Spread':<18} "
        f"{'OT Total':>9} {'KP Total':>9}  {'Result':<18}"
    )
    print("-" * 110)

    for _, r in df.iterrows():
        home = r["ot_home_team"]
        away = r["ot_away_team"]
        game_label = f"{away} @ {home}"
        ot_spread = fmt_spread(r.get("ot_predicted_margin"), home, away)
        kp_spread = fmt_spread(r.get("kp_home_spread"), home, away)
        ot_total = f"{r['ot_total']:.1f}" if pd.notna(r.get("ot_total")) else "N/A"
        kp_total = f"{r['kp_total']:.1f}" if pd.notna(r.get("kp_total")) else "N/A"
        actual = ""
        if pd.notna(r.get("actual_margin")):
            actual = fmt_winner(r["actual_margin"], home, away)
            actual += f" [{r['actual_total']:.0f}]"
        print(
            f"{game_label:<30} {ot_spread:<18} {kp_spread:<18} "
            f"{ot_total:>9} {kp_total:>9}  {actual:<18}"
        )

    if not both.any():
        print("\n[WARNING] No games with both KenPom predictions and actual results")
        return

    matched = df[both].copy()
    n = len(matched)

    # ── Spread/Margin comparison ──
    print(f"\n{'=' * 80}")
    print(f"MARGIN PREDICTION ACCURACY ({n} games)")
    print(f"{'=' * 80}")

    ot_margin_err = (matched["ot_predicted_margin"] - matched["actual_margin"]).abs()
    kp_margin_err = (matched["kp_home_spread"] - matched["actual_margin"]).abs()

    print(f"\n  Overtime margin MAE:  {ot_margin_err.mean():.2f} pts")
    print(f"  KenPom margin MAE:   {kp_margin_err.mean():.2f} pts")
    diff = ot_margin_err.mean() - kp_margin_err.mean()
    winner = "KenPom" if diff > 0 else "Overtime"
    print(f"  -> {winner} closer by {abs(diff):.2f} pts on average")

    # Bias (do they systematically over/under predict?)
    ot_bias = (matched["ot_predicted_margin"] - matched["actual_margin"]).mean()
    kp_bias = (matched["kp_home_spread"] - matched["actual_margin"]).mean()
    print(f"\n  Overtime margin bias: {ot_bias:+.2f} pts (predicted - actual)")
    print(f"  KenPom margin bias:  {kp_bias:+.2f} pts (predicted - actual)")

    # Who picked the right side (winner)?
    ot_right_side = ((matched["ot_predicted_margin"] > 0) == (matched["actual_margin"] > 0)).mean()
    kp_right_side = ((matched["kp_home_spread"] > 0) == (matched["actual_margin"] > 0)).mean()
    print(f"\n  Overtime correct winner:  {ot_right_side:.1%}")
    print(f"  KenPom correct winner:   {kp_right_side:.1%}")

    # ATS: did the actual result cover the Overtime line?
    # Cover = actual_margin - ot_predicted_margin
    # Positive = home outperformed the line
    cover = matched["actual_margin"] - matched["ot_predicted_margin"]
    print("\n  Games vs Overtime spread:")
    print(f"    Home covers: {(cover > 0).sum()} / {n}")
    print(f"    Away covers: {(cover < 0).sum()} / {n}")
    print(f"    Push:        {(cover == 0).sum()} / {n}")

    # Did KenPom predict the cover direction?
    # If KP margin > OT margin, KP says home side; if < OT, KP says away side
    kp_edge = matched["kp_home_spread"] - matched["ot_predicted_margin"]
    kp_ats_correct = ((kp_edge > 0) & (cover > 0)) | ((kp_edge < 0) & (cover < 0))
    print(f"\n  KenPom ATS accuracy vs OT line: {kp_ats_correct.mean():.1%}")
    print("    (When KP disagrees with OT, does actual follow KP's direction?)")

    # ── Total comparison ──
    print(f"\n{'=' * 80}")
    print(f"TOTALS PREDICTION ACCURACY ({n} games)")
    print(f"{'=' * 80}")

    ot_total_error = (matched["ot_total"] - matched["actual_total"]).abs()
    kp_total_error = (matched["kp_total"] - matched["actual_total"]).abs()

    print(f"\n  Overtime total MAE:  {ot_total_error.mean():.2f} pts")
    print(f"  KenPom total MAE:   {kp_total_error.mean():.2f} pts")
    diff = ot_total_error.mean() - kp_total_error.mean()
    winner = "KenPom" if diff > 0 else "Overtime"
    print(f"  -> {winner} closer by {abs(diff):.2f} pts on average")

    ot_total_bias = (matched["ot_total"] - matched["actual_total"]).mean()
    kp_total_bias = (matched["kp_total"] - matched["actual_total"]).mean()
    print(f"\n  Overtime total bias:  {ot_total_bias:+.2f} pts (predicted - actual)")
    print(f"  KenPom total bias:   {kp_total_bias:+.2f} pts (predicted - actual)")

    # Over/Under accuracy
    overs = (matched["actual_total"] > matched["ot_total"]).sum()
    unders = (matched["actual_total"] < matched["ot_total"]).sum()
    print(f"\n  Actual vs OT line: {overs} overs, {unders} unders")

    kp_predicted_over = (matched["kp_total"] > matched["ot_total"]).sum()
    kp_predicted_under = (matched["kp_total"] < matched["ot_total"]).sum()
    print(f"  KenPom vs OT line: {kp_predicted_over} overs, {kp_predicted_under} unders")

    # KenPom O/U accuracy
    kp_ou_correct = (
        (matched["kp_total"] > matched["ot_total"])
        & (matched["actual_total"] > matched["ot_total"])
    ) | (
        (matched["kp_total"] < matched["ot_total"])
        & (matched["actual_total"] < matched["ot_total"])
    )
    print(f"  KenPom O/U accuracy vs OT: {kp_ou_correct.mean():.1%}")

    # ── Disagreement analysis ──
    print(f"\n{'=' * 80}")
    print("DISAGREEMENT ANALYSIS")
    print(f"{'=' * 80}")

    margin_diff = matched["kp_home_spread"] - matched["ot_predicted_margin"]
    total_diff = matched["kp_total"] - matched["ot_total"]

    print(f"\n  Avg margin disagreement: {margin_diff.abs().mean():.2f} pts")
    print(f"  Max margin disagreement: {margin_diff.abs().max():.2f} pts")
    print(f"  Avg total disagreement:  {total_diff.abs().mean():.2f} pts")
    print(f"  Max total disagreement:  {total_diff.abs().max():.2f} pts")

    # Game-by-game comparison where they disagree
    disagree_mask = margin_diff.abs() > 1.0
    if disagree_mask.any():
        disagree = matched[disagree_mask]
        print(f"\n  Games where KP & OT disagree by >1 pt ({disagree_mask.sum()}):")
        for _, r in disagree.iterrows():
            home = r["ot_home_team"]
            away = r["ot_away_team"]
            game = f"{away} @ {home}"
            ot_mag = abs(r["ot_predicted_margin"])
            ot_fav = home if r["ot_predicted_margin"] > 0 else away
            kp_mag = abs(r["kp_home_spread"])
            kp_fav = home if r["kp_home_spread"] > 0 else away
            act_mag = abs(r["actual_margin"])
            act_won = home if r["actual_margin"] > 0 else away
            ot_err = abs(r["ot_predicted_margin"] - r["actual_margin"])
            kp_err = abs(r["kp_home_spread"] - r["actual_margin"])
            closer = "OT" if ot_err < kp_err else "KP"
            print(
                f"    {game:<28} "
                f"OT: {ot_mag:.1f} ({ot_fav[:8]})  "
                f"KP: {kp_mag:.1f} ({kp_fav[:8]})  "
                f"Result: {act_mag:.0f} ({act_won[:8]})  "
                f"-> {closer} closer"
            )

    # ── Edge detection ──
    print(f"\n{'=' * 80}")
    print("EDGE DETECTION: Can disagreement predict accuracy?")
    print(f"{'=' * 80}")

    matched = matched.copy()
    matched["margin_disagree"] = margin_diff.abs()
    matched["total_disagree"] = total_diff.abs()
    matched["ot_margin_err"] = ot_margin_err
    matched["kp_margin_err"] = kp_margin_err
    matched["ot_total_err"] = ot_total_error
    matched["kp_total_err"] = kp_total_error

    if n >= 4:
        median_disagree = matched["margin_disagree"].median()
        high = matched[matched["margin_disagree"] >= median_disagree]
        low = matched[matched["margin_disagree"] < median_disagree]

        print(f"\n  High margin disagreement (>={median_disagree:.1f} pts): {len(high)} games")
        if len(high) > 0:
            print(f"    OT margin MAE: {high['ot_margin_err'].mean():.2f}")
            print(f"    KP margin MAE: {high['kp_margin_err'].mean():.2f}")
            kp_better = (high["kp_margin_err"] < high["ot_margin_err"]).mean()
            print(f"    KP closer: {kp_better:.1%}")

        print(f"\n  Low margin disagreement (<{median_disagree:.1f} pts): {len(low)} games")
        if len(low) > 0:
            print(f"    OT margin MAE: {low['ot_margin_err'].mean():.2f}")
            print(f"    KP margin MAE: {low['kp_margin_err'].mean():.2f}")
            kp_better = (low["kp_margin_err"] < low["ot_margin_err"]).mean()
            print(f"    KP closer: {kp_better:.1%}")

    # ── Blended prediction ──
    print(f"\n{'=' * 80}")
    print("BLENDED PREDICTION (50/50 OT + KP)")
    print(f"{'=' * 80}")

    blend_margin = (matched["ot_predicted_margin"] + matched["kp_home_spread"]) / 2
    blend_total = (matched["ot_total"] + matched["kp_total"]) / 2
    blend_margin_err = (blend_margin - matched["actual_margin"]).abs()
    blend_total_err = (blend_total - matched["actual_total"]).abs()

    print(f"\n  Blended margin MAE: {blend_margin_err.mean():.2f} pts")
    print(f"  vs Overtime alone:  {ot_margin_err.mean():.2f}")
    print(f"  vs KenPom alone:   {kp_margin_err.mean():.2f}")
    print(f"\n  Blended total MAE:  {blend_total_err.mean():.2f} pts")
    print(f"  vs Overtime alone:  {ot_total_error.mean():.2f}")
    print(f"  vs KenPom alone:   {kp_total_error.mean():.2f}")

    # ── Summary ──
    print(f"\n{'=' * 80}")
    print("SUMMARY")
    print(f"{'=' * 80}")
    print(f"\n  Games analyzed: {n}")
    print(f"  {'Source':<20} {'Margin MAE':>12} {'Total MAE':>12} {'Winner %':>10}")
    print(f"  {'-' * 56}")
    print(
        f"  {'Overtime (market)':<20} {ot_margin_err.mean():>12.2f} "
        f"{ot_total_error.mean():>12.2f} {ot_right_side:>10.1%}"
    )
    print(
        f"  {'KenPom (model)':<20} {kp_margin_err.mean():>12.2f} "
        f"{kp_total_error.mean():>12.2f} {kp_right_side:>10.1%}"
    )
    print(
        f"  {'Blend (50/50)':<20} {blend_margin_err.mean():>12.2f} {blend_total_err.mean():>12.2f}"
    )
    print()


# ── Main ───────────────────────────────────────────────────────────────


async def main_async(target_date: str, output_path: Path | None) -> None:
    """Run the comparison analysis."""
    logger.info(f"[OK] Comparing Overtime vs KenPom for {target_date}\n")

    # Load data from all three sources
    overtime_df = load_overtime_closing_lines(target_date)
    if overtime_df.empty:
        logger.error("No Overtime data found. Exiting.")
        return

    kenpom_df = await fetch_kenpom_fanmatch(target_date)
    if kenpom_df.empty:
        logger.warning("No KenPom FanMatch data found.")

    actuals_df = load_actual_results(target_date)

    # Match and merge
    merged = match_games(overtime_df, kenpom_df, actuals_df)

    # Print analysis
    analyze_comparison(merged)

    # Save output
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        merged.to_csv(output_path, index=False)
        logger.info(f"[OK] Saved comparison to {output_path}")


def main() -> None:
    """Entry point."""
    parser = argparse.ArgumentParser(
        description="Compare Overtime.ag odds vs KenPom FanMatch predictions"
    )
    parser.add_argument(
        "--date",
        type=str,
        required=True,
        help="Target date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output CSV path (default: data/reports/ot_vs_kp_<date>.csv)",
    )
    args = parser.parse_args()

    if args.output is None:
        args.output = Path(f"data/reports/ot_vs_kp_{args.date}.csv")

    asyncio.run(main_async(args.date, args.output))


if __name__ == "__main__":
    main()
