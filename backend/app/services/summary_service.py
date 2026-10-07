"""
Post-meeting summary (attendance per person, actual duration, chat transcript) and the
in-meeting chat history.

Called by: routers/meetings.py for /summary and /messages.

A personal room reuses one meeting row across many sessions, so everything here is
limited to the latest session: rows from `meeting.started_at` onward.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import ChatMessage, Meeting, Participant, User
from app.models.enums import ParticipantRole
from app.models.types import utc_now
from app.schemas.chat import ChatMessageOut
from app.schemas.summary import AttendanceSessionOut, AttendeeOut, MeetingSummaryOut
from app.services.attendance import attended, person_key
from app.services.codes import format_meeting_code
from app.services.errors import ConflictError
from app.services.meeting_service import get_meeting_for_viewer

SECONDS_PER_MINUTE = 60


def build_meeting_summary(
    db: Session, meeting_code: str, *, user: User | None, join_ticket: str | None
) -> MeetingSummaryOut:
    """The recap, for the host and people who were in the meeting (attendance and chat
    are private to them)."""
    meeting = get_meeting_for_viewer(db, meeting_code, user=user, join_ticket=join_ticket)
    if meeting.started_at is None:
        raise ConflictError("This meeting hasn't taken place yet")

    # A live meeting has no end yet, so measure up to "now".
    window_end = meeting.ended_at or utc_now()
    sessions = _sessions_in_latest_run(meeting)
    messages = [m for m in _messages_in_latest_run(meeting) if _is_visible_to(m, user)]
    return MeetingSummaryOut(
        meeting_code=meeting.meeting_code,
        formatted_code=format_meeting_code(meeting.meeting_code),
        title=meeting.title,
        host_name=meeting.host.name,
        started_at=meeting.started_at,
        ended_at=meeting.ended_at,
        duration_minutes=_minutes_between(meeting.started_at, window_end),
        attendees=_group_by_person(sessions, window_end, host_user_id=meeting.host_id),
        messages=[ChatMessageOut.from_message(message) for message in messages],
    )


def list_public_messages(
    db: Session, meeting_code: str, *, user: User | None, join_ticket: str | None
) -> list[ChatMessageOut]:
    """Chat history sent "to everyone" in the current/latest run of the meeting, for the
    host and people in the meeting (get_meeting_for_viewer).

    Private messages are never returned here; they're delivered live over the WebSocket.
    """
    meeting = get_meeting_for_viewer(db, meeting_code, user=user, join_ticket=join_ticket)
    public_messages = [
        message
        for message in _messages_in_latest_run(meeting)
        if message.recipient_participant_id is None
    ]
    return [ChatMessageOut.from_message(message) for message in public_messages]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sessions_in_latest_run(meeting: Meeting) -> list[Participant]:
    if meeting.started_at is None:
        return []
    started_at = meeting.started_at
    return [p for p in attended(meeting.participants) if p.joined_at >= started_at]


def _messages_in_latest_run(meeting: Meeting) -> list[ChatMessage]:
    if meeting.started_at is None:
        return []
    started_at = meeting.started_at
    return [m for m in meeting.messages if m.sent_at >= started_at]


def _is_visible_to(message: ChatMessage, user: User | None) -> bool:
    """Public messages are visible to everyone; private ones only to the sender and
    recipient (if they had accounts). A guest who isn't signed in sees public ones only."""
    if message.recipient is None:
        return True
    if user is None:
        return False
    return user.id in (message.sender.user_id, message.recipient.user_id)


def _minutes_between(start: datetime, end: datetime) -> int:
    return round((end - start).total_seconds() / SECONDS_PER_MINUTE)


def _group_by_person(
    sessions: list[Participant], window_end: datetime, *, host_user_id: int
) -> list[AttendeeOut]:
    """Merge join sessions into one entry per person, in order of first arrival."""
    sessions_by_person: dict[str, list[Participant]] = {}
    for session in sorted(sessions, key=lambda participant: participant.joined_at):
        sessions_by_person.setdefault(person_key(session), []).append(session)

    return [
        _attendee_from_sessions(group, window_end, host_user_id=host_user_id)
        for group in sessions_by_person.values()
    ]


def _attendee_from_sessions(
    sessions: list[Participant], window_end: datetime, *, host_user_id: int
) -> AttendeeOut:
    first_session = sessions[0]
    # The meeting's own host is "Host" even after handing the role over mid-meeting;
    # anyone who was handed the role counts as a host too.
    is_meeting_owner = first_session.user_id == host_user_id
    was_ever_host = is_meeting_owner or any(s.role == ParticipantRole.HOST for s in sessions)
    total_minutes = sum(_minutes_between(s.joined_at, s.left_at or window_end) for s in sessions)
    return AttendeeOut(
        display_name=first_session.display_name,
        is_guest=first_session.user_id is None,
        role=ParticipantRole.HOST if was_ever_host else first_session.role,
        sessions=[AttendanceSessionOut(joined_at=s.joined_at, left_at=s.left_at) for s in sessions],
        total_minutes=total_minutes,
    )
