from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

from odds_pipeline.config import load_settings
from odds_pipeline.db import connect
from odds_pipeline.freshness import check_freshness
from odds_pipeline.util import now_utc


@dataclass(frozen=True)
class PredictionArtifact:
    model_version: str
    window_days: int
    generated_at: str
    notes: str
    sample: list[dict[str, object]]


def _artifact_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "artifacts"


def predict(*, model_version: str, window_days: int | None = None, limit: int = 50) -> PredictionArtifact:
    settings = load_settings()
    wd = int(window_days if window_days is not None else settings.window_days)

    freshness = check_freshness(window_days=wd)
    if not freshness.ok:
        raise RuntimeError(f"Freshness check failed: {freshness.details}")

    cutoff = now_utc() - timedelta(days=wd)

    # Minimal placeholder predictions: emit latest moneyline implied probs as a baseline.
    sample: list[dict[str, object]] = []
    with connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT ON (sport, event_id, bookmaker_key)
                  sport, event_id, bookmaker_key, collected_at,
                  home_team, away_team, home_implied_prob, away_implied_prob
                FROM canonical_moneylines
                WHERE collected_at >= %(cutoff)s
                ORDER BY sport, event_id, bookmaker_key, collected_at DESC
                LIMIT %(limit)s
                """,
                {"cutoff": cutoff, "limit": int(limit)},
            )
            for row in cur.fetchall():
                (
                    sport,
                    event_id,
                    bookmaker_key,
                    collected_at,
                    home_team,
                    away_team,
                    home_p,
                    away_p,
                ) = row
                sample.append(
                    {
                        "sport": sport,
                        "event_id": event_id,
                        "bookmaker_key": bookmaker_key,
                        "collected_at": collected_at.isoformat() if collected_at else None,
                        "home_team": home_team,
                        "away_team": away_team,
                        "home_win_prob_baseline": home_p,
                        "away_win_prob_baseline": away_p,
                    }
                )

    artifact = PredictionArtifact(
        model_version=model_version,
        window_days=wd,
        generated_at=now_utc().isoformat(),
        notes="Baseline predictions = latest implied probabilities (placeholder).",
        sample=sample,
    )

    out_dir = _artifact_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "predictions.json").write_text(json.dumps(artifact.__dict__, indent=2), encoding="utf-8")
    return artifact

