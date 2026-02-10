"""Collect ESPN scores for a single date and update Odds API SQLite DB.

Defaults to yesterday in PST to capture end-of-day results.

Usage:
    uv run python scripts/collect_espn_scores_recap.py
    uv run python scripts/collect_espn_scores_recap.py --date 2026-02-04
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from sports_betting_edge.adapters.espn import fetch_scoreboard, parse_espn_score
from sports_betting_edge.adapters.filesystem import read_parquet_df
from sports_betting_edge.adapters.odds_api_db import OddsAPIDatabase
from sports_betting_edge.core.team_mapper import TeamMapper

PST = ZoneInfo("America/Los_Angeles")


def _log_setup() -> None:
    log_dir = Path("data") / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "scores_recap.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_path, encoding="utf-8"),
        ],
    )


def _parse_date(value: str) -> date:
    return datetime.fromisoformat(value).date()


def _default_date() -> date:
    today_pst = datetime.now(PST).date()
    return today_pst - timedelta(days=1)


async def _collect_scores_for_date(
    target_date: date,
    db_path: Path,
    team_mapping_path: Path,
    *,
    include_in_progress: bool,
) -> dict[str, int]:
    logger = logging.getLogger(__name__)

    mapping_df = read_parquet_df(str(team_mapping_path))
    team_mapper = TeamMapper(mapping_df)
    db = OddsAPIDatabase(db_path)

    try:
        scoreboard = await fetch_scoreboard(target_date)
        events = scoreboard.get("events", [])
        logger.info("ESPN scoreboard events: %d", len(events))

        if not events:
            return {"stored": 0, "updated": 0, "unmatched": 0}

        our_events = pd.read_sql_query(
            """
            SELECT event_id, home_team, away_team, commence_time
            FROM events
            WHERE DATE(commence_time) = ?
            """,
            db.conn,
            params=(target_date.strftime("%Y-%m-%d"),),
        )

        stored = 0
        updated = 0
        unmatched = 0
        in_progress = 0

        for espn_event in events:
            score = parse_espn_score(espn_event)
            if score is None:
                continue

            completed = score["completed"]
            if not completed and not include_in_progress:
                continue

            espn_home_team = score["espn_home_team"]
            espn_away_team = score["espn_away_team"]
            home_score = score["home_score"]
            away_score = score["away_score"]

            odds_home_team = team_mapper.get_odds_api_name(
                team_mapper.get_kenpom_name(espn_home_team, source="espn")
            )
            odds_away_team = team_mapper.get_odds_api_name(
                team_mapper.get_kenpom_name(espn_away_team, source="espn")
            )

            matching_event = our_events[
                (
                    (our_events["home_team"] == odds_home_team)
                    & (our_events["away_team"] == odds_away_team)
                )
                | (
                    (our_events["home_team"] == espn_home_team)
                    & (our_events["away_team"] == espn_away_team)
                )
            ]

            if len(matching_event) == 0:
                unmatched += 1
                continue

            event_id = matching_event.iloc[0]["event_id"]
            now_iso = datetime.now(UTC).isoformat()
            completed_flag = 1 if completed else 0

            existing = db.conn.execute(
                "SELECT event_id FROM scores WHERE event_id = ?",
                (event_id,),
            ).fetchone()

            if existing:
                db.conn.execute(
                    """
                    UPDATE scores
                    SET sport_key = ?,
                        completed = ?,
                        home_score = ?,
                        away_score = ?,
                        last_update = ?,
                        fetched_at = ?
                    WHERE event_id = ?
                    """,
                    (
                        "basketball_ncaab",
                        completed_flag,
                        int(home_score),
                        int(away_score),
                        now_iso,
                        now_iso,
                        event_id,
                    ),
                )
                updated += 1
            else:
                db.conn.execute(
                    """
                    INSERT INTO scores
                    (event_id, sport_key, completed, home_score, away_score,
                     last_update, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event_id,
                        "basketball_ncaab",
                        completed_flag,
                        int(home_score),
                        int(away_score),
                        now_iso,
                        now_iso,
                    ),
                )
                stored += 1
            if not completed:
                in_progress += 1

        db.conn.commit()
        return {
            "stored": stored,
            "updated": updated,
            "unmatched": unmatched,
            "in_progress": in_progress,
        }
    finally:
        db.close()


def main() -> int:
    _log_setup()
    logger = logging.getLogger(__name__)

    parser = argparse.ArgumentParser(description="Collect ESPN scores for a date")
    parser.add_argument("--date", type=_parse_date, help="Target date (YYYY-MM-DD)")
    parser.add_argument(
        "--use-today",
        action="store_true",
        help="Use today's date in PST (overrides --date)",
    )
    parser.add_argument(
        "--include-in-progress",
        action="store_true",
        help="Also store in-progress games (live scores) with completed=0",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/odds_api/odds_api.sqlite3"),
        help="Path to Odds API SQLite database",
    )
    parser.add_argument(
        "--team-mapping",
        type=Path,
        default=Path("data/staging/mappings/team_mapping.parquet"),
        help="Path to team mapping file",
    )
    args = parser.parse_args()

    target_date = datetime.now(PST).date() if args.use_today else args.date or _default_date()
    logger.info("Collecting ESPN scores for %s", target_date.isoformat())

    try:
        metrics = asyncio.run(
            _collect_scores_for_date(
                target_date=target_date,
                db_path=args.db,
                team_mapping_path=args.team_mapping,
                include_in_progress=args.include_in_progress,
            )
        )
        logger.info(
            "Scores recap: stored=%d updated=%d unmatched=%d in_progress=%d",
            metrics["stored"],
            metrics["updated"],
            metrics["unmatched"],
            metrics["in_progress"],
        )
        return 0
    except Exception as exc:  # noqa: BLE001
        logger.exception("Scores recap failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
