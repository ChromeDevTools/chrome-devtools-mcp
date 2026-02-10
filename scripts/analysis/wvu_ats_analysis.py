"""WVU ATS analysis for Texas Tech matchup."""

from __future__ import annotations

import sqlite3

import pandas as pd


def main() -> None:
    conn = sqlite3.connect("data/odds_api/odds_api.sqlite3")

    # Get all WVU games this season with scores
    wvu_games = pd.read_sql_query(
        """
        SELECT e.event_id, e.commence_time, e.home_team, e.away_team,
               s.home_score, s.away_score, s.completed
        FROM events e
        LEFT JOIN scores s ON e.event_id = s.event_id
        WHERE e.sport_key = 'basketball_ncaab'
          AND (e.home_team LIKE '%West Virginia%'
               OR e.away_team LIKE '%West Virginia%')
          AND e.commence_time >= '2024-11-01'
        ORDER BY e.commence_time
        """,
        conn,
    )

    results = []
    for _, g in wvu_games.iterrows():
        eid = g["event_id"]

        # Get closing spread from FanDuel
        spread_data = pd.read_sql_query(
            f"""
            SELECT outcome_name, point, price_american
            FROM observations
            WHERE event_id = '{eid}'
              AND market_key = 'spreads'
              AND book_key = 'fanduel'
            ORDER BY fetched_at DESC
            LIMIT 2
            """,
            conn,
        )

        # Get closing total from FanDuel
        total_data = pd.read_sql_query(
            f"""
            SELECT point
            FROM observations
            WHERE event_id = '{eid}'
              AND market_key = 'totals'
              AND book_key = 'fanduel'
              AND outcome_name = 'Over'
            ORDER BY fetched_at DESC
            LIMIT 1
            """,
            conn,
        )

        is_home = "West Virginia" in g["home_team"]
        opp = g["away_team"] if is_home else g["home_team"]
        wvu_score = g["home_score"] if is_home else g["away_score"]
        opp_score = g["away_score"] if is_home else g["home_score"]

        # Parse WVU spread
        wvu_spread = None
        if len(spread_data) > 0:
            for _, sd in spread_data.iterrows():
                if "West Virginia" in sd["outcome_name"]:
                    wvu_spread = sd["point"]
                    break
            if wvu_spread is None:
                for _, sd in spread_data.iterrows():
                    if "West Virginia" not in sd["outcome_name"]:
                        wvu_spread = -sd["point"]
                        break

        close_total = total_data.iloc[0]["point"] if len(total_data) > 0 else None

        # Clean opponent name
        opp_clean = (
            opp.replace(" Mountaineers", "")
            .replace("West Virginia ", "")
            .replace(" Red Raiders", "")
            .replace(" Wildcats", "")
            .replace(" Jayhawks", "")
            .replace(" Buffaloes", "")
            .replace(" Bears", "")
            .replace(" Cyclones", "")
            .replace(" Sooners", "")
            .replace(" Cougars", "")
            .replace(" Longhorns", "")
            .replace(" Horned Frogs", "")
            .replace(" Cowboys", "")
            .replace(" Sun Devils", "")
            .replace(" Bearcats", "")
            .replace(" Aggies", "")
            .replace(" Spartans", "")
            .replace(" Rams", "")
            .replace(" Fighting Illini", "")
            .replace(" Golden Eagles", "")
        )

        results.append(
            {
                "date": g["commence_time"][:10],
                "opp": opp_clean[:20],
                "ha": "H" if is_home else "A",
                "wvu": wvu_score,
                "opp_sc": opp_score,
                "spread": wvu_spread,
                "total": close_total,
                "completed": g["completed"],
            }
        )

    conn.close()

    df = pd.DataFrame(results)
    scored = df[df["wvu"].notna()].copy()
    scored["wvu"] = scored["wvu"].astype(float)
    scored["opp_sc"] = scored["opp_sc"].astype(float)
    scored["margin"] = scored["wvu"] - scored["opp_sc"]
    scored["won"] = scored["margin"] > 0
    scored["act_total"] = scored["wvu"] + scored["opp_sc"]

    # ATS calc
    with_spread = scored[scored["spread"].notna()].copy()
    with_spread["ats_margin"] = with_spread["margin"] + with_spread["spread"]
    with_spread["covered"] = with_spread["ats_margin"] > 0
    with_spread["push"] = with_spread["ats_margin"] == 0

    # O/U calc
    with_total = with_spread[with_spread["total"].notna()].copy()
    with_total["went_over"] = with_total["act_total"] > with_total["total"]

    # Print game log
    hdr = "=" * 105
    print(hdr)
    print("  WEST VIRGINIA MOUNTAINEERS - 2025-26 GAME LOG")
    print(hdr)
    print()
    header = (
        f"{'Date':12s} {'':4s} {'Opponent':20s} {'WVU':>5s} {'Opp':>5s} "
        f"{'Margin':>7s} {'W/L':>4s} {'Spread':>7s} {'ATS':>4s} "
        f"{'Total':>6s} {'O/U':>4s} {'ActTot':>7s}"
    )
    print(header)
    print("-" * 105)

    for _, r in scored.iterrows():
        wl = "W" if r["won"] else "L"
        sp_str = f"{r['spread']:+.1f}" if pd.notna(r["spread"]) else "  N/A"

        # ATS
        if pd.notna(r["spread"]):
            am = r["margin"] + r["spread"]
            ats = "W" if am > 0 else ("P" if am == 0 else "L")
        else:
            ats = "-"

        # O/U
        if pd.notna(r.get("total")):
            t_str = f"{r['total']:.0f}"
            if r["act_total"] > r["total"]:
                ou = "O"
            elif r["act_total"] < r["total"]:
                ou = "U"
            else:
                ou = "P"
        else:
            t_str = "N/A"
            ou = "-"

        print(
            f"{r['date']:12s} {r['ha']:4s} {r['opp']:20s} "
            f"{r['wvu']:5.0f} {r['opp_sc']:5.0f} {r['margin']:+7.0f} "
            f"{wl:>4s} {sp_str:>7s} {ats:>4s} {t_str:>6s} {ou:>4s} "
            f"{r['act_total']:7.0f}"
        )

    # Summaries
    print()
    print(hdr)
    print("  SUMMARY STATS")
    print(hdr)

    wins = int(scored["won"].sum())
    losses = len(scored) - wins
    print(f"  Overall: {wins}-{losses}")

    if len(with_spread) > 0:
        ats_w = int(with_spread["covered"].sum())
        ats_l = int((~with_spread["covered"] & ~with_spread["push"]).sum())
        ats_p = int(with_spread["push"].sum())
        pct = ats_w / (ats_w + ats_l) * 100 if (ats_w + ats_l) > 0 else 0
        print(f"  ATS: {ats_w}-{ats_l}-{ats_p} ({pct:.1f}%)")

    if len(with_total) > 0:
        overs = int(with_total["went_over"].sum())
        unders = len(with_total) - overs
        print(f"  O/U: {overs} Over, {unders} Under")
        print(f"  Avg Actual Total: {with_total['act_total'].mean():.1f}")

    # Home splits
    home = scored[scored["ha"] == "H"]
    away = scored[scored["ha"] == "A"]
    home_ws = with_spread[with_spread.index.isin(home.index)]
    away_ws = with_spread[with_spread.index.isin(away.index)]

    print()
    print("  --- HOME ---")
    hw = int(home["won"].sum())
    hl = len(home) - hw
    print(f"  SU: {hw}-{hl}")
    if len(home_ws) > 0:
        haw = int(home_ws["covered"].sum())
        hal = int((~home_ws["covered"] & ~home_ws["push"]).sum())
        print(f"  ATS: {haw}-{hal}")
        print(f"  Avg Margin: {home['margin'].mean():+.1f}")

    print()
    print("  --- AWAY ---")
    aw = int(away["won"].sum())
    al_ = len(away) - aw
    print(f"  SU: {aw}-{al_}")
    if len(away_ws) > 0:
        aaw = int(away_ws["covered"].sum())
        aal = int((~away_ws["covered"] & ~away_ws["push"]).sum())
        print(f"  ATS: {aaw}-{aal}")
        print(f"  Avg Margin: {away['margin'].mean():+.1f}")

    # As underdog
    dog = with_spread[with_spread["spread"] > 0]
    fav = with_spread[with_spread["spread"] < 0]

    print()
    print("  --- AS UNDERDOG ---")
    if len(dog) > 0:
        dw = int(dog["covered"].sum())
        dl = int((~dog["covered"] & ~dog["push"]).sum())
        dsu_w = int((dog["margin"] > 0).sum())
        dsu_l = len(dog) - dsu_w
        print(f"  Games: {len(dog)}")
        print(f"  SU: {dsu_w}-{dsu_l} (outright wins)")
        print(f"  ATS: {dw}-{dl}")
        print(f"  Avg Spread: +{dog['spread'].mean():.1f}")
        print(f"  Avg Margin: {dog['margin'].mean():+.1f}")
    else:
        print("  No games as underdog")

    print()
    print("  --- AS FAVORITE ---")
    if len(fav) > 0:
        fw = int(fav["covered"].sum())
        fl = int((~fav["covered"] & ~fav["push"]).sum())
        print(f"  Games: {len(fav)}")
        print(f"  ATS: {fw}-{fl}")
        print(f"  Avg Spread: {fav['spread'].mean():.1f}")
    else:
        print("  No games as favorite")

    # Last 5
    print()
    print("  --- LAST 5 GAMES ---")
    last5 = scored.tail(5)
    l5w = int(last5["won"].sum())
    print(f"  SU: {l5w}-{5 - l5w}")
    print(f"  Avg Margin: {last5['margin'].mean():+.1f}")
    print(f"  Avg Total: {last5['act_total'].mean():.1f}")
    l5_ws = with_spread[with_spread.index.isin(last5.index)]
    if len(l5_ws) > 0:
        l5aw = int(l5_ws["covered"].sum())
        l5al = int((~l5_ws["covered"] & ~l5_ws["push"]).sum())
        print(f"  ATS: {l5aw}-{l5al}")

    # Conference play only
    print()
    print("  --- BIG 12 PLAY ONLY ---")
    b12_teams = [
        "Arizona",
        "Arizona St",
        "Baylor",
        "BYU",
        "Cincinnati",
        "Colorado",
        "Houston",
        "Iowa St",
        "Kansas",
        "Kansas St",
        "Oklahoma St",
        "TCU",
        "Texas Tech",
        "UCF",
        "Utah",
        "West Virginia",
    ]
    conf = scored[scored["opp"].apply(lambda x: any(t in x for t in b12_teams))]
    if len(conf) > 0:
        cw = int(conf["won"].sum())
        cl_ = len(conf) - cw
        print(f"  SU: {cw}-{cl_}")
        print(f"  Avg Margin: {conf['margin'].mean():+.1f}")
        print(f"  Avg Total: {conf['act_total'].mean():.1f}")
        conf_ws = with_spread[with_spread.index.isin(conf.index)]
        if len(conf_ws) > 0:
            caw = int(conf_ws["covered"].sum())
            cal_ = int((~conf_ws["covered"] & ~conf_ws["push"]).sum())
            print(f"  ATS: {caw}-{cal_}")


if __name__ == "__main__":
    main()
