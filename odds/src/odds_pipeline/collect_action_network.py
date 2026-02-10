from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime

import requests

from odds_pipeline.config import load_settings
from odds_pipeline.db import connect
from odds_pipeline.util import now_utc


@dataclass(frozen=True)
class ActionNetworkConfig:
    # This is a public web page; we treat it as a best-effort HTML feed.
    odds_url: str = "https://www.actionnetwork.com/ncaab/odds"


_GAME_URL_RE = re.compile(r"https://www\.actionnetwork\.com/ncaab-game/[^)\s]+/(\d+)")


def collect_action_network_odds_page() -> int:
    """
    Best-effort collection from Action Network's NCAAB odds page.

    This is **not** a stable public API; we store raw HTML and extracted game IDs/URLs
    as a schedules/scores supplement.
    """
    settings = load_settings()
    cfg = ActionNetworkConfig()

    resp = requests.get(cfg.odds_url, timeout=60, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    html = resp.text

    collected_at = now_utc()
    matches = list(_GAME_URL_RE.finditer(html))
    inserted = 0

    with connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            for m in matches:
                game_id = m.group(1)
                url = m.group(0)
                raw = {"url": url, "html_len": len(html)}
                cur.execute(
                    """
                    INSERT INTO raw_games_snapshots (
                      source, sport, external_event_id, collected_at, raw
                    ) VALUES (
                      %(source)s, %(sport)s, %(external_event_id)s, %(collected_at)s, %(raw)s
                    )
                    ON CONFLICT DO NOTHING
                    """,
                    {
                        "source": "actionnetwork",
                        "sport": "basketball_ncaab",
                        "external_event_id": str(game_id),
                        "collected_at": collected_at,
                        "raw": json.dumps(raw),
                    },
                )
                inserted += cur.rowcount
        conn.commit()

    return inserted

