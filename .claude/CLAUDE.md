# Odds ML Orchestration (Claude Code Team)

This repository is used to maintain an orchestrated pipeline for **sports odds statistical research and ML predictions** (spreads, moneylines, totals) with a strict **rolling 5-day freshness window**.

## Non-negotiables

- **Freshness SLO**: all datasets used for training and prediction must be derived from the last **5 days** of collected data. If inputs are stale, the pipeline must fail fast and trigger backfill.
- **Canonical markets**:
  - **Spreads**: store **one canonical value per game** (favorite perspective OR `spread_magnitude` + `favorite_team`). Never average ±spread rows.
  - **Totals**: store **one canonical total** per game (not separate over/under rows).
  - **Moneylines**: convert American odds to **implied probability** for aggregation and ML.

See the project rules in `./.claude/rules/` for details.

## Repeatable Agent Team Template (copy/paste prompt)

Create an agent team for odds pipeline maintenance with these teammates and responsibilities. Require plan approval before implementing any schema or workflow changes. Put the lead into delegate mode after spawning.

- **TeamLead (delegate mode)**: coordination only, creates tasks, assigns owners, synthesizes results.
- **CollectorEngineer**: web scraping + API collectors, rate limits, idempotency, retries/backfills.
- **NormalizationSteward**: canonicalization of spreads/totals/moneylines; dedupe; invariants/tests.
- **DataFreshnessSRE**: rolling 5-day window enforcement; staleness detection; alerting/escalation.
- **MLTrainerEngineer**: feature views; training; evaluation; prediction artifacts.
- **CostQuotaAnalyst (optional)**: API credit/usage budgeting; schedule optimization.

Approval criteria for TeamLead:
- Reject any plan that changes market sign conventions.
- Reject any plan that allows stale inputs to silently pass.
- Reject any plan that introduces non-idempotent collectors.

## Operational contract (GitHub Actions)

GitHub Actions runs the scheduled pipeline. The code must support:
- **Collect** → **Normalize/Validate** → **Train** → **Predict/Report** → **Freshness Guard**
- Bounded backfill on staleness (5-day lookback).

