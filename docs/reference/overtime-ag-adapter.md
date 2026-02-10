# Overtime.ag SignalR Adapter

Production-ready adapter for collecting real-time odds from Overtime.ag via SignalR WebSocket interception.

## Architecture

```
Chrome Browser (--remote-debugging-port=9222)
    |
    | WebSocket (wss://ws.ticosports.com/signalr)
    |
    V
Chrome DevTools Protocol (CDP)
    |
    | Network.webSocketFrameReceived events
    |
    V
OvertimeSignalRClient
    |
    | Parse SignalR broadcastMessage
    | Normalize line changes (per /normalize-odds skill)
    |
    V
OvertimeSignalRLineChange (domain model)
```

## Components

### Core Domain Model

**`OvertimeSignalRLineChange`** (in `src/sports_betting_edge/core/models.py`)

Normalized line change following `/normalize-odds` patterns:
- `line_points`: Always positive magnitude (e.g., 6.5 not -6.5)
- `side_role`: FAVORITE/UNDERDOG for spreads, OVER/UNDER for totals
- `is_steam`: True when `ChangedBy="AutoMover"` (sharp action indicator)
- `market_type`: SPREAD, TOTAL, or MONEYLINE enum
- Full pricing: `money1`, `money2`, `decimal1`, `decimal2`

### Adapter Layer

**`OvertimeSignalRClient`** (in `src/sports_betting_edge/adapters/overtime_ag/signalr_client.py`)

Async WebSocket client using Chrome DevTools Protocol:

```python
async with OvertimeSignalRClient() as client:
    async for line_change in client.stream_line_changes(duration_seconds=3600):
        print(f"{line_change.team} {line_change.line_points} [STEAM: {line_change.is_steam}]")
```

**Features**:
- Automatic connection to Chrome CDP
- SignalR message parsing (`gbsHub.broadcastMessage`)
- Line normalization (magnitude-only, explicit roles)
- Steam move detection
- Structured logging
- Type-safe with full mypy compliance

### Operational Script

**`scripts/collect_overtime_realtime.py`**

Production collection script with Parquet output:

```bash
# Collect for 1 hour
uv run python scripts/collect_overtime_realtime.py --duration 3600

# Collect for full game window (3 hours)
uv run python scripts/collect_overtime_realtime.py --duration 10800

# Custom output location
uv run python scripts/collect_overtime_realtime.py --output data/raw/overtime_lines.parquet
```

**Output Schema** (Parquet):
- `timestamp`: When line changed (UTC)
- `game_num`: Overtime.ag game number
- `market_type`: SPREAD, TOTAL, MONEYLINE
- `line_points`: Magnitude only (positive)
- `side_role`: FAVORITE/UNDERDOG or OVER/UNDER
- `team`: Team name (if available)
- `money1`, `money2`: American odds both sides
- `is_steam`: True if AutoMover
- `captured_at`: When we captured it

## Prerequisites

1. **Chrome with Remote Debugging**:
   ```powershell
   chrome.exe --remote-debugging-port=9222 \
       --user-data-dir=%USERPROFILE%\.chrome-profiles\overtime-ag
   ```

2. **overtime.ag Tab**:
   - Open https://www.overtime.ag/sports#/
   - Log in (session persists in profile)
   - Navigate to Basketball -> College Basketball

3. **Dependencies**:
   ```bash
   uv add websockets httpx
   uv add --optional polars  # For Parquet export
   ```

## Usage Examples

### Basic Collection

```python
from sports_betting_edge.adapters.overtime_ag import OvertimeSignalRClient

async def collect_lines():
    async with OvertimeSignalRClient() as client:
        async for line_change in client.stream_line_changes(duration_seconds=600):
            if line_change.is_steam:
                print(f"[STEAM] {line_change.team} moved to {line_change.line_points}")
```

### With Pattern Detection

```python
from sports_betting_edge.adapters.overtime_ag import OvertimeSignalRClient
from sports_betting_edge.core.types import MarketType

async def detect_steam_moves():
    steam_moves = []

    async with OvertimeSignalRClient() as client:
        async for change in client.stream_line_changes(duration_seconds=3600):
            if change.is_steam and change.market_type == MarketType.SPREAD:
                steam_moves.append({
                    "team": change.team,
                    "line": change.line_points,
                    "timestamp": change.timestamp,
                })

    return steam_moves
```

### Save to Parquet

```python
import polars as pl
from sports_betting_edge.adapters.overtime_ag import OvertimeSignalRClient

async def collect_to_parquet():
    line_changes = []

    async with OvertimeSignalRClient() as client:
        async for change in client.stream_line_changes(duration_seconds=3600):
            line_changes.append(change.model_dump())

    df = pl.DataFrame(line_changes)
    df.write_parquet("data/overtime_lines.parquet")
```

## Integration with Services

### Service Layer Pattern

```python
# src/sports_betting_edge/services/odds_collector.py

from sports_betting_edge.adapters.overtime_ag import OvertimeSignalRClient

class OddsCollector:
    async def collect_realtime_lines(self, duration_seconds: int = 3600):
        async with OvertimeSignalRClient() as client:
            async for line_change in client.stream_line_changes(duration_seconds):
                await self._process_line_change(line_change)
```

## Testing

### Unit Tests

Standard pytest async tests work:

```python
import pytest
from sports_betting_edge.adapters.overtime_ag import OvertimeSignalRClient

@pytest.mark.asyncio
async def test_client_connection():
    async with OvertimeSignalRClient() as client:
        assert client._ws is not None
```

### Integration Tests

Requires Chrome running:

```bash
# Skip Chrome-dependent tests
uv run pytest tests/integration/adapters/test_overtime_signalr.py -m "not requires_chrome"

# Run all tests (Chrome must be running)
uv run pytest tests/integration/adapters/test_overtime_signalr.py -v
```

## Troubleshooting

### Chrome Not Running

**Error**: `ConfigurationError: Chrome not running with remote debugging`

**Fix**:
```powershell
chrome.exe --remote-debugging-port=9222 \
    --user-data-dir=%USERPROFILE%\.chrome-profiles\overtime-ag
```

### No overtime.ag Tab

**Error**: `ConfigurationError: No overtime.ag tab found`

**Fix**: Open https://www.overtime.ag/sports#/ in Chrome

### Session Expired

**Symptom**: Login screen appears

**Fix**: Log in manually - session persists in dedicated profile

### No LineChanges Captured

**Symptom**: No line changes in stream

**Fix**: Navigate to Basketball -> College Basketball to trigger SignalR subscription

## Performance

- **Message Volume**: 100-300 line changes/hour during peak windows
- **WebSocket Overhead**: <1 MB/hour for line data
- **Storage**: ~2 KB/change (normalized Parquet)
- **Latency**: Sub-second from Overtime servers

## Security & Ethics

1. **Terms of Service**: Review Overtime.ag TOS before automated collection
2. **Rate Limiting**: Real-time stream has natural rate limiting
3. **Personal Use**: Collection for personal betting research is generally acceptable
4. **No Redistribution**: Do not resell Overtime.ag data

## Related Documentation

- `/overtime-collecting` skill: Comprehensive collection methodology
- `/normalize-odds` skill: Mandatory normalization patterns
- [SignalR Protocol](https://github.com/dotnet/aspnetcore/tree/main/src/SignalR/docs/specs)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)

## Version History

- **1.0.0** (2024-02-02): Initial production release
  - OvertimeSignalRClient adapter
  - OvertimeSignalRLineChange domain model
  - Integration tests
  - Collection script with Parquet export
