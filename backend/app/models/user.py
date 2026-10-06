"""
`users` table: people with an account (the seeded default user and a few colleagues).

Guests who join by link have no row here; they exist only as `participants` rows.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.types import UTCDateTime, utc_now

if TYPE_CHECKING:
    # Imported only for type hints, which avoids a circular import at runtime.
    from app.models.meeting import Meeting

# The app has no login, so new users default to the timezone of the seeded user.
DEFAULT_TIMEZONE = "Asia/Kolkata"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    # Hex colour (e.g. "#0B5CFF") for the initials avatar shown when the camera is off.
    avatar_color: Mapped[str] = mapped_column(String(7))
    # IANA name like "Asia/Kolkata". Times are stored in UTC and converted for display.
    timezone: Mapped[str] = mapped_column(String(64), default=DEFAULT_TIMEZONE)
    # 10-digit Personal Meeting ID. Regular meeting codes are 11 digits, so the two
    # can never collide.
    personal_meeting_id: Mapped[str] = mapped_column(String(10), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)

    hosted_meetings: Mapped[list[Meeting]] = relationship(back_populates="host")
