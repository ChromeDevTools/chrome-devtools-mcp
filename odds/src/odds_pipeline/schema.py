from __future__ import annotations

from pathlib import Path

from odds_pipeline.config import load_settings
from odds_pipeline.db import connect, execute_sql_file


def init_schema() -> None:
    settings = load_settings()
    schema_path = Path(__file__).resolve().parents[2] / "sql" / "schema.sql"
    with connect(settings.database_url) as conn:
        execute_sql_file(conn, str(schema_path))


if __name__ == "__main__":
    init_schema()

