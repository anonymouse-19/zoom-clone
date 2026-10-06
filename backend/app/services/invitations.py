"""
The shareable invite link and the "Copy invitation" text for a meeting.

Called by: schemas/meeting.py (both go into API responses) and services/ics.py (the
calendar file's description). Built here once, so the dialog, the clipboard text and
the calendar entry always say the same thing.
"""

from zoneinfo import ZoneInfo

from app.config import get_settings
from app.models import Meeting
from app.models.enums import Recurrence
from app.services.codes import format_meeting_code

# e.g. "Oct 08, 2026 03:00 PM"
INVITATION_TIME_FORMAT = "%b %d, %Y %I:%M %p"
RECURRENCE_LABELS = {Recurrence.DAILY: "Every day", Recurrence.WEEKLY: "Every week"}


def build_invite_link(meeting_code: str, invite_token: str) -> str:
    """The frontend's invite route plus the token that lets the link skip the passcode.

    e.g. http://localhost:3000/j/12345678901?tk=<invite_token>
    """
    frontend_url = get_settings().frontend_url.rstrip("/")
    return f"{frontend_url}/j/{meeting_code}?tk={invite_token}"


def build_invitation_text(meeting: Meeting) -> str:
    """Zoom-style invitation text, ready to paste into an email or chat."""
    invite_link = build_invite_link(meeting.meeting_code, meeting.invite_token)
    lines = [f"{meeting.host.name} is inviting you to a Zoom meeting.", ""]
    lines.append(f"Topic: {meeting.title}")
    if meeting.start_time is not None:
        local_start = meeting.start_time.astimezone(ZoneInfo(meeting.timezone))
        lines.append(f"Time: {local_start.strftime(INVITATION_TIME_FORMAT)} {meeting.timezone}")
    if meeting.recurrence in RECURRENCE_LABELS:
        lines.append(f"Repeats: {RECURRENCE_LABELS[meeting.recurrence]}")
    lines += [
        "",
        "Join Zoom Meeting",
        invite_link,
        "",
        f"Meeting ID: {format_meeting_code(meeting.meeting_code)}",
        f"Passcode: {meeting.passcode}",
    ]
    return "\n".join(lines)
