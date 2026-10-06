"""
`meeting_events` table: an append-only audit log of what happened in a meeting
(joins, leaves, host mutes, hand raises, ...). Powers the post-meeting summary.

Reactions are NOT logged here: they're ephemeral by design (see docs/DECISIONS.md).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.types import UTCDateTime, utc_now

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.participant import Participant


class MeetingEvent(Base):
    __tablename__ = "meeting_events"
    __table_args__ = (
        # Serves "events for meeting X in time order" for the summary timeline.
        Index("ix_meeting_events_meeting_id_created_at", "meeting_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    # Null for meeting-level events like "meeting_started".
    participant_id: Mapped[int | None] = mapped_column(
        ForeignKey("participants.id", ondelete="SET NULL")
    )
    # A MeetingEventType value. Plain string, no CHECK constraint (see enums.py).
    event_type: Mapped[str] = mapped_column(String(40))
    # Event-specific details, e.g. {"target_participant_id": 7} for "muted_by_host".
    # JSON because each event type carries a different shape, and we never filter on it.
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)

    meeting: Mapped[Meeting] = relationship(back_populates="events")
    participant: Mapped[Participant | None] = relationship()
