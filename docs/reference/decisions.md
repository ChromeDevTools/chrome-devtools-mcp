# Decisions

Architecture decision records (ADRs) for this project.

---

## ADR-1: Strict src layout and layering

**Status:** Accepted

**Context:** We need a clear place for domain logic, orchestration, and I/O so that tests and refactors stay predictable and core logic stays free of external dependencies.

**Decision:**

- All importable Python code lives under `src/sports_betting_edge/` (src layout). No importable modules at repo root.
- Layering: **core** (pure, no I/O) → **services** (orchestration, call adapters) → **adapters** (HTTP, DB, FS, browser).
- Core must not depend on services or adapters. Services may depend on core and adapters. Adapters perform all I/O.

**Consequences:**

- Tests can unit-test core and services with mocked adapters. Integration tests target adapters.
- New features follow: add/update types in core, orchestration in services, I/O in adapters.

---

## ADR-2: Odds and spreads decomposed (no signed values in models)

**Status:** Accepted

**Context:** Sports odds use signs to encode meaning (favorite/underdog, over/under). Storing signed numbers in models leads to sign-convention bugs and ambiguous deltas.

**Decision:**

- Numeric fields represent **one concept only**. We decompose:
  - Magnitude (always positive), e.g. `spread_points = 6.5`
  - Role via explicit flags/enums, e.g. `is_favorite`, `SideRole.OVER`
- We do **not** store signed spreads (e.g. `-6.5`) or use `+1/-1` as role. American odds are converted to implied probability where needed.

**Consequences:**

- All new code involving spreads, totals, or moneylines must follow the normalize-odds skill/spec. See CLAUDE.md.

---

*Add new ADRs above with a short title, status, context, decision, and consequences.*
