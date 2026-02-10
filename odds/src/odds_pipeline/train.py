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
class TrainResult:
    model_version: str
    window_days: int
    trained_at: str
    metrics: dict[str, float]


def _artifact_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "artifacts"


def train(*, window_days: int | None = None) -> TrainResult:
    settings = load_settings()
    wd = int(window_days if window_days is not None else settings.window_days)

    freshness = check_freshness(window_days=wd)
    if not freshness.ok:
        raise RuntimeError(f"Freshness check failed: {freshness.details}")

    cutoff = now_utc() - timedelta(days=wd)
    # Minimal baseline “model”: record basic counts so the pipeline is end-to-end deterministic.
    with connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  (SELECT COUNT(*) FROM canonical_spreads WHERE collected_at >= %(cutoff)s) AS spreads,
                  (SELECT COUNT(*) FROM canonical_totals WHERE collected_at >= %(cutoff)s) AS totals,
                  (SELECT COUNT(*) FROM canonical_moneylines WHERE collected_at >= %(cutoff)s) AS moneylines
                """,
                {"cutoff": cutoff},
            )
            spreads, totals, moneylines = cur.fetchone()

    trained_at = now_utc().isoformat()
    model_version = trained_at.replace(":", "").replace("-", "").split(".")[0] + "Z"
    metrics = {
        "rows_spreads": float(spreads),
        "rows_totals": float(totals),
        "rows_moneylines": float(moneylines),
    }

    result = TrainResult(
        model_version=model_version,
        window_days=wd,
        trained_at=trained_at,
        metrics=metrics,
    )

    out_dir = _artifact_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "model.json").write_text(json.dumps(result.__dict__, indent=2), encoding="utf-8")
    return result

