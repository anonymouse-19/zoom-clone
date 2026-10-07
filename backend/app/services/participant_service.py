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
from app.services.attempt_limiter import AttemptLimiter
from app.services.errors import ConflictError, ForbiddenError, UnauthorizedError
from app.services.join_service import (
    JOIN_STATE_MESSAGES,
    JoinState,
    invite_token_matches,
    join_state_for,
    passcode_matches,
)
from app.services.meeting_service import (
    get_meeting_by_code,
    mark_started,
    require_host,
    start_meeting,
)


def join_meeting(
    db: Session,
    meeting_code: str,
    user: User | None,
    request: JoinMeetingRequest,
    *,
    is_locked: bool,
    passcode_attempts: AttemptLimiter,
) -> Participant:
    """Create a join session for `meeting_code`, or raise if the rules say no.

    `user` is None for a guest who isn't signed in."""
    meeting = get_meeting_by_code(db, meeting_code)
    is_host_door = request.join_as == JoinAs.HOST

    # Step 1: the host door is only for the host, and opening it starts the meeting.
    if is_host_door:
        if user is None:
            raise UnauthorizedError("Log in as the host to start this meeting")
        require_host(meeting, user)
        if meeting.status == MeetingStatus.SCHEDULED:
            start_meeting(db, meeting_code, user)

    # Step 2: is the meeting joinable right now (not ended, cancelled, or waiting)?
    _require_joinable(meeting, as_host=is_host_door)
    if is_locked and not is_host_door:
        raise ConflictError("This meeting has been locked by the host")

    # Step 3: guests must prove they were invited, with the invite link's token or the
    # passcode. INTERVIEW: checked on the server; the passcode box is only UI.
    if not is_host_door and not invite_token_matches(meeting, request.invite_token):
        _check_passcode(meeting, request.passcode, passcode_attempts)

    # Step 3b: a guest who may join before the host (the host allowed it) starts the
    # meeting, as in Zoom. Otherwise the room would refuse them: it only opens for
    # running meetings. Done after the passcode check, so a wrong guess starts nothing.
    if meeting.status == MeetingStatus.SCHEDULED:
        mark_started(meeting)

    # Step 4: create the session (a new row even if this person joined before).
    participant = _new_participant(meeting, user, request.display_name, is_host_door)
    db.add(participant)
    db.commit()
    return participant


def _check_passcode(meeting: Meeting, passcode: str | None, attempts: AttemptLimiter) -> None:
    """Accept the right passcode; count wrong ones. After too many wrong passcodes for
    this meeting, passcode joins are refused for a while (invite links still work), so a
    short passcode can't be found by trying every combination."""
    key = str(meeting.id)
    attempts.check(key)
    if not passcode_matches(meeting, passcode):
        attempts.record_failure(key)
        raise ForbiddenError("Incorrect meeting passcode")


def _require_joinable(meeting: Meeting, *, as_host: bool) -> None:
    state = join_state_for(meeting, as_host=as_host)
    if state != JoinState.READY:
        raise ConflictError(JOIN_STATE_MESSAGES[state])


def _new_participant(
    meeting: Meeting, user: User | None, display_name: str, is_host: bool
) -> Participant:
    """A participant row, plus a "joined" event if they go straight in."""
    # Guests skip the waiting room only if there isn't one; the host never waits.
    goes_to_waiting_room = meeting.settings.waiting_room_enabled and not is_host
    participant = Participant(
        meeting=meeting,
        # Guest-door joins stay anonymous even if this browser is signed in: people
        # often test by opening the invite link in another tab of the same browser,
        # and that guest must not be counted as the host (docs/DECISIONS.md D-086).
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
