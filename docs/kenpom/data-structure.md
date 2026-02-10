# KenPom Data Structure

Standard layout for KenPom data in `data/kenpom/`. Uses Parquet for analytics and ML pipelines.

## Directory Layout

```
data/kenpom/
├── {dataset-type}/
│   ├── daily/                    # Date-stamped snapshots (when applicable)
│   │   └── {dataset-type}_{YYYY-MM-DD}.parquet
│   └── season/                   # Season-level data
│       └── {dataset-type}_{YYYY}.parquet
```

- **Dataset types**: kebab-case (e.g., `four-factors`, `misc-stats`, `pointdist`)
- **Daily**: Date-specific collections; filename includes `YYYY-MM-DD`
- **Season**: Season-level data; filename includes `YYYY` (e.g., 2026 for 2025–26 season)

## File Naming

### Season Data (standard)

| Dataset       | Path                               | Example                           |
|---------------|------------------------------------|-----------------------------------|
| ratings       | `ratings/season/ratings_{YYYY}.parquet` | `ratings/season/ratings_2026.parquet` |
| four-factors  | `four-factors/season/four-factors_{YYYY}.parquet` | `four-factors/season/four-factors_2026.parquet` |
| four-factors (conf only) | `four-factors/season/four-factors_conference_{YYYY}.parquet` | `four-factors/season/four-factors_conference_2026.parquet` |
| misc-stats    | `misc-stats/season/misc-stats_{YYYY}.parquet` | `misc-stats/season/misc-stats_2026.parquet` |
| misc-stats (conf only) | `misc-stats/season/misc-stats_conference_{YYYY}.parquet` | same pattern |
| pointdist     | `pointdist/season/pointdist_{YYYY}.parquet` | `pointdist/season/pointdist_2026.parquet` |
| height        | `height/season/height_{YYYY}.parquet` | `height/season/height_2026.parquet` |
| teams         | `teams/season/teams_{YYYY}.parquet` | `teams/season/teams_2026.parquet` |
| conferences   | `conferences/season/conferences_{YYYY}.parquet` | `conferences/season/conferences_2026.parquet` |
| conf-ratings  | `conf-ratings/season/conf-ratings_{YYYY}.parquet` | `conf-ratings/season/conf-ratings_2026.parquet` |
| efficiency    | `efficiency/season/efficiency_{YYYY}.parquet` | `efficiency/season/efficiency_2026.parquet` |

### Season Data (special cases)

| Dataset        | Path                                          | Example                                      |
|----------------|-----------------------------------------------|----------------------------------------------|
| conf-standings | `conf-standings/season/{CONF}_standings_{YYYY}.parquet` | `conf-standings/season/B10_standings_2026.parquet` |
| game-attribs   | `game-attribs/season/game-attribs_{Type}_{YYYY}.parquet` | `game-attribs/season/game-attribs_Excitement_2026.parquet` |
| player-stats   | `player-stats/season/player-stats_{StatType}_{YYYY}.parquet` | `player-stats/season/player-stats_ORtg_2026.parquet` |
| schedules      | `schedules/season/{TeamName}_schedule_{YYYY}.parquet` | `schedules/season/Wisconsin_schedule_2026.parquet` |
| scouting       | `scouting/season/{TeamName}_scouting_{YYYY}.parquet` | `scouting/season/Chicago_St._scouting_2026.parquet` |

### Daily Data

| Dataset   | Path                                      | Example                                         |
|-----------|-------------------------------------------|-------------------------------------------------|
| ratings   | `ratings/daily/ratings_{YYYY-MM-DD}.parquet` | `ratings/daily/ratings_2026-01-31.parquet`     |
| height    | `height/daily/height_{YYYY-MM-DD}.parquet` | `height/daily/height_2026-01-31.parquet`       |
| fanmatch  | `fanmatch/daily/fanmatch_{YYYY-MM-DD}.parquet` | `fanmatch/daily/fanmatch_2026-01-28.parquet` |

## Current Season

Default season for collection: **2026** (2025–26 NCAA season).

Update `settings.kenpom_default_season` or pass `--season 2026` to the CLI when needed.

## REST API Collection Output

The `kenpom_collection` service writes:

- **Season-level** (ratings, four-factors, misc-stats, pointdist, height): `{type}/season/{type}_{season}.parquet`
- **Conference-only** variants: `{type}/season/{type}_conference_{season}.parquet`
- **Daily** (fanmatch): `fanmatch/daily/fanmatch_{date}.parquet`

## Reading Data

```python
from pathlib import Path
from sports_betting_edge.adapters.filesystem import read_parquet

kenpom_dir = Path("data/kenpom")

# Season ratings
ratings = read_parquet(kenpom_dir / "ratings/season/ratings_{season}.parquet")

# Daily fanmatch
games = read_parquet(kenpom_dir / "fanmatch/daily/fanmatch_{date}.parquet")
```

## Related Docs

- [endpoints.md](endpoints.md) — API endpoints and field reference
- [fields.md](fields.md) — Metric definitions and quality thresholds
