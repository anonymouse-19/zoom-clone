"""
`meeting_invitees` table: the email addresses a scheduled meeting was sent to.

One-to-many from `meetings`. An email can be invited to many meetings, but only once per
meeting (enforced by the UNIQUE(meeting_id, email) constraint).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.meeting import Meeting


class MeetingInvitee(Base):
    __tablename__ = "meeting_invitees"
    # The composite unique constraint also creates an index starting with meeting_id,
    # which serves "list this meeting's invitees" with no extra index needed.
    __table_args__ = (UniqueConstraint("meeting_id", "email"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    # Stored lowercased by the service layer, so "A@x.com" and "a@x.com" are the same invitee.
    email: Mapped[str] = mapped_column(String(255))
    name: Mapped[str | None] = mapped_column(String(100))

    meeting: Mapped[Meeting] = relationship(back_populates="invitees")
