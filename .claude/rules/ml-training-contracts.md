---
paths:
  - "odds/**"
---

# ML training + prediction contracts

This project is designed so that models can be trained and evaluated deterministically from canonical data in the last 5 days.

## Requirements

- Training jobs must:
  - log the dataset time window used
  - record training timestamp and model version identifier
  - output evaluation metrics (at minimum: calibration/accuracy proxies appropriate to the target)
- Prediction jobs must:
  - refuse to run if freshness checks fail
  - attach the model version + data window to every prediction artifact

## Targets

- **Spreads**: predict cover probability from the team perspective (requires consistent sign conventions).
- **Moneylines**: predict win probability (compare to implied probs for edge).
- **Totals**: predict over probability relative to the canonical total.

