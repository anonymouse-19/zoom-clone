"""
`participants` table: one row per *join session*, not per person.

If someone joins, drops, and rejoins, that's two rows. That gives an accurate attendance
history (every join/leave time) for the post-meeting summary, and gives each live
connection its own id to address WebRTC signaling to.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import ParticipantRole, ParticipantStatus
from app.models.types import UTCDateTime, string_enum, utc_now

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.user import User


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (
        # Serves "who is currently admitted / waiting in meeting X?", asked on every
        # join and by the host's waiting-room list.
        Index("ix_participants_meeting_id_status", "meeting_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    # Null for guests (no account). SET NULL: deleting a user keeps the attendance
    # history; the row still has display_name.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # Copied at join time, so later name changes don't rewrite past attendance.
    display_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[ParticipantRole] = mapped_column(string_enum(ParticipantRole, "participant_role"))
    status: Mapped[ParticipantStatus] = mapped_column(
        string_enum(ParticipantStatus, "participant_status")
    )
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)
    left_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # INTERVIEW: a random secret handed to whoever created this join session. The
    # WebSocket connection must present it (Phase 5), so nobody can connect as another
    # participant (e.g. the host) just by guessing their numeric id.
    # Nullable because seeded, historical rows never had a live connection.
    session_token: Mapped[str | None] = mapped_column(String(64), unique=True)

    meeting: Mapped[Meeting] = relationship(back_populates="participants")
    user: Mapped[User | None] = relationship()
