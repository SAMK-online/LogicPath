import os
import secrets
from pathlib import Path

# Must be set before app modules read settings.
os.environ["SESSION_SECRET"] = secrets.token_urlsafe(48)
os.environ["ENV"] = "test"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["FRONTEND_ORIGIN"] = "http://localhost:5173"
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.db import session as db_session
from app.db.seed import seed_catalog

ORIGIN = "http://localhost:5173"
BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture()
def engine():
    """Fresh in-memory SQLite per test, built by running the real Alembic migrations."""
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(eng, "connect")
    def _fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    with eng.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")
    return eng


@pytest.fixture()
def db(engine):
    factory = sessionmaker(engine, expire_on_commit=False)
    db_session._engine, db_session._factory = engine, factory
    with factory() as s:
        seed_catalog(s, get_settings().fixtures_dir)
    with factory() as s:
        yield s


@pytest.fixture()
def app(db):
    from app.main import create_app
    limiter.reset()
    return create_app()


@pytest.fixture()
def client(app):
    with TestClient(app, headers={"Origin": ORIGIN}) as c:
        yield c


def register(client, email="ada@example.com", name="Ada Lovelace", password="correct-horse-battery"):
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": password, "confirm_password": password})
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture()
def auth(client):
    """Registered + logged-in client; returns (client, csrf_headers)."""
    data = register(client)
    return client, {"X-CSRF-Token": data["csrf_token"]}
