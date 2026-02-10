# ML Pipeline Integration - Odds API + KenPom

## Summary

Successfully integrated Odds API SQLite database (3.5GB, 10.4M+ observations) with KenPom efficiency metrics into XGBoost training pipeline for spreads and totals prediction.

## Data Pipeline

```
Odds API SQLite (10.4M observations)
    |
    v
Normalized Views (canonical_spreads, canonical_totals)
    |
    v
FeatureEngineer Service
    |
    +-- KenPom Ratings (AdjEM, AdjOE, AdjDE, AdjTempo, SOS, Luck)
    +-- KenPom Four Factors (eFG%, TO%, OR%, FT Rate, etc.)
    +-- Line Movement (opening, closing, movement)
    +-- Team Mapper (fuzzy matching across sources)
    |
    v
Training Datasets (Parquet)
    |
    v
XGBoost Models
```

## Dataset Statistics

### Spreads Dataset
- **Games**: 390 (2025-12-28 to 2026-01-29)
- **Features**: 30
  - KenPom metrics (11 per team): AdjEM, AdjOE, AdjDE, AdjTempo, SOS, Luck, eFG%, TO%, OR%, FT Rate, DeFG%, DTO%
  - Matchup features (3): em_diff, fav_o_vs_dog_d, dog_o_vs_fav_d
  - Line features (3): opening_spread, closing_spread, line_movement
- **Target**: favorite_covered (35.9% covered rate - 140/390)
- **File**: `data/ml/spreads_2025-12-28_2026-01-29.parquet`

### Totals Dataset
- **Games**: 366 (2025-12-28 to 2026-01-29)
- **Features**: 31
  - KenPom metrics (11 per team): Same as spreads
  - Matchup features (4): avg_tempo, tempo_diff, total_offense, total_defense
  - Line features (3): opening_total, closing_total, total_movement
- **Target**: went_over (37.4% over rate - 137/366)
- **File**: `data/ml/totals_2025-12-28_2026-01-29.parquet`

## Team Name Mapping

Created fuzzy-matched team name mapping across KenPom, ESPN, and Odds API:
- **Total teams mapped**: 365
- **Odds API match rate**: 95.1% (347/365)
- **ESPN match rate**: 30.7% (112/365)
- **Methodology**: Multi-stage matching (exact -> normalized -> prefix -> fuzzy with validation)
- **File**: `data/team_mapping.parquet`

### Sample Verified Mappings
| KenPom | Odds API | Match Score |
|--------|----------|-------------|
| Duke | Duke Blue Devils | 95 |
| Kentucky | Kentucky Wildcats | 95 |
| Kansas | Kansas Jayhawks | 95 |
| North Carolina | North Carolina Tar Heels | 95 |
| Gonzaga | Gonzaga Bulldogs | 95 |

## Baseline Model Performance

### Spreads Model
```
Train Accuracy: 93.91%
Test Accuracy:  56.41%
Train LogLoss:  0.1648
Test LogLoss:   0.8657
Train AUC:      0.9918
Test AUC:       0.5061
```

**Top Features**:
1. fav_adj_o (0.0564) - Favorite offensive efficiency
2. dog_luck (0.0512) - Underdog luck rating
3. dog_sos (0.0411) - Underdog strength of schedule
4. dog_adj_d (0.0402) - Underdog defensive efficiency
5. dog_o_vs_fav_d (0.0396) - Matchup: underdog offense vs favorite defense

### Totals Model
```
Train Accuracy: 90.75%
Test Accuracy:  51.35%
Train LogLoss:  0.1914
Test LogLoss:   0.7406
Train AUC:      0.9807
Test AUC:       0.5939
```

**Top Features**:
1. total_defense (0.0918) - Combined defensive efficiency
2. home_defg_pct (0.0607) - Home defensive eFG%
3. away_luck (0.0584) - Away team luck rating
4. away_dto_pct (0.0582) - Away defensive turnover%
5. away_adj_em (0.0438) - Away efficiency margin

## Analysis

### Overfitting Detected
Both models show severe overfitting:
- **Spreads**: 93.91% train vs 56.41% test accuracy
- **Totals**: 90.75% train vs 51.35% test accuracy

This is expected with:
- Small dataset (390/366 games)
- High feature count (30/31 features)
- Default XGBoost hyperparameters

Test AUC scores near 0.5 (random) indicate models have not learned generalizable patterns.

### Feature Importance Insights

**Spreads**:
- Offensive efficiency (fav_adj_o) most important
- Luck and SOS ratings significant
- Line movement features ranked low (need more data)

**Totals**:
- Defensive metrics dominate (total_defense, defg_pct)
- Luck ratings important
- Line movement (total_movement) appears in top 10
- Tempo features (avg_tempo) less important than expected

## Next Steps for Improvement

### 1. More Training Data
- Current: 1 month (Dec 28 - Jan 29)
- Target: Full season (Nov - Mar = ~5,000 games)
- Action: Continue collecting Odds API data through season

### 2. Regularization
- Current: Default XGBoost params (max_depth=5, n_estimators=100)
- Try:
  - Reduce max_depth (3-4)
  - Increase min_child_weight (5-10)
  - Add regularization (reg_alpha, reg_lambda)
  - Reduce feature set (drop low-importance features)

### 3. Cross-Validation
- Current: Single 80/20 train/test split
- Action: Implement k-fold cross-validation for robust evaluation
- Consider time-based splits (train on older games, test on recent)

### 4. Additional Features
- Advanced line movement: steam moves, RLM, consensus
- Bookmaker-specific features (sharp vs square books)
- Recent form (last 5 games performance)
- Home court advantage metrics
- Injury/roster data

### 5. Alternative Models
- Logistic regression (interpretable baseline)
- LightGBM (faster, sometimes better than XGBoost)
- Neural networks (if dataset grows to 5K+ games)

### 6. Evaluation Against Market
- **Critical metric**: Closing Line Value (CLV), not accuracy
- Track ROI on bets placed vs closing lines
- Measure calibration (predicted probabilities vs actual outcomes)

## File Structure

```
data/
  ml/
    spreads_2025-12-28_2026-01-29.parquet  # Spreads training data
    totals_2025-12-28_2026-01-29.parquet   # Totals training data
  team_mapping.parquet                      # Cross-source team names
  odds_api/
    odds_api.sqlite3                        # Raw odds data (3.5GB)

models/
  spreads_model.json                        # Trained spreads model
  totals_model.json                         # Trained totals model

scripts/
  build_training_datasets.py                # Generate ML datasets
  train_spreads_model.py                    # Train spreads model
  train_totals_model.py                     # Train totals model
  create_team_mapping.py                    # Generate team mappings

src/sports_betting_edge/
  adapters/
    odds_api_db.py                          # Odds API database adapter
  services/
    feature_engineering.py                  # Feature extraction service
  core/
    team_mapper.py                          # Team name lookup helper

sql/
  create_normalized_views.sql               # Database normalization
```

## Usage

### Build Datasets
```bash
uv run python scripts/build_training_datasets.py \
  --start 2025-12-28 \
  --end 2026-01-29 \
  --season 2026 \
  --output-dir data/ml
```

### Train Models
```bash
# Spreads model
uv run python scripts/train_spreads_model.py \
  --data data/ml/spreads_2025-12-28_2026-01-29.parquet \
  --output models/spreads_model.json

# Totals model
uv run python scripts/train_totals_model.py \
  --data data/ml/totals_2025-12-28_2026-01-29.parquet \
  --output models/totals_model.json
```

### Update Team Mapping
```bash
uv run python scripts/create_team_mapping.py
```

## References

- Odds API: https://the-odds-api.com/
- KenPom: https://kenpom.com/
- Team Mapper: src/sports_betting_edge/core/team_mapper.py
- Feature Engineering: src/sports_betting_edge/services/feature_engineering.py
