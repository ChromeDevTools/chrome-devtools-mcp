"""Game day outlook: merge Overtime.ag live odds with model predictions.

Usage:
    uv run python scripts/analysis/game_day_outlook.py --date 2026-02-09
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd


def load_overtime_odds(date_str: str) -> pd.DataFrame:
    """Load latest OT snapshots for both College Basketball and College Extra."""
    frames = []
    for sub in ["college_basketball", "college_extra"]:
        d = Path(f"data/source/overtime/api/{sub}")
        files = sorted(d.glob(f"{sub}_{date_str}*.parquet"))
        if files:
            df = pd.read_parquet(files[-1])
            frames.append(df[df["period_number"] == 0])

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


ALIASES: dict[str, str] = {
    "coll of charleston": "charleston",
    "st johns": "st john",
    "nc wilmington": "unc wilmington",
    "st francis pa": "st francis",
    "ark pine bluff": "arkansas pine bluff",
    "prairie view a&m": "prairie view",
    "bethune cookman": "bethune cookman",
    "se louisiana": "se louisiana",
    "mississippi valley state": "miss valley",
    "mcneese state": "mcneese",
    "nicholls state": "nicholls",
    "texas a&m corpus": "texas am cc",
    "east texas a&m": "east texas",
    "northwestern state": "northwestern st",
    "stephen f austin": "stephen f austin",
    "murray state": "murray st",
    "southern illinois": "southern illinois",
    "indiana state": "indiana st",
    "illinois state": "illinois st",
    "jackson state": "jackson st",
    "delaware state": "delaware st",
    "alabama a&m": "alabama am",
    "alabama state": "alabama st",
    "north carolina central": "north carolina central",
    "northern iowa": "northern iowa",
    "incarnate word": "incarnate word",
    "houston christian": "houston christian",
    "ut rio grande valley": "ut rio grande valley",
}


def norm(name: str) -> str:
    n = name.lower().replace(".", "").replace("'", "").replace("-", " ").strip()
    for old, new in ALIASES.items():
        if old in n:
            return new
    return n


def merge_odds_and_predictions(ot: pd.DataFrame, preds: pd.DataFrame) -> list[dict]:
    """Match OT odds to predictions by home team name."""
    ot_lookup: dict[str, pd.Series] = {}
    for _, row in ot.iterrows():
        ot_lookup[norm(row["team2_id"])] = row

    results = []
    for _, p in preds.iterrows():
        pn = norm(p["home_team"])
        found = None
        for ok, ov in ot_lookup.items():
            if pn == ok or (len(pn) > 4 and len(ok) > 4 and (pn[:6] in ok or ok[:6] in pn)):
                found = ov
                break

        pm = float(p["predicted_margin"])
        fp = int(str(p["favorite_cover_prob"]).replace("%", ""))
        dp = int(str(p["underdog_cover_prob"]).replace("%", ""))
        op = int(str(p["over_prob"]).replace("%", ""))
        up = int(str(p["under_prob"]).replace("%", ""))

        r: dict = {
            "home": p["home_team"],
            "away": p["away_team"],
            "pred_margin": pm,
            "pred_total": float(p["predicted_total"]),
            "fav": p["favorite_team"],
            "mkt_spread": float(p["spread_magnitude"]),
            "mkt_total": float(p["total_points"]),
            "fp": fp,
            "dp": dp,
            "op": op,
            "up": up,
            "ot_spread": None,
            "ot_fav": None,
            "ot_total": None,
            "ot_ml_home": None,
            "ot_ml_away": None,
            "game_time": None,
        }

        if found is not None:
            r["ot_spread"] = found["spread_magnitude"]
            r["ot_fav"] = found["favorite_team"]
            r["ot_total"] = found["total_points"]
            if pd.notna(found.get("moneyline2")):
                r["ot_ml_home"] = int(found["moneyline2"])
            if pd.notna(found.get("moneyline1")):
                r["ot_ml_away"] = int(found["moneyline1"])
            if pd.notna(found.get("game_datetime")):
                r["game_time"] = str(found["game_datetime"])[:16]

        results.append(r)

    results.sort(key=lambda x: x["game_time"] or "9999")
    return results


def print_report(results: list[dict], date_str: str) -> None:
    """Print formatted outlook report."""
    print()
    print("=" * 125)
    print(f"  {date_str} CBB GAME DAY OUTLOOK  (Overtime.ag Live Odds + Model Predictions)")
    print("=" * 125)

    # Strong edges
    strong_ats = []
    strong_ou = []

    for r in results:
        ats_conf = max(r["fp"], r["dp"])
        ou_conf = max(r["op"], r["up"])

        if ats_conf >= 62:
            if r["dp"] > r["fp"]:
                pick = f"{r['away'][:20]} +{r['mkt_spread']}"
            else:
                pick = f"{r['fav'][:20]} cover"
            strong_ats.append((r, pick, ats_conf))

        if ou_conf >= 62:
            line = r["ot_total"] or r["mkt_total"]
            pick = f"OVER {line}" if r["op"] > r["up"] else f"UNDER {line}"
            strong_ou.append((r, pick, ou_conf))

    print()
    print(f"  STRONG SPREAD EDGES (>=62%) - {len(strong_ats)} picks")
    print("  " + "-" * 95)
    for r, pick, conf in sorted(strong_ats, key=lambda x: -x[2]):
        ot_sp = ""
        if r["ot_spread"] is not None and r["ot_fav"]:
            ot_sp = f"{r['ot_fav'][:12]} -{r['ot_spread']:.1f}"
        home_s = r["home"][:18]
        away_s = r["away"][:18]
        ml_str = ""
        if r["dp"] > r["fp"] and r["ot_ml_away"]:
            ml_str = f" (ML {r['ot_ml_away']:+d})"
        elif r["fp"] > r["dp"] and r["ot_ml_home"]:
            ml_str = f" (ML {r['ot_ml_home']:+d})"
        print(
            f"  {home_s:<18s} vs {away_s:<18s}"
            f" | OT: {ot_sp:<18s}"
            f" | PICK: {pick:<28s} {conf}%{ml_str}"
        )

    print()
    print(f"  STRONG TOTALS EDGES (>=62%) - {len(strong_ou)} picks")
    print("  " + "-" * 95)
    for r, pick, conf in sorted(strong_ou, key=lambda x: -x[2]):
        pred_t = r["pred_total"]
        line = r["ot_total"] or r["mkt_total"]
        diff = pred_t - line
        home_s = r["home"][:18]
        away_s = r["away"][:18]
        print(
            f"  {home_s:<18s} vs {away_s:<18s}"
            f" | Line: {line:<6.1f} Model: {pred_t:<6.1f} ({diff:+.1f})"
            f" | PICK: {pick:<18s} {conf}%"
        )

    # Full game list
    print()
    print("  ALL GAMES")
    print("  " + "-" * 118)
    print(
        f"  {'Game':<42s} {'OT Spread':>14s} {'OT Tot':>7s}"
        f" {'ML':>12s} {'Model':>7s} {'ATS':>12s} {'O/U':>12s}"
    )
    print("  " + "-" * 118)

    for r in results:
        home_s = r["home"][:18]
        away_s = r["away"][:18]
        game = f"{home_s:<18s} vs {away_s:<18s}"

        # OT spread
        if r["ot_spread"] is not None and r["ot_fav"]:
            fav_is_home = r["ot_fav"].lower()[:5] in r["home"].lower()[:8]
            ot_sp = f"-{r['ot_spread']:.1f}" if fav_is_home else f"+{r['ot_spread']:.1f}"
        else:
            fav_is_home = r["fav"] == r["home"]
            ot_sp = f"-{r['mkt_spread']:.1f}" if fav_is_home else f"+{r['mkt_spread']:.1f}"

        ot_tot = f"{r['ot_total']:.1f}" if r["ot_total"] else f"{r['mkt_total']:.1f}"

        # ML
        if r["ot_ml_home"] and r["ot_ml_away"]:
            ml = f"{r['ot_ml_home']:+d}/{r['ot_ml_away']:+d}"
        else:
            ml = "--"

        # ATS
        ats_conf = max(r["fp"], r["dp"])
        ats_label = "DOG" if r["dp"] > r["fp"] else "FAV"
        ats = f"{ats_label} {ats_conf}%"
        if ats_conf >= 62:
            ats += " **"

        # O/U
        ou_conf = max(r["op"], r["up"])
        ou_label = "OVER" if r["op"] > r["up"] else "UNDR"
        ou = f"{ou_label} {ou_conf}%"
        if ou_conf >= 62:
            ou += " **"

        print(
            f"  {game:<42s} {ot_sp:>14s} {ot_tot:>7s}"
            f" {ml:>12s} {r['pred_margin']:>+7.1f} {ats:>12s} {ou:>12s}"
        )

    print("  " + "-" * 118)
    print()
    print("  ** = Strong edge (>=62% confidence)")
    now_str = pd.Timestamp.now().strftime("%I:%M %p PT")
    print(f"  OT odds polled at {now_str} | Model: score_model_v3 (48 features)")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Game day outlook")
    parser.add_argument("--date", required=True, help="Date (YYYY-MM-DD)")
    args = parser.parse_args()

    pred_file = Path(f"predictions/{args.date}.csv")
    if not pred_file.exists():
        print(f"[ERROR] No predictions: {pred_file}")
        return 1

    preds = pd.read_csv(pred_file)
    print(f"[OK] {len(preds)} predictions loaded")

    ot = load_overtime_odds(args.date)
    print(f"[OK] {len(ot)} OT game lines loaded")

    results = merge_odds_and_predictions(ot, preds)
    matched = sum(1 for r in results if r["ot_spread"] is not None)
    print(f"[OK] {matched}/{len(results)} games matched to OT odds")

    print_report(results, args.date)
    return 0


if __name__ == "__main__":
    sys.exit(main())
