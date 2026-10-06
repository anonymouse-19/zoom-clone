"""
Behaviors proven in this file:
1. The Alembic migrations build a schema identical to the models (no "drift"). If someone
   edits a model and forgets to write a migration, this test fails.
2. Migrations can be rolled all the way back, leaving no tables behind.
"""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _table_names(database_url: str) -> set[str]:
    engine = create_engine(database_url)
    names = set(inspect(engine).get_table_names())
    engine.dispose()
    return names


def test_migrations_build_the_same_schema_as_the_models(tmp_path: Path) -> None:
    database_url = f"sqlite:///{tmp_path / 'migrated.db'}"
    config = _alembic_config(database_url)

    command.upgrade(config, "head")

    # `check` compares the migrated DB against the models and raises if they differ.
    command.check(config)
    assert "meetings" in _table_names(database_url)


def test_migrations_roll_back_cleanly(tmp_path: Path) -> None:
    database_url = f"sqlite:///{tmp_path / 'migrated.db'}"
    config = _alembic_config(database_url)

    command.upgrade(config, "head")
    command.downgrade(config, "base")

    # Only Alembic's own bookkeeping table remains.
    assert _table_names(database_url) == {"alembic_version"}
