"""
Behaviors proven in this file:
1. The .ics download is a valid calendar file: UTC start/end, escaped text, CRLF line
   endings, no line over 75 bytes, served as a file attachment.
2. A meeting without a scheduled time can't be exported (409).
3. The summary merges a person's rejoins into one attendee and adds up their minutes.
4. The summary shows public chat, plus private messages only if I sent or received them.
5. A meeting that never started has no summary (409).
6. Chat history (/messages) returns only messages sent to everyone.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import ChatMessage, Meeting, Participant, User
from app.models.enums import MeetingStatus, MeetingType, ParticipantStatus
from tests.factories import make_meeting, make_participant, make_user

START = datetime(2030, 5, 1, 9, 30, tzinfo=UTC)


def test_ics_file_is_a_valid_calendar_entry(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(
        db_session, me, title="Plan; review, ship", start_time=START, duration_minutes=45
    )

    response = client.get(f"/api/meetings/{meeting.meeting_code}/ics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    assert "attachment" in response.headers["content-disposition"]
    text = response.text
    assert text.startswith("BEGIN:VCALENDAR\r\n")
    assert "DTSTART:20300501T093000Z" in text
    assert "DTEND:20300501T101500Z" in text
    assert "SUMMARY:Plan\\; review\\, ship" in text
    assert all(len(line.encode()) <= 75 for line in text.split("\r\n"))


def test_a_meeting_without_a_time_cannot_be_exported(
    client: TestClient, db_session: Session, me: User
) -> None:
    room = make_meeting(db_session, me, type=MeetingType.PERSONAL, start_time=None)

    response = client.get(f"/api/meetings/{room.meeting_code}/ics")

    assert response.status_code == 409


@dataclass
class RejoinScenario:
    meeting: Meeting
    alex: Participant
    sam_first_session: Participant
    sam_second_session: Participant


def _ended_meeting_with_a_rejoin(db_session: Session, me: User) -> RejoinScenario:
    """Alex hosts; Sam (a guest) joins, drops for 5 minutes, and rejoins."""
    meeting = make_meeting(
        db_session,
        me,
        status=MeetingStatus.ENDED,
        started_at=START,
        ended_at=START + timedelta(minutes=30),
    )

    def at(minute: int) -> datetime:
        return START + timedelta(minutes=minute)

    alex = make_participant(
        db_session, meeting, user=me, display_name=me.name, joined_at=at(0), left_at=at(30)
    )
    sam_first = make_participant(db_session, meeting, display_name="Sam", joined_at=at(0))
    sam_first.left_at = at(10)
    sam_first.status = ParticipantStatus.LEFT
    sam_again = make_participant(
        db_session, meeting, display_name="Sam", joined_at=at(15), left_at=at(30)
    )
    return RejoinScenario(meeting, alex, sam_first, sam_again)


def test_summary_merges_rejoins_into_one_attendee(
    client: TestClient, db_session: Session, me: User
) -> None:
    scenario = _ended_meeting_with_a_rejoin(db_session, me)
    db_session.commit()

    response = client.get(f"/api/meetings/{scenario.meeting.meeting_code}/summary")

    assert response.status_code == 200
    summary = response.json()
    assert summary["duration_minutes"] == 30
    attendees = {attendee["display_name"]: attendee for attendee in summary["attendees"]}
    assert len(attendees["Sam"]["sessions"]) == 2
    assert attendees["Sam"]["total_minutes"] == 25  # 10 + 15
    assert attendees["Sam"]["is_guest"] is True


def test_summary_shows_private_messages_only_to_their_sender_or_recipient(
    client: TestClient, db_session: Session, me: User
) -> None:
    scenario = _ended_meeting_with_a_rejoin(db_session, me)
    meeting = scenario.meeting
    sam = scenario.sam_first_session
    kai = make_participant(db_session, meeting, display_name="Kai", joined_at=START)
    meeting.messages.extend(
        [
            ChatMessage(sender=sam, body="hello all", sent_at=START),
            ChatMessage(sender=sam, recipient=scenario.alex, body="to alex", sent_at=START),
            ChatMessage(sender=sam, recipient=kai, body="to kai", sent_at=START),
        ]
    )
    db_session.commit()

    response = client.get(f"/api/meetings/{meeting.meeting_code}/summary")

    bodies = [message["body"] for message in response.json()["messages"]]
    assert bodies == ["hello all", "to alex"]


def test_a_meeting_that_never_started_has_no_summary(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, me)

    assert client.get(f"/api/meetings/{meeting.meeting_code}/summary").status_code == 409


def test_chat_history_contains_only_public_messages(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, make_user(db_session), status=MeetingStatus.LIVE)
    meeting.started_at = START
    sender = make_participant(db_session, meeting, display_name="Sam", joined_at=START)
    receiver = make_participant(db_session, meeting, display_name="Kai", joined_at=START)
    meeting.messages.extend(
        [
            ChatMessage(sender=sender, body="for everyone", sent_at=START),
            ChatMessage(sender=sender, recipient=receiver, body="secret", sent_at=START),
        ]
    )
    db_session.commit()

    response = client.get(f"/api/meetings/{meeting.meeting_code}/messages")

    assert response.status_code == 200
    assert [message["body"] for message in response.json()] == ["for everyone"]
