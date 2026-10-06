"""
`chat_messages` table: in-meeting chat, persisted so it survives refreshes and can be
exported in the post-meeting summary.

Sender and recipient are *participant* ids (a join session), not user ids, because
guests have no user row and chat must work for them too.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.types import UTCDateTime, utc_now

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.participant import Participant


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        # Serves "chat history for meeting X in order", used on join and in the summary.
        Index("ix_chat_messages_meeting_id_sent_at", "meeting_id", "sent_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    sender_participant_id: Mapped[int] = mapped_column(
        ForeignKey("participants.id", ondelete="CASCADE")
    )
    # Null = sent to everyone. Set = a private message to one participant.
    # INTERVIEW: CASCADE, not SET NULL. SET NULL would turn a private message into a
    # message "to everyone" if the recipient row were ever deleted, leaking it.
    recipient_participant_id: Mapped[int | None] = mapped_column(
        ForeignKey("participants.id", ondelete="CASCADE")
    )
    body: Mapped[str] = mapped_column(Text)
    sent_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utc_now)

    meeting: Mapped[Meeting] = relationship(back_populates="messages")
    # Two foreign keys point at `participants`, so each relationship must say which one it uses.
    sender: Mapped[Participant] = relationship(foreign_keys=[sender_participant_id])
    recipient: Mapped[Participant | None] = relationship(foreign_keys=[recipient_participant_id])
