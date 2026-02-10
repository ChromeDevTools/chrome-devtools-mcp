# Overtime Line Feed API

Real-time NCAA Men's Basketball line movement tracking API built with FastAPI.

## Quick Start

```bash
# Start the API server
uv run python scripts/start_line_feed_api.py

# Visit the dashboard
open http://127.0.0.1:8000

# View API documentation
open http://127.0.0.1:8000/docs
```

## Features

### [OK] Real-Time Line Tracking
- Compare opening odds to current lines
- Track spread and total movements
- Monitor juice changes (vig movement)
- Filter by minimum movement thresholds

### [OK] Dashboard
- Auto-refreshing web interface (30-second intervals)
- Color-coded movement indicators
- Filterable by category (College Basketball / College Extra)
- Snapshot count tracking
- Responsive design

### [OK] REST API
- `/api/games` - List all tracked games
- `/api/movements` - Get line movements with filters
- `/api/game/{game_id}` - Full snapshot history for a game
- `/api/stats` - Database statistics

## Data Source

The API reads from the SQLite database at:
```
data/overtime/overtime_lines.db
```

This database is populated by the `overtime_line_tracker.py` script running periodic captures.

## Architecture

```
FastAPI App (src/sports_betting_edge/api/)
│
├── app.py               Main FastAPI application
├── models.py            Pydantic response models
├── routers/
│   ├── health.py        Health check endpoint
│   └── line_movements.py Line tracking endpoints
└── static/
    └── index.html       Dashboard UI
```

## API Endpoints

### GET /api/games
List all games with opening lines.

**Query Parameters:**
- `category` (optional): Filter by category (e.g., "College Basketball")

**Response:**
```json
{
  "games": [
    {
      "game_id": "college_basketball_601-602",
      "category": "College Basketball",
      "away_team": "Tennessee State",
      "home_team": "UT Martin",
      "game_time_str": "7:00 PM",
      "game_date_str": "Feb 5",
      "away_rotation": "601",
      "home_rotation": "602"
    }
  ],
  "total": 245
}
```

### GET /api/movements
Get line movements comparing opening to current lines.

**Query Parameters:**
- `category` (optional): Filter by category
- `min_spread_movement` (optional): Minimum spread movement (absolute value)
- `min_total_movement` (optional): Minimum total movement (absolute value)

**Response:**
```json
[
  {
    "game": {
      "game_id": "college_basketball_601-602",
      "category": "College Basketball",
      "away_team": "Tennessee State",
      "home_team": "UT Martin",
      ...
    },
    "opening": {
      "spread_magnitude": 6.5,
      "favorite_team": "UT Martin",
      "spread_favorite_price": -110,
      "spread_underdog_price": -110,
      "total_points": 145.5,
      "total_over_price": -110,
      "total_under_price": -110,
      "captured_at": "2026-02-05T12:00:00Z"
    },
    "current": {
      "spread_magnitude": 7.0,
      "favorite_team": "UT Martin",
      "spread_favorite_price": -115,
      "spread_underdog_price": -105,
      "total_points": 146.0,
      "total_over_price": -108,
      "total_under_price": -112,
      "captured_at": "2026-02-05T18:30:00Z"
    },
    "movement": {
      "spread_movement": 0.5,
      "total_movement": 0.5,
      "spread_fav_juice_movement": -5,
      "spread_dog_juice_movement": 5,
      "total_over_juice_movement": 2,
      "total_under_juice_movement": -2
    },
    "snapshots_count": 192
  }
]
```

### GET /api/game/{game_id}
Get full snapshot history for a specific game.

**Response:**
```json
{
  "game": { ... },
  "opening": { ... },
  "snapshots": [
    { "captured_at": "2026-02-05T12:00:00Z", ... },
    { "captured_at": "2026-02-05T12:30:00Z", ... },
    { "captured_at": "2026-02-05T13:00:00Z", ... }
  ],
  "total_snapshots": 192
}
```

### GET /api/stats
Get database statistics.

**Response:**
```json
{
  "total_games": 245,
  "total_snapshots": 47085,
  "games_with_movement": 245,
  "last_update": "2026-02-05T18:30:00Z",
  "database_url": "sqlite:///./data/overtime/overtime_lines.db"
}
```

## Dashboard Interface

The web dashboard provides:

1. **Stats Overview**
   - Total games tracked
   - Total snapshots captured
   - Games with movement
   - Last update timestamp

2. **Filtering**
   - Category filter (College Basketball / College Extra)
   - Minimum spread movement filter
   - Minimum total movement filter

3. **Game Cards**
   - Matchup display (away @ home)
   - Opening vs current odds comparison
   - Movement indicators (▲ up, ▼ down)
   - Color-coded significant movements (yellow border)
   - Snapshot count
   - Timestamps for opening and current lines

4. **Auto-Refresh**
   - Updates every 30 seconds automatically
   - Live indicator shows refresh status

## Integration with Line Tracker

The API consumes data from the line tracking service. To populate data:

```bash
# One-shot capture
uv run python scripts/overtime_line_tracker.py --once

# Continuous capture (every 30 minutes)
uv run python scripts/overtime_line_tracker.py --interval 30
```

**Recommended Setup:**
1. Run line tracker continuously: `--interval 30`
2. Start API server in separate terminal
3. Access dashboard at http://127.0.0.1:8000

## Deployment

### Development
```bash
uv run python scripts/start_line_feed_api.py
```

### Production
```bash
# With multiple workers
uv run python scripts/start_line_feed_api.py --prod --workers 4 --host 0.0.0.0 --port 8000
```

### Docker (Optional)
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install uv && uv sync --no-dev
EXPOSE 8000
CMD ["uv", "run", "python", "scripts/start_line_feed_api.py", "--prod", "--host", "0.0.0.0"]
```

## Performance

- **Database**: SQLite with indexed queries (game_id, captured_at)
- **Response time**: < 100ms for most endpoints
- **Memory**: ~50MB base + ~1MB per 1000 snapshots
- **Concurrency**: Supports multiple concurrent requests

## Security

### Development
- Runs on localhost (127.0.0.1) by default
- CORS enabled for local development

### Production
- Bind to specific interface: `--host 0.0.0.0`
- Use reverse proxy (nginx/Caddy) for HTTPS
- Restrict CORS origins in `app.py`
- Consider authentication for sensitive deployments

## Troubleshooting

### Database Not Found
```
[ERROR] Database not found
```
**Solution**: Run the line tracker to create and populate the database:
```bash
uv run python scripts/overtime_line_tracker.py --once
```

### No Games Found
```
No games found with current filters
```
**Solution**: Clear filters or adjust thresholds. Database may be empty - run line tracker.

### Port Already in Use
```
[ERROR] error while attempting to bind on address ('127.0.0.1', 8000)
```
**Solution**: Use a different port:
```bash
uv run python scripts/start_line_feed_api.py --port 8001
```

## Future Enhancements

Potential additions:
- [ ] WebSocket for real-time push updates
- [ ] Historical line charts (Chart.js)
- [ ] Steam move detection and alerts
- [ ] Export to CSV functionality
- [ ] Comparison with other sportsbooks (Odds API integration)
- [ ] Line movement velocity calculations
- [ ] Sharp action indicators
- [ ] Email/SMS alerts for significant movements

## See Also

- `scripts/overtime_line_tracker.py` - Line tracking scheduler
- `src/sports_betting_edge/services/overtime_line_tracking.py` - Line tracking service
- `scripts/README_overtime.md` - Overtime.ag integration guide
- `/normalize-odds` skill - Odds data normalization patterns
