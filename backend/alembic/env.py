"""
Alembic's entry point: runs whenever `alembic upgrade`, `alembic revision`, or
`alembic check` executes. Tells Alembic which database to touch and what the models
look like, so it can generate and apply migrations.

Calls: config.get_settings() (database URL) and app.models (Base.metadata).
"""

from logging.config import fileConfig
from typing import Any

from alembic import context
from sqlalchemy import create_engine, pool

from app.config import get_settings
from app.models import Base
from app.models.types import UTCDateTime

config = context.config

if config.config_file_name is not None:
    # disable_existing_loggers=False: don't silence the app's loggers when migrations
    # run in the same process (e.g. from the test suite).
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# The models' combined schema. `alembic revision --autogenerate` diffs the live DB
# against this to write a migration.
target_metadata = Base.metadata


def _database_url() -> str:
    """An explicit `sqlalchemy.url` (set by tests) wins; otherwise use DATABASE_URL."""
    return config.get_main_option("sqlalchemy.url") or get_settings().database_url


def _render_item(type_: str, obj: Any, autogen_context: Any) -> str | bool:
    """Write our custom UTCDateTime column type into migration files as a plain DateTime.

    Migrations must not import app code: if UTCDateTime were renamed or moved later,
    every old migration file importing it would break. On disk it's an ordinary
    DATETIME anyway; the UTC conversion happens only in Python.
    """
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime()"
    return False  # False = "use Alembic's default rendering"


def run_migrations_offline() -> None:
    """Print the SQL instead of running it (`alembic upgrade head --sql`)."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
        render_item=_render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Connect to the database and apply migrations."""
    # INTERVIEW: a plain engine, NOT app.db.build_engine. Batch migrations on SQLite
    # copy a table and DROP the original; with `PRAGMA foreign_keys=ON` that DROP would
    # fire ON DELETE CASCADE and silently wipe every child table. SQLite leaves foreign
    # keys off by default, which is what we want while migrating.
    engine = create_engine(_database_url(), poolclass=pool.NullPool)

    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite can't ALTER most things in place. Batch mode does
            # "create new table → copy rows → drop old → rename" for us.
            render_as_batch=True,
            render_item=_render_item,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
