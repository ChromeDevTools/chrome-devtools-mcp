# Walk-Forward Validation for Sports Betting Models

## Overview

Walk-forward validation is critical for sports betting models because it:
1. **Respects temporal ordering** - No lookahead bias
2. **Simulates production** - Train on past, predict future
3. **Reveals overfitting** - Tests on truly unseen data

## Why Random Train/Test Split Fails

Random splitting violates temporal causality:
```python
# WRONG: Random split
X_train, X_test = train_test_split(X, y, test_size=0.2, random_state=42)
# Problem: Test set may contain games from BEFORE training games
```

This creates lookahead bias where the model "sees the future" during training.

## Walk-Forward Approach

Train on chronologically earlier data, test on chronologically later data:

```
Timeline:  [----Training Period----][----Test Period----]
           Nov - Dec - Jan 15       Jan 16 - Jan 31

Train:     Games from Nov-Jan 15
Test:      Games from Jan 16-31 (strictly AFTER training period)
```

## Current Implementation

### Training Script

```bash
uv run python scripts/train_walkforward.py \\
    --model-type spreads \\
    --train-start 2026-01-24 \\
    --train-end 2026-01-27 \\
    --test-start 2026-01-28 \\
    --test-end 2026-01-31 \\
    --output models/spreads_walkforward.json
```

### Validation Rules

The script enforces:
1. `test_start` must be > `train_end` (no overlap)
2. Features are aligned between train/test sets
3. Datasets built separately for each period
4. Temporal ordering strictly maintained

## Results (Jan 2026 Data)

### Spreads Model
```
Training: 214 games (Jan 24-27)
Test:     201 games (Jan 28-31)

Train Accuracy: 100.00%  <- Severe overfitting!
Test Accuracy:   56.72%
Train AUC:       1.0000
Test AUC:        0.4636  <- Worse than random (0.50)
```

**Top Features**: fav_adj_em, fav_o_vs_dog_d, fav_adj_o

### Totals Model
```
Training: 154 games (Jan 24-27)
Test:     234 games (Jan 28-31)

Train Accuracy: 100.00%  <- Severe overfitting!
Test Accuracy:   55.13%
Train AUC:       1.0000
Test AUC:        0.5661  <- Slightly better than random
```

**Top Features**: home_adj_em, away_dto_pct, away_defg_pct, total_defense

## Analysis

### Severe Overfitting Detected

Both models show:
- **100% train accuracy** - Memorizing training data
- **Test AUC ≈ 0.5** - No better than coin flip
- **Limited data** - Only 154-214 training games

This is expected because:
1. Small dataset (need 1,000+ games minimum)
2. High feature count (30-31 features)
3. Default hyperparameters (no regularization)
4. Limited temporal coverage (only 4 days training)

### Walk-Forward Reveals Truth

Random split would have shown better (but misleading) results due to lookahead bias.
Walk-forward properly shows the model isn't learning generalizable patterns.

## Data Availability

Current Odds API database:
- **Odds data**: 2025-12-28 onwards (observations table)
- **Scores**: 2026-01-24 to 2026-01-31 only (369 games)

### Limitation

Can only use data where we have BOTH odds and scores:
- Training period: Jan 24-27 (first 4 days with scores)
- Test period: Jan 28-31 (next 4 days)

This is insufficient for production models. Need full season coverage.

## Next Steps

### 1. Collect More Data (Critical)

Continue collecting Odds API data through March 2026:
```bash
# Daily collection
uv run python scripts/collect_odds_stream.py \\
    --sport basketball_ncaab \\
    --interval 30 \\
    --regions us,us2 \\
    --markets h2h,spreads,totals
```

Target dataset size: 3,000+ games (full season Nov-Mar)

### 2. Implement Rolling Walk-Forward

As more data accumulates, implement rolling window:

```
Window 1: Train Nov-Dec,  Test Jan Week 1
Window 2: Train Nov-Jan,  Test Jan Week 2
Window 3: Train Nov-Feb,  Test Feb Week 1
...
```

This gives multiple test periods for robust evaluation.

### 3. Add Regularization

Current model overfits due to no regularization. Try:
```python
XGBClassifier(
    n_estimators=50,        # Reduce from 100
    max_depth=3,            # Reduce from 5
    min_child_weight=5,     # Add minimum samples per leaf
    learning_rate=0.05,     # Slower learning
    subsample=0.8,          # Row sampling
    colsample_bytree=0.8,   # Feature sampling
    reg_alpha=1.0,          # L1 regularization
    reg_lambda=1.0,         # L2 regularization
)
```

### 4. Feature Selection

Drop low-importance features (< 0.02 importance):
- Currently using 30-31 features
- Target: 15-20 most important features
- Reduces overfitting risk

### 5. Evaluate CLV, Not Just Accuracy

Accuracy is misleading for betting. Use:
- **Closing Line Value (CLV)**: Beat closing lines consistently
- **ROI**: Return on investment vs flat betting
- **Calibration**: Do predicted probabilities match reality?

Example:
```python
# Model predicts: 60% favorite covers
# Closing line implies: 55% favorite covers
# CLV = +5% (value bet if model is correct)
```

## Production Workflow (Future)

Once sufficient data is collected:

```bash
# 1. Build datasets for new period
uv run python scripts/build_training_datasets.py \\
    --start 2026-02-01 --end 2026-02-15

# 2. Train with walk-forward
uv run python scripts/train_walkforward.py \\
    --model-type spreads \\
    --train-start 2025-11-01 \\
    --train-end 2026-01-31 \\
    --test-start 2026-02-01 \\
    --test-end 2026-02-15

# 3. Evaluate CLV on test period
# 4. If CLV positive, deploy for next period
# 5. Retrain weekly with new data
```

## Key Takeaways

1. ✅ **Walk-forward validation implemented** - No lookahead bias
2. ⚠️ **Models currently overfit** - 100% train accuracy, ~56% test accuracy
3. ⚠️ **Limited data** - Only 4 days training, need full season
4. ✅ **Framework ready** - Can retrain as more data comes in
5. 🎯 **Focus on CLV** - Accuracy is secondary to beating closing lines

## References

- Training script: `scripts/train_walkforward.py`
- Feature engineering: `src/sports_betting_edge/services/feature_engineering.py`
- Odds collection: `scripts/collect_odds_stream.py`
- Current models: `models/spreads_walkforward.json`, `models/totals_walkforward.json`
