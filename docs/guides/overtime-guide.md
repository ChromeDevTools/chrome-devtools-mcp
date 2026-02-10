# Overtime.ag Collection Service Guide

## Quick Start

```bash
# Install dependencies
uv add pandas pyarrow

# Run the service
uv run python scripts/overtime_collector_service.py
```

The service will:
- Collect College Basketball odds immediately
- Append to `data/overtime/college_basketball_odds/YYYY-MM-DD/college_basketball_odds.parquet`
- Wait 30 minutes
- Repeat forever (until you stop it with Ctrl+C)

## Configuration

### Environment Variables

Create a `.env` file (copy from `.env.overtime.example`):

```bash
# Collection frequency
COLLECTION_INTERVAL=30  # Minutes between collections

# What to collect
COLLECTION_SPORTS=Basketball,Football
COLLECTION_SUBTYPES=College Basketball,NFL

# Where to save
DATA_DIR=data/overtime

# Logging
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR
```

Load with:
```bash
# Windows PowerShell
Get-Content .env | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
}
uv run python scripts/overtime_collector_service.py
```

Or use `python-dotenv`:
```bash
uv add python-dotenv
```

Then modify the script to load `.env` automatically.

### Command-line Override

```bash
# Collect every 15 minutes
$env:COLLECTION_INTERVAL=15
uv run python scripts/overtime_collector_service.py

# Change sports
$env:COLLECTION_SPORTS="Basketball"
$env:COLLECTION_SUBTYPES="NBA"
uv run python scripts/overtime_collector_service.py
```

## Running the Service

### Option 1: Foreground (Development)

```bash
uv run python scripts/overtime_collector_service.py
```

**Pros**: See logs in real-time, easy to debug
**Cons**: Stops when terminal closes

Stop with: `Ctrl+C`

### Option 2: Background (Windows)

#### Using PowerShell Job

```powershell
# Start in background
$job = Start-Job -ScriptBlock {
    Set-Location "C:\Users\omall\Documents\python_projects\sports-betting-edge"
    uv run python scripts/overtime_collector_service.py
}

# Check status
Get-Job

# View output
Receive-Job -Id $job.Id -Keep

# Stop
Stop-Job -Id $job.Id
Remove-Job -Id $job.Id
```

#### Using Task Scheduler (Production)

1. Open Task Scheduler
2. Create Basic Task
   - Name: "Overtime Odds Collector"
   - Trigger: "At startup"
   - Action: Start a program
     - Program: `uv.exe`
     - Arguments: `run python scripts/overtime_collector_service.py`
     - Start in: `C:\Users\omall\Documents\python_projects\sports-betting-edge`

3. Settings:
   - ✓ Allow task to run on demand
   - ✓ Run task as soon as possible after a scheduled start is missed
   - ✓ If task fails, restart every: 1 minute

#### Using NSSM (Windows Service)

```powershell
# Install NSSM (Windows service wrapper)
choco install nssm

# Create service
nssm install OvertimeCollector "C:\Users\omall\.local\bin\uv.exe" "run python scripts/overtime_collector_service.py"
nssm set OvertimeCollector AppDirectory "C:\Users\omall\Documents\python_projects\sports-betting-edge"

# Start service
nssm start OvertimeCollector

# Stop service
nssm stop OvertimeCollector

# Remove service
nssm remove OvertimeCollector confirm
```

### Option 3: Docker (Cross-platform)

Create `Dockerfile.collector`:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy project
COPY . .

# Install dependencies
RUN uv sync --frozen

# Run service
CMD ["uv", "run", "python", "scripts/overtime_collector_service.py"]
```

Run:
```bash
docker build -f Dockerfile.collector -t overtime-collector .
docker run -d --name overtime-collector \
  -e COLLECTION_INTERVAL=30 \
  -v ./data:/app/data \
  overtime-collector

# View logs
docker logs -f overtime-collector

# Stop
docker stop overtime-collector
```

## Monitoring

### View Collected Data

```python
import pandas as pd
from pathlib import Path

# List all daily partitions
data_dir = Path("data/overtime/college_basketball_odds")
files = sorted(data_dir.glob("*/college_basketball_odds.parquet"))
print(f"Found {len(files)} daily partitions")

# Load most recent partition
latest = pd.read_parquet(files[-1])
print(latest.head())

# Combine all partitions
df_all = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
print(f"Total rows: {len(df_all)}")
```

### Track Line Movements

```python
import pandas as pd

# Load a daily partition and compare two capture times
df = pd.read_parquet(
    "data/overtime/college_basketball_odds/2026-02-02/college_basketball_odds.parquet"
)

df1 = df[df["collected_at"] == "2026-02-02T20:00:00+00:00"]
df2 = df[df["collected_at"] == "2026-02-02T20:30:00+00:00"]

# Compare spreads
comparison = pd.merge(
    df1[["game_num", "team1_name", "spread_points", "collected_at"]],
    df2[["game_num", "spread_points", "collected_at"]],
    on="game_num",
    suffixes=("_before", "_after")
)

comparison["spread_movement"] = comparison["spread_points_after"] - comparison["spread_points_before"]

# Games with line movement
movers = comparison[comparison["spread_movement"] != 0]
print(f"Games with line movement: {len(movers)}")
print(movers[["team1_name", "spread_movement"]])
```

## Service Logs

The service logs:
- **INFO**: Normal operations (collections started/completed)
- **WARNING**: No games found, unusual conditions
- **ERROR**: Collection failures, network issues

Example output:
```
2026-02-02 20:00:00 [INFO] __main__: Starting collection at 2026-02-02T20:00:00+00:00
2026-02-02 20:00:01 [INFO] __main__: Fetching Basketball - College Basketball...
2026-02-02 20:00:02 [INFO] __main__: [OK] Basketball - College Basketball: 6 games saved
2026-02-02 20:00:02 [INFO] __main__: Collection complete: 6 games in 2.1s
2026-02-02 20:00:02 [INFO] __main__: Next collection in 30 minutes (at 20:30:00)
```

## Troubleshooting

### Service won't start

```bash
# Check dependencies
uv sync

# Check if port is blocked (if using web interface)
netstat -ano | findstr :8080

# Run with debug logging
$env:LOG_LEVEL="DEBUG"
uv run python scripts/overtime_collector_service.py
```

### No data being saved

```bash
# Check data directory permissions
ls data/overtime/

# Verify environment variables
$env:DATA_DIR
```

### Network errors

The service will automatically retry on the next interval. Check:
- Internet connection
- overtime.ag website status
- Firewall/proxy settings

## Graceful Shutdown

The service handles:
- **Ctrl+C**: Graceful shutdown with statistics
- **SIGTERM**: Clean shutdown (Docker, systemd)
- **SIGINT**: Keyboard interrupt

Statistics shown on shutdown:
```
================================================================================
Service Statistics
================================================================================
Collections completed: 48
Collections failed: 0
Total games collected: 288
================================================================================
```

## Performance

Typical resource usage:
- **Memory**: 50-100 MB
- **CPU**: <1% (idle), 5-10% (during collection)
- **Disk**: ~100 KB per collection (Parquet compressed)
- **Network**: ~500 KB per collection

## Data Retention

Parquet files accumulate over time. Suggested retention policy:

```python
from pathlib import Path
from datetime import datetime, timedelta

def cleanup_old_files(data_dir: Path, days: int = 30) -> None:
    """Delete daily partitions older than X days."""
    cutoff = datetime.now() - timedelta(days=days)
    base_dir = data_dir / "college_basketball_odds"

    for partition in base_dir.iterdir():
        if not partition.is_dir():
            continue

        try:
            partition_date = datetime.strptime(partition.name, "%Y-%m-%d")
        except ValueError:
            continue

        if partition_date < cutoff:
            for file in partition.glob("*.parquet"):
                file.unlink()
            partition.rmdir()
            print(f"Deleted: {partition}")

# Run monthly
cleanup_old_files(Path("data/overtime"), days=30)
```

## Next Steps

1. **Add implied probability conversion**
   - Invoke `/normalize-odds` skill
   - Implement `american_to_implied_prob()` function
   - Update `_normalize_games()` to calculate probabilities

2. **Create overtime adapter**
   ```bash
   /new_adapter overtime_ag
   ```

3. **Integrate with KenPom**
   - Cross-reference team names
   - Combine efficiency metrics with odds
   - Calculate expected value

4. **Build alerts**
   - Detect significant line movements
   - Compare with opening lines
   - Identify sharp money signals

5. **Web dashboard**
   - Visualize line movements
   - Show current odds
   - Display historical trends
