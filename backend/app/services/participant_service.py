"""
Joining a meeting: checks the rules, then creates the participant row (one per join
session) that the meeting room connects with.

Called by: routers/participants.py.
Calls: join_service (shared join rules), meeting_service (host check, start).

Two doors (docs/DECISIONS.md D-045):
- Host door (`join_as="host"`): the dashboard's Start / New meeting. The caller must
  host the meeting; joining starts it if it hasn't started.
- Guest door (`join_as="guest"`): the Join page and invite links. Needs the invite
  token or the passcode, and may land in the waiting room.
"""

from sqlalchemy.orm import Session

from app.models import Meeting, MeetingEvent, Participant, User
from app.models.enums import (
    JoinAs,
    MeetingEventType,
    MeetingStatus,
    ParticipantRole,
    ParticipantStatus,
)
from app.schemas.participant import JoinMeetingRequest
from app.services import codes
from app.services.errors import ConflictError, ForbiddenError
from app.services.join_service import (
    JOIN_STATE_MESSAGES,
    JoinState,
    has_valid_credential,
    join_state_for,
)
from app.services.meeting_service import get_meeting_by_code, require_host, start_meeting


def join_meeting(
    db: Session, meeting_code: str, user: User, request: JoinMeetingRequest
) -> Participant:
    """Create a join session for `meeting_code`, or raise if the rules say no."""
    meeting = get_meeting_by_code(db, meeting_code)
    is_host_door = request.join_as == JoinAs.HOST

    # Step 1: the host door is only for the host, and opening it starts the meeting.
    if is_host_door:
        require_host(meeting, user)
        if meeting.status == MeetingStatus.SCHEDULED:
            start_meeting(db, meeting_code, user)

    # Step 2: is the meeting joinable right now (not ended, cancelled, or waiting)?
    _require_joinable(meeting, as_host=is_host_door)

    # Step 3: guests must prove they were invited.
    # INTERVIEW: checked on the server; the pre-join screen's passcode box is only UI.
    has_credential = has_valid_credential(
        meeting, invite_token=request.invite_token, passcode=request.passcode
    )
    if not is_host_door and not has_credential:
        raise ForbiddenError("Incorrect meeting passcode")

    # Step 4: create the session (a new row even if this person joined before).
    participant = _new_participant(meeting, user, request.display_name, is_host_door)
    db.add(participant)
    db.commit()
    return participant


def _require_joinable(meeting: Meeting, *, as_host: bool) -> None:
    state = join_state_for(meeting, as_host=as_host)
    if state != JoinState.READY:
        raise ConflictError(JOIN_STATE_MESSAGES[state])


def _new_participant(meeting: Meeting, user: User, display_name: str, is_host: bool) -> Participant:
    """A participant row, plus a "joined" event if they go straight in."""
    # Guests skip the waiting room only if there isn't one; the host never waits.
    goes_to_waiting_room = meeting.settings.waiting_room_enabled and not is_host
    participant = Participant(
        meeting=meeting,
        # Guests are anonymous: even though this browser is "Alex", a guest-door join
        # represents someone else on another device.
        user=user if is_host else None,
        display_name=display_name,
        role=ParticipantRole.HOST if is_host else ParticipantRole.ATTENDEE,
        status=ParticipantStatus.WAITING if goes_to_waiting_room else ParticipantStatus.ADMITTED,
        session_token=codes.generate_session_token(),
    )
    if not goes_to_waiting_room:
        meeting.events.append(
            MeetingEvent(participant=participant, event_type=MeetingEventType.JOINED)
        )
    return participant
