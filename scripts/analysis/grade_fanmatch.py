"""Grade KenPom FanMatch predictions against actual results and market lines.

Usage:
    uv run python scripts/analysis/grade_fanmatch.py --date 2026-02-09
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import date, timedelta
from typing import Any

import httpx
import pandas as pd
from dotenv import load_dotenv

from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.adapters.kenpom import KenPomAdapter
from sports_betting_edge.config.settings import settings


def fetch_completed_scores(target: str) -> dict[tuple[str, str], tuple[int, int]]:
    """Fetch completed scores from Odds API for a given date."""
    load_dotenv()
    key = os.getenv("ODDS_API_KEY")
    if not key:
        print("[ERROR] ODDS_API_KEY not set")
        sys.exit(1)

    url = "https://api.the-odds-api.com/v4/sports/basketball_ncaab/scores"
    resp = httpx.get(url, params={"apiKey": key, "daysFrom": 3}, timeout=30)
    events = resp.json()
    credits = resp.headers.get("x-requests-remaining", "?")
    print(f"[OK] API credits remaining: {credits}")

    scores: dict[tuple[str, str], tuple[int, int]] = {}
    for ev in events:
        if not ev.get("completed"):
            continue
        ct = ev.get("commence_time", "")
        if target in ct:
            pass
        else:
            parts = ct.split("T")
            if len(parts) == 2 and parts[1][:2] < "08":
                d = date.fromisoformat(parts[0])
                prev = (d - timedelta(days=1)).isoformat()
                if prev != target:
                    continue
            else:
                continue
        hs = as_ = None
        for s in ev.get("scores", []):
            if s["name"] == ev["home_team"]:
                hs = int(s["score"])
            elif s["name"] == ev["away_team"]:
                as_ = int(s["score"])
        if hs is not None and as_ is not None:
            scores[(ev["home_team"], ev["away_team"])] = (hs, as_)

    print(f"[OK] {len(scores)} completed games for {target}")
    return scores


async def main(target_date: str) -> None:
    """Grade FanMatch predictions for a date."""
    # 1) Fetch FanMatch for target date AND previous day (UTC/ET boundary)
    kp = KenPomAdapter()
    try:
        all_fm: list[dict[str, Any]] = []
        target_dt = date.fromisoformat(target_date)
        prev_date = target_dt - timedelta(days=1)
        for d in [prev_date, target_dt]:
            try:
                batch = await kp.get_fanmatch(d.isoformat())
                print(f"[OK] FanMatch {d}: {len(batch)} games")
                all_fm.extend(batch)
            except Exception as e:
                print(f"[--] FanMatch {d}: {e}")
    finally:
        await kp.close()
    fm_df = pd.DataFrame(all_fm)
    print(f"[OK] {len(fm_df)} total FanMatch predictions")

    # 2) Completed scores from live API
    scores = fetch_completed_scores(target_date)

    # 3) Closing odds from predictions CSV (already has spread/total from pipeline)
    pred_path = settings.predictions_dir / f"{target_date}.csv"
    if not pred_path.exists():
        # Try previous day's predictions (evening games filed under next UTC day)
        prev_pred = (
            settings.predictions_dir
            / f"{(date.fromisoformat(target_date) - timedelta(days=1)).isoformat()}.csv"
        )
        if prev_pred.exists():
            pred_path = prev_pred
    if pred_path.exists():
        preds = pd.read_csv(pred_path)
    else:
        print(f"[WARNING] No predictions file found for {target_date}")
        return

    # 4) Team mapping
    mapping = read_parquet_df(str(settings.staging_dir / "mappings" / "team_mapping.parquet"))
    kp_to_odds: dict[str, str] = dict(
        zip(mapping["kenpom_name"], mapping["odds_api_name"], strict=False)
    )

    # 5) Match FanMatch -> scores -> predictions (for market lines)
    # Build lookup from predictions: (odds_home, odds_away) -> (home_spread, total)
    pred_lookup: dict[tuple[str, str], tuple[float, float, str]] = {}
    for _, p in preds.iterrows():
        fav = p["favorite_team"]
        mag = float(p["spread_magnitude"])
        home_spread = -mag if fav == p["home_team"] else mag
        pred_lookup[(p["home_team"], p["away_team"])] = (
            home_spread,
            float(p["total_points"]),
            fav,
        )

    results = []
    for _, fm_row in fm_df.iterrows():
        home_kp = fm_row.get("Home", "")
        away_kp = fm_row.get("Visitor", "")
        home_odds = kp_to_odds.get(home_kp)
        away_odds = kp_to_odds.get(away_kp)
        if not home_odds or not away_odds:
            continue
        if (home_odds, away_odds) not in scores:
            continue
        hs, as_ = scores[(home_odds, away_odds)]

        if (home_odds, away_odds) not in pred_lookup:
            continue
        home_spread, mkt_total, fav = pred_lookup[(home_odds, away_odds)]

        results.append(
            {
                "home": home_kp,
                "away": away_kp,
                "home_spread": home_spread,
                "spread_mag": abs(home_spread),
                "favorite": fav,
                "fm_margin": fm_row["HomePred"] - fm_row["VisitorPred"],
                "fm_total": fm_row["HomePred"] + fm_row["VisitorPred"],
                "mkt_total": mkt_total,
                "actual_margin": hs - as_,
                "actual_total": hs + as_,
            }
        )

    rdf = pd.DataFrame(results)
    if len(rdf) == 0:
        print("[WARNING] No games matched FanMatch + scores + odds")
        return

    # Grade ATS (nullable boolean for pushes)
    rdf["fm_ats"] = pd.array(
        (rdf["fm_margin"] > rdf["home_spread"]) == (rdf["actual_margin"] > rdf["home_spread"]),
        dtype=pd.BooleanDtype(),
    )
    rdf.loc[rdf["actual_margin"] == rdf["home_spread"], "fm_ats"] = pd.NA

    # Grade O/U
    rdf["fm_ou"] = pd.array(
        (rdf["fm_total"] > rdf["mkt_total"]) == (rdf["actual_total"] > rdf["mkt_total"]),
        dtype=pd.BooleanDtype(),
    )
    rdf.loc[rdf["actual_total"] == rdf["mkt_total"], "fm_ou"] = pd.NA

    # Errors
    rdf["fm_margin_err"] = abs(rdf["fm_margin"] - rdf["actual_margin"])
    rdf["mkt_margin_err"] = abs(rdf["home_spread"] - rdf["actual_margin"])
    rdf["fm_total_err"] = abs(rdf["fm_total"] - rdf["actual_total"])
    rdf["mkt_total_err"] = abs(rdf["mkt_total"] - rdf["actual_total"])

    # Print report
    print(
        f"\n{'=' * 100}\n"
        f"  FANMATCH GRADING REPORT - {target_date} ({len(rdf)} games)\n"
        f"{'=' * 100}\n"
    )
    hdr = (
        f"{'Game':<42} {'Line':>6} {'FM':>6} {'Act':>6} {'ATS':>5}"
        f"   {'Line':>6} {'FM':>6} {'Act':>6} {'O/U':>5}"
    )
    print(f"{'':42} {'--- SPREAD ---':^24}   {'--- TOTALS ---':^24}")
    print(hdr)
    print("-" * len(hdr))

    for _, r in rdf.iterrows():
        ats_str = "HIT" if r["fm_ats"] is True else ("MISS" if r["fm_ats"] is False else "PUSH")
        ou_str = "HIT" if r["fm_ou"] is True else ("MISS" if r["fm_ou"] is False else "PUSH")
        label = f"{r['away']} @ {r['home']}"
        print(
            f"{label:<42} {r['home_spread']:>+6.1f} {r['fm_margin']:>+6.0f}"
            f" {r['actual_margin']:>+6.0f} {ats_str:>5}"
            f"   {r['mkt_total']:>6.1f} {r['fm_total']:>6.0f}"
            f" {r['actual_total']:>6.0f} {ou_str:>5}"
        )
    print("-" * len(hdr))

    ats_v = rdf["fm_ats"].dropna()
    ou_v = rdf["fm_ou"].dropna()

    print("\n--- SPREAD PERFORMANCE ---")
    print(
        f"FM ATS Record:     "
        f"{int(ats_v.sum())}-{int(len(ats_v) - ats_v.sum())}"
        f" ({ats_v.mean() * 100:.0f}%)"
    )
    print(f"FM Margin MAE:     {rdf['fm_margin_err'].mean():.1f} pts")
    print(f"Market Spread MAE: {rdf['mkt_margin_err'].mean():.1f} pts")
    delta = rdf["fm_margin_err"].mean() - rdf["mkt_margin_err"].mean()
    print(f"FM vs Market:      {delta:+.1f} pts")

    print("\n--- TOTALS PERFORMANCE ---")
    print(
        f"FM O/U Record:     "
        f"{int(ou_v.sum())}-{int(len(ou_v) - ou_v.sum())}"
        f" ({ou_v.mean() * 100:.0f}%)"
    )
    print(f"FM Total MAE:      {rdf['fm_total_err'].mean():.1f} pts")
    print(f"Market Total MAE:  {rdf['mkt_total_err'].mean():.1f} pts")
    delta_t = rdf["fm_total_err"].mean() - rdf["mkt_total_err"].mean()
    print(f"FM vs Market:      {delta_t:+.1f} pts")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Grade FanMatch predictions")
    parser.add_argument(
        "--date",
        default=date.today().isoformat(),
        help="Date to grade (YYYY-MM-DD)",
    )
    args = parser.parse_args()
    asyncio.run(main(args.date))
