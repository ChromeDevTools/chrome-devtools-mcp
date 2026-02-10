# Architecture

System design and layering for the sports-betting-edge toolkit.

## Domain

- **Focus:** NCAA Men's Basketball betting edge research.
- **Success metric:** Closing Line Value (CLV), not win percentage.
- **Data storage:** Parquet preferred for analytical datasets.

## Layering

Dependency direction: **core → services → adapters**. No I/O in core.

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Core** | `src/sports_betting_edge/core/` | Domain models, types, pure functions, exceptions. No network, no file I/O, no DB. |
| **Services** | `src/sports_betting_edge/services/` | Workflow orchestration and business rules. Call adapters; return domain objects. |
| **Adapters** | `src/sports_betting_edge/adapters/` | All external I/O: HTTP clients, DB access, filesystem, browser automation. |
| **Config** | `src/sports_betting_edge/config/` | Settings from env, logging configuration only. |

## Data Sources

| Source | Purpose | Adapter / Integration |
|--------|---------|------------------------|
| **KenPom** | Efficiency, Four Factors, tempo, team ratings | `adapters/kenpom.py`; services: `kenpom_collection.py`. See `docs/kenpom/`. |
| **The Odds API** | Odds, line movement, scores | `adapters/odds_api.py`; services: `odds_collection.py`. |
| **ESPN** | Schedule, scoreboard, teams, logos (API + browser) | `adapters/espn.py` (scoreboard, teams, CDN logos); Puppeteer script `puppeteer/capture_espn_schedule.js`. See **ESPN data model:** `docs/espn-data-model.md`. |
| **Overtime / Action Network** | (Planned) | Not yet implemented. |

## Components

- **CLI** (`cli.py`): Typer app; commands for KenPom, Odds, ESPN schedule collection. Entry: `python -m sports_betting_edge` or `sports_betting_edge`.
- **API** (`api/`): FastAPI scaffold (routers, health). Run when implemented: `uv run uvicorn sports_betting_edge.api.main:app --reload`.
- **Scraper** (`scraper/`): Scrapy-based crawl scaffold (items, spiders, pipelines). For generic crawls.
- **Scraper prod** (`scraper_prod/`): Production scraper scaffold; can drive Puppeteer/Playwright for ESPN schedule capture.
- **Puppeteer** (`puppeteer/`): Node scripts for browser automation (e.g. `capture_espn_schedule.js`). Run with Node: `node puppeteer/capture_espn_schedule.js [--date YYYYMMDD]`.

## Data Layout

| Directory | Purpose |
|-----------|---------|
| `data/raw/` | Raw scraped/ingested data |
| `data/processed/` | Processed/transformed datasets |
| `data/analysis/` | Analysis outputs (e.g. KenPom vs odds edge analysis) |
| `data/kenpom/` | KenPom ratings, FanMatch data |
| `data/overtime/` | Overtime.ag outputs (parquet + JSON), partitioned by date. Tracker snapshots live under `data/overtime/tracker/`. |
| `data/espn/` | ESPN schedule, teams, team logos |
| `data/odds_api/` | The Odds API snapshots and DB: `odds/<sport>/`, `scores/<sport>/YYYY-MM-DD/`, `stream/<sport>/`, plus `odds_api.sqlite3`. |

Analysis CSV outputs are written to `data/analysis/` by default (e.g. `analysis_2026-01-31.csv`). Use `--output` to override, or `--output-dir` to change the base directory.

## ML / Feature Importance

XGBoost is used to discover which KenPom stats best predict FanMatch win probability:

- **Script:** `scripts/xgboost_feature_importance.py`
- **Features:** KenPom ratings (AdjEM, AdjOE, AdjDE, AdjTempo, Luck, SOS), Four Factors, misc stats
- **Target:** FanMatch HomeWP (KenPom's published win probability)
- **Output:** Feature importance by gain (which stats matter most)
- **Requires:** `uv sync --extra ml` (xgboost, scikit-learn, pandas)

Use feature importance to guide feature engineering for walk-forward ML models (spreads, totals).

## Configuration

- Env-based settings via `config/settings.py` (Pydantic Settings).
- Logging: `config/logging.py`; level via `LOG_LEVEL`, optional JSON via `LOG_FORMAT=json`.
- Optional OpenTelemetry: `OTEL_*` env vars; see `utils/otel.py`.

## References

- **KenPom:** `docs/kenpom/endpoints.md`, `docs/kenpom/fields.md`
- **Odds normalization:** CLAUDE.md (normalize-odds skill); no signed spreads in models.
- **Decisions:** `docs/decisions.md`
