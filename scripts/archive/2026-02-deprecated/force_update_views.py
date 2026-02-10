"""Force update SQL views in Odds API database.

This script drops and recreates all views to ensure they use latest definitions.
Run this after updating sql/create_normalized_views.sql.

Usage:
    uv run python scripts/force_update_views.py
"""

import sqlite3
from pathlib import Path

# Connect to database
db_path = Path("data/odds_api/odds_api.sqlite3")
conn = sqlite3.connect(str(db_path))

# Enable write-ahead logging checkpoint
conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

# Drop all views in reverse dependency order
views = [
    "ml_line_features",
    "bookmaker_consensus",
    "spread_movements",
    "canonical_moneylines",
    "canonical_totals",
    "canonical_spreads",
]

print("Dropping existing views...")
for view in views:
    try:
        conn.execute(f"DROP VIEW IF EXISTS {view}")
        print(f"  [OK] Dropped {view}")
    except Exception as e:
        print(f"  [ERROR] Could not drop {view}: {e}")

conn.commit()

# Recreate views from SQL file
print("\nRecreating views...")
views_sql = Path("sql/create_normalized_views.sql")

if not views_sql.exists():
    print(f"[ERROR] SQL file not found: {views_sql}")
    exit(1)

with open(views_sql) as f:
    sql = f.read()

# Check for STDEV (should not be present)
if "STDEV" in sql:
    print("[WARNING] SQL file contains STDEV - this won't work in SQLite!")
    print("Please replace STDEV with (MAX - MIN) for variance")
    exit(1)

try:
    conn.executescript(sql)
    conn.commit()
    print("[OK] All views recreated successfully")
except Exception as e:
    print(f"[ERROR] Failed to create views: {e}")
    exit(1)

# Verify views were created
print("\nVerifying views...")
for view in views:
    result = conn.execute(
        f"SELECT sql FROM sqlite_master WHERE type='view' AND name='{view}'"
    ).fetchone()

    if result:
        sql_def = result[0]
        if "STDEV" in sql_def:
            print(f"  [ERROR] {view} still contains STDEV!")
        else:
            print(f"  [OK] {view} created successfully")
    else:
        print(f"  [ERROR] {view} not found in database")

# Checkpoint and close
conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
conn.close()

print("\n[OK] Database views updated successfully!")
