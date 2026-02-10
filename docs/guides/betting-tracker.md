# Betting Tracker Guide

Comprehensive guide for tracking betting performance on spreads and totals predictions.

## Overview

The betting tracker system consists of three main components:

1. **betting_tracker.py** - Core tracking logic for bet outcomes and ROI
2. **enter_results.py** - Interactive/batch result entry
3. **betting_dashboard.py** - Detailed performance analytics

## Quick Start

### 1. Track Initial Predictions

Start with your predictions file (e.g., `combined_predictions_2026-02-03.csv`):

```powershell
uv run python scripts/betting_tracker.py
```

This shows pending games and initializes tracking.

### 2. Enter Game Results

#### Interactive Entry

```powershell
uv run python scripts/enter_results.py
```

Prompts you for scores for each pending game.

#### Batch Import

Create a CSV with game results:

```csv
Away_Team,Home_Team,Away_Score,Home_Score
Miami Ohio,Buffalo,72,85
Akron,Eastern Michigan,68,82
```

Then import:

```powershell
uv run python scripts/enter_results.py --import-csv data/results/scores_2026-02-03.csv
```

### 3. View Dashboard

```powershell
uv run python scripts/betting_dashboard.py data/analysis/combined_predictions_2026-02-03_tracked_*.csv
```

## Command Reference

### betting_tracker.py

Basic tracker with summary stats.

```powershell
# Show pending games and current stats
uv run python scripts/betting_tracker.py

# Custom unit size
uv run python scripts/betting_tracker.py --unit-size 50
```

### enter_results.py

Enter or import game results.

```powershell
# Interactive entry
uv run python scripts/enter_results.py

# Batch import
uv run python scripts/enter_results.py --import-csv scores.csv

# Custom predictions file
uv run python scripts/enter_results.py --predictions data/analysis/predictions.csv

# Show summary after entry
uv run python scripts/enter_results.py --show-summary

# Specify output location
uv run python scripts/enter_results.py --output data/tracked/results.csv
```

### betting_dashboard.py

Detailed performance analytics.

```powershell
# View dashboard
uv run python scripts/betting_dashboard.py data/analysis/tracked_results.csv

# Export detailed analysis
uv run python scripts/betting_dashboard.py data/analysis/tracked_results.csv --export data/analysis/detailed_report.csv
```

## Workflow Example

Complete workflow for a day's games:

```powershell
# 1. Generate predictions (your existing workflow)
uv run python scripts/prediction/deploy_today_predictions.py

# 2. Monitor games as they complete
# Wait for games to finish...

# 3. Enter results interactively
uv run python scripts/enter_results.py --show-summary

# 4. View detailed analytics
uv run python scripts/betting_dashboard.py data/analysis/combined_predictions_2026-02-03_tracked_*.csv
```

## Output Files

### Tracked Results CSV

Created by `betting_tracker.py` or `enter_results.py`:

- Original prediction columns
- `Away_Score`, `Home_Score` - Final scores
- `Actual_Total`, `Actual_Margin` - Calculated values
- `Spread_Result` - Win/Loss/Push for spread bet
- `Total_Result` - Win/Loss/Push for total bet
- `Spread_Profit`, `Total_Profit` - Dollar profit/loss per bet

### Detailed Analysis CSV

Created by `betting_dashboard.py --export`:

- All tracked result columns
- `Spread_Profitable`, `Total_Profitable` - Boolean flags
- `Spread_Edge_Category`, `Total_Edge_Category` - Edge buckets (0-2, 2-4, 4-6, 6-8, 8+)

## Key Metrics

### Win Rate

Percentage of bets won (excluding pushes):

```
Win Rate = Wins / (Wins + Losses)
```

Break-even at standard -110 juice: 52.38%

### ROI (Return on Investment)

```
ROI = (Profit / Amount Wagered) * 100
```

- Positive ROI = profitable
- Target: +5% or higher long-term

### Edge Threshold Analysis

Performance at different edge levels:

- **Edge >= 0**: All plays
- **Edge >= 2**: Small edge threshold
- **Edge >= 4**: Moderate edge
- **Edge >= 6**: Strong edge
- **Edge >= 8**: Very strong edge
- **Edge >= 10**: Extreme edge

Higher edge thresholds should show better ROI (if model is calibrated).

### Closing Line Value (CLV)

Compare your predicted edge to actual game outcomes:

- Positive CLV = beating the closing line
- Success metric for long-term profitability

## Understanding Results

### Spread Result Calculation

Spread bets are graded based on the adjusted margin:

```
Adjusted Margin = Actual Margin + Spread
```

- **Win**: Adjusted margin > 0
- **Loss**: Adjusted margin < 0
- **Push**: Adjusted margin = 0

Example: Duke -7 beats UNC by 10 points
- Actual margin: +10 (Duke wins by 10)
- Adjusted margin: 10 + (-7) = +3
- Result: WIN

### Total Result Calculation

Total bets compare actual total to market line:

```
Difference = Actual Total - Market Total
```

- **Over wins**: Difference > 0
- **Under wins**: Difference < 0
- **Push**: Difference = 0

Example: Market total 145.5, actual score 148
- Difference: 148 - 145.5 = +2.5
- Result: OVER wins

## Profit Calculation

Standard -110 juice:

```
Win: Risk $110 to win $100 (profit = $100)
Loss: Lose $110
Push: No profit or loss (refund)
```

With custom juice (e.g., -115):

```
Win: Risk $115 to win $100 (profit = $100)
```

## Best Practices

### 1. Track Every Bet

Enter results for every game, even losses. Complete data enables pattern analysis.

### 2. Use Consistent Unit Sizing

Stick to same unit size for accurate ROI calculation. Default: $100/unit.

### 3. Monitor Edge Thresholds

If low-edge bets underperform, consider raising minimum edge threshold.

### 4. Review KenPom Accuracy

Dashboard shows KenPom prediction accuracy. If consistently off, may need recalibration.

### 5. Analyze Patterns

Check dashboard for profitable patterns:
- Favorites vs underdogs
- Overs vs unders
- High edge vs low edge

### 6. Focus on CLV, Not Win Rate

Short-term win rate variance is normal. Closing Line Value (CLV) is the long-term indicator.

## Troubleshooting

### "Game not found in predictions"

Team names must match exactly. Check for:
- Extra spaces
- Different abbreviations (e.g., "Miami OH" vs "Miami Ohio")
- Encoding issues

### "Missing required columns"

Ensure predictions file has all required fields from your prediction generation script.

### "No results to display"

No games have been graded yet. Use `enter_results.py` to add game scores.

## Advanced Usage

### Custom Juice Per Bookmaker

Modify `betting_tracker.py` to read juice from prediction columns:

```python
spread_profit = self._calculate_payout(
    self.unit_size,
    game.get("Away_Spread_Juice", self.juice)
)
```

### Multiple Unit Sizing

For games with different confidence levels, track bet size:

```python
# Add unit_size column to predictions
bet_size = game["Unit_Size"] * self.unit_size
profit = self._calculate_payout(bet_size, juice)
```

### Closing Line Tracking

Compare opening vs closing spreads/totals to track line movement and CLV.

## Integration with Existing Workflow

This tracker integrates with your current prediction pipeline:

```
1. KenPom data collection → 2. Model training → 3. Generate predictions
   (odds-collecting)            (walk_forward)      (deploy_today)
                                                            ↓
4. Predictions file → 5. Track games → 6. Enter results → 7. Analyze
   (combined_*.csv)    (betting_tracker)  (enter_results)   (dashboard)
```

## Files Location

Default locations:

- **Predictions**: `data/analysis/combined_predictions_YYYY-MM-DD.csv`
- **Tracked results**: `data/analysis/combined_predictions_YYYY-MM-DD_tracked_*.csv`
- **Scores import**: `data/results/scores_YYYY-MM-DD.csv`
- **Detailed reports**: `data/analysis/detailed_report_*.csv`

## Support

For issues or questions:
1. Check team name matching in predictions vs results
2. Verify CSV format for batch imports
3. Review logs for detailed error messages
