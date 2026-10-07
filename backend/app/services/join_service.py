"""
"Can I join this?": turns whatever the user typed or pasted into a meeting code, then
decides whether that meeting can be joined right now.

Called by: routers/meetings.py (GET /api/meetings/resolve) and participant_service.py
(the actual join), so the join screen and the join itself apply the same rules.

There are two "doors" into a meeting (see docs/DECISIONS.md D-045): the host door
(dashboard Start) and the guest door (Join page, invite links). /resolve serves the
guest door, so it answers as a guest would experience the meeting.

Accepted inputs (all resolve to the same meeting):
    "123 4567 8901"   "12345678901"   "123-4567-8901"
    "http://localhost:3000/j/12345678901?tk=<invite token>"
    "https://zoom.us/j/12345678901?pwd=<passcode>"   "localhost:3000/j/12345678901"
"""

import re
import secrets
from dataclasses import dataclass
from enum import StrEnum
from urllib.parse import parse_qs, urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Meeting, User
from app.models.enums import MeetingStatus

# 10 digits (Personal Meeting ID) or 11 digits (regular meeting code).
MEETING_CODE_PATTERN = re.compile(r"\d{10,11}")
# Spaces and dashes people use to group digits: "123 4567 8901", "123-4567-8901".
DIGIT_SEPARATORS = re.compile(r"[\s-]")
# The meeting code inside an invite path: /j/12345678901 (ours and Zoom's) or /room/...
INVITE_PATH_PATTERN = re.compile(r"/(?:j|room)/(\d{10,11})(?:/|$)")


class JoinState(StrEnum):
    """The answer to "can I join?" The frontend shows a different screen for each."""

    READY = "ready"
    WAITING_FOR_HOST = "waiting_for_host"
    ENDED = "ended"
    CANCELLED = "cancelled"
    NOT_FOUND = "not_found"
    INVALID_INPUT = "invalid_input"


# Messages match Zoom's wording where Zoom has one.
JOIN_STATE_MESSAGES = {
    JoinState.READY: "Ready to join",
    JoinState.WAITING_FOR_HOST: "Waiting for the host to start this meeting",
    JoinState.ENDED: "This meeting has ended",
    JoinState.CANCELLED: "This meeting has been cancelled",
    JoinState.NOT_FOUND: "Invalid meeting ID",
    JoinState.INVALID_INPUT: "Enter a meeting ID (10 or 11 digits) or an invite link",
}


@dataclass(frozen=True)
class ParsedJoinInput:
    """What we could pull out of the user's input."""

    meeting_code: str
    invite_token: str | None = None  # from ?tk= in our own invite links
    passcode: str | None = None  # from ?pwd= in Zoom-style links


@dataclass(frozen=True)
class JoinCheck:
    """Result of resolve_join_input(): the state, plus the meeting if one was found."""

    state: JoinState
    meeting: Meeting | None
    passcode_required: bool
    # The current user hosts this meeting. The join page then offers "Start meeting"
    # (the host door) instead of waiting for themselves.
    you_are_host: bool = False


# ---------------------------------------------------------------------------
# Step 1: parse the input
# ---------------------------------------------------------------------------


def parse_join_input(raw_input: str) -> ParsedJoinInput | None:
    """Extract a meeting code (and any credential) from an ID or a link.
    Returns None if the input isn't recognisable as either."""
    text = raw_input.strip()
    if "/" in text:  # IDs never contain a slash; links always do
        return _parse_invite_link(text)

    digits_only = DIGIT_SEPARATORS.sub("", text)
    if MEETING_CODE_PATTERN.fullmatch(digits_only):
        return ParsedJoinInput(meeting_code=digits_only)
    return None


def _parse_invite_link(link: str) -> ParsedJoinInput | None:
    """Pull the code from the path and the token/passcode from the query string."""
    if "://" not in link:
        link = "https://" + link  # so "localhost:3000/j/123..." parses as a URL
    url = urlsplit(link)
    path_match = INVITE_PATH_PATTERN.search(url.path)
    if path_match is None:
        return None

    query = parse_qs(url.query)  # {"tk": ["abc"], "pwd": ["xyz"]}
    return ParsedJoinInput(
        meeting_code=path_match.group(1),
        invite_token=_first_value(query, "tk"),
        passcode=_first_value(query, "pwd"),
    )


def _first_value(query: dict[str, list[str]], key: str) -> str | None:
    values = query.get(key)
    return values[0] if values else None


# ---------------------------------------------------------------------------
# Step 2: decide whether the meeting can be joined
# ---------------------------------------------------------------------------


def join_state_for(meeting: Meeting, *, as_host: bool) -> JoinState:
    """Whether someone coming through the host door (`as_host`) or the guest door can
    join `meeting` right now."""
    if meeting.status == MeetingStatus.CANCELLED:
        return JoinState.CANCELLED
    if meeting.status == MeetingStatus.ENDED:
        return JoinState.ENDED
    if meeting.status == MeetingStatus.LIVE:
        return JoinState.READY

    # Not started yet. The host can always go in (joining starts the meeting). Guests
    # only if the host allowed "join before host", and there's no waiting room: someone
    # has to admit people from a waiting room, and before the host arrives nobody can.
    settings = meeting.settings
    if as_host or (settings.allow_join_before_host and not settings.waiting_room_enabled):
        return JoinState.READY
    return JoinState.WAITING_FOR_HOST


def has_valid_credential(
    meeting: Meeting, *, invite_token: str | None, passcode: str | None
) -> bool:
    """True if the guest presented the right invite token or passcode.

    INTERVIEW: invite links carry a random token instead of the passcode, so the
    passcode itself never sits in links, chat logs or browser history.
    """
    return invite_token_matches(meeting, invite_token) or passcode_matches(meeting, passcode)


def invite_token_matches(meeting: Meeting, invite_token: str | None) -> bool:
    return invite_token is not None and _same_secret(invite_token, meeting.invite_token)


def passcode_matches(meeting: Meeting, passcode: str | None) -> bool:
    return passcode is not None and _same_secret(passcode, meeting.passcode)


def _same_secret(given: str, expected: str) -> bool:
    """Compare in constant time, so response timing reveals nothing about how close a
    guess was. (Encoded to bytes: compare_digest refuses non-ASCII strings.)"""
    return secrets.compare_digest(given.encode(), expected.encode())


def resolve_join_input(db: Session, raw_input: str, user: User | None) -> JoinCheck:
    """Steps 1 + 2 together: what GET /api/meetings/resolve returns."""
    parsed = parse_join_input(raw_input)
    if parsed is None:
        return JoinCheck(state=JoinState.INVALID_INPUT, meeting=None, passcode_required=False)

    meeting = db.scalar(select(Meeting).where(Meeting.meeting_code == parsed.meeting_code))
    if meeting is None:
        return JoinCheck(state=JoinState.NOT_FOUND, meeting=None, passcode_required=False)

    # Only the invite token is checked here, never a passcode: this lookup has no
    # guessing limit, so answering "that passcode is right" would let anyone try
    # passcodes here without limit. Passcodes are checked when joining, which is limited.
    return JoinCheck(
        state=join_state_for(meeting, as_host=False),
        meeting=meeting,
        passcode_required=not invite_token_matches(meeting, parsed.invite_token),
        you_are_host=user is not None and meeting.host_id == user.id,
    )
