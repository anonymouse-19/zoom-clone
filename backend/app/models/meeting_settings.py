"""
`meeting_settings` table: per-meeting options (waiting room, mute on entry, ...).

One-to-one with `meetings`: the primary key *is* the foreign key, so a meeting can have
at most one settings row. Kept in its own table so the hot `meetings` table (scanned by
every dashboard query) stays narrow, and options can grow without touching it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import ScreenSharePermission
from app.models.types import string_enum

if TYPE_CHECKING:
    from app.models.meeting import Meeting


class MeetingSettings(Base):
    __tablename__ = "meeting_settings"

    # INTERVIEW: PK = FK enforces one-to-one at the database level. A second settings
    # row for the same meeting would violate the primary key.
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True
    )
    waiting_room_enabled: Mapped[bool] = mapped_column(default=False)
    mute_on_entry: Mapped[bool] = mapped_column(default=False)
    video_on_entry_host: Mapped[bool] = mapped_column(default=True)
    video_on_entry_participant: Mapped[bool] = mapped_column(default=True)
    allow_join_before_host: Mapped[bool] = mapped_column(default=False)
    allow_screen_share: Mapped[ScreenSharePermission] = mapped_column(
        string_enum(ScreenSharePermission, "screen_share_permission"),
        default=ScreenSharePermission.ALL,
    )
    chat_enabled: Mapped[bool] = mapped_column(default=True)

    meeting: Mapped[Meeting] = relationship(back_populates="settings")
