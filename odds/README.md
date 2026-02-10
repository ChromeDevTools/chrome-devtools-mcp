# Odds pipeline (Postgres + GitHub Actions)

This folder contains a minimal, repo-local odds data pipeline designed for:
- **rolling 5-day freshness windows**
- strict **canonical normalization** (spreads/totals/moneylines)
- scheduled orchestration via **GitHub Actions**

## Required secrets / env vars

- `DATABASE_URL` (required): Postgres connection string (persistent store).
- `ODDS_API_KEY` (collector key; required once collectors are enabled).
- `KENPOM_EMAIL` / `KENPOM_PASSWORD` (required for KenPom scraping via kenpompy).

Optional:
- `WINDOW_DAYS` (default 5)
- `ODDS_STALE_MINUTES` (default 180)
- `SCORES_STALE_HOURS` (default 24)

## Additional sources

- **ESPN**: schedules + historical scores via the public scoreboard endpoint (stored in `raw_games_snapshots`).
- **Action Network**: best-effort HTML scrape from `actionnetwork.com` to supplement game IDs/links (stored in `raw_games_snapshots`).
- **KenPom**: team metrics scraped via `kenpompy` (stored in `raw_kenpom_team_metrics`).

## Initialize schema

From repo root, using **pip**:

```bash
python -m pip install -e odds
python -m odds_pipeline.schema
```

Or with **uv**:

```bash
cd odds
uv sync
uv run python -m odds_pipeline.schema
```

