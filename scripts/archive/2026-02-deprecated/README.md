# Deprecated Scripts Archive (February 2026)

Scripts moved here during the February 2026 cleanup to reduce redundancy and improve architectural consistency.

## Why These Scripts Were Archived

This archive contains 30+ scripts that were deprecated due to:
- **Redundancy**: Multiple scripts doing the same thing
- **Architecture violations**: Direct I/O instead of using adapters/services
- **One-off utilities**: Scripts used once for data fixes
- **Demo/test scripts**: Example code that should be in examples/

## What Was Archived

### Redundant Overtime Collection (5 scripts)
Consolidated to `overtime_collector_service.py` in main scripts directory.

- `collect_overtime_realtime.py` - SignalR real-time (functionality in service)
- `collect_overtime_scheduled.py` - Scheduled snapshots (functionality in service)
- `collect_overtime_odds_csv.py` - CSV output variant
- `track_overtime_daily.py` - Daily tracking variant
- `overtime_ag_scraper.py` - Demo script for REST + WebSocket

### Redundant Live Monitors (4 scripts)
Should be consolidated to single `monitor_live_odds.py` with configurable data sources.

- `live_line_monitor_overtime.py` - Overtime variant
- `monitor_live_lines.py` - Generic monitor
- `monitor_live_rich.py` - Rich console variant
- `monitor_live_with_logging.py` - Logging variant

### Redundant Team Mapping (2 scripts)
Consolidated to `build_team_mapping.py` in main scripts directory.

- `create_team_mapping.py` - Alternative creation approach
- `rebuild_team_mapping.py` - Rebuilds mapping (same as build)

### Redundant Dataset Builders (3 scripts)
Consolidated to `build_training_datasets.py` which uses services layer.

- `build_datasets_espn_odds.py` - Direct approach without services
- `build_dataset_comprehensive.py` - Comprehensive variant
- `export_complete_dataset.py` - Export variant

### Redundant Training Scripts (2 scripts)
Consolidated to `train_spreads_model.py` and `train_totals_model.py`.

- `train_spreads_basic_model.py` - Basic approach (full model supports all cases)
- `walk_forward_training_fast.py` - Fast variant (use train_walkforward.py)

### Demo/Test Scripts (5 scripts)
Example code that doesn't belong in production scripts directory.

- `demo_bookmaker_accuracy.py` - Demo of bookmaker analysis
- `demo_market_features.py` - Demo of market features
- `demo_tracker.py` - Demo of tracker
- `test_simple.py` - Simple test script
- `backfill_example.py` - Example backfill script

### One-off/Fix Scripts (4 scripts)
Scripts used once for data fixes or migrations.

- `fix_team_mapping.py` - One-time mapping fix
- `fix_complete_analysis.py` - One-time analysis fix
- `add_dates_to_training_data.py` - One-time data migration
- `force_update_views.py` - Database view update utility

### Additional Cleanup (5 scripts)
- `comprehensive_odds_with_overtime.py` - Redundant collection script
- `save_overtime_snapshot.py` - Functionality should be in service
- `manual_overtime_entry.py` - One-off manual entry utility
- `verify_odds_streaming.py` - Test/verification script
- `view_collected_odds.py` - Utility for viewing data

## Migration Notes

### If you need functionality from archived scripts:

1. **Overtime Collection**: Use `overtime_collector_service.py`
2. **Live Monitoring**: Use `live_line_monitor.py` (TODO: refactor to use adapters)
3. **Team Mapping**: Use `build_team_mapping.py`
4. **Dataset Building**: Use `build_training_datasets.py`
5. **Model Training**: Use `train_spreads_model.py` or `train_totals_model.py`

### Restoration

If you need to restore a script:
```bash
cp scripts/archive/2026-02-deprecated/<script_name>.py scripts/
```

## Cleanup Date

**Archived**: 2026-02-04
**Archived By**: Claude Code + Andy
**Total Scripts Archived**: 30+
