# Odds API Database Inspection Report

## Summary

| Item                                               | Status                        | Notes                                                          |
| -------------------------------------------------- | ----------------------------- | -------------------------------------------------------------- |
| **Database file** `data/odds_api/odds_api.sqlite3` | Gitignored, may exist locally | `.gitignore` excludes `*.sqlite3`                              |
| **`_ensure_views_exist()`**                        | Exists                        | In `odds_api_db.py`, creates normalized views on first connect |
| **`_ensure_indexes_exist()`**                      | Does NOT exist                | `create_indexes.sql` is never applied automatically            |
| **Schema initialization**                          | Missing                       | No `CREATE TABLE` for events/observations/scores in repo       |
| **Indexes**                                        | Never applied                 | Script must be run manually                                    |

---

## Upstream (Data producers)

| Component                      | Role                                 | Impact                                        |
| ------------------------------ | ------------------------------------ | --------------------------------------------- |
| **`scripts/collect_daily.py`** | Inserts events, observations, scores | Assumes tables exist; fails if schema missing |
| **Odds API HTTP**              | Source of odds/scores data           | N/A (external)                                |

**Gap**: `collect_daily.py` does `INSERT INTO observations` / `INSERT OR REPLACE INTO events` but never creates the schema. First run fails with "no such table".

---

## Downstream (Data consumers)

| Component                                  | Role                              | Impact if DB/schema missing                   |
| ------------------------------------------ | --------------------------------- | --------------------------------------------- |
| **`OddsAPIDatabase`**                      | Adapter, creates views on connect | Raises `FileNotFoundError` if DB path missing |
| **`FeatureEngineer`**                      | Builds ML datasets                | Depends on OddsAPIDatabase                    |
| **`scripts/build_training_datasets.py`**   | CLI for training data             | Fails if DB missing                           |
| **`scripts/build_datasets_espn_odds.py`**  | ESPN + odds merge                 | Fails if DB missing                           |
| **`scripts/create_team_mapping.py`**       | Team mapping from events          | Fails if DB missing                           |
| **`scripts/force_update_views.py`**        | Recreate views                    | Fails if DB missing                           |
| **`scripts/test_odds_api_integration.py`** | Integration test                  | Fails if DB missing                           |
| **`scripts/train_walkforward.py`**         | Walk-forward training             | Fails if DB missing                           |

---

## Current Bootstrap Flow

1. **Database file**: Must exist before any use. Adapter raises if path missing.
2. **Schema (tables)**: Not created by any script. Assumed to exist (or created manually).
3. **Views**: Created by `_ensure_views_exist()` on first `OddsAPIDatabase` connect.
4. **Indexes**: Never applied. `sql/create_indexes.sql` exists but is not wired.

---

## Implemented Fixes

1. **`sql/create_odds_api_schema.sql`** – Added `CREATE TABLE IF NOT EXISTS` for events, observations, scores.
2. **`_ensure_schema_exists()`** – Runs on first connect; creates tables if missing (idempotent).
3. **`_ensure_indexes_exist()`** – Runs on first connect; applies `create_indexes.sql` (idempotent).
4. **Bootstrap on connect** – Parent directory and DB file created if missing; schema → indexes → views applied in order.
5. **Bootstrap order** – `conn` property: `_ensure_schema_exists()` → `_ensure_indexes_exist()` → `_ensure_views_exist()`.

## Manual Application (if needed)

To apply schema or indexes without using the adapter:

```bash
sqlite3 data/odds_api/odds_api.sqlite3 < sql/create_odds_api_schema.sql
sqlite3 data/odds_api/odds_api.sqlite3 < sql/create_indexes.sql
```
