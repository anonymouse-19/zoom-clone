"""
Behaviors proven in this file (the database rules, enforced by SQLite itself):
1. Foreign keys are enforced: a participant can't point at a meeting that doesn't exist.
2. Deleting a meeting cascades to its settings, invitees, participants, chat and events.
3. Meeting codes are unique.
4. An email can be invited once per meeting, but to many different meetings.
5. Times go in as any timezone and come back as the same instant in UTC.
6. Naive datetimes (no timezone) are rejected instead of guessed.
7. CHECK constraints reject enum values and durations the app doesn't allow, even via raw SQL.
8. Deleting a user keeps their past attendance rows (user_id set to NULL).
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, StatementError
from sqlalchemy.orm import Session

from app.models import (
    ChatMessage,
    Meeting,
    MeetingEvent,
    MeetingInvitee,
    MeetingSettings,
    Participant,
)
from app.models.enums import MeetingEventType
from tests.factories import make_meeting, make_participant, make_user


def _count(session: Session, model: type) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def test_foreign_keys_are_enforced(db_session: Session) -> None:
    with pytest.raises(IntegrityError):
        db_session.execute(
            text(
                "INSERT INTO participants (meeting_id, display_name, role, status, joined_at) "
                "VALUES (999, 'Ghost', 'attendee', 'admitted', '2030-01-01 00:00:00')"
            )
        )


def test_deleting_a_meeting_cascades_to_all_its_children(db_session: Session) -> None:
    host = make_user(db_session)
    meeting = make_meeting(db_session, host)
    sender = make_participant(db_session, meeting, display_name="Alex")
    meeting.invitees.append(MeetingInvitee(email="a@example.com"))
    meeting.messages.append(ChatMessage(sender=sender, body="hi"))
    meeting.events.append(MeetingEvent(event_type=MeetingEventType.JOINED, participant=sender))
    db_session.commit()

    db_session.delete(meeting)
    db_session.commit()

    for child_model in (MeetingSettings, MeetingInvitee, Participant, ChatMessage, MeetingEvent):
        assert _count(db_session, child_model) == 0, child_model.__name__


def test_meeting_codes_must_be_unique(db_session: Session) -> None:
    host = make_user(db_session)
    make_meeting(db_session, host, meeting_code="12345678901")

    with pytest.raises(IntegrityError):
        make_meeting(db_session, host, meeting_code="12345678901")


def test_an_email_is_invited_once_per_meeting_but_to_many_meetings(db_session: Session) -> None:
    host = make_user(db_session)
    first, second = make_meeting(db_session, host), make_meeting(db_session, host)
    first.invitees.append(MeetingInvitee(email="sam@example.com"))
    second.invitees.append(MeetingInvitee(email="sam@example.com"))
    db_session.flush()  # same email, different meetings: allowed

    first.invitees.append(MeetingInvitee(email="sam@example.com"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_times_round_trip_as_the_same_instant_in_utc(db_session: Session) -> None:
    host = make_user(db_session)
    ten_am_in_india = datetime(2030, 3, 1, 10, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
    meeting = make_meeting(db_session, host, start_time=ten_am_in_india)
    db_session.commit()
    db_session.expire_all()  # force a real read from the database

    reloaded = db_session.get(Meeting, meeting.id)
    assert reloaded is not None
    assert reloaded.start_time == datetime(2030, 3, 1, 4, 30, tzinfo=UTC)
    assert reloaded.start_time.tzinfo == UTC


def test_naive_datetimes_are_rejected(db_session: Session) -> None:
    host = make_user(db_session)

    # SQLAlchemy wraps our ValueError in a StatementError when the flush runs.
    with pytest.raises(StatementError, match="timezone-aware"):
        make_meeting(db_session, host, start_time=datetime(2030, 3, 1, 10, 0))


@pytest.mark.parametrize(
    "bad_sql",
    [
        "UPDATE meetings SET status = 'paused'",
        "UPDATE meetings SET type = 'webinar'",
        "UPDATE meetings SET duration_minutes = 0",
    ],
)
def test_check_constraints_reject_invalid_values_even_from_raw_sql(
    db_session: Session, bad_sql: str
) -> None:
    make_meeting(db_session, make_user(db_session))

    with pytest.raises(IntegrityError):
        db_session.execute(text(bad_sql))


def test_deleting_a_user_keeps_their_attendance_history(db_session: Session) -> None:
    host = make_user(db_session)
    guest_user = make_user(db_session, name="Sam")
    meeting = make_meeting(db_session, host)
    attendance = make_participant(db_session, meeting, user=guest_user, display_name="Sam")
    db_session.commit()

    db_session.delete(guest_user)
    db_session.commit()
    db_session.expire_all()

    reloaded = db_session.get(Participant, attendance.id)
    assert reloaded is not None
    assert reloaded.user_id is None
    assert reloaded.display_name == "Sam"
