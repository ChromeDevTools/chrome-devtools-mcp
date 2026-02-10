---
name: betting-data-normalizing
description: Mandatory normalization rules for spreads, totals, and moneylines. Use for ANY sports betting analytics or ML work in this repo.
---

# Betting Data Normalizing (repo standard)

## Spreads

- APIs/books often return two outcomes per game with opposite signs (e.g., -7 and +7). They represent the **same** spread.\n
- Store **one canonical record per game**.\n
- Recommended representation:\n
  - `spread_magnitude`: always positive\n
  - `favorite_team` and `underdog_team`\n
  - prices for each side\n
\n
Never average raw point values that mix negative and positive spreads.

## Totals

- Store **one total** per game plus `over_price` and `under_price`.\n
- Do not store separate Over/Under rows as separate totals.

## Moneylines

- Convert American odds to implied probability before doing math.\n
\n
If `odds < 0`:\n
`p = abs(odds) / (abs(odds) + 100)`\n
\n
If `odds > 0`:\n
`p = 100 / (odds + 100)`\n
\n
Never average American odds directly.

## Movement convention

Track spread movement from the **favorite’s perspective** (negative spread). This avoids mixing perspectives between teams.

