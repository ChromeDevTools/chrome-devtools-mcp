#!/usr/bin/env python3
"""Check date ranges of events with odds vs scores."""

import pandas as pd

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

db = OddsAPIDatabase("data/odds_api/odds_api.sqlite3")

# Get all events
events = pd.read_sql_query("SELECT event_id, commence_time, has_odds FROM events", db.conn)
scored = pd.read_sql_query("SELECT event_id, completed FROM scores", db.conn)

events["commence_date"] = pd.to_datetime(events["commence_time"], format="ISO8601").dt.date

print("Events with odds:")
odds_events = events[events["has_odds"] == 1]
print(f"  Date range: {odds_events['commence_date'].min()} to {odds_events['commence_date'].max()}")
print(f"  Count: {len(odds_events)}")

print("")
print("Events with scores:")
scored_ids = set(scored["event_id"])
scored_events = events[events["event_id"].isin(scored_ids)]
date_min = scored_events["commence_date"].min()
date_max = scored_events["commence_date"].max()
print(f"  Date range: {date_min} to {date_max}")
print(f"  Count: {len(scored_events)}")

print("")
print("Overlap:")
overlap = odds_events[odds_events["event_id"].isin(scored_ids)]
print(f"  Events with BOTH: {len(overlap)}")
if len(overlap) > 0:
    print(f"  Date range: {overlap['commence_date'].min()} to {overlap['commence_date'].max()}")
else:
    print("  [ISSUE] No overlap - odds and scores are for different games!")
    print("")
    print("This explains why line_features.parquet is empty:")
    print("- Scores are for PAST games (already played)")
    print("- Odds are for FUTURE games (not yet played)")
    print("- The Odds API only provides odds for upcoming games (3-day lookback)")
    print("")
    print("SOLUTION: Need historical odds from odds_snapshots table")

# Check odds_snapshots
print("")
print("Checking odds_snapshots table:")
snapshots = pd.read_sql_query("SELECT COUNT(*) as cnt FROM odds_snapshots", db.conn)
print(f"  Snapshot records: {snapshots.iloc[0, 0]}")
if snapshots.iloc[0, 0] > 0:
    snapshot_dates = pd.read_sql_query(
        "SELECT MIN(snapshot_date) as min_date, MAX(snapshot_date) as max_date FROM odds_snapshots",
        db.conn,
    )
    print(f"  Date range: {snapshot_dates.iloc[0, 0]} to {snapshot_dates.iloc[0, 1]}")
else:
    print("  [EMPTY] No historical snapshots available yet")
    print("  Need to run archive_daily_odds.py to build historical data")
