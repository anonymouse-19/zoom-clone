"""
Shared pytest fixtures. pytest finds this file automatically and gives every test file
access to the fixtures defined here.
"""

import os

# These must be set BEFORE any `app` module is imported: settings are read once and
# cached, and app.db builds its engine at import time. This keeps the test run from
# ever touching (or seeding) the developer's real zoom_clone.db.
os.environ["DATABASE_URL"] = "sqlite://"  # in-memory; tests needing a DB use db_session
os.environ["SEED_ON_STARTUP"] = "false"
os.environ["FRONTEND_URL"] = "http://frontend.test"

from collections.abc import Iterator  # noqa: E402  (must come after the env setup above)
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import Engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.db import build_engine, build_session_factory  # noqa: E402
from app.deps import DEFAULT_USER_ID, get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base, User  # noqa: E402
from tests.factories import make_user  # noqa: E402


@pytest.fixture
def db_engine(tmp_path: Path) -> Iterator[Engine]:
    """A brand-new SQLite file per test, with all tables created.

    A real file (not :memory:) so the same pragmas (foreign keys, WAL) apply as in
    production. pytest deletes tmp_path afterwards, so tests never share data.
    """
    engine = build_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine: Engine) -> Iterator[Session]:
    """A session on the per-test database, configured exactly like the app's sessions.
    Tests use it to set up rows and to check what the API wrote."""
    session = build_session_factory(db_engine)()
    yield session
    session.close()


@pytest.fixture
def client(db_engine: Engine) -> TestClient:
    """An in-process HTTP client for a fresh app that uses the per-test database.

    TestClient calls the app directly in memory (no real network or running server).
    `dependency_overrides` swaps get_db for a version bound to the test database. This
    is the same dependency-injection mechanism the routes use, put to work for testing.
    """
    app = create_app()
    session_factory = build_session_factory(db_engine)

    def get_test_db() -> Iterator[Session]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = get_test_db
    return TestClient(app)


@pytest.fixture
def me(db_session: Session) -> User:
    """The "logged-in" user: id=1, which is who get_current_user returns."""
    return make_user(
        db_session,
        id=DEFAULT_USER_ID,
        name="Alex Morgan",
        email="alex@example.com",
        personal_meeting_id="1234567890",
    )
