# Team Mapping System

## Overview

The team mapping system provides a canonical identifier for all NCAA Division I basketball teams, enabling accurate data joins across multiple data sources with different naming conventions.

## Canonical Team Mapping Table

**Location**: `data/processed/team_mapping.parquet`

**Base Source**: KenPom (365 D-I teams, 2026 season)

### Schema

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `canonical_team_id` | int64 | Unique team identifier (KenPom ID) | KenPom |
| `canonical_name` | string | Official canonical team name | KenPom |
| `conference` | string | Conference abbreviation | KenPom |
| `division` | string | Division (always "D1") | KenPom |
| `kenpom_id` | int64 | KenPom team ID | KenPom |
| `kenpom_name` | string | KenPom team name | KenPom |
| `espn_id` | Int64 | ESPN team ID (nullable) | ESPN |
| `espn_display_name` | string | ESPN display name (nullable) | ESPN |
| `espn_abbreviation` | string | ESPN abbreviation (nullable) | ESPN |
| `espn_slug` | string | ESPN URL slug (nullable) | ESPN |
| `overtime_name` | string | Overtime.ag team name (nullable) | Overtime.ag |
| `odds_api_name` | string | The Odds API team name (nullable) | The Odds API |

## Data Source Coverage

| Source | Teams Mapped | Coverage |
|--------|-------------|----------|
| **KenPom** | 365 / 365 | 100.0% (BASE) |
| **ESPN** | 48 / 365 | 13.2% |
| **Overtime.ag** | 193 / 365 | 52.9% |
| **The Odds API** | 47 / 365 | 12.9% |

## Common Name Variations

Different data sources use different naming conventions. Examples:

| Canonical (KenPom) | ESPN | Overtime.ag | The Odds API |
|-------------------|------|-------------|--------------|
| Arizona St. | Arizona State Sun Devils | Arizona State |
| Connecticut | UConn Huskies | Connecticut |
| UCF | Central Florida Knights | Central Florida |
| N.C. State | NC State Wolfpack | NC State | NC State Wolfpack |
| Louisiana St. | LSU Tigers | Louisiana State | Louisiana State Tigers |
| Miami FL | Miami Hurricanes | Miami (FL) | Miami (FL) Hurricanes |
| Alabama St. | - | Alabama State | Alabama St Hornets |
| Cal Poly | Cal Poly Mustangs | Cal Poly SLO | - |
| East Tennessee St. | - | East Tenn State | East Tennessee St Buccaneers |

## Building the Mapping

### 1. Initialize from KenPom (Base)

```bash
uv run python scripts/build_team_mapping.py
```

Creates the base mapping with all 365 D-I teams from KenPom.

### 2. Map ESPN Teams

```bash
uv run python scripts/map_espn_teams.py
```

Maps ESPN team data using:
- Manual mappings for common variations
- Fuzzy string matching (85% threshold)

**Result**: 48 teams mapped (100% match rate on ESPN data)

### 3. Map Overtime.ag Teams

```bash
uv run python scripts/map_overtime_teams.py
```

Maps Overtime.ag team names using:
- Manual mappings for abbreviations and variations
- Exact string matching
- Fuzzy matching as fallback (90% threshold)

**Result**: 193 teams mapped (100% match rate on Overtime data)

### 4. Collect Odds API Sample Data

```bash
uv run python scripts/collect_odds_api_sample.py
```

Fetches current NCAAB odds and extracts unique team names.

**Cost**: 1-2 credits (depends on regions)

### 5. Map The Odds API Teams

```bash
uv run python scripts/map_odds_api_teams.py
```

Maps Odds API team names using:
- Manual mappings for full names with mascots
- Mascot stripping for fuzzy matching
- Core team name extraction

**Result**: 47 teams mapped (100% match rate on Odds API data)

## Usage Examples

### Join KenPom metrics with Overtime.ag odds

```python
import pandas as pd

# Load team mapping
mapping = pd.read_parquet('data/processed/team_mapping.parquet')

# Load KenPom efficiency data
kenpom_df = pd.read_parquet('data/kenpom/teams/season/teams_2026.parquet')

# Load Overtime odds data
overtime_df = pd.read_parquet('data/overtime/2026-01-31.parquet')

# Join Overtime home team to canonical mapping
home_joined = overtime_df.merge(
    mapping[['overtime_name', 'canonical_team_id', 'kenpom_id']],
    left_on='home_team',
    right_on='overtime_name',
    how='left'
)

# Now join to KenPom metrics
final_df = home_joined.merge(
    kenpom_df,
    left_on='kenpom_id',
    right_on='TeamID',
    how='left'
)
```

### Validate matchup consistency

```python
import pandas as pd

mapping = pd.read_parquet('data/processed/team_mapping.parquet')
overtime_df = pd.read_parquet('data/overtime/2026-01-31.parquet')

# Check for unmatched teams
home_unmatched = overtime_df[
    ~overtime_df['home_team'].isin(mapping['overtime_name'])
]
away_unmatched = overtime_df[
    ~overtime_df['away_team'].isin(mapping['overtime_name'])
]

if len(home_unmatched) > 0 or len(away_unmatched) > 0:
    print("WARNING: Unmatched teams found!")
    print(f"Home teams: {home_unmatched['home_team'].unique()}")
    print(f"Away teams: {away_unmatched['away_team'].unique()}")
else:
    print("All teams matched successfully!")
```

## Timezone Handling

Different data sources use different timezone conventions:

| Source | Format | Example | Notes |
|--------|--------|---------|-------|
| KenPom | - | - | No timestamps in team data |
| ESPN | Various | - | Check specific endpoint |
| Overtime.ag | ISO 8601 UTC | `2026-01-31T13:55:20.225134Z` | 'Z' suffix = UTC |
| The Odds API | ISO 8601 UTC | `2026-01-31T20:00:00Z` | 'Z' suffix = UTC |

### Converting Overtime.ag timestamps

```python
import pandas as pd

df = pd.read_parquet('data/overtime/2026-01-31.parquet')

# Parse UTC timestamp
df['captured_at_utc'] = pd.to_datetime(df['captured_at'], utc=True)

# Convert to local timezone (e.g., Pacific)
df['captured_at_local'] = df['captured_at_utc'].dt.tz_convert('America/Los_Angeles')

# For game times, combine date and time strings
df['game_datetime'] = pd.to_datetime(
    df['game_date_str'] + ' ' + df['game_time_str'],
    format='%a %b %d %I:%M %p'
)
```

## Maintenance

### Adding New Manual Mappings

If new teams appear in data sources with unmatched names:

1. Identify the canonical KenPom name
2. Add to `MANUAL_*_MAPPINGS` dict in the appropriate script
3. Re-run the mapping script

Example for Overtime.ag:

```python
# In scripts/map_overtime_teams.py
MANUAL_OVERTIME_MAPPINGS = {
    # ... existing mappings ...
    "New Team Name": "Canonical KenPom Name",
}
```

### Updating for New Season

When a new season starts:

1. Collect new KenPom team data for the season
2. Run `build_team_mapping.py` with new season year
3. Re-run all mapping scripts to update coverage

```bash
# In scripts/build_team_mapping.py, update:
kenpom_df = load_kenpom_teams(season=2027)  # New season
```

## Quality Checks

### Validate Complete Coverage

```python
import pandas as pd

mapping = pd.read_parquet('data/processed/team_mapping.parquet')

# Check for teams without any external mappings
no_external = mapping[
    mapping['espn_id'].isna() &
    mapping['overtime_name'].isna() &
    mapping['odds_api_name'].isna()
]

print(f"Teams with no external data sources: {len(no_external)}")
print(f"Conferences affected: {no_external['conference'].value_counts()}")
```

### Detect Duplicates

```python
import pandas as pd

mapping = pd.read_parquet('data/processed/team_mapping.parquet')

# Check for duplicate KenPom IDs
dupes = mapping[mapping.duplicated(['kenpom_id'], keep=False)]
if len(dupes) > 0:
    print(f"WARNING: {len(dupes)} duplicate KenPom IDs found")
    print(dupes[['canonical_team_id', 'kenpom_id', 'canonical_name']])
```

## Future Enhancements

1. **Historical Team Names**: Track team name changes over seasons
2. **Alternate Names**: Store common abbreviations and variations
3. **Conference Changes**: Track conference realignment over time
4. **Validation Suite**: Automated tests for mapping integrity
5. **API Integration**: Provide REST endpoint for team lookups
