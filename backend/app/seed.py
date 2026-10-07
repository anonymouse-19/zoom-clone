"""
Inserts the demo data described in seed_data.py: the demo account (Alex Morgan, id=1)
and three colleagues (all with the password DEMO_PASSWORD), upcoming meetings for the
next week, and past meetings with attendance, chat and events.

Called by: main.py on startup, and by hand with `python -m app.seed`.
Idempotent: if any user already exists it does nothing, so restarting the server never
duplicates data. All dates are relative to "now", so the demo never goes stale.
"""

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import (
    ChatMessage,
    Meeting,
    MeetingEvent,
    MeetingInvitee,
    MeetingSettings,
    Participant,
    User,
)
from app.models.enums import (
    MeetingEventType,
    MeetingStatus,
    MeetingType,
    ParticipantRole,
    ParticipantStatus,
)
from app.models.types import utc_now
from app.seed_data import (
    ALEX,
    DEMO_PASSWORD,
    PAST_MEETINGS,
    PRIYA,
    SEED_USERS,
    SOFIA,
    UPCOMING_MEETINGS,
    PastSpec,
)
from app.services.codes import (
    generate_invite_token,
    generate_meeting_code,
    generate_passcode,
    generate_personal_meeting_id,
)
from app.services.passwords import hash_password

# Wall-clock times in seed_data.py ("9:30 standup") are in the demo account's (Alex's) timezone.
SEED_TIMEZONE_NAME = "Asia/Kolkata"
SEED_TIMEZONE = ZoneInfo(SEED_TIMEZONE_NAME)
# "Later today" meeting: at least this far ahead, so it's still upcoming during a demo.
TODAY_MEETING_LEAD = timedelta(minutes=45)
# The Schedule form uses 15-minute steps, so seeded start times do too.
SLOT_MINUTES = 15


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def _local_to_utc(now: datetime, days_from_today: int, at: time) -> datetime:
    """The UTC instant of wall-clock time `at`, `days_from_today` days from today,
    in the seed timezone. A negative `days_from_today` means the past."""
    local_today = now.astimezone(SEED_TIMEZONE).date()
    local_date = local_today + timedelta(days=days_from_today)
    local_moment = datetime.combine(local_date, at, tzinfo=SEED_TIMEZONE)
    return local_moment.astimezone(UTC)


def _next_slot(now: datetime) -> datetime:
    """The first 15-minute boundary at least TODAY_MEETING_LEAD after `now`."""
    earliest = (now + TODAY_MEETING_LEAD).replace(second=0, microsecond=0)
    minutes_past_slot = earliest.minute % SLOT_MINUTES
    if minutes_past_slot > 0:
        earliest += timedelta(minutes=SLOT_MINUTES - minutes_past_slot)
    return earliest


def _new_meeting_code(issued_codes: set[str]) -> str:
    """A meeting code not yet used in this seed run.

    The database's UNIQUE constraint would also catch a repeat, but it would fail the
    whole seed. Checking here keeps the seed reliable.
    """
    code = generate_meeting_code()
    while code in issued_codes:
        code = generate_meeting_code()
    issued_codes.add(code)
    return code


def _new_personal_meeting_id(issued_codes: set[str]) -> str:
    """A Personal Meeting ID not yet used in this seed run."""
    pmi = generate_personal_meeting_id()
    while pmi in issued_codes:
        pmi = generate_personal_meeting_id()
    issued_codes.add(pmi)
    return pmi


def _new_meeting(
    session: Session,
    *,
    host: User,
    title: str,
    meeting_type: MeetingType,
    status: MeetingStatus,
    start_time: datetime | None,
    duration_minutes: int,
    meeting_code: str,
    description: str = "",
) -> Meeting:
    """Add a meeting plus its 1:1 settings row (all defaults) to the session."""
    meeting = Meeting(
        meeting_code=meeting_code,
        host=host,
        title=title,
        description=description,
        type=meeting_type,
        status=status,
        start_time=start_time,
        duration_minutes=duration_minutes,
        timezone=SEED_TIMEZONE_NAME,
        passcode=generate_passcode(),
        invite_token=generate_invite_token(),
    )
    meeting.settings = MeetingSettings()
    session.add(meeting)
    return meeting


def _add_invitees(meeting: Meeting, invitees: list[User]) -> None:
    for invitee in invitees:
        meeting.invitees.append(MeetingInvitee(email=invitee.email, name=invitee.name))


def _session_at(participants: list[Participant], person: str, moment: datetime) -> Participant:
    """The join session `person` was in at `moment`.

    Someone who dropped and rejoined has several sessions, and a chat message must
    belong to the one that was live when it was sent.
    """
    for participant in participants:
        is_this_person = participant.display_name == person
        was_present = (
            participant.left_at is not None
            and participant.joined_at <= moment <= participant.left_at
        )
        if is_this_person and was_present:
            return participant
    raise ValueError(f"Seed data error: {person} was not in the meeting at {moment}")


# ---------------------------------------------------------------------------
# Seeding steps
# ---------------------------------------------------------------------------


def _create_users(session: Session, issued_codes: set[str]) -> dict[str, User]:
    """Create SEED_USERS and return them keyed by name.

    Ids are set explicitly so the demo account is guaranteed to be id=1.
    """
    # Hashed once and shared: scrypt is deliberately slow, and it's the same password.
    demo_password_hash = hash_password(DEMO_PASSWORD)
    users_by_name = {}
    for position, spec in enumerate(SEED_USERS):
        user = User(
            id=position + 1,
            name=spec.name,
            email=spec.email,
            password_hash=demo_password_hash,
            email_verified=True,
            avatar_color=spec.avatar_color,
            timezone=spec.timezone,
            personal_meeting_id=_new_personal_meeting_id(issued_codes),
        )
        session.add(user)
        users_by_name[spec.name] = user
    return users_by_name


def _create_personal_rooms(session: Session, users_by_name: dict[str, User]) -> None:
    """Each user's reusable Personal Meeting Room. Its code is the user's PMI."""
    for user in users_by_name.values():
        _new_meeting(
            session,
            host=user,
            title=f"{user.name}'s Personal Meeting Room",
            meeting_type=MeetingType.PERSONAL,
            status=MeetingStatus.SCHEDULED,
            start_time=None,
            duration_minutes=60,
            meeting_code=user.personal_meeting_id,
        )


def _create_later_today_meeting(
    session: Session, users_by_name: dict[str, User], now: datetime, issued_codes: set[str]
) -> None:
    """A meeting a little later today, so the dashboard's "Today" list is never empty.

    Its time depends on when the seed runs, so it lives here rather than in seed_data.py.
    """
    meeting = _new_meeting(
        session,
        host=users_by_name[ALEX],
        title="Design Review: Meeting Room UI",
        meeting_type=MeetingType.SCHEDULED,
        status=MeetingStatus.SCHEDULED,
        start_time=_next_slot(now),
        duration_minutes=30,
        meeting_code=_new_meeting_code(issued_codes),
        description="Review gallery/speaker layouts and the toolbar against Zoom.",
    )
    meeting.settings.waiting_room_enabled = True
    _add_invitees(meeting, [users_by_name[PRIYA], users_by_name[SOFIA]])


def _create_upcoming(
    session: Session, users_by_name: dict[str, User], now: datetime, issued_codes: set[str]
) -> None:
    """The UPCOMING_MEETINGS specs, spread over the next week."""
    for spec in UPCOMING_MEETINGS:
        meeting = _new_meeting(
            session,
            host=users_by_name[spec.host],
            title=spec.title,
            meeting_type=MeetingType.SCHEDULED,
            status=MeetingStatus.SCHEDULED,
            start_time=_local_to_utc(now, spec.days_from_today, spec.start),
            duration_minutes=spec.duration_minutes,
            description=spec.description,
            meeting_code=_new_meeting_code(issued_codes),
        )
        meeting.settings.allow_join_before_host = spec.allow_join_before_host
        _add_invitees(meeting, [users_by_name[name] for name in spec.invitees])


def _add_attendance(
    meeting: Meeting, spec: PastSpec, users_by_name: dict[str, User]
) -> list[Participant]:
    """Participants (one per join session) plus their joined/left events."""
    assert meeting.started_at is not None  # past meetings always have one
    participants = []
    for attendance in spec.attendance:
        user = None if attendance.is_guest else users_by_name[attendance.person]
        is_host = attendance.person == spec.host
        participant = Participant(
            user=user,
            display_name=attendance.person,
            role=ParticipantRole.HOST if is_host else ParticipantRole.ATTENDEE,
            status=ParticipantStatus.LEFT,
            joined_at=meeting.started_at + timedelta(minutes=attendance.joined_minute),
            left_at=meeting.started_at + timedelta(minutes=attendance.left_minute),
        )
        meeting.participants.append(participant)
        participants.append(participant)
        _log_join_and_leave(meeting, participant)
    return participants


def _log_join_and_leave(meeting: Meeting, participant: Participant) -> None:
    """Audit-log a "joined" and a "left" event at the participant's join/leave times."""
    assert participant.left_at is not None
    joined = MeetingEvent(
        participant=participant,
        event_type=MeetingEventType.JOINED,
        created_at=participant.joined_at,
    )
    left = MeetingEvent(
        participant=participant,
        event_type=MeetingEventType.LEFT,
        created_at=participant.left_at,
    )
    meeting.events.extend([joined, left])


def _add_chat(meeting: Meeting, spec: PastSpec, participants: list[Participant]) -> None:
    """Chat messages, each linked to the sender's (and recipient's) live join session."""
    assert meeting.started_at is not None
    for line in spec.chat:
        sent_at = meeting.started_at + timedelta(minutes=line.minute)
        recipient = None
        if line.private_to is not None:
            recipient = _session_at(participants, line.private_to, sent_at)
        message = ChatMessage(
            sender=_session_at(participants, line.sender, sent_at),
            recipient=recipient,
            body=line.body,
            sent_at=sent_at,
        )
        meeting.messages.append(message)


def _create_past(
    session: Session, users_by_name: dict[str, User], now: datetime, issued_codes: set[str]
) -> None:
    """Ended meetings with realistic attendance, chat and start/end events."""
    for spec in PAST_MEETINGS:
        start = _local_to_utc(now, -spec.days_ago, spec.start)
        last_person_left_minute = max(a.left_minute for a in spec.attendance)
        end = start + timedelta(minutes=last_person_left_minute)
        meeting = _new_meeting(
            session,
            host=users_by_name[spec.host],
            title=spec.title,
            meeting_type=MeetingType.SCHEDULED,
            status=MeetingStatus.ENDED,
            start_time=start,
            duration_minutes=spec.planned_minutes,
            meeting_code=_new_meeting_code(issued_codes),
        )
        meeting.started_at = start
        meeting.ended_at = end
        started_event = MeetingEvent(event_type=MeetingEventType.MEETING_STARTED, created_at=start)
        meeting.events.append(started_event)
        participants = _add_attendance(meeting, spec, users_by_name)
        _add_chat(meeting, spec, participants)
        ended_event = MeetingEvent(event_type=MeetingEventType.MEETING_ENDED, created_at=end)
        meeting.events.append(ended_event)


# ---------------------------------------------------------------------------
# Entry points
# ---------------------------------------------------------------------------


def seed_database(session: Session, now: datetime) -> None:
    """Insert all demo data in one transaction: either everything is saved, or nothing."""
    # Every code issued so far, so no two rows get the same meeting code or PMI.
    issued_codes: set[str] = set()
    users_by_name = _create_users(session, issued_codes)
    _create_personal_rooms(session, users_by_name)
    _create_later_today_meeting(session, users_by_name, now, issued_codes)
    _create_upcoming(session, users_by_name, now, issued_codes)
    _create_past(session, users_by_name, now, issued_codes)
    session.commit()


def seed_if_empty(session: Session, now: datetime | None = None) -> bool:
    """Seed only if the users table is empty. Returns True if data was inserted.

    `now` is injectable so tests can pin the clock.
    """
    # INTERVIEW: idempotency check. Running this twice (or restarting the server)
    # must not duplicate data, so "any user exists" means "already seeded".
    user_count = session.scalar(select(func.count()).select_from(User))
    if user_count:
        return False
    seed_database(session, now or utc_now())
    return True


def run_startup_seed() -> bool:
    """Called from main.py's lifespan. Turns "tables missing" into a clear instruction."""
    with SessionLocal() as session:
        try:
            return seed_if_empty(session)
        except OperationalError as error:
            if "no such table" in str(error.orig):
                raise RuntimeError(
                    "The database has no tables yet. Run `alembic upgrade head` in backend/."
                ) from error
            raise


if __name__ == "__main__":
    was_seeded = run_startup_seed()
    print("Seeded demo data." if was_seeded else "Database already has data; nothing to do.")
