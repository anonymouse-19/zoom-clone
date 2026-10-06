"""
Database engine and session factory, plus the SQLite settings applied to every connection.

Called by: deps.py (one session per request, from Phase 2), seed.py, alembic/env.py, tests.
Calls: config.get_settings() for DATABASE_URL.
"""

from sqlite3 import Connection as SQLiteConnection
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


def _apply_sqlite_pragmas(dbapi_connection: Any, _connection_record: Any) -> None:
    """Runs on every new SQLite connection, right after it opens.

    `dbapi_connection` is typed Any because SQLAlchemy passes whichever driver
    connection is in use; we check for sqlite3 before touching it.
    """
    if not isinstance(dbapi_connection, SQLiteConnection):
        return
    cursor = dbapi_connection.cursor()
    # INTERVIEW: SQLite ignores FOREIGN KEY rules unless this is switched on, and the
    # setting is per-connection, not per-database. That's why it runs on every connect.
    cursor.execute("PRAGMA foreign_keys=ON")
    # Write-Ahead Logging: readers don't block the writer and vice versa, which matters
    # because WebSocket handlers and REST requests touch the DB concurrently.
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def build_engine(database_url: str) -> Engine:
    """Create an engine for `database_url`, with SQLite-specific setup when needed."""
    is_sqlite = database_url.startswith("sqlite")
    connect_args = {}
    if is_sqlite:
        # sqlite3 refuses by default to share a connection across threads. FastAPI runs
        # sync routes in a thread pool, and SQLAlchemy's pool hands each request its own
        # connection, so it's safe to turn that check off.
        connect_args["check_same_thread"] = False

    engine = create_engine(database_url, connect_args=connect_args)
    if is_sqlite:
        event.listen(engine, "connect", _apply_sqlite_pragmas)
    return engine


def build_session_factory(bind: Engine) -> sessionmaker[Session]:
    """A factory for Session objects bound to `bind`. Tests use it with their own engine.

    - autoflush=False: SQL is sent only on an explicit flush()/commit(), so the order of
      writes is visible in the code instead of happening implicitly mid-query.
    - expire_on_commit=False: after commit, objects keep their loaded values, so a route
      can commit and then still read `meeting.title` for its response without a re-query.
    """
    return sessionmaker(bind=bind, autoflush=False, expire_on_commit=False)


engine = build_engine(get_settings().database_url)

# Each request/task opens its own session from this factory and closes it when done.
SessionLocal = build_session_factory(engine)
