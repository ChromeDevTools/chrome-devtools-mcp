"""Simple test of Odds API database without complex views."""

import sqlite3

import pandas as pd

# Connect fresh
conn = sqlite3.connect("data/odds_api/odds_api.sqlite3")

# Test 1: Query raw observations
print("=== Test 1: Raw Observations ===")
result = conn.execute("""
    SELECT COUNT(*) as total,
           COUNT(DISTINCT event_id) as games,
           MIN(as_of) as first,
           MAX(as_of) as last
    FROM observations
""").fetchone()

print(f"Total observations: {result[0]:,}")
print(f"Unique games: {result[1]:,}")
print(f"Date range: {result[2]} to {result[3]}")

# Test 2: Manual canonical spreads (no view)
print("\n=== Test 2: Manual Canonical Spreads ===")
spreads = pd.read_sql(
    """
    SELECT
        event_id,
        book_key,
        as_of,
        MAX(CASE WHEN point < 0 THEN outcome_name END) as favorite_team,
        MAX(CASE WHEN point > 0 THEN outcome_name END) as underdog_team,
        ABS(MAX(point)) as spread_magnitude,
        MAX(CASE WHEN point < 0 THEN price_american END) as favorite_price,
        MAX(CASE WHEN point > 0 THEN price_american END) as underdog_price
    FROM observations
    WHERE market_key = 'spreads'
      AND point IS NOT NULL
    GROUP BY event_id, book_key, as_of, ABS(point)
    LIMIT 5
""",
    conn,
)

print(f"Sample canonical spreads ({len(spreads)} rows):")
spread_cols = ["event_id", "favorite_team", "underdog_team", "spread_magnitude"]
print(spreads[spread_cols].to_string(index=False))

# Test 3: Events with scores
print("\n=== Test 3: Events with Scores ===")
events = pd.read_sql(
    """
    SELECT e.event_id, e.home_team, e.away_team, s.home_score, s.away_score
    FROM events e
    INNER JOIN scores s ON e.event_id = s.event_id
    WHERE s.home_score IS NOT NULL
    LIMIT 5
""",
    conn,
)

print(f"Found {len(events)} games with scores:")
for _, row in events.iterrows():
    away = row["away_team"]
    home = row["home_team"]
    score = f"{row['away_score']}-{row['home_score']}"
    print(f"  {away:30s} @ {home:30s} ({score})")

# Test 4: Line movement (manual)
print("\n=== Test 4: Line Movement for One Game ===")
sample_event = events.iloc[0]["event_id"]

movements = pd.read_sql(
    f"""
    SELECT
        as_of,
        book_key,
        MAX(CASE WHEN point < 0 THEN outcome_name END) as favorite,
        ABS(MAX(point)) as spread
    FROM observations
    WHERE event_id = '{sample_event}'
      AND market_key = 'spreads'
      AND book_key = 'fanduel'
    GROUP BY as_of, ABS(point)
    ORDER BY as_of
""",
    conn,
)

if len(movements) > 0:
    print(f"FanDuel line movement for {sample_event[:20]}...:")
    print(f"  Opening: {movements.iloc[0]['favorite']} {movements.iloc[0]['spread']}")
    print(f"  Closing: {movements.iloc[-1]['favorite']} {movements.iloc[-1]['spread']}")
    print(f"  Total observations: {len(movements)}")

conn.close()

print("\n[OK] Simple tests passed!")
