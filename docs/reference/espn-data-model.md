# ESPN Data Model and Linking

How ESPN data is linked and related in this project. **Use ESPN team ID as the single canonical key** for all team-scoped data.

## Canonical key: ESPN team ID

- **Type:** string (e.g. `"150"`, `"2710"`).
- **Stable:** Same ID is used across scoreboard, teams API, CDN logos, and team detail/roster endpoints.
- **Source of truth:** The [ESPN teams API](https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams) returns the full list; `id` on each team is the team ID.
- **In this repo:** `ESPNTeam.team_id` and `ESPNGame.home_team_id` / `away_team_id` all use this value.

## How each asset links to team ID

| Asset | Link to team | Where it lives | Join / usage |
|-------|----------------|----------------|--------------|
| **Team metadata** | Primary key | `data/espn/teams/espn_team_names_*.parquet` | One row per team: `team_id`, `display_name`, `abbreviation`, `slug`. **Use this as the team index** for “which teams exist” and for display names. |
| **Schedule / games** | Foreign key | `data/espn/schedule/*.parquet` | Each game has `home_team_id`, `away_team_id`. Filter by team: “all games where `home_team_id = id` or `away_team_id = id`.” |
| **Logos** | Filename (display name) | `data/espn/team_logos/{slug}.png` | One file per team. Saved as **slug** (e.g. `boston-college-eagles.png`) for clarity and future use; image is still fetched via team_id. Collision: `{slug}_{team_id}.png`. |
| **Roster** (future) | URL/param | Team detail API | Endpoint pattern: `.../teams/{team_id}` or `.../teams/{team_id}/roster`; same `team_id`. |
| **Team stats** (future) | URL/param | Team or summary API | Same `team_id` in request; store with `team_id` column for join. |

## Relating everything in practice

1. **Team index**
   Treat the teams Parquet file as the **master list of teams**: each row has `team_id` and names. All other ESPN data joins or references this via `team_id`.

2. **Schedule → teams**
   - To get “all games for team X”: filter schedule rows where `home_team_id == X` or `away_team_id == X`.
   - To attach display names: left-join schedule to the teams table twice (on `home_team_id` and `away_team_id`) and take `display_name` for home and away.

3. **Logos**
   - Stored by **display name (slug)** for clarity: `data/espn/team_logos/{slug}.png` (e.g. `boston-college-eagles.png`).
   - To get “team + logo path”: from the teams table, derive filename from `slug` or slugify(`display_name`); same logic as `services/espn_team_logos._logo_filename`.

4. **Future roster / stats**
   - Ingest with a `team_id` column. Join to the same teams table and to schedule (e.g. by `game_id` for roster-by-game) as needed.

## File layout (current)

```
data/espn/
├── teams/
│   └── espn_team_names_2026.parquet   # team_id, display_name, abbreviation, slug  ← team index
├── schedule/
│   └── 2026-01-31.parquet             # game_id, home_team_id, away_team_id, ...
└── team_logos/
    └── {slug}.png                     # one image per team (e.g. boston-college-eagles.png)
```

## Cross-source linking (ESPN ↔ KenPom, Odds, etc.)

- **Within ESPN:** always use **team ID**; no need for name matching.
- **Across sources:** ESPN has no universal external ID; we use **display names** (and variants) plus fuzzy matching.
  See `src/sports_betting_edge/utils/team_matching.py`: match Odds API / Overtime names to KenPom names. To link ESPN → KenPom, use `ESPNTeam.display_name` (or `short_display_name`) as input to the same matching pipeline; store the result as an optional `kenpom_name` or use it only at analysis time.

**Summary:** Use **ESPN team ID** for all ESPN-internal linking (schedule, logos, future roster/stats). Keep the **teams Parquet** as the team index. For cross-source (e.g. ESPN ↔ KenPom), use team names and the existing `team_matching` utilities.
