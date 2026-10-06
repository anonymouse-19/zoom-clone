"""
Builds an .ics calendar file (the iCalendar format, RFC 5545) for a scheduled meeting.
Opening the file adds the meeting to Outlook, Apple Calendar or Google Calendar, with no
OAuth or calendar API needed.

Called by: routers/meetings.py for GET /api/meetings/{code}/ics.
"""

from datetime import datetime

from app.models import Meeting
from app.services.errors import ConflictError
from app.services.invitations import build_invitation_text, build_invite_link
from app.services.meeting_service import planned_end

# iCalendar UTC timestamps look like 20261008T093000Z (the Z means UTC).
ICS_UTC_FORMAT = "%Y%m%dT%H%M%SZ"
# RFC 5545: a content line may be at most 75 bytes; longer lines are "folded".
MAX_LINE_BYTES = 75
# Identifies which program produced the file. Required by the format.
PRODUCT_ID = "-//Zoom Clone//Meetings//EN"


def build_ics(meeting: Meeting, now: datetime) -> str:
    """The full .ics file for `meeting`. `now` is the file's creation stamp (DTSTAMP)."""
    if meeting.start_time is None:
        raise ConflictError("Only meetings with a scheduled time can be added to a calendar")

    invite_link = build_invite_link(meeting.meeting_code, meeting.invite_token)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODUCT_ID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        # A stable UID means re-importing updates the event instead of duplicating it.
        f"UID:meeting-{meeting.meeting_code}@zoom-clone",
        f"DTSTAMP:{now.strftime(ICS_UTC_FORMAT)}",
        f"DTSTART:{meeting.start_time.strftime(ICS_UTC_FORMAT)}",
        f"DTEND:{planned_end(meeting).strftime(ICS_UTC_FORMAT)}",
        f"SUMMARY:{_escape_text(meeting.title)}",
        f"DESCRIPTION:{_escape_text(build_invitation_text(meeting))}",
        f"LOCATION:{_escape_text(invite_link)}",
        f"URL:{invite_link}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    # The format requires CRLF ("\r\n") line endings, including after the last line.
    return "\r\n".join(_fold_line(line) for line in lines) + "\r\n"


def _escape_text(text: str) -> str:
    """Escape the characters that have a special meaning in iCalendar text values.

    The backslash must be escaped first, or we'd double-escape the ones we add.
    """
    text = text.replace("\\", "\\\\")
    text = text.replace(";", "\\;")
    text = text.replace(",", "\\,")
    text = text.replace("\n", "\\n")
    return text


def _fold_line(line: str) -> str:
    """Split a line longer than 75 bytes into pieces. Each continuation line starts with
    a single space, which calendar apps strip when they join the pieces back together.

    We count bytes (UTF-8), not characters, and never split inside a character.
    """
    pieces: list[str] = []
    current_piece = ""
    for character in line:
        # Continuation lines lose one byte to their leading space.
        byte_limit = MAX_LINE_BYTES if not pieces else MAX_LINE_BYTES - 1
        if len((current_piece + character).encode("utf-8")) > byte_limit:
            pieces.append(current_piece)
            current_piece = character
        else:
            current_piece += character
    pieces.append(current_piece)
    return "\r\n ".join(pieces)
