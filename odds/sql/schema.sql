-- Odds pipeline persistent schema (Postgres)
-- All timestamps are stored as timestamptz (UTC).

CREATE TABLE IF NOT EXISTS raw_odds_snapshots (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  sport TEXT NOT NULL,
  event_id TEXT NOT NULL,
  commence_time TIMESTAMPTZ,
  home_team TEXT,
  away_team TEXT,
  bookmaker_key TEXT,
  market_key TEXT NOT NULL,
  outcome_name TEXT NOT NULL,
  price INTEGER,
  point NUMERIC,
  collected_at TIMESTAMPTZ NOT NULL,
  raw JSONB,
  UNIQUE (source, event_id, bookmaker_key, market_key, outcome_name, collected_at)
);

CREATE INDEX IF NOT EXISTS raw_odds_snapshots_collected_at_idx
  ON raw_odds_snapshots (collected_at DESC);

CREATE INDEX IF NOT EXISTS raw_odds_snapshots_event_idx
  ON raw_odds_snapshots (sport, event_id);

CREATE TABLE IF NOT EXISTS raw_scores_snapshots (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  sport TEXT NOT NULL,
  event_id TEXT NOT NULL,
  commence_time TIMESTAMPTZ,
  home_team TEXT,
  away_team TEXT,
  completed BOOLEAN,
  home_score INTEGER,
  away_score INTEGER,
  last_update TIMESTAMPTZ,
  collected_at TIMESTAMPTZ NOT NULL,
  raw JSONB,
  UNIQUE (source, event_id, collected_at)
);

CREATE INDEX IF NOT EXISTS raw_scores_snapshots_collected_at_idx
  ON raw_scores_snapshots (collected_at DESC);

CREATE INDEX IF NOT EXISTS raw_scores_snapshots_event_idx
  ON raw_scores_snapshots (sport, event_id);

-- Generic external games feed (schedules + scores) from public endpoints like ESPN
-- and HTML-scraped sources like Action Network. This is intentionally flexible.
CREATE TABLE IF NOT EXISTS raw_games_snapshots (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL, -- e.g. 'espn', 'actionnetwork'
  sport TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  commence_time TIMESTAMPTZ,
  home_team TEXT,
  away_team TEXT,
  status TEXT,
  home_score INTEGER,
  away_score INTEGER,
  collected_at TIMESTAMPTZ NOT NULL,
  raw JSONB,
  UNIQUE (source, sport, external_event_id, collected_at)
);

CREATE INDEX IF NOT EXISTS raw_games_snapshots_collected_at_idx
  ON raw_games_snapshots (collected_at DESC);

CREATE INDEX IF NOT EXISTS raw_games_snapshots_event_idx
  ON raw_games_snapshots (sport, external_event_id);

-- KenPom metrics snapshots (scraped via kenpompy; one row per team per scrape timestamp).
CREATE TABLE IF NOT EXISTS raw_kenpom_team_metrics (
  id BIGSERIAL PRIMARY KEY,
  season INTEGER NOT NULL,
  team TEXT NOT NULL,
  metric_type TEXT NOT NULL, -- 'pomeroy_ratings', 'efficiency', 'four_factors', 'fanmatch'
  collected_at TIMESTAMPTZ NOT NULL,
  raw JSONB NOT NULL,
  UNIQUE (season, team, metric_type, collected_at)
);

CREATE INDEX IF NOT EXISTS raw_kenpom_team_metrics_collected_at_idx
  ON raw_kenpom_team_metrics (collected_at DESC);

-- Canonical spreads: one row per event/book/collected_at.
-- spread_magnitude is always positive; favorite/underdog teams are explicit.
CREATE TABLE IF NOT EXISTS canonical_spreads (
  id BIGSERIAL PRIMARY KEY,
  sport TEXT NOT NULL,
  event_id TEXT NOT NULL,
  commence_time TIMESTAMPTZ,
  bookmaker_key TEXT NOT NULL,
  favorite_team TEXT NOT NULL,
  underdog_team TEXT NOT NULL,
  spread_magnitude NUMERIC NOT NULL,
  favorite_price INTEGER,
  underdog_price INTEGER,
  collected_at TIMESTAMPTZ NOT NULL,
  UNIQUE (event_id, bookmaker_key, collected_at, spread_magnitude)
);

CREATE INDEX IF NOT EXISTS canonical_spreads_collected_at_idx
  ON canonical_spreads (collected_at DESC);

CREATE INDEX IF NOT EXISTS canonical_spreads_event_idx
  ON canonical_spreads (sport, event_id);

-- Canonical totals: one row per event/book/collected_at.
CREATE TABLE IF NOT EXISTS canonical_totals (
  id BIGSERIAL PRIMARY KEY,
  sport TEXT NOT NULL,
  event_id TEXT NOT NULL,
  commence_time TIMESTAMPTZ,
  bookmaker_key TEXT NOT NULL,
  total NUMERIC NOT NULL,
  over_price INTEGER,
  under_price INTEGER,
  collected_at TIMESTAMPTZ NOT NULL,
  UNIQUE (event_id, bookmaker_key, collected_at, total)
);

CREATE INDEX IF NOT EXISTS canonical_totals_collected_at_idx
  ON canonical_totals (collected_at DESC);

CREATE INDEX IF NOT EXISTS canonical_totals_event_idx
  ON canonical_totals (sport, event_id);

-- Canonical moneylines: store prices + implied probabilities.
CREATE TABLE IF NOT EXISTS canonical_moneylines (
  id BIGSERIAL PRIMARY KEY,
  sport TEXT NOT NULL,
  event_id TEXT NOT NULL,
  commence_time TIMESTAMPTZ,
  bookmaker_key TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_price INTEGER,
  away_price INTEGER,
  home_implied_prob DOUBLE PRECISION,
  away_implied_prob DOUBLE PRECISION,
  collected_at TIMESTAMPTZ NOT NULL,
  UNIQUE (event_id, bookmaker_key, collected_at)
);

CREATE INDEX IF NOT EXISTS canonical_moneylines_collected_at_idx
  ON canonical_moneylines (collected_at DESC);

CREATE INDEX IF NOT EXISTS canonical_moneylines_event_idx
  ON canonical_moneylines (sport, event_id);

-- Pipeline run log for auditing and freshness debugging.
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  details JSONB
);

