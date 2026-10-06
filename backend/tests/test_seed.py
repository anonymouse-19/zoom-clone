"""
Behaviors proven in this file:
1. Seeding creates the default user, Alex Morgan, with id=1.
2. Seeding is idempotent: running it twice doesn't duplicate anything.
3. Every seeded upcoming meeting is in the future, and one of them is later today.
4. Every past meeting ended after it started and has attendance.
5. A dropped-and-rejoined attendee has two participant rows (one per session).
6. Every meeting has exactly one settings row.
7. A personal room's meeting code is its host's Personal Meeting ID.
"""

from collections import Counter
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Meeting, MeetingSettings, Participant, User
from app.models.enums import MeetingStatus, MeetingType
from app.seed import seed_if_empty

# Pin the clock so results don't depend on when the tests run: 12:00 noon in India.
FIXED_NOW = datetime(2026, 10, 6, 6, 30, tzinfo=UTC)
INDIA = ZoneInfo("Asia/Kolkata")


@pytest.fixture
def seeded(db_session: Session) -> Session:
    assert seed_if_empty(db_session, now=FIXED_NOW) is True
    return db_session


def _table_counts(session: Session) -> dict[str, int]:
    models = (User, Meeting, MeetingSettings, Participant)
    return {m.__name__: session.scalar(select(func.count()).select_from(m)) or 0 for m in models}


def _meetings(session: Session, status: MeetingStatus, meeting_type: MeetingType) -> list[Meeting]:
    query = select(Meeting).where(Meeting.status == status, Meeting.type == meeting_type)
    return list(session.scalars(query))


def test_seed_creates_alex_morgan_as_user_1(seeded: Session) -> None:
    alex = seeded.get(User, 1)
    assert alex is not None
    assert alex.name == "Alex Morgan"


def test_seeding_twice_does_not_duplicate_data(seeded: Session) -> None:
    counts_after_first_run = _table_counts(seeded)

    assert seed_if_empty(seeded, now=FIXED_NOW) is False
    assert _table_counts(seeded) == counts_after_first_run


def test_upcoming_meetings_are_in_the_future_and_one_is_today(seeded: Session) -> None:
    upcoming = _meetings(seeded, MeetingStatus.SCHEDULED, MeetingType.SCHEDULED)

    assert len(upcoming) >= 6
    start_times = [m.start_time for m in upcoming if m.start_time is not None]
    assert all(start > FIXED_NOW for start in start_times)
    today_in_india = FIXED_NOW.astimezone(INDIA).date()
    assert any(start.astimezone(INDIA).date() == today_in_india for start in start_times)


def test_past_meetings_have_attendance_and_end_after_start(seeded: Session) -> None:
    past = _meetings(seeded, MeetingStatus.ENDED, MeetingType.SCHEDULED)

    assert len(past) >= 10
    for meeting in past:
        assert meeting.started_at is not None and meeting.ended_at is not None
        assert meeting.ended_at > meeting.started_at
        assert len(meeting.participants) >= 2


def test_a_rejoin_creates_a_second_participant_row(seeded: Session) -> None:
    roadmap = seeded.scalars(select(Meeting).where(Meeting.title == "Product Roadmap Q4")).one()

    sessions_per_person = Counter(p.display_name for p in roadmap.participants)
    assert sessions_per_person["Daniel Kim"] == 2


def test_every_meeting_has_exactly_one_settings_row(seeded: Session) -> None:
    counts = _table_counts(seeded)
    assert counts["MeetingSettings"] == counts["Meeting"]


def test_personal_room_code_is_the_hosts_pmi(seeded: Session) -> None:
    rooms = _meetings(seeded, MeetingStatus.SCHEDULED, MeetingType.PERSONAL)

    assert len(rooms) == 4
    for room in rooms:
        assert room.meeting_code == room.host.personal_meeting_id
