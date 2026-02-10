"""Season-long comparison: Market closing lines vs KenPom FanMatch.

Uses Odds API closing lines (proxy for Overtime/sharp market) as the
benchmark and compares KenPom FanMatch predictions against them across
the full season.

Usage:
    uv run python scripts/analysis/market_vs_kenpom_season.py --season 2026
    uv run python scripts/analysis/market_vs_kenpom_season.py --start 2025-11-04 --end 2026-02-08
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

from sports_betting_edge.adapters.kenpom import KenPomAdapter
from sports_betting_edge.config.logging import configure_logging

configure_logging()
logger = logging.getLogger(__name__)


# ── Team name normalization ────────────────────────────────────────────

KENPOM_TO_CANONICAL: dict[str, str] = {
    "South Fla.": "South Florida",
    "Penn St.": "Penn State",
    "Ohio St.": "Ohio State",
    "Mich. St.": "Michigan State",
    "Michigan St.": "Michigan State",
    "Miss. St.": "Mississippi State",
    "N.C. State": "NC State",
    "UNC Greensboro": "UNC Greensboro",
    "UNCG": "UNC Greensboro",
    "Wichita St.": "Wichita State",
    "Boise St.": "Boise State",
    "Fresno St.": "Fresno State",
    "San Diego St.": "San Diego State",
    "Colorado St.": "Colorado State",
    "Utah St.": "Utah State",
    "Kansas St.": "Kansas State",
    "Iowa St.": "Iowa State",
    "Oklahoma St.": "Oklahoma State",
    "Oregon St.": "Oregon State",
    "Washington St.": "Washington State",
    "Arizona St.": "Arizona State",
    "San Jose St.": "San Jose State",
    "Jacksonville St.": "Jacksonville State",
    "Kennesaw St.": "Kennesaw State",
    "Morehead St.": "Morehead State",
    "Murray St.": "Murray State",
    "Appalachian St.": "Appalachian State",
    "Portland St.": "Portland State",
    "Sacramento St.": "Sacramento State",
    "Weber St.": "Weber State",
    "Montana St.": "Montana State",
    "Ill.": "Illinois",
    "Ind.": "Indiana",
    "La.": "Louisiana",
    "Ark.": "Arkansas",
    "Col.": "Colorado",
    "Conn.": "Connecticut",
    "Del.": "Delaware",
    "Fla.": "Florida",
    "Ga.": "Georgia",
    "Ky.": "Kentucky",
    "Md.": "Maryland",
    "Mass.": "Massachusetts",
    "Mich.": "Michigan",
    "Minn.": "Minnesota",
    "Miss.": "Mississippi",
    "Mo.": "Missouri",
    "Neb.": "Nebraska",
    "Nev.": "Nevada",
    "Ore.": "Oregon",
    "Tenn.": "Tennessee",
    "Tex.": "Texas",
    "Va.": "Virginia",
    "Wash.": "Washington",
    "Wis.": "Wisconsin",
    "Wyo.": "Wyoming",
    "UCF": "UCF",
    "UAB": "UAB",
    "UTEP": "UTEP",
    "SMU": "SMU",
    "LSU": "LSU",
    "USC": "USC",
    "BYU": "BYU",
    "VCU": "VCU",
    "UConn": "Connecticut",
    "St. John's": "St. John's",
}


def normalize_kenpom_name(name: str) -> str:
    """Normalize KenPom team name to match Odds API naming."""
    if name in KENPOM_TO_CANONICAL:
        return KENPOM_TO_CANONICAL[name]
    return name


def fuzzy_match(name1: str, name2: str) -> bool:
    """Check if two team names likely refer to the same team."""
    n1 = normalize_kenpom_name(name1).lower().strip()
    n2 = name2.lower().strip()

    if n1 == n2:
        return True

    # One contains the other
    if n1 in n2 or n2 in n1:
        return True

    # Strip common suffixes for matching
    suffixes = [
        "bulldogs",
        "tigers",
        "bears",
        "wolverines",
        "buckeyes",
        "red raiders",
        "mountaineers",
        "paladins",
        "spartans",
        "shockers",
        "green wave",
        "49ers",
        "bearcats",
        "knights",
        "golden gophers",
        "terrapins",
        "blazers",
        "owls",
        "hawkeyes",
        "wildcats",
        "bulls",
        "golden hurricane",
        "nittany lions",
        "trojans",
        "cougars",
        "gaels",
        "dons",
        "aggies",
        "bruins",
        "huskies",
        "ducks",
        "beavers",
        "cardinals",
        "buffaloes",
        "sun devils",
        "utes",
        "rams",
        "falcons",
        "aztecs",
        "rebels",
        "wolf pack",
        "broncos",
        "cowboys",
        "lobos",
        "thunderbirds",
        "texans",
        "lancers",
        "bobcats",
        "eagles",
        "lumberjacks",
        "vikings",
        "pilots",
        "redhawks",
        "toreros",
        "waves",
        "lions",
        "dolphins",
        "peacocks",
        "red foxes",
        "stags",
        "jaspers",
        "colonels",
        "purple aces",
        "bluejays",
        "musketeers",
        "friars",
        "hoyas",
        "pirates",
        "boilermakers",
        "fighting illini",
        "badgers",
        "hawkeyes",
        "cornhuskers",
        "gophers",
        "blue devils",
        "tar heels",
        "cavaliers",
        "hokies",
        "demon deacons",
        "orange",
        "yellow jackets",
        "hurricanes",
        "seminoles",
        "panthers",
        "cardinals",
        "volunteers",
        "crimson tide",
        "razorbacks",
        "tigers",
        "gamecocks",
        "gators",
        "commodores",
        "jayhawks",
        "sooners",
        "longhorns",
        "horned frogs",
        "cyclones",
        "red raiders",
        "mountaineers",
        "bears",
    ]
    n1_stripped = n1
    n2_stripped = n2
    for s in suffixes:
        if n1_stripped.endswith(s):
            n1_stripped = n1_stripped[: -len(s)].strip()
        if n2_stripped.endswith(s):
            n2_stripped = n2_stripped[: -len(s)].strip()

    if n1_stripped and n2_stripped:
        if n1_stripped == n2_stripped:
            return True
        if n1_stripped in n2_stripped or n2_stripped in n1_stripped:
            return True

    return False


# ── Data loading ───────────────────────────────────────────────────────


def load_staging_data() -> pd.DataFrame:
    """Load events + line features from staging.

    Returns merged DataFrame with game results and closing market lines.
    """
    events = pd.read_parquet("data/staging/events.parquet")
    lines = pd.read_parquet("data/staging/line_features.parquet")

    # Drop duplicate line entries (some events have 2 rows for fav/dog)
    lines_deduped = lines.drop_duplicates(subset=["event_id"], keep="first")

    merged = events.merge(lines_deduped, on="event_id", how="inner")
    logger.info(
        f"Staging data: {len(events)} events, {len(lines_deduped)} with lines, {len(merged)} merged"
    )

    # Compute market predicted margin (positive = home wins)
    # closing_spread is magnitude, favorite_team tells direction
    def market_margin(row: pd.Series) -> float | None:
        if pd.isna(row["closing_spread"]) or pd.isna(row["favorite_team"]):
            return None
        mag = float(row["closing_spread"])
        if fuzzy_match(row["favorite_team"], row["home_team"]):
            return mag  # Home favored -> positive margin
        else:
            return -mag  # Away favored -> negative margin

    merged["market_predicted_margin"] = merged.apply(market_margin, axis=1)
    merged["actual_margin"] = merged["home_score"] - merged["away_score"]
    merged["actual_total"] = merged["home_score"] + merged["away_score"]

    return merged


async def fetch_kenpom_season(start_date: date, end_date: date) -> pd.DataFrame:
    """Fetch KenPom FanMatch for entire season.

    Args:
        start_date: Season start
        end_date: Season end (inclusive)

    Returns:
        DataFrame with all KenPom predictions
    """
    kenpom = KenPomAdapter()
    all_rows: list[dict] = []
    current = start_date
    n_dates = (end_date - start_date).days + 1
    fetched = 0

    try:
        while current <= end_date:
            date_str = current.isoformat()
            try:
                games = await kenpom.get_fanmatch(date_str)
                if games:
                    for g in games:
                        home = g.get("Home", "")
                        visitor = g.get("Visitor", "")
                        home_pred = g.get("HomePred")
                        visitor_pred = g.get("VisitorPred")

                        kp_margin = None
                        kp_total = None
                        if home_pred is not None and visitor_pred is not None:
                            kp_margin = float(home_pred) - float(visitor_pred)
                            kp_total = float(home_pred) + float(visitor_pred)

                        all_rows.append(
                            {
                                "game_date": date_str,
                                "kp_home": home,
                                "kp_visitor": visitor,
                                "kp_home_pred": home_pred,
                                "kp_visitor_pred": visitor_pred,
                                "kp_predicted_margin": kp_margin,
                                "kp_predicted_total": kp_total,
                                "kp_home_wp": g.get("HomeWP"),
                                "kp_predicted_winner": g.get("PredictedWinner"),
                            }
                        )
                    fetched += 1
                    if fetched % 20 == 0:
                        logger.info(
                            f"  Fetched {fetched}/{n_dates} dates ({len(all_rows)} games)..."
                        )
            except Exception as e:
                logger.debug(f"  No data for {date_str}: {e}")

            current += timedelta(days=1)
    finally:
        await kenpom.close()

    df = pd.DataFrame(all_rows)
    logger.info(f"KenPom FanMatch: {len(df)} predictions across {fetched} dates")
    return df


def match_kenpom_to_market(market_df: pd.DataFrame, kenpom_df: pd.DataFrame) -> pd.DataFrame:
    """Match KenPom predictions to market games by date + team names.

    Returns:
        Merged DataFrame with market, KenPom, and actual data
    """
    matched_count = 0
    kp_cols = [
        "kp_home",
        "kp_visitor",
        "kp_home_pred",
        "kp_visitor_pred",
        "kp_predicted_margin",
        "kp_predicted_total",
        "kp_home_wp",
    ]

    # Initialize KenPom columns
    for col in kp_cols:
        market_df[col] = None

    for idx, mkt in market_df.iterrows():
        game_date = str(mkt["game_date"])
        home = mkt["home_team"]
        away = mkt["away_team"]

        # Find matching KenPom game
        date_games = kenpom_df[kenpom_df["game_date"] == game_date]

        for _, kp in date_games.iterrows():
            if fuzzy_match(kp["kp_home"], home) and fuzzy_match(kp["kp_visitor"], away):
                for col in kp_cols:
                    market_df.at[idx, col] = kp[col]
                matched_count += 1
                break

    logger.info(
        f"Matched {matched_count}/{len(market_df)} games ({matched_count / len(market_df):.1%})"
    )
    return market_df


# ── Analysis ───────────────────────────────────────────────────────────


def run_analysis(df: pd.DataFrame) -> dict:
    """Run comprehensive accuracy analysis.

    Returns dict of metrics for downstream use.
    """
    # Filter to games with both market and KenPom predictions
    has_market = df["market_predicted_margin"].notna()
    has_kp = df["kp_predicted_margin"].notna()
    has_actual = df["actual_margin"].notna()
    complete = has_market & has_kp & has_actual
    m = df[complete].copy()
    n = len(m)

    if n == 0:
        print("[ERROR] No games with all three data sources")
        return {}

    print(f"\n{'=' * 90}")
    print(f"SEASON COMPARISON: MARKET vs KENPOM ({n} games)")
    print(f"{'=' * 90}")
    print(f"Date range: {m['game_date'].min()} to {m['game_date'].max()}")

    # ── Margin accuracy ──
    m["mkt_margin_err"] = (m["market_predicted_margin"] - m["actual_margin"]).abs()
    m["kp_margin_err"] = (m["kp_predicted_margin"] - m["actual_margin"]).abs()

    mkt_mae = m["mkt_margin_err"].mean()
    kp_mae = m["kp_margin_err"].mean()

    print("\n--- SPREAD/MARGIN ACCURACY ---")
    print(f"  Market margin MAE:   {mkt_mae:.2f} pts")
    print(f"  KenPom margin MAE:   {kp_mae:.2f} pts")
    diff = mkt_mae - kp_mae
    winner = "KenPom" if diff > 0 else "Market"
    print(f"  -> {winner} closer by {abs(diff):.2f} pts")

    # Bias
    mkt_bias = (m["market_predicted_margin"] - m["actual_margin"]).mean()
    kp_bias = (m["kp_predicted_margin"] - m["actual_margin"]).mean()
    print(f"\n  Market margin bias:  {mkt_bias:+.2f} (predicted - actual)")
    print(f"  KenPom margin bias:  {kp_bias:+.2f} (predicted - actual)")

    # Correct winner
    mkt_winner_correct = ((m["market_predicted_margin"] > 0) == (m["actual_margin"] > 0)).mean()
    kp_winner_correct = ((m["kp_predicted_margin"] > 0) == (m["actual_margin"] > 0)).mean()
    print(f"\n  Market correct winner: {mkt_winner_correct:.1%}")
    print(f"  KenPom correct winner: {kp_winner_correct:.1%}")

    # Who was closer more often?
    kp_closer = (m["kp_margin_err"] < m["mkt_margin_err"]).mean()
    print(f"\n  KenPom closer than market: {kp_closer:.1%} of games")

    # ATS: KenPom vs market spread
    cover = m["actual_margin"] - m["market_predicted_margin"]
    kp_edge = m["kp_predicted_margin"] - m["market_predicted_margin"]
    kp_ats = ((kp_edge > 0) & (cover > 0)) | ((kp_edge < 0) & (cover < 0))
    # Exclude games where KP agrees with market (no edge)
    has_edge = kp_edge.abs() > 0.5
    if has_edge.any():
        kp_ats_rate = kp_ats[has_edge].mean()
        print(
            f"\n  KenPom ATS vs market: {kp_ats_rate:.1%} "
            f"({has_edge.sum()} games where KP disagrees)"
        )

    # ── Total accuracy ──
    has_total = m["closing_total"].notna() & m["kp_predicted_total"].notna()
    mt = m[has_total].copy()
    nt = len(mt)

    if nt > 0:
        mt["mkt_total_err"] = (mt["closing_total"] - mt["actual_total"]).abs()
        mt["kp_total_err"] = (mt["kp_predicted_total"] - mt["actual_total"]).abs()

        print(f"\n--- TOTALS ACCURACY ({nt} games) ---")
        mkt_total_mae = mt["mkt_total_err"].mean()
        kp_total_mae = mt["kp_total_err"].mean()
        print(f"  Market total MAE:  {mkt_total_mae:.2f} pts")
        print(f"  KenPom total MAE:  {kp_total_mae:.2f} pts")
        diff = mkt_total_mae - kp_total_mae
        winner = "KenPom" if diff > 0 else "Market"
        print(f"  -> {winner} closer by {abs(diff):.2f} pts")

        mkt_total_bias = (mt["closing_total"] - mt["actual_total"]).mean()
        kp_total_bias = (mt["kp_predicted_total"] - mt["actual_total"]).mean()
        print(f"\n  Market total bias:  {mkt_total_bias:+.2f}")
        print(f"  KenPom total bias:  {kp_total_bias:+.2f}")

        # O/U accuracy when KenPom disagrees with market
        ou_edge = mt["kp_predicted_total"] - mt["closing_total"]
        actual_ou = mt["actual_total"] - mt["closing_total"]
        kp_ou = ((ou_edge > 0) & (actual_ou > 0)) | ((ou_edge < 0) & (actual_ou < 0))
        has_ou_edge = ou_edge.abs() > 0.5
        if has_ou_edge.any():
            print(
                f"\n  KenPom O/U vs market: {kp_ou[has_ou_edge].mean():.1%} "
                f"({has_ou_edge.sum()} games where KP disagrees)"
            )

        # KenPom closer more often on totals?
        kp_total_closer = (mt["kp_total_err"] < mt["mkt_total_err"]).mean()
        print(f"  KenPom closer on totals: {kp_total_closer:.1%}")

    # ── Disagreement analysis ──
    m["margin_disagree"] = (m["kp_predicted_margin"] - m["market_predicted_margin"]).abs()

    print("\n--- DISAGREEMENT ANALYSIS ---")
    print(f"  Avg margin disagreement: {m['margin_disagree'].mean():.2f} pts")
    print(f"  Median:                  {m['margin_disagree'].median():.2f} pts")
    print(f"  90th percentile:         {m['margin_disagree'].quantile(0.9):.2f} pts")

    # Bucket by disagreement level
    for threshold in [2.0, 3.0, 5.0, 7.0]:
        big_disagree = m[m["margin_disagree"] >= threshold]
        if len(big_disagree) >= 5:
            kp_better_pct = (big_disagree["kp_margin_err"] < big_disagree["mkt_margin_err"]).mean()
            # ATS when KP disagrees significantly
            cover_sub = big_disagree["actual_margin"] - big_disagree["market_predicted_margin"]
            kp_dir = big_disagree["kp_predicted_margin"] - big_disagree["market_predicted_margin"]
            ats_hit = ((kp_dir > 0) & (cover_sub > 0)) | ((kp_dir < 0) & (cover_sub < 0))
            print(f"\n  Disagreement >= {threshold:.0f} pts ({len(big_disagree)} games):")
            print(f"    KenPom closer: {kp_better_pct:.1%}")
            print(f"    KenPom ATS:    {ats_hit.mean():.1%}")
            print(f"    Market MAE:    {big_disagree['mkt_margin_err'].mean():.2f}")
            print(f"    KenPom MAE:    {big_disagree['kp_margin_err'].mean():.2f}")

    # ── Blended predictions ──
    print("\n--- BLENDED PREDICTIONS ---")
    for w in [0.25, 0.50, 0.75]:
        blend = w * m["kp_predicted_margin"] + (1 - w) * m["market_predicted_margin"]
        blend_mae = (blend - m["actual_margin"]).abs().mean()
        print(f"  {w:.0%} KP + {1 - w:.0%} Market: MAE = {blend_mae:.2f}")

    # ── Monthly breakdown ──
    m["month"] = pd.to_datetime(m["game_date"]).dt.to_period("M")
    print("\n--- MONTHLY BREAKDOWN ---")
    print(
        f"  {'Month':<10} {'N':>5} {'Mkt MAE':>10} {'KP MAE':>10} {'KP closer':>10} {'KP ATS':>8}"
    )
    print(f"  {'-' * 55}")

    for month, grp in m.groupby("month"):
        mkt_m = grp["mkt_margin_err"].mean()
        kp_m = grp["kp_margin_err"].mean()
        kp_cl = (grp["kp_margin_err"] < grp["mkt_margin_err"]).mean()
        cover_g = grp["actual_margin"] - grp["market_predicted_margin"]
        kp_dir_g = grp["kp_predicted_margin"] - grp["market_predicted_margin"]
        ats_g = ((kp_dir_g > 0) & (cover_g > 0)) | ((kp_dir_g < 0) & (cover_g < 0))
        has_e = kp_dir_g.abs() > 0.5
        ats_rate = ats_g[has_e].mean() if has_e.any() else float("nan")
        print(
            f"  {str(month):<10} {len(grp):>5} {mkt_m:>10.2f} {kp_m:>10.2f} "
            f"{kp_cl:>10.1%} {ats_rate:>8.1%}"
        )

    # ── Spread magnitude buckets ──
    m["spread_bucket"] = pd.cut(
        m["market_predicted_margin"].abs(),
        bins=[0, 3, 7, 12, 50],
        labels=["<3", "3-7", "7-12", "12+"],
    )
    print("\n--- BY SPREAD SIZE ---")
    print(f"  {'Bucket':<10} {'N':>5} {'Mkt MAE':>10} {'KP MAE':>10} {'KP closer':>10}")
    print(f"  {'-' * 47}")

    for bucket, grp in m.groupby("spread_bucket", observed=True):
        if len(grp) < 3:
            continue
        mkt_b = grp["mkt_margin_err"].mean()
        kp_b = grp["kp_margin_err"].mean()
        kp_cl = (grp["kp_margin_err"] < grp["mkt_margin_err"]).mean()
        print(f"  {str(bucket):<10} {len(grp):>5} {mkt_b:>10.2f} {kp_b:>10.2f} {kp_cl:>10.1%}")

    # ── Summary table ──
    print(f"\n{'=' * 90}")
    print("FINAL SUMMARY")
    print(f"{'=' * 90}")
    print(f"\n  Games analyzed: {n}")
    print(f"  Date range: {m['game_date'].min()} to {m['game_date'].max()}")
    print(f"\n  {'Metric':<30} {'Market':>12} {'KenPom':>12} {'Better':>10}")
    print(f"  {'-' * 66}")
    print(
        f"  {'Margin MAE':<30} {mkt_mae:>12.2f} {kp_mae:>12.2f} "
        f"{'KenPom' if kp_mae < mkt_mae else 'Market':>10}"
    )
    print(
        f"  {'Margin Bias':<30} {mkt_bias:>+12.2f} {kp_bias:>+12.2f} "
        f"{'KenPom' if abs(kp_bias) < abs(mkt_bias) else 'Market':>10}"
    )
    print(
        f"  {'Correct Winner':<30} {mkt_winner_correct:>12.1%} "
        f"{kp_winner_correct:>12.1%} "
        f"{'KenPom' if kp_winner_correct > mkt_winner_correct else 'Market':>10}"
    )
    if nt > 0:
        print(
            f"  {'Total MAE':<30} {mkt_total_mae:>12.2f} {kp_total_mae:>12.2f} "
            f"{'KenPom' if kp_total_mae < mkt_total_mae else 'Market':>10}"
        )
        print(
            f"  {'Total Bias':<30} {mkt_total_bias:>+12.2f} {kp_total_bias:>+12.2f} "
            f"{'KenPom' if abs(kp_total_bias) < abs(mkt_total_bias) else 'Market':>10}"
        )
    print()

    return {
        "n_games": n,
        "market_margin_mae": mkt_mae,
        "kenpom_margin_mae": kp_mae,
        "market_margin_bias": mkt_bias,
        "kenpom_margin_bias": kp_bias,
        "market_winner_pct": mkt_winner_correct,
        "kenpom_winner_pct": kp_winner_correct,
        "kenpom_closer_pct": kp_closer,
    }


# ── Main ───────────────────────────────────────────────────────────────


async def main_async(args: argparse.Namespace) -> None:
    """Run the season-long comparison."""
    logger.info("[OK] Season-long Market vs KenPom Comparison\n")

    # Determine date range
    if args.season:
        start_date = date(args.season - 1, 11, 1)
        end_date = date.today() - timedelta(days=1)
    else:
        start_date = datetime.strptime(args.start, "%Y-%m-%d").date()
        end_date = datetime.strptime(args.end, "%Y-%m-%d").date()

    logger.info(f"Date range: {start_date} to {end_date}")

    # Load market data
    market_df = load_staging_data()

    # Filter to date range
    market_df["game_date"] = market_df["game_date"].astype(str)
    market_df = market_df[
        (market_df["game_date"] >= str(start_date)) & (market_df["game_date"] <= str(end_date))
    ].copy()
    logger.info(f"Market games in range: {len(market_df)}")

    # Fetch KenPom
    kenpom_df = await fetch_kenpom_season(start_date, end_date)

    if kenpom_df.empty:
        logger.error("No KenPom data fetched")
        return

    # Cache KenPom data
    cache_path = Path(f"data/kenpom/fanmatch/fanmatch_season_{args.season or 'custom'}.parquet")
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    kenpom_df.to_parquet(cache_path)
    logger.info(f"Cached KenPom data to {cache_path}")

    # Match
    merged = match_kenpom_to_market(market_df, kenpom_df)

    # Analyze
    run_analysis(merged)

    # Save detailed results
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        merged.to_parquet(args.output)
        logger.info(f"[OK] Saved detailed results to {args.output}")


def main() -> None:
    """Entry point."""
    parser = argparse.ArgumentParser(description="Season-long Market vs KenPom comparison")
    parser.add_argument("--season", type=int, default=None, help="Season year")
    parser.add_argument("--start", type=str, default=None, help="Start date")
    parser.add_argument("--end", type=str, default=None, help="End date")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/reports/market_vs_kenpom_season.parquet"),
    )
    args = parser.parse_args()

    if args.season is None and (args.start is None or args.end is None):
        parser.error("Either --season or both --start/--end required")

    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
