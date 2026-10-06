"""
The declarative base class every model inherits from.

Called by: every model file, db.py, and alembic/env.py (via Base.metadata).
"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

# Predictable names for every constraint the DB creates. Without a convention, SQLite
# constraints are unnamed, and Alembic can't later drop or alter an unnamed constraint.
# With it, the CHECK on meetings.status is always called "ck_meetings_meeting_status".
NAMING_CONVENTION = {
    "pk": "pk_%(table_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
}


class Base(DeclarativeBase):
    """All tables register themselves on this metadata, which Alembic compares against
    the live database to generate migrations."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)
