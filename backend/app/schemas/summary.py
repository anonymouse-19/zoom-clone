"""
Response shape for GET /api/meetings/{code}/summary: the post-meeting recap page.
"""

from datetime import datetime

from pydantic import BaseModel

from app.models.enums import ParticipantRole
from app.schemas.chat import ChatMessageOut


class AttendanceSessionOut(BaseModel):
    """One join → leave interval. `left_at` is None while still in the meeting."""

    joined_at: datetime
    left_at: datetime | None


class AttendeeOut(BaseModel):
    """One person, with every join session they had (several if they rejoined)."""

    display_name: str
    is_guest: bool
    role: ParticipantRole
    sessions: list[AttendanceSessionOut]
    total_minutes: int


class MeetingSummaryOut(BaseModel):
    meeting_code: str
    formatted_code: str
    title: str
    host_name: str
    started_at: datetime
    ended_at: datetime | None  # None if the meeting is still live
    duration_minutes: int  # how long it actually ran, not the planned duration
    attendees: list[AttendeeOut]
    messages: list[ChatMessageOut]
