"""
Request and response shapes for meetings.

Request models validate what the client sends. If validation fails, FastAPI answers
422 with the exact field and reason, before our code runs. Response models define
exactly what we send back, so internal columns can never leak by accident.

Called by: routers/meetings.py (and services, which receive validated request models).
"""

import re
from datetime import datetime, timedelta
from typing import Annotated, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
)

from app.models import Meeting
from app.models.enums import MeetingStatus, MeetingType, Recurrence, ScreenSharePermission
from app.models.types import utc_now
from app.schemas.user import HostOut
from app.services.attendance import count_distinct_attendees
from app.services.codes import format_meeting_code
from app.services.invitations import build_invitation_text, build_invite_link

MAX_TITLE_LENGTH = 200
MAX_DESCRIPTION_LENGTH = 2000
# Zoom's scheduler caps a meeting at 24 hours.
MAX_DURATION_MINUTES = 24 * 60
DEFAULT_DURATION_MINUTES = 60
MAX_INVITEES = 100
# A start time may be slightly in the past: the user picked "now" a few seconds before
# pressing Save, and their clock may be a little off from ours.
START_TIME_GRACE = timedelta(minutes=1)
# A deliberately simple shape check ("something@something.something"). The only real
# way to verify an email address is to send it a message.
SIMPLE_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------------------------------------------------------------------
# Reusable validated field types. Create and Update share them, so the rules
# are written once.
# ---------------------------------------------------------------------------


def _check_timezone(name: str) -> str:
    """Accept only real IANA zone names like "Asia/Kolkata"."""
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ValueError(f"Unknown time zone: {name}") from error
    return name


def _check_not_in_past(moment: datetime) -> datetime:
    if moment < utc_now() - START_TIME_GRACE:
        raise ValueError("Start time can't be in the past")
    return moment


def _normalize_email(email: str) -> str:
    """Lowercase and shape-check an email, so "Sam@X.com" and "sam@x.com" are one invitee."""
    cleaned = email.strip().lower()
    if not SIMPLE_EMAIL_PATTERN.match(cleaned):
        raise ValueError(f"Not a valid email address: {email}")
    return cleaned


Title = Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_TITLE_LENGTH)]
Description = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=MAX_DESCRIPTION_LENGTH)
]
DurationMinutes = Annotated[int, Field(ge=1, le=MAX_DURATION_MINUTES)]
TimezoneName = Annotated[str, AfterValidator(_check_timezone)]
# AwareDatetime rejects times without a timezone ("2030-01-01T10:00"), so the server
# never has to guess which zone the client meant.
FutureStartTime = Annotated[AwareDatetime, AfterValidator(_check_not_in_past)]
Passcode = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9]{1,10}$")]
InviteeEmail = Annotated[str, AfterValidator(_normalize_email)]


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------


class MeetingSettingsData(BaseModel):
    """Per-meeting options. Used for requests and responses alike.

    In a PATCH, only the fields the client actually sent are applied
    (see `model_dump(exclude_unset=True)` in meeting_service.update_meeting).
    """

    model_config = ConfigDict(from_attributes=True)

    waiting_room_enabled: bool = False
    mute_on_entry: bool = False
    video_on_entry_host: bool = True
    video_on_entry_participant: bool = True
    allow_join_before_host: bool = False
    allow_screen_share: ScreenSharePermission = ScreenSharePermission.ALL
    chat_enabled: bool = True


class InstantMeetingRequest(BaseModel):
    """Body of POST /api/meetings/instant. Every field is optional."""

    # True = start the host's Personal Meeting Room instead of a new one-off meeting.
    use_personal_meeting_id: bool = False
    # Empty → "<host name>'s Zoom Meeting". Set by "Start again" on a past meeting.
    title: Title = ""


class ScheduleMeetingRequest(BaseModel):
    """Body of POST /api/meetings."""

    # Empty title → "<host name>'s Zoom Meeting", like Zoom's default.
    title: Title = ""
    description: Description = ""
    start_time: FutureStartTime
    duration_minutes: DurationMinutes = DEFAULT_DURATION_MINUTES
    timezone: TimezoneName
    recurrence: Recurrence = Recurrence.NONE
    # None → the server generates one.
    passcode: Passcode | None = None
    settings: MeetingSettingsData = Field(default_factory=MeetingSettingsData)
    invitees: list[InviteeEmail] = Field(default_factory=list, max_length=MAX_INVITEES)


class UpdateMeetingRequest(BaseModel):
    """Body of PATCH /api/meetings/{code}. Send only the fields you want to change."""

    title: Title | None = None
    description: Description | None = None
    start_time: FutureStartTime | None = None
    duration_minutes: DurationMinutes | None = None
    timezone: TimezoneName | None = None
    recurrence: Recurrence | None = None
    passcode: Passcode | None = None
    settings: MeetingSettingsData | None = None
    # When sent, this list *replaces* the invitee list.
    invitees: list[InviteeEmail] | None = Field(default=None, max_length=MAX_INVITEES)


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------


class InviteeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email: str
    name: str | None


class MeetingListItem(BaseModel):
    """One row in a meetings list (dashboard, Meetings page)."""

    meeting_code: str
    formatted_code: str  # "123 4567 8901", for display
    title: str
    type: MeetingType
    status: MeetingStatus
    start_time: datetime | None
    duration_minutes: int
    timezone: str
    recurrence: Recurrence
    started_at: datetime | None
    ended_at: datetime | None
    host: HostOut
    # Distinct people, not join sessions (a rejoin isn't a second attendee).
    attendee_count: int

    @classmethod
    def from_meeting(cls, meeting: Meeting) -> Self:
        return cls(**_list_item_fields(meeting))


class MeetingDetail(MeetingListItem):
    """Everything about one meeting: details page, invitation, after create/edit."""

    description: str
    passcode: str
    invite_link: str
    # Ready-to-paste text for the "Copy invitation" button.
    invitation: str
    settings: MeetingSettingsData
    invitees: list[InviteeOut]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_meeting(cls, meeting: Meeting) -> Self:
        return cls(
            **_list_item_fields(meeting),
            description=meeting.description,
            passcode=meeting.passcode,
            invite_link=build_invite_link(meeting.meeting_code, meeting.invite_token),
            invitation=build_invitation_text(meeting),
            settings=MeetingSettingsData.model_validate(meeting.settings),
            invitees=[InviteeOut.model_validate(invitee) for invitee in meeting.invitees],
            created_at=meeting.created_at,
            updated_at=meeting.updated_at,
        )


def _list_item_fields(meeting: Meeting) -> dict[str, object]:
    """The fields shared by MeetingListItem and MeetingDetail, read off the ORM object."""
    return {
        "meeting_code": meeting.meeting_code,
        "formatted_code": format_meeting_code(meeting.meeting_code),
        "title": meeting.title,
        "type": meeting.type,
        "status": meeting.status,
        "start_time": meeting.start_time,
        "duration_minutes": meeting.duration_minutes,
        "timezone": meeting.timezone,
        "recurrence": meeting.recurrence,
        "started_at": meeting.started_at,
        "ended_at": meeting.ended_at,
        "host": HostOut.model_validate(meeting.host),
        "attendee_count": count_distinct_attendees(meeting.participants),
    }
