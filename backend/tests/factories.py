"""
Tiny helpers that insert valid rows with sensible defaults, so each test only spells
out the fields it actually cares about. Each helper commits, so the row is visible to
API requests, which run in their own database session.
"""

from datetime import UTC, datetime, timedelta
from itertools import count

from sqlalchemy.orm import Session

from app.models import Meeting, MeetingSettings, Participant, User
from app.models.enums import MeetingStatus, MeetingType, ParticipantRole, ParticipantStatus

# Unique suffixes so every factory call produces distinct emails / codes.
_sequence = count(1)

A_FIXED_FUTURE_TIME = datetime(2030, 1, 15, 10, 0, tzinfo=UTC)


def make_user(session: Session, **overrides: object) -> User:
    number = next(_sequence)
    fields: dict[str, object] = {
        "name": f"User {number}",
        "email": f"user{number}@example.com",
        "avatar_color": "#0B5CFF",
        "personal_meeting_id": f"{9000000000 + number}",
    }
    fields.update(overrides)
    user = User(**fields)
    session.add(user)
    session.commit()  # committed, so API requests (which use their own session) see it
    return user


def make_meeting(session: Session, host: User, **overrides: object) -> Meeting:
    number = next(_sequence)
    fields: dict[str, object] = {
        "meeting_code": f"{10000000000 + number}",
        "host": host,
        "title": f"Meeting {number}",
        "type": MeetingType.SCHEDULED,
        "status": MeetingStatus.SCHEDULED,
        "start_time": A_FIXED_FUTURE_TIME + timedelta(days=number),
        "timezone": "Asia/Kolkata",
        "passcode": "abc123",
        "invite_token": f"token-{number}",
    }
    fields.update(overrides)
    meeting = Meeting(**fields)
    meeting.settings = MeetingSettings()
    session.add(meeting)
    session.commit()
    return meeting


def make_participant(session: Session, meeting: Meeting, **overrides: object) -> Participant:
    fields: dict[str, object] = {
        "meeting": meeting,
        "display_name": "Guest",
        "role": ParticipantRole.ATTENDEE,
        "status": ParticipantStatus.ADMITTED,
    }
    fields.update(overrides)
    participant = Participant(**fields)
    session.add(participant)
    session.commit()
    return participant
