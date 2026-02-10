---
paths:
  - "odds/**"
  - ".github/workflows/odds-*.yml"
---

# Data freshness + rolling window rules (5 days)

This project’s ML outputs are only valid if inputs are **fresh** and the training/inference data is bounded to a **rolling 5-day window**.

## Freshness SLO

Fail the pipeline if any required input stream is stale.

Recommended defaults (tune per sport/market cadence):
- **Odds snapshots**: stale if `max(collected_at)` older than **180 minutes**
- **Scores/finals**: stale if `max(collected_at)` older than **24 hours**

## Rolling 5-day window

All downstream datasets (features, training rows, prediction features) must be computable from the last **5 days** of canonical + raw inputs.

Implementation requirements:
- Every compute job must accept `--window-days 5` (default 5).
- Normalization must support backfill with an explicit `--lookback-days 5`.
- Any retention/pruning job must never delete within the active 5-day window.

## Backfill on staleness

If freshness checks fail:
- run a bounded backfill (lookback 5 days)
- re-run normalization + validation
- re-check freshness before training/predicting

