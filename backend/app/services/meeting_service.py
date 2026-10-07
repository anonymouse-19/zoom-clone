"""
Business rules for meetings: create (instant or scheduled), list, edit, cancel, start
and end.

Called by: routers/meetings.py.
Calls: the models, services/codes.py, and raises services/errors.py exceptions.
It knows nothing about HTTP, so every rule can be tested without a web server.
"""

from datetime import datetime, timedelta
from enum import StrEnum

from sqlalchemy import Select, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import Meeting, MeetingEvent, MeetingInvitee, MeetingSettings, Participant, User
from app.models.enums import MeetingEventType, MeetingStatus, MeetingType, ParticipantStatus
from app.models.types import utc_now
from app.schemas.meeting import (
    MAX_DURATION_MINUTES,
    InstantMeetingRequest,
    ScheduleMeetingRequest,
    UpdateMeetingRequest,
)
from app.services import codes
from app.services.errors import ConflictError, ForbiddenError, NotFoundError, UnavailableError

# How many times to draw a new code if the one we drew is already taken. With 9×10^10
# possible codes, even one collision is astronomically unlikely; 5 is generous.
MAX_CODE_ATTEMPTS = 5
INSTANT_MEETING_DURATION_MINUTES = 60
# A meeting that started up to 24h ago (the longest allowed) could still be running.
UPCOMING_LOOKBACK = timedelta(minutes=MAX_DURATION_MINUTES)
RECENT_MEETINGS_LIMIT = 50


class MeetingScope(StrEnum):
    """Which list GET /api/meetings returns."""

    UPCOMING = "upcoming"
    RECENT = "recent"
    ALL = "all"


# ---------------------------------------------------------------------------
# Lookups and guards
# ---------------------------------------------------------------------------


def get_meeting_by_code(db: Session, meeting_code: str) -> Meeting:
    meeting = db.scalar(select(Meeting).where(Meeting.meeting_code == meeting_code))
    if meeting is None:
        raise NotFoundError("Invalid meeting ID")  # Zoom's own wording
    return meeting


def require_host(meeting: Meeting, user: User) -> None:
    """Stop here unless `user` hosts `meeting`.

    INTERVIEW: authorization is checked on the server for every host action. Hiding a
    button in the UI is not security: anyone can send the HTTP request by hand.
    """
    if meeting.host_id != user.id:
        raise ForbiddenError("Only the host can do this")


def default_title(host: User) -> str:
    return f"{host.name}'s Zoom Meeting"


# ---------------------------------------------------------------------------
# Creating meetings
# ---------------------------------------------------------------------------


def create_instant_meeting(db: Session, host: User, request: InstantMeetingRequest) -> Meeting:
    """The "New meeting" button: a meeting that is live from the moment it's created."""
    if request.use_personal_meeting_id:
        return start_meeting(db, host.personal_meeting_id, host)

    now = utc_now()
    meeting = Meeting(
        host=host,
        title=request.title or default_title(host),
        type=MeetingType.INSTANT,
        status=MeetingStatus.LIVE,
        start_time=now,
        started_at=now,
        duration_minutes=INSTANT_MEETING_DURATION_MINUTES,
        timezone=host.timezone,
        passcode=codes.generate_passcode(),
    )
    meeting.settings = MeetingSettings()
    meeting.events.append(MeetingEvent(event_type=MeetingEventType.MEETING_STARTED, created_at=now))
    _save_with_unique_code(db, meeting)
    return meeting


def schedule_meeting(db: Session, host: User, request: ScheduleMeetingRequest) -> Meeting:
    """The Schedule form: a meeting for a future time. Input is already validated."""
    meeting = Meeting(
        host=host,
        title=request.title or default_title(host),
        description=request.description,
        type=MeetingType.SCHEDULED,
        status=MeetingStatus.SCHEDULED,
        start_time=request.start_time,
        duration_minutes=request.duration_minutes,
        timezone=request.timezone,
        recurrence=request.recurrence,
        passcode=request.passcode or codes.generate_passcode(),
    )
    meeting.settings = MeetingSettings(**request.settings.model_dump())
    _replace_invitees(db, meeting, request.invitees)
    _save_with_unique_code(db, meeting)
    return meeting


def _save_with_unique_code(db: Session, meeting: Meeting) -> None:
    """Give `meeting` a fresh code and invite token, then commit.

    INTERVIEW: "check the code is free, then insert" has a race. Two requests can both
    check, both see "free", and both insert. Instead we let the database decide: the
    UNIQUE constraint rejects a duplicate atomically, and we retry with a new code.
    """
    for _attempt in range(MAX_CODE_ATTEMPTS):
        meeting.meeting_code = codes.generate_meeting_code()
        meeting.invite_token = codes.generate_invite_token()
        db.add(meeting)
        try:
            db.commit()
            return
        except IntegrityError as error:
            db.rollback()
            if not _is_code_collision(error):
                raise
    raise UnavailableError("Couldn't generate a free meeting ID. Please try again.")


def _is_code_collision(error: IntegrityError) -> bool:
    """True if the failure was a duplicate meeting code or invite token (worth a retry),
    as opposed to some other rule being broken (a real bug, so re-raise it)."""
    message = str(error.orig)
    return "meetings.meeting_code" in message or "meetings.invite_token" in message


def _replace_invitees(db: Session, meeting: Meeting, emails: list[str]) -> None:
    """Make the meeting's invitee list exactly `emails` (already lowercased by the schema).

    Invitees who stay keep their existing row. Only removed ones are deleted and only new
    ones inserted. Why not just replace the whole list? SQLAlchemy inserts new rows
    *before* deleting old ones, so re-adding "sam@x.com" would briefly duplicate it and
    trip UNIQUE(meeting_id, email).
    """
    wanted_emails = _without_duplicates(emails)
    meeting.invitees = [invitee for invitee in meeting.invitees if invitee.email in wanted_emails]
    already_invited = {invitee.email for invitee in meeting.invitees}

    # Fill in names for invitees who have an account.
    users = db.scalars(select(User).where(User.email.in_(wanted_emails)))
    name_by_email = {user.email: user.name for user in users}

    for email in wanted_emails:
        if email not in already_invited:
            meeting.invitees.append(MeetingInvitee(email=email, name=name_by_email.get(email)))


def _without_duplicates(items: list[str]) -> list[str]:
    """Remove repeats while keeping the original order."""
    unique_items: list[str] = []
    for item in items:
        if item not in unique_items:
            unique_items.append(item)
    return unique_items


# ---------------------------------------------------------------------------
# Changing meetings
# ---------------------------------------------------------------------------


def _require_editable(meeting: Meeting) -> None:
    if meeting.type != MeetingType.SCHEDULED or meeting.status != MeetingStatus.SCHEDULED:
        raise ConflictError("Only upcoming scheduled meetings can be edited")


def update_meeting(
    db: Session, meeting_code: str, user: User, request: UpdateMeetingRequest
) -> Meeting:
    """Apply only the fields the client sent (a PATCH, not a full replacement)."""
    meeting = get_meeting_by_code(db, meeting_code)
    require_host(meeting, user)
    _require_editable(meeting)

    simple_fields = [
        "description",
        "start_time",
        "duration_minutes",
        "timezone",
        "recurrence",
        "passcode",
    ]
    for field_name in simple_fields:
        new_value = getattr(request, field_name)
        if new_value is not None:
            setattr(meeting, field_name, new_value)
    if request.title is not None:
        meeting.title = request.title or default_title(user)
    if request.settings is not None:
        changed_settings = request.settings.model_dump(exclude_unset=True)
        for setting_name, value in changed_settings.items():
            setattr(meeting.settings, setting_name, value)
    if request.invitees is not None:
        _replace_invitees(db, meeting, request.invitees)

    db.commit()
    return meeting


def cancel_meeting(db: Session, meeting_code: str, user: User) -> None:
    """Soft delete: status becomes "cancelled", so old invite links can say so."""
    meeting = get_meeting_by_code(db, meeting_code)
    require_host(meeting, user)
    if meeting.status == MeetingStatus.CANCELLED:
        return  # already cancelled: DELETE is idempotent
    if meeting.status == MeetingStatus.LIVE:
        raise ConflictError("This meeting is in progress. End it instead.")
    _require_editable(meeting)
    meeting.status = MeetingStatus.CANCELLED
    db.commit()


def start_meeting(db: Session, meeting_code: str, user: User) -> Meeting:
    """Host starts a scheduled meeting or their personal room."""
    meeting = get_meeting_by_code(db, meeting_code)
    require_host(meeting, user)
    if meeting.status == MeetingStatus.LIVE:
        return meeting  # already running: starting again changes nothing
    if meeting.status != MeetingStatus.SCHEDULED:
        raise ConflictError(f"This meeting can't be started because it is {meeting.status}")

    now = utc_now()
    meeting.status = MeetingStatus.LIVE
    meeting.started_at = now
    meeting.ended_at = None  # a reused personal room may have an old end time
    meeting.events.append(MeetingEvent(event_type=MeetingEventType.MEETING_STARTED, created_at=now))
    db.commit()
    return meeting


def end_meeting(db: Session, meeting_code: str, user: User) -> Meeting:
    """Host ends the meeting for everyone (REST: the account that hosts it)."""
    meeting = get_meeting_by_code(db, meeting_code)
    require_host(meeting, user)
    finish_meeting(db, meeting)
    return meeting


def finish_meeting(db: Session, meeting: Meeting) -> None:
    """End a live meeting: everyone in it has left, anyone still waiting never got in.

    Shared by end_meeting (REST, checks the host's account) and the meeting room (checks
    the participant's in-meeting role, since a guest can be handed the host role).
    """
    if meeting.status != MeetingStatus.LIVE:
        raise ConflictError("This meeting isn't in progress")

    now = utc_now()
    for participant in list(meeting.participants):
        if participant.status == ParticipantStatus.ADMITTED:
            participant.status = ParticipantStatus.LEFT
            participant.left_at = now
        elif participant.status == ParticipantStatus.WAITING:
            # Never admitted, so never part of the meeting's attendance.
            db.delete(participant)
    meeting.ended_at = now
    # A personal room goes back to idle so its permanent link keeps working.
    is_personal_room = meeting.type == MeetingType.PERSONAL
    meeting.status = MeetingStatus.SCHEDULED if is_personal_room else MeetingStatus.ENDED
    meeting.events.append(MeetingEvent(event_type=MeetingEventType.MEETING_ENDED, created_at=now))
    db.commit()


# ---------------------------------------------------------------------------
# Listing meetings
# ---------------------------------------------------------------------------


def list_meetings(db: Session, user: User, scope: MeetingScope) -> list[Meeting]:
    if scope == MeetingScope.UPCOMING:
        return _upcoming_meetings(db, user, utc_now())
    if scope == MeetingScope.RECENT:
        return _recent_meetings(db, user)
    return _all_meetings(db, user)


def _meetings_involving(user: User) -> Select[tuple[Meeting]]:
    """Meetings the user hosts, was invited to, or attended, with the related rows the
    list needs loaded up front.

    INTERVIEW: selectinload fetches every listed meeting's host and participants in
    one extra query each. Without it, reading `meeting.host` in a loop would fire one
    query per meeting (the "N+1 queries" problem).
    """
    invited_meeting_ids = select(MeetingInvitee.meeting_id).where(
        MeetingInvitee.email == user.email.lower()
    )
    attended_meeting_ids = select(Participant.meeting_id).where(Participant.user_id == user.id)
    is_involved = or_(
        Meeting.host_id == user.id,
        Meeting.id.in_(invited_meeting_ids),
        Meeting.id.in_(attended_meeting_ids),
    )
    return (
        select(Meeting)
        .where(is_involved, Meeting.type != MeetingType.PERSONAL)
        .options(selectinload(Meeting.host), selectinload(Meeting.participants))
    )


def _upcoming_meetings(db: Session, user: User, now: datetime) -> list[Meeting]:
    """Scheduled meetings whose planned end (start + duration) is still in the future.

    SQL narrows the candidates using the indexes (status, and a start time within the
    last 24 hours). Then Python does the final `start + duration > now` check, because
    adding a per-row duration to a date in SQL needs SQLite-specific functions.
    """
    query = (
        _meetings_involving(user)
        .where(
            Meeting.status == MeetingStatus.SCHEDULED,
            Meeting.start_time >= now - UPCOMING_LOOKBACK,
        )
        .order_by(Meeting.start_time)
    )
    candidates = db.scalars(query).all()
    return [meeting for meeting in candidates if planned_end(meeting) > now]


def planned_end(meeting: Meeting) -> datetime:
    """When the meeting is scheduled to finish. Only for meetings with a start time."""
    assert meeting.start_time is not None
    return meeting.start_time + timedelta(minutes=meeting.duration_minutes)


def _recent_meetings(db: Session, user: User) -> list[Meeting]:
    query = (
        _meetings_involving(user)
        .where(Meeting.status == MeetingStatus.ENDED)
        .order_by(Meeting.ended_at.desc())
        .limit(RECENT_MEETINGS_LIMIT)
    )
    return list(db.scalars(query).all())


def _all_meetings(db: Session, user: User) -> list[Meeting]:
    query = _meetings_involving(user).order_by(Meeting.created_at.desc())
    return list(db.scalars(query).all())
