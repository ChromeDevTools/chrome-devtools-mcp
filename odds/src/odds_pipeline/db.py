from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg


@contextmanager
def connect(database_url: str) -> Iterator[psycopg.Connection]:
    # autocommit=False so callers explicitly commit or rollback.
    with psycopg.connect(database_url, autocommit=False) as conn:
        yield conn


def execute_sql_file(conn: psycopg.Connection, sql_path: str) -> None:
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()

