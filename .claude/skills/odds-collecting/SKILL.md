---
name: odds-collecting
description: Collect scores and odds in a rolling window with retries, deduplication, and freshness guarantees.
---

# Odds Collecting (repo standard)

## Goals

- Keep data fresh for a rolling **5-day** ML window.\n
- Make collectors **idempotent** and safe to rerun.\n
- Track costs/quotas and avoid redundant polling.\n

## Collector requirements

- Always accept explicit arguments:\n
  - `--lookback-days` (default 5)\n
  - `--sport` (e.g., `basketball_ncaab`)\n
  - `--regions` and `--markets` when applicable\n
- Always write timestamps in UTC (`collected_at`).\n
- Use `event_id` (or equivalent) as the primary dedupe key.\n
- Handle rate limits with exponential backoff.\n

## Freshness

- Provide a `freshness_guard` command that fails when data is stale.\n
- On staleness, run bounded backfill (lookback 5 days), then re-normalize.\n

