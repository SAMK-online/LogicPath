from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_engine: Engine | None = None
_factory: sessionmaker[Session] | None = None


def make_engine(url: str) -> Engine:
    is_sqlite = url.startswith("sqlite")
    if is_sqlite and ":memory:" not in url:
        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 15} if is_sqlite else {})
    if is_sqlite:

        @event.listens_for(engine, "connect")
        def _pragmas(dbapi_conn, _):  # noqa: ANN001
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")  # SQLite ignores FKs unless asked
            cur.execute("PRAGMA journal_mode=WAL")  # readers don't block the single writer
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.execute("PRAGMA busy_timeout=15000")
            cur.close()

    return engine


def init_engine(url: str | None = None) -> Engine:
    global _engine, _factory
    _engine = make_engine(url or get_settings().database_url)
    _factory = sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_engine() -> Engine:
    return _engine or init_engine()


def session_factory() -> sessionmaker[Session]:
    if _factory is None:
        init_engine()
    assert _factory is not None
    return _factory


def get_db() -> Iterator[Session]:
    db = session_factory()()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
