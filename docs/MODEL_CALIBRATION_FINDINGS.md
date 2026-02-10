# Model Calibration Findings - 2026-02-07

This document summarizes the bias analysis that motivated the one-time
calibration fix implemented in `scripts/prediction/apply_calibration_fix.py`.

> Status: **snapshot** – describes the specific 2026-02-07 underprediction issue.
> Future calibration work should extend this document or be captured in a new
> dated section.

## Background

On 2026-02-07, evaluation of the totals model against actual game results
identified a **systematic underprediction** of final scores:

- Average miss vs final totals was approximately **+4.5 points** (actual higher).
- Bias was consistent across a wide range of matchups and totals bands.

To avoid re-training the model mid-slates, a lightweight correction layer was
introduced that:

- Preserves the model’s relative ordering between games.
- Applies a uniform upward shift to totals predictions.

## Fix Implemented

The script `scripts/prediction/apply_calibration_fix.py`:

1. Stores original predictions:
   - `predicted_total_raw`
   - `predicted_home_score_raw`
   - `predicted_away_score_raw`
2. Adds a **+4.5 point bias correction** to totals:
   - `predicted_total = predicted_total_raw + 4.5`
3. Redistributes the 4.5 points proportionally to home and away scores so that:
   - The **margin** (`predicted_home_score - predicted_away_score`) is unchanged.
4. Optionally (when `--validate` is used) computes warning flags for games that
   diverge too far from:
   - KenPom-derived totals (`kenpom_total`)
   - Market totals (`market_total`)
   - Recent scoring averages (`recent_avg_total`)

Command-line usage:

```bash
uv run python scripts/prediction/apply_calibration_fix.py \
  --input predictions/2026-02-07_raw.csv \
  --output predictions/2026-02-07_calibrated.csv
```

## Interpretation

- This correction should be treated as a **temporary hotfix**, not a substitute
  for retraining with more data.
- The value **+4.5** is specific to the 2026-02-07 analysis window; future
  evaluation may justify a different value or a more nuanced, context-aware
  approach (see `docs/CALIBRATION_EXPERT_GUIDE.md`).

## Next Steps

- Regularly recompute calibration bias on rolling windows.
- Prefer context-aware calibration (`apply_context_aware_calibration.py`) once
  its methodology is fully validated.
- Integrate calibration metrics (e.g., Brier score, calibration curves) into the
  standard model evaluation pipeline.

