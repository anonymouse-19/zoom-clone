"""
Database rules for the live meeting room: who may connect, the waiting room, chat,
roles, the audit log, leaving, and ending the meeting from inside the room.

Called by: the realtime/ handler modules (in a worker thread, each call with its own
short session). Like every service, it knows nothing about WebSockets: it raises
ServiceErrors, and the caller decides how to tell the browser.
"""

import secrets
from dataclasses import dataclass
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import ChatMessage, Meeting, MeetingEvent, Participant
from app.models.enums import (
    MeetingEventType,
    MeetingStatus,
    ParticipantRole,
    ParticipantStatus,
    ScreenSharePermission,
)
from app.models.types import utc_now
from app.schemas.chat import ChatMessageOut
from app.services.errors import ConflictError, ForbiddenError, NotFoundError
from app.services.meeting_service import finish_meeting, get_meeting_by_code


@dataclass(frozen=True)
class RoomIdentity:
    """Who a connection belongs to, once authenticated, plus the meeting settings the
    room needs. Plain values (not database objects), so they can be used after the
    session that loaded them has closed."""

    participant_id: int
    display_name: str
    role: ParticipantRole
    is_waiting: bool
    mute_on_entry: bool
    chat_enabled: bool
    screen_share: ScreenSharePermission


def authenticate_participant(
    db: Session, *, meeting_code: str, participant_id: int, session_token: str
) -> RoomIdentity:
    """Check that this connection really is this participant, and may be in the room now."""
    meeting = get_meeting_by_code(db, meeting_code)
    participant = db.get(Participant, participant_id)

    # Step 1: prove identity. Same message for every failure, so a guesser learns nothing.
    is_this_meeting = participant is not None and participant.meeting_id == meeting.id
    if not is_this_meeting or not _token_matches(participant, session_token):
        raise ForbiddenError("This meeting link has expired. Join the meeting again.")

    # Step 2: the meeting must be running.
    if meeting.status == MeetingStatus.SCHEDULED:
        raise ConflictError("The host hasn't started this meeting yet")
    if meeting.status == MeetingStatus.CANCELLED:
        raise ConflictError("This meeting has been cancelled")
    if meeting.status != MeetingStatus.LIVE:
        raise ConflictError("This meeting has ended")

    # Step 3: this join session must be in the meeting, or waiting to be let in.
    if participant.status not in (ParticipantStatus.ADMITTED, ParticipantStatus.WAITING):
        raise ForbiddenError("You've left this meeting. Join again to come back.")

    settings = meeting.settings
    return RoomIdentity(
        participant_id=participant.id,
        display_name=participant.display_name,
        role=participant.role,
        is_waiting=participant.status == ParticipantStatus.WAITING,
        mute_on_entry=settings.mute_on_entry,
        chat_enabled=settings.chat_enabled,
        screen_share=settings.allow_screen_share,
    )


def _token_matches(participant: Participant | None, session_token: str) -> bool:
    if participant is None or participant.session_token is None:
        return False
    # INTERVIEW: compare_digest takes the same time however many characters match, so an
    # attacker can't recover the token one character at a time by timing failed tries.
    # (Encoded to bytes: compare_digest refuses non-ASCII strings.)
    return secrets.compare_digest(participant.session_token.encode(), session_token.encode())


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


def chat_history(db: Session, *, meeting_code: str, participant_id: int) -> list[ChatMessageOut]:
    """This run's chat as one participant may see it: everything sent to everyone, plus
    private messages they sent or received."""
    meeting = get_meeting_by_code(db, meeting_code)
    if meeting.started_at is None:
        return []
    visible_to_participant = or_(
        ChatMessage.recipient_participant_id.is_(None),
        ChatMessage.sender_participant_id == participant_id,
        ChatMessage.recipient_participant_id == participant_id,
    )
    messages = db.scalars(
        select(ChatMessage)
        .where(
            ChatMessage.meeting_id == meeting.id,
            ChatMessage.sent_at >= meeting.started_at,
            visible_to_participant,
        )
        .order_by(ChatMessage.sent_at)
    ).all()
    return [ChatMessageOut.from_message(message) for message in messages]


def save_chat_message(
    db: Session, *, sender_id: int, recipient_id: int | None, text: str
) -> ChatMessageOut:
    """Store one chat message (recipient None = to everyone) and return it as sent."""
    sender = _participant(db, sender_id)
    message = ChatMessage(
        meeting_id=sender.meeting_id,
        sender_participant_id=sender.id,
        recipient_participant_id=recipient_id,
        body=text,
    )
    db.add(message)
    db.commit()
    return ChatMessageOut.from_message(message)


# ---------------------------------------------------------------------------
# Waiting room, removal, roles
# ---------------------------------------------------------------------------


def admit_participant(db: Session, *, participant_id: int) -> None:
    participant = _participant(db, participant_id)
    if participant.status != ParticipantStatus.WAITING:
        raise ConflictError(f"{participant.display_name} isn't in the waiting room")
    participant.status = ParticipantStatus.ADMITTED
    # Attendance counts from when they actually got in, not from when they knocked.
    participant.joined_at = utc_now()
    _add_event(db, participant, MeetingEventType.ADMITTED)
    db.commit()


def deny_participant(db: Session, *, participant_id: int) -> None:
    """Turn away someone in the waiting room. They never got in, so their row is deleted
    (attendance only lists people who were in the meeting); the audit log keeps a note."""
    participant = _participant(db, participant_id)
    if participant.status != ParticipantStatus.WAITING:
        raise ConflictError(f"{participant.display_name} isn't in the waiting room")
    db.add(
        MeetingEvent(
            meeting_id=participant.meeting_id,
            event_type=MeetingEventType.REMOVED,
            payload={"display_name": participant.display_name, "while_waiting": True},
        )
    )
    db.delete(participant)
    db.commit()


def remove_participant(db: Session, *, participant_id: int) -> None:
    participant = _participant(db, participant_id)
    participant.status = ParticipantStatus.REMOVED
    participant.left_at = utc_now()
    _add_event(db, participant, MeetingEventType.REMOVED)
    db.commit()


def set_role(db: Session, *, participant_id: int, role: ParticipantRole) -> None:
    participant = _participant(db, participant_id)
    participant.role = role
    _add_event(db, participant, MeetingEventType.ROLE_CHANGED, {"role": role.value})
    db.commit()


def log_event(
    db: Session,
    *,
    participant_id: int,
    event_type: MeetingEventType,
    payload: dict[str, Any] | None = None,
) -> None:
    """Add one entry to the meeting's audit log (hand raised, screen share, muted, ...)."""
    _add_event(db, _participant(db, participant_id), event_type, payload)
    db.commit()


# ---------------------------------------------------------------------------
# Leaving and ending
# ---------------------------------------------------------------------------


def record_leave(db: Session, *, participant_id: int) -> bool:
    """Mark a join session as over. Safe to call on every disconnect:
    - in the meeting → "left", with the time;
    - still waiting → never got in, so the row is deleted;
    - already over (left, removed, or the meeting ended) → nothing to do.

    Returns True if this was the last person in the meeting, which has now ended."""
    participant = db.get(Participant, participant_id)
    if participant is None:
        return False
    if participant.status == ParticipantStatus.WAITING:
        db.delete(participant)
        db.commit()
        return False
    if participant.status != ParticipantStatus.ADMITTED:
        return False
    participant.status = ParticipantStatus.LEFT
    participant.left_at = utc_now()
    _add_event(db, participant, MeetingEventType.LEFT)
    db.commit()
    return _end_if_everyone_left(db, participant.meeting)


def _end_if_everyone_left(db: Session, meeting: Meeting) -> bool:
    """As in Zoom, a meeting is over once the last person in it has left.

    INTERVIEW: "in the meeting" means an admitted row. A dropped connection keeps its
    row admitted during the reconnect grace period, so a host alone in the meeting who
    refreshes the page doesn't end it: the row only becomes "left" if they don't return.
    """
    if meeting.status != MeetingStatus.LIVE:
        return False  # already ended by the host
    someone_is_in = any(
        participant.status == ParticipantStatus.ADMITTED for participant in meeting.participants
    )
    if someone_is_in:
        return False
    # Guests who joined before the host all left before the host came: the meeting goes
    # back to "waiting for the host", so the host can still start it later.
    finish_meeting(db, meeting, can_start_again=not _host_came(meeting))
    return True


def _host_came(meeting: Meeting) -> bool:
    """True if someone held the host role in this run of the meeting (since it started)."""
    started_at = meeting.started_at
    return any(
        participant.role == ParticipantRole.HOST
        and started_at is not None
        and participant.joined_at >= started_at
        for participant in meeting.participants
    )


def end_meeting_as_host(db: Session, *, meeting_code: str, participant_id: int) -> None:
    """End the meeting for everyone, if this participant holds the host role.

    Checked by in-meeting role (not user account), because the host can hand the role
    to a guest. The ending itself is meeting_service.finish_meeting, the same code the
    REST endpoint uses.
    """
    participant = _participant(db, participant_id)
    if participant.role != ParticipantRole.HOST:
        raise ForbiddenError("Only the host can end the meeting for everyone")
    finish_meeting(db, get_meeting_by_code(db, meeting_code))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _participant(db: Session, participant_id: int) -> Participant:
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise NotFoundError("That participant isn't in this meeting")
    return participant


def _add_event(
    db: Session,
    participant: Participant,
    event_type: MeetingEventType,
    payload: dict[str, Any] | None = None,
) -> None:
    db.add(
        MeetingEvent(
            meeting_id=participant.meeting_id,
            participant_id=participant.id,
            event_type=event_type,
            payload=payload or {},
        )
    )
