# Model Calibration Expert Guide

This document explains the methodology behind the context-aware calibration used in
`scripts/prediction/apply_context_aware_calibration.py`.

> Status: **draft** – calibration constants and procedures are expected to evolve as
> more validation data becomes available.

## Purpose

The goal of context-aware calibration is to correct systematic biases in model
totals predictions by conditioning adjustments on:

- **Scoring range** (low/mid/high)
- **Pace** (slow/moderate/fast)
- **Team quality** (elite defenses, large efficiency mismatches)

Rather than adding the same offset to every game, the script computes a
per-game adjustment based on these contextual signals.

See the docstring and comments in `scripts/prediction/apply_context_aware_calibration.py`
for the exact thresholds and constants currently in use.

## Implementation Overview

The calibration pipeline implemented in `apply_context_aware_calibration.py`:

1. **Stores raw predictions**
   - `predicted_total_raw`
   - `predicted_home_score_raw`
   - `predicted_away_score_raw`
2. **Computes a context adjustment** via `calculate_context_adjustment`:
   - Scoring band bias (low / mid / high totals)
   - Pace bias (if `avg_tempo` is present)
   - Elite defense bias (if `home_adj_d` / `away_adj_d` present)
   - Mismatch bias (if `home_adj_em` / `away_adj_em` present)
3. **Applies the adjustment**:
   - New `predicted_total = predicted_total_raw + calibration_adjustment`
   - Home/away scores shifted proportionally while keeping the margin intact
4. **Logs aggregate behavior**:
   - Average adjustment
   - Adjustment range
   - Count of low/mid/high-scoring games

The script also records a human-readable `calibration_reasons` string that
summarizes which contextual rules fired for each game.

## When to Use This Script

Use `apply_context_aware_calibration.py` **after** you have generated base model
predictions and want to:

- Reduce systematic over/underprediction in certain game types.
- Preserve the underlying model ordering while nudging totals into better-calibrated
  ranges.

Example:

```bash
uv run python scripts/prediction/apply_context_aware_calibration.py \
  --input predictions/2026-02-08_fresh.csv \
  --output predictions/2026-02-08_context_calibrated.csv
```

## Future Work

- Periodically recompute calibration constants from out-of-sample data.
- Add automated reports that compare:
  - Raw vs calibrated Brier score / log-loss.
  - Calibration curves by scoring band and tempo band.
- Consider integrating calibration into the main training pipeline once
  behavior is stable.

