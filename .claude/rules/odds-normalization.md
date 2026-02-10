---
paths:
  - "odds/**"
---

# Odds normalization rules (canonical markets)

These rules prevent sign-convention errors and ensure math is consistent across collectors, analytics, and ML training.

## Key distinction

**Favorite/underdog is determined by spread sign; home/away is venue and independent.** Do not conflate them.

## Spreads (one canonical value per game)

Sportsbooks/APIs often return **two outcomes per event** with opposite signs (e.g., -7 and +7). Those represent the *same* market.

Store exactly **one canonical record per event/book/collected_at** using either:

- **Option A (allowed)**: store the **favorite spread** (always negative or 0).
- **Option B (preferred)**: store `spread_magnitude` (always positive) and explicit `favorite_team`/`underdog_team`.

Never average raw `point` values that include both + and -.

## Totals (one canonical value per game)

Over/Under are two prices on the same number. Store one `total` value plus `over_price`/`under_price`.

## Moneylines (use implied probability for math)

American odds must be converted to implied probability before any aggregation or modeling.

For American odds \(o\):

- If \(o < 0\): \(p = |o| / (|o| + 100)\)
- If \(o > 0\): \(p = 100 / (o + 100)\)

Never average American odds directly.

## Line movement convention (favorite perspective)

If tracking spread movement, compute deltas from the **favorite’s spread** (negative). This avoids mixing perspectives.

