"""
`meetings` table: one row per meeting, whether instant, scheduled, or a personal room.

The central table. Settings, invitees, participants, chat and events all point here
with ON DELETE CASCADE, so deleting a meeting cleans up everything that belongs to it.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import MeetingStatus, MeetingType, Recurrence
from app.models.types import UTCDateTime, string_enum, utc_now

if TYPE_CHECKING:
    from app.models.chat_message import ChatMessage
    from app.models.meeting_event import MeetingEvent
    from app.models.meeting_invitee import MeetingInvitee
    from app.models.meeting_settings import MeetingSettings
    from app.models.participant import Participant
    from app.models.user import User

DEFAULT_DURATION_MINUTES = 60


class Meeting(Base):
    __tablename__ = "meetings"
    __table_args__ = (
        # INTERVIEW: serves "my meetings, ordered by time", the dashboard's main query.
        # host_id comes first because the query filters on it (equality), then sorts or
        # ranges on start_time.
        Index("ix_meetings_host_id_start_time", "host_id", "start_time"),
        # Serves "all live meetings" and "upcoming = status 'scheduled'".
        Index("ix_meetings_status", "status"),
        CheckConstraint("duration_minutes > 0", name="duration_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # 11 digits (shown as "XXX XXXX XXXX"), or the host's 10-digit PMI for a personal
    # room. Generated server-side only. `unique=True` creates the unique index lookups use.
    meeting_code: Mapped[str] = mapped_column(String(11), unique=True)
    # RESTRICT: a user who still hosts meetings can't be deleted out from under them.
    host_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[MeetingType] = mapped_column(string_enum(MeetingType, "meeting_type"))
    status: Mapped[MeetingStatus] = mapped_column(string_enum(MeetingStatus, "meeting_status"))
    # Null for instant meetings and personal rooms, which have no planned time.
    start_time: Mapped[datetime | None] = mapped_column(UTCDateTime)
    duration_minutes: Mapped[int] = mapped_column(default=DEFAULT_DURATION_MINUTES)
    # A label only ("repeats weekly"); see Recurrence in enums.py.
    # server_default (a default written into the table itself) is what lets the
    # migration add this NOT NULL column to a table that already has rows.
    recurrence: Mapped[Recurrence] = mapped_column(
        string_enum(Recurrence, "recurrence"),
        default=Recurrence.NONE,
        server_default=Recurrence.NONE.value,
    )
    # The scheduler's IANA timezone. Used only to *display* the time the way it was
    # entered; the instant itself is start_time, in UTC.
    timezone: Mapped[str] = mapped_column(String(64))
    passcode: Mapped[str] = mapped_column(String(10))
    # Random token for invite links (/j/{code}?tk=...), so the link works without
    # exposing the passcode itself.
    invite_token: Mapped[str] = mapped_column(String(64), unique=True)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now, onupdate=utc_now)

    host: Mapped[User] = relationship(back_populates="hosted_meetings")

    # passive_deletes=True: let the database's ON DELETE CASCADE remove children,
    # instead of SQLAlchemy loading every child row just to delete it one by one.
    settings: Mapped[MeetingSettings] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", passive_deletes=True
    )
    invitees: Mapped[list[MeetingInvitee]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", passive_deletes=True
    )
    participants: Mapped[list[Participant]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Participant.joined_at",
    )
    messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChatMessage.sent_at",
    )
    events: Mapped[list[MeetingEvent]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="MeetingEvent.created_at",
    )
