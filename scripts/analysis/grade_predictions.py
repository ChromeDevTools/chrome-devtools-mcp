"""Grade predictions against actual scores from Odds API.

Usage:
    uv run python scripts/analysis/grade_predictions.py --date 2026-02-08
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv


def fetch_scores(target_date: str) -> dict[str, tuple[int, int]]:
    """Fetch completed scores from Odds API for games on target_date."""
    load_dotenv()
    key = os.getenv("ODDS_API_KEY")
    if not key:
        print("[ERROR] ODDS_API_KEY not set")
        sys.exit(1)

    url = "https://api.the-odds-api.com/v4/sports/basketball_ncaab/scores"
    params = {"apiKey": key, "daysFrom": 3}
    resp = httpx.get(url, params=params, timeout=30)
    data = resp.json()

    scores: dict[str, tuple[int, int]] = {}
    for event in data:
        if not event.get("completed"):
            continue
        ct = event.get("commence_time", "")
        # Match date (late games may have next day UTC)
        if target_date not in ct:
            # Check if late game from target date (before 08:00 UTC next day)
            next_parts = ct.split("T")
            if len(next_parts) == 2 and next_parts[1][:2] < "08":
                from datetime import date, timedelta

                d = date.fromisoformat(next_parts[0])
                prev = (d - timedelta(days=1)).isoformat()
                if prev != target_date:
                    continue
            else:
                continue

        home_score = away_score = None
        for s in event.get("scores", []):
            if s["name"] == event["home_team"]:
                home_score = int(s["score"])
            elif s["name"] == event["away_team"]:
                away_score = int(s["score"])

        if home_score is not None and away_score is not None:
            norm_home = event["home_team"].lower().replace(".", "").replace("'", "")
            scores[norm_home] = (home_score, away_score)

    credits = resp.headers.get("x-requests-remaining", "unknown")
    print(f"[OK] Fetched {len(scores)} completed games (API credits: {credits})")
    return scores


def load_predictions(pred_file: Path) -> list[dict[str, str]]:
    """Load predictions CSV."""
    preds = []
    with open(pred_file) as f:
        reader = csv.DictReader(f)
        for row in reader:
            preds.append(row)
    return preds


def normalize(name: str) -> str:
    return name.lower().replace(".", "").replace("'", "").strip()


def match_predictions(
    preds: list[dict[str, str]], scores: dict[str, tuple[int, int]]
) -> list[dict]:
    """Match predictions to actual scores."""
    results = []
    for pred in preds:
        home = pred["home_team"].strip()
        nh = normalize(home)

        # Exact match
        matched_key = None
        if nh in scores:
            matched_key = nh
        else:
            # Partial match (first 10 chars)
            for sk in scores:
                if nh[:10] in sk or sk[:10] in nh:
                    matched_key = sk
                    break

        if matched_key is None:
            continue

        hs, as_ = scores[matched_key]
        results.append(
            {
                "home": home,
                "away": pred["away_team"].strip(),
                "pred_home": float(pred["predicted_home_score"]),
                "pred_away": float(pred["predicted_away_score"]),
                "pred_margin": float(pred["predicted_margin"]),
                "pred_total": float(pred["predicted_total"]),
                "actual_home": hs,
                "actual_away": as_,
                "actual_margin": hs - as_,
                "actual_total": hs + as_,
                "favorite": pred["favorite_team"],
                "spread_mag": float(pred["spread_magnitude"]),
                "total_line": float(pred["total_points"]),
                "fav_cover_pct": int(pred["favorite_cover_prob"].replace("%", "")),
                "dog_cover_pct": int(pred["underdog_cover_prob"].replace("%", "")),
                "over_pct": int(pred["over_prob"].replace("%", "")),
                "under_pct": int(pred["under_prob"].replace("%", "")),
            }
        )

    return results


def grade(results: list[dict]) -> None:
    """Print grading report."""
    print()
    print("=" * 130)
    print("PREDICTION GRADING REPORT")
    print("=" * 130)
    print()

    header = (
        f"{'Game':<48s} {'Spread':>7s} {'Pred':>6s} {'Act':>5s} "
        f"{'ATS':>5s} {'Line':>6s} {'Pred':>6s} {'Act':>5s} {'O/U':>5s}"
    )
    print(header)
    print("-" * 130)

    spread_hits = 0
    spread_total = 0
    total_hits = 0
    total_total = 0
    margin_errors = []
    total_errors = []
    market_total_errors = []
    strong_spread_hits = 0
    strong_spread_total = 0
    strong_total_hits = 0
    strong_total_total = 0

    for r in results:
        game = f"{r['home'][:22]:<22s} vs {r['away'][:22]:<22s}"

        # --- Spread grading ---
        am = r["actual_margin"]
        sm = r["spread_mag"]
        fav = r["favorite"]

        # Favorite margin (positive = favorite won by this much)
        fav_margin = am if fav == r["home"] else -am

        margin_errors.append(abs(r["pred_margin"] - am))

        # Did favorite cover?
        if fav_margin == sm:
            spread_result = "PUSH"
        elif fav_margin > sm:
            fav_covered = True
            spread_result = "FAV"
        else:
            fav_covered = False
            spread_result = "DOG"

        # Model pick
        model_pick_fav = r["fav_cover_pct"] > r["dog_cover_pct"]

        if spread_result == "PUSH":
            ats_str = "PUSH"
        else:
            model_correct = (model_pick_fav and fav_covered) or (
                not model_pick_fav and not fav_covered
            )
            ats_str = "HIT" if model_correct else "MISS"
            spread_total += 1
            if model_correct:
                spread_hits += 1

            # Strong picks (>= 62% confidence)
            confidence = max(r["fav_cover_pct"], r["dog_cover_pct"])
            if confidence >= 62:
                strong_spread_total += 1
                if model_correct:
                    strong_spread_hits += 1

        # Display spread
        spread_disp = f"-{sm}" if fav == r["home"] else f"+{sm}"

        # --- Totals grading ---
        at = r["actual_total"]
        tl = r["total_line"]
        pt = r["pred_total"]

        total_errors.append(abs(pt - at))
        market_total_errors.append(abs(tl - at))

        if at == tl:
            ou_str = "PUSH"
        else:
            actual_over = at > tl
            model_said_over = r["over_pct"] > 50
            total_correct = (model_said_over and actual_over) or (
                not model_said_over and not actual_over
            )
            ou_str = "HIT" if total_correct else "MISS"
            total_total += 1
            if total_correct:
                total_hits += 1

            # Strong totals picks (>= 62%)
            confidence = max(r["over_pct"], r["under_pct"])
            if confidence >= 62:
                strong_total_total += 1
                if total_correct:
                    strong_total_hits += 1

        print(
            f"{game:<48s} {spread_disp:>7s} {r['pred_margin']:>+6.1f} "
            f"{am:>+5d} {ats_str:>5s} {tl:>6.1f} {pt:>6.1f} "
            f"{at:>5d} {ou_str:>5s}"
        )

    print("-" * 130)
    print()

    # Summary
    print("=== SPREAD PERFORMANCE ===")
    if spread_total > 0:
        pct = spread_hits / spread_total * 100
        print(f"All picks: {spread_hits}-{spread_total - spread_hits} ({pct:.0f}%)")
    if strong_spread_total > 0:
        spct = strong_spread_hits / strong_spread_total * 100
        print(
            f"Strong picks (>=62%): {strong_spread_hits}-"
            f"{strong_spread_total - strong_spread_hits} ({spct:.0f}%)"
        )
    print(f"Margin MAE: {sum(margin_errors) / len(margin_errors):.1f} pts")
    print()

    print("=== TOTALS PERFORMANCE ===")
    if total_total > 0:
        tpct = total_hits / total_total * 100
        print(f"All picks: {total_hits}-{total_total - total_hits} ({tpct:.0f}%)")
    if strong_total_total > 0:
        stpct = strong_total_hits / strong_total_total * 100
        print(
            f"Strong picks (>=62%): {strong_total_hits}-"
            f"{strong_total_total - strong_total_hits} ({stpct:.0f}%)"
        )
    print(f"Model Total MAE: {sum(total_errors) / len(total_errors):.1f} pts")
    print(f"Market Total MAE: {sum(market_total_errors) / len(market_total_errors):.1f} pts")
    model_mae = sum(total_errors) / len(total_errors)
    market_mae = sum(market_total_errors) / len(market_total_errors)
    edge = market_mae - model_mae
    print(f"Model vs Market: {'+' if edge > 0 else ''}{edge:.1f} pts")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Grade predictions vs actuals")
    parser.add_argument("--date", required=True, help="Date to grade (YYYY-MM-DD)")
    args = parser.parse_args()

    pred_file = Path(f"predictions/{args.date}.csv")
    if not pred_file.exists():
        print(f"[ERROR] No predictions file: {pred_file}")
        return 1

    preds = load_predictions(pred_file)
    print(f"[OK] Loaded {len(preds)} predictions from {pred_file}")

    scores = fetch_scores(args.date)
    results = match_predictions(preds, scores)
    print(f"[OK] Matched {len(results)} of {len(preds)} predicted games")

    if not results:
        print("[ERROR] No matches found")
        return 1

    grade(results)
    return 0


if __name__ == "__main__":
    sys.exit(main())
