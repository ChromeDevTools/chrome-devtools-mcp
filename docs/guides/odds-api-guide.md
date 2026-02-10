# Odds API Streaming Service

Automated line movement tracking for NCAA Men's Basketball with optimal credit usage.

## Overview

The streaming service collects odds from The Odds API at 30-second intervals during betting hours (4 AM - 11 PM PST). This enables:

- **Line movement detection**: Track how spreads and totals move throughout the day
- **Steam move identification**: Detect sharp money and reverse line movement
- **Closing Line Value (CLV)**: Compare your picks against closing lines
- **Market inefficiencies**: Find bookmaker divergence and arbitrage opportunities

## Credit Budget Strategy

Following the `/odds-collecting` skill guidance:

| Metric | Value |
|--------|-------|
| **Interval** | 30 seconds (2 calls/min) |
| **Active hours** | 4 AM - 11 PM PST (19 hours) |
| **Daily calls** | ~2,280 calls |
| **Regions** | us, us2 (2 regions) |
| **Daily credits** | ~4,560 credits |
| **Monthly usage** | ~137K credits |
| **Monthly budget** | 5M credits |
| **Reserved** | ~4.86M for backfills and special events |

This strategy provides high-resolution line tracking while reserving 97% of quota for historical analysis.

## Quick Start

### Option 1: Daemon Mode (Recommended)

Runs continuously, automatically collecting during betting hours:

```powershell
# Start daemon (runs until you stop it)
uv run python scripts/stream_odds_api.py --daemon
```

**For persistent background operation**, use Windows Task Scheduler:

```powershell
# Set up automated task (runs at boot)
.\scripts\setup_odds_streaming_windows.ps1

# Start the task
Start-ScheduledTask -TaskName "OddsAPIStreaming"

# Check status
Get-ScheduledTask -TaskName "OddsAPIStreaming" | Select-Object State

# View logs
Get-Content data\logs\odds_api_streaming.log -Tail 50 -Wait
```

### Option 2: Manual Collection

Run single snapshot (useful for testing or cron jobs):

```powershell
# Collect once
uv run python scripts/stream_odds_api.py --once

# Dry run (see what would happen)
uv run python scripts/stream_odds_api.py --dry-run
```

## Collection Schedule

| Time (PST) | Status | Rationale |
|------------|--------|-----------|
| 4:00 AM - 11:00 PM | ✅ Active | Betting hours for next-day games |
| 11:00 PM - 4:00 AM | ❌ Inactive | Saves credits, minimal line movement |

Collection stops automatically outside betting hours and resumes at 4 AM.

## Data Storage

### Database Schema

**Location**: `data/odds_api/odds_api.sqlite3`

```sql
-- Events (one row per game)
CREATE TABLE events (
    event_id TEXT PRIMARY KEY,
    sport_key TEXT,
    home_team TEXT,
    away_team TEXT,
    commence_time TEXT,
    created_at TEXT,
    source TEXT,
    has_odds INTEGER
);

-- Observations (raw odds snapshots)
CREATE TABLE observations (
    obs_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT,
    book_key TEXT,
    market_key TEXT,
    outcome_name TEXT,
    price_american INTEGER,
    point REAL,
    as_of TEXT,
    fetched_at TEXT,
    sport_key TEXT
);

-- Scores (final results)
CREATE TABLE scores (
    event_id TEXT PRIMARY KEY,
    sport_key TEXT,
    completed INTEGER,
    home_score INTEGER,
    away_score INTEGER,
    last_update TEXT,
    fetched_at TEXT
);
```

### Normalized Views

The database automatically creates canonical views that follow betting data normalization standards:

- `canonical_spreads`: One row per game/book/time with spread magnitude (always positive) and favorite/underdog teams
- `canonical_totals`: One row per game/book/time with total value
- `canonical_moneylines`: Moneylines with implied probabilities
- `spread_movements`: Line movement tracking with steam detection
- `bookmaker_consensus`: Market consensus across all books

**Example Query** (get closing spreads for a game):

```sql
SELECT
    book_key,
    favorite_team,
    underdog_team,
    spread_magnitude,
    favorite_price,
    underdog_price
FROM canonical_spreads
WHERE event_id = 'abc123'
ORDER BY as_of DESC
LIMIT 1;
```

## Verification & Monitoring

### Check Latest Collection

```powershell
# View recent log entries
Get-Content data\logs\odds_api_streaming.log -Tail 20

# Run verification script
uv run python scripts/verify_odds_streaming.py
```

### Database Queries

```python
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

db = OddsAPIDatabase("data/odds_api/odds_api.sqlite3")

# Get coverage stats
stats = db.get_database_stats()
print(f"Total events: {stats['total_events']}")
print(f"Events with scores: {stats['events_with_scores']}")

# Get line movements for a game
movements = db.get_spread_movements(event_id="your_event_id")
print(movements)

# Get closing lines for today's games
from datetime import date
closing = db.get_bookmaker_closing_lines(
    event_ids=["event1", "event2"],
    book_keys=["fanduel", "draftkings", "pinnacle"]
)
print(closing)
```

### Quota Monitoring

The service automatically logs quota warnings when usage exceeds 80%:

```
[WARNING] Quota below 20%: 950,000 remaining (19.0%)
```

Check current quota:

```python
from sports_betting_edge.adapters.odds_api import OddsAPIAdapter
import asyncio

async def check_quota():
    adapter = OddsAPIAdapter()
    await adapter.get_sports()  # Make any API call
    remaining = adapter.get_quota_remaining()
    used = adapter.get_quota_used()
    print(f"Remaining: {remaining:,}")
    print(f"Used: {used:,}")
    await adapter.close()

asyncio.run(check_quota())
```

## Troubleshooting

### Issue: "ODDS_API_KEY not set"

**Solution**: Add your API key to `.env` file:

```bash
ODDS_API_KEY=your_key_here
```

### Issue: "No odds data returned"

**Possible causes**:
- No games scheduled for today
- Collecting outside betting hours
- API quota exhausted

**Check**:
```powershell
# Test single collection
uv run python scripts/stream_odds_api.py --once
```

### Issue: "Task not running in background"

**Solution**: Check Task Scheduler status:

```powershell
Get-ScheduledTask -TaskName "OddsAPIStreaming" | Select-Object State

# If stopped, start it
Start-ScheduledTask -TaskName "OddsAPIStreaming"
```

### Issue: "Database locked"

**Cause**: Multiple processes accessing database simultaneously

**Solution**:
- Ensure only one streaming daemon is running
- Stop Task Scheduler task before manual collection
- Use `--db` flag to specify different database for testing

## Advanced Usage

### Custom Database Path

```powershell
# Use different database for testing
uv run python scripts/stream_odds_api.py --daemon --db data/test.sqlite3
```

### Manual Interval Control

Edit `scripts/stream_odds_api.py`:

```python
COLLECTION_INTERVAL_SECONDS = 60  # Change from 30 to 60 seconds
```

**Trade-off**: Longer intervals save credits but reduce line movement resolution.

### Custom Time Window

Edit `scripts/stream_odds_api.py`:

```python
COLLECTION_START_TIME = dt_time(10, 0)  # Start at 10 AM instead of 4 AM
COLLECTION_END_TIME = dt_time(22, 0)    # End at 10 PM instead of 11 PM
```

## Line Movement Analysis

See `scripts/analyze_line_movement.py` for detecting:

- **Steam moves**: Rapid line movement across multiple books
- **Reverse Line Movement (RLM)**: Line moves opposite to public betting %
- **Key number violations**: Movements through 3, 7 (NFL), 1-2 (NCAAB)
- **Bookmaker divergence**: Sharp vs public book disagreements

## Integration with ML Models

The streaming data feeds into your prediction models:

```python
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase

db = OddsAPIDatabase("data/odds_api/odds_api.sqlite3")

# Get line movement features for model
features = db.get_line_movement_features(event_ids=["event1", "event2"])

# Columns: avg_opening_spread, avg_closing_spread, avg_total_movement,
#          hours_tracked, movement_velocity

# Get consensus divergence (market inefficiency indicator)
divergence = db.get_consensus_divergence(event_ids=["event1", "event2"])

# Columns: consensus_spread, spread_variance, has_market_disagreement,
#          outlier_book_count, num_books
```

## See Also

- `/odds-collecting` skill: Complete Odds API reference
- `docs/kenpom/`: KenPom data collection
- `scripts/collect_hybrid.py`: ESPN + Odds API hybrid collection
- `sql/create_normalized_views.sql`: View definitions
