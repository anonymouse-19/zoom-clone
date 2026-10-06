"""
Custom column types shared by all models: UTC-only datetimes and string-backed enums.

Called by: every model file in app/models/.
"""

from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import DateTime, Dialect, Enum
from sqlalchemy.types import TypeDecorator


def utc_now() -> datetime:
    """The current time as a timezone-aware UTC datetime. Used for column defaults."""
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """A DateTime column that only accepts timezone-aware values and always returns UTC.

    SQLite has no real datetime type: it stores text and silently drops timezone info.
    Without this, a time saved as 10:00 IST would come back as a "naive" 10:00 with no
    zone, and we would have no way to know it wasn't UTC.
    """

    impl = DateTime
    # Tells SQLAlchemy this type has no per-instance state, so compiled SQL can be cached.
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        """Python → DB: convert to UTC, then drop the tzinfo (SQLite can't store it)."""
        if value is None:
            return None
        # INTERVIEW: we refuse naive datetimes instead of guessing their zone. A guess
        # would silently shift meeting times by hours for users outside UTC.
        if value.tzinfo is None:
            raise ValueError("UTCDateTime requires a timezone-aware datetime, got a naive one")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        """DB → Python: every stored value is UTC by construction, so re-attach UTC."""
        if value is None:
            return None
        return value.replace(tzinfo=UTC)


def _enum_values(enum_class: type[StrEnum]) -> list[str]:
    """The stored strings for an enum, e.g. ["instant", "scheduled", "personal"]."""
    return [member.value for member in enum_class]


def string_enum(enum_class: type[StrEnum], constraint_name: str) -> Enum:
    """A column type storing an enum's *values* as VARCHAR, guarded by a CHECK constraint.

    - native_enum=False: use VARCHAR, not a database ENUM type (SQLite has none, and
      Postgres ENUMs are painful to change later).
    - create_constraint=True: the DB itself rejects values outside the enum, even from
      raw SQL that bypasses our Python code.
    - values_callable: by default SQLAlchemy stores the member *name* ("INSTANT"); we
      store the value ("instant") so the DB matches what the API sends.
    """
    return Enum(
        enum_class,
        name=constraint_name,
        native_enum=False,
        create_constraint=True,
        values_callable=_enum_values,
        validate_strings=True,
    )
