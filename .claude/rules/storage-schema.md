---
paths:
  - "odds/**"
---

# Storage and schema contract

GitHub Actions runners are ephemeral. **All pipeline state must live in persistent storage**.

## Required environment variables

- `DATABASE_URL`: Postgres connection string for the persistent store.
- `ODDS_API_KEY`: The Odds API key (or equivalent) for collectors.

## Schema principles

- **Raw tables**: append-only snapshots; never mutated in place.
- **Canonical tables**: derived from raw via normalization; can be re-derived deterministically.
- **Idempotency**: collectors must not create duplicates for the same `(source,event_id,market,bookmaker,collected_at)` tuple.
- **Time zone**: store timestamps in UTC and only convert for presentation.

## Market canonicalization

Canonical tables must follow the rules in `odds-normalization.md`.

