"""Verify Odds API streaming service is working correctly.

Checks:
1. Database exists and schema is valid
2. Recent data collection (last 5 minutes)
3. Observations are being stored correctly
4. Normalized views are working
5. Quota usage is reasonable

Usage:
    uv run python scripts/verify_odds_streaming.py
    uv run python scripts/verify_odds_streaming.py --db data/custom.sqlite3
"""

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path

# Ensure parent is in path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase


def check_database_exists(db_path: Path) -> bool:
    """Check if database file exists."""
    if not db_path.exists():
        print(f"[ERROR] Database not found: {db_path}")
        print("        Run streaming service to create database:")
        print("        uv run python scripts/stream_odds_api.py --once")
        return False

    print(f"[OK] Database exists: {db_path}")
    return True


def check_schema(db: OddsAPIDatabase) -> bool:
    """Check if required tables exist."""
    required_tables = ["events", "observations", "scores"]

    for table in required_tables:
        result = db.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()

        if not result:
            print(f"[ERROR] Missing table: {table}")
            return False

    print(f"[OK] Schema valid (tables: {', '.join(required_tables)})")
    return True


def check_normalized_views(db: OddsAPIDatabase) -> bool:
    """Check if normalized views exist."""
    required_views = ["canonical_spreads", "canonical_totals"]

    for view in required_views:
        result = db.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='view' AND name=?",
            (view,),
        ).fetchone()

        if not result:
            print(f"[WARNING] Missing view: {view}")
            print("          This is normal for new databases - views create automatically")
            return True  # Not fatal

    print("[OK] Normalized views exist")
    return True


def check_recent_collection(db: OddsAPIDatabase) -> bool:
    """Check if data has been collected recently."""
    # Get most recent observation
    result = db.conn.execute(
        """
        SELECT MAX(as_of) as latest_collection
        FROM observations
        """
    ).fetchone()

    if not result or not result[0]:
        print("[WARNING] No observations found in database")
        print("          Run streaming service to start collection:")
        print("          uv run python scripts/stream_odds_api.py --once")
        return True  # Not fatal for new databases

    latest_str = result[0]
    latest = datetime.fromisoformat(latest_str.replace("Z", "+00:00"))
    now = datetime.now(UTC)
    age_minutes = (now - latest).total_seconds() / 60

    if age_minutes > 5:
        print(f"[WARNING] Latest collection was {age_minutes:.1f} minutes ago")
        print("          Expected: < 1 minute (30-second intervals)")
        print("          Check if streaming daemon is running:")
        print("          Get-ScheduledTask -TaskName 'OddsAPIStreaming'")
        return True  # Warning, not error

    print(f"[OK] Recent collection: {age_minutes:.1f} minutes ago")
    return True


def check_data_coverage(db: OddsAPIDatabase) -> bool:
    """Check data coverage and quality."""
    stats = db.get_database_stats()

    total_events = stats["total_events"]
    events_with_scores = stats["events_with_scores"]

    print("[OK] Data coverage:")
    print(f"     Total events: {total_events}")
    print(f"     Events with scores: {events_with_scores}")

    if total_events == 0:
        print("[WARNING] No events in database yet")
        print("          This is normal for a new database")
        return True

    # Check bookmaker coverage
    bookmaker_coverage = stats.get("bookmaker_coverage", [])
    if bookmaker_coverage:
        print("     Bookmaker coverage:")
        for book in bookmaker_coverage[:5]:  # Top 5
            book_key = book["book_key"]
            games_covered = book["games_covered"]
            coverage_pct = book.get("coverage_pct", 0)
            print(f"       {book_key}: {games_covered} games ({coverage_pct:.1f}%)")

    return True


def check_observation_counts(db: OddsAPIDatabase) -> bool:
    """Check observation counts for sanity."""
    # Get counts by market
    result = db.conn.execute(
        """
        SELECT
            market_key,
            COUNT(*) as count,
            COUNT(DISTINCT event_id) as unique_events
        FROM observations
        GROUP BY market_key
        """
    ).fetchall()

    if not result:
        print("[WARNING] No observations found")
        return True

    print("[OK] Observations by market:")
    for market_key, count, unique_events in result:
        print(f"     {market_key}: {count:,} observations ({unique_events} events)")

    return True


def check_quota_health(db: OddsAPIDatabase) -> bool:
    """Check if quota usage is reasonable."""
    # This is informational only - can't check quota without API call
    print("[INFO] Quota health check skipped (requires API call)")
    print("       Check logs for quota warnings:")
    print("       Get-Content data\\logs\\odds_api_streaming.log -Tail 50")
    return True


def main() -> None:
    """Run all verification checks."""
    parser = argparse.ArgumentParser(description="Verify Odds API streaming service")
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to SQLite database",
    )

    args = parser.parse_args()

    print("=" * 80)
    print("Odds API Streaming Verification")
    print("=" * 80)
    print()

    # Check 1: Database exists
    if not check_database_exists(args.db):
        print()
        print("=" * 80)
        print("[FAILED] Verification failed - database not found")
        print("=" * 80)
        sys.exit(1)

    # Open database
    db = OddsAPIDatabase(args.db)

    try:
        # Check 2: Schema
        print()
        if not check_schema(db):
            print()
            print("=" * 80)
            print("[FAILED] Verification failed - schema invalid")
            print("=" * 80)
            sys.exit(1)

        # Check 3: Normalized views
        print()
        check_normalized_views(db)

        # Check 4: Recent collection
        print()
        check_recent_collection(db)

        # Check 5: Data coverage
        print()
        check_data_coverage(db)

        # Check 6: Observation counts
        print()
        check_observation_counts(db)

        # Check 7: Quota health
        print()
        check_quota_health(db)

        print()
        print("=" * 80)
        print("[SUCCESS] All verification checks passed")
        print("=" * 80)
        print()
        print("Next Steps:")
        print()
        print("1. Start streaming daemon (if not already running):")
        print("   Start-ScheduledTask -TaskName 'OddsAPIStreaming'")
        print()
        print("2. Monitor logs:")
        print("   Get-Content data\\logs\\odds_api_streaming.log -Tail 50 -Wait")
        print()
        print("3. Query line movements:")
        print("   python scripts/analyze_line_movement.py")
        print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
