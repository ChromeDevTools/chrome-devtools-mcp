from __future__ import annotations

from datetime import timedelta
from os import getenv

from pydantic import BaseModel, Field


class Settings(BaseModel):
    database_url: str = Field(..., description="Postgres connection string", alias="DATABASE_URL")
    odds_api_key: str | None = Field(default=None, description="API key for collectors", alias="ODDS_API_KEY")

    # Defaults for orchestration. Override via env vars if needed.
    window_days: int = Field(default=5, alias="WINDOW_DAYS")
    odds_stale_minutes: int = Field(default=180, alias="ODDS_STALE_MINUTES")
    scores_stale_hours: int = Field(default=24, alias="SCORES_STALE_HOURS")

    @property
    def window(self) -> timedelta:
        return timedelta(days=int(self.window_days))

    @property
    def odds_stale_for(self) -> timedelta:
        return timedelta(minutes=int(self.odds_stale_minutes))

    @property
    def scores_stale_for(self) -> timedelta:
        return timedelta(hours=int(self.scores_stale_hours))


def load_settings() -> Settings:
    # Pydantic v2 supports reading env via model_validate with dict.
    env = {
        "DATABASE_URL": getenv("DATABASE_URL"),
        "ODDS_API_KEY": getenv("ODDS_API_KEY"),
        "WINDOW_DAYS": getenv("WINDOW_DAYS"),
        "ODDS_STALE_MINUTES": getenv("ODDS_STALE_MINUTES"),
        "SCORES_STALE_HOURS": getenv("SCORES_STALE_HOURS"),
    }
    # Remove None keys so defaults apply.
    env = {k: v for k, v in env.items() if v is not None}
    return Settings.model_validate(env)

