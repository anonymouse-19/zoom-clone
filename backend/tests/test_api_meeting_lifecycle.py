"""
Behaviors proven in this file (reading and changing meetings through the API):
1. Upcoming = scheduled meetings whose planned end is still ahead, soonest first,
   including ones I'm invited to (but not other people's).
2. Recent = ended meetings, most recently ended first.
3. Start → live; end → ended, and everyone still present is marked as left.
4. A personal room goes back to idle after ending, so its link keeps working.
5. Ended or cancelled meetings can't be started (409).
6. Cancelling is a soft delete (204, status becomes "cancelled"); a live meeting can't be cancelled.
7. PATCH changes only the fields sent; editing invitees keeps existing ones.
8. Unknown codes → 404; malformed codes → 422.
"""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import MeetingInvitee, Participant, User
from app.models.enums import MeetingStatus, MeetingType, ParticipantStatus
from tests.factories import make_meeting, make_participant, make_user

NOW = datetime.now(UTC)


def _codes(response_json: list[dict[str, object]]) -> list[object]:
    return [meeting["meeting_code"] for meeting in response_json]


def test_upcoming_lists_meetings_that_have_not_finished_soonest_first(
    client: TestClient, db_session: Session, me: User
) -> None:
    later = make_meeting(db_session, me, start_time=NOW + timedelta(days=2))
    sooner = make_meeting(db_session, me, start_time=NOW + timedelta(days=1))
    # Planned 10 minutes ago for an hour: still within its slot, so still "upcoming".
    in_its_slot = make_meeting(
        db_session, me, start_time=NOW - timedelta(minutes=10), duration_minutes=60
    )
    make_meeting(db_session, me, start_time=NOW - timedelta(hours=3), duration_minutes=60)
    make_meeting(db_session, me, status=MeetingStatus.CANCELLED)
    make_meeting(db_session, me, status=MeetingStatus.ENDED)

    response = client.get("/api/meetings", params={"scope": "upcoming"})

    assert response.status_code == 200
    expected = [in_its_slot.meeting_code, sooner.meeting_code, later.meeting_code]
    assert _codes(response.json()) == expected


def test_upcoming_includes_invitations_but_not_strangers_meetings(
    client: TestClient, db_session: Session, me: User
) -> None:
    colleague = make_user(db_session)
    invited = make_meeting(db_session, colleague)
    invited.invitees.append(MeetingInvitee(email=me.email))
    db_session.commit()
    make_meeting(db_session, colleague)  # not invited

    response = client.get("/api/meetings", params={"scope": "upcoming"})

    assert _codes(response.json()) == [invited.meeting_code]


def test_recent_lists_ended_meetings_most_recent_first(
    client: TestClient, db_session: Session, me: User
) -> None:
    older = make_meeting(
        db_session, me, status=MeetingStatus.ENDED, ended_at=NOW - timedelta(days=3)
    )
    newer = make_meeting(
        db_session, me, status=MeetingStatus.ENDED, ended_at=NOW - timedelta(days=1)
    )
    make_meeting(db_session, me)  # scheduled, not ended

    response = client.get("/api/meetings", params={"scope": "recent"})

    assert _codes(response.json()) == [newer.meeting_code, older.meeting_code]


def test_host_can_start_and_then_end_a_meeting(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, me)
    still_here = make_participant(db_session, meeting, status=ParticipantStatus.ADMITTED)

    started = client.post(f"/api/meetings/{meeting.meeting_code}/start")
    ended = client.post(f"/api/meetings/{meeting.meeting_code}/end")

    assert started.status_code == 200
    assert started.json()["status"] == "live"
    assert started.json()["started_at"] is not None
    assert ended.status_code == 200
    assert ended.json()["status"] == "ended"
    db_session.expire_all()
    reloaded = db_session.get(Participant, still_here.id)
    assert reloaded is not None
    assert reloaded.status == ParticipantStatus.LEFT
    assert reloaded.left_at is not None


def test_a_personal_room_goes_back_to_idle_after_ending(
    client: TestClient, db_session: Session, me: User
) -> None:
    room = make_meeting(
        db_session,
        me,
        meeting_code=me.personal_meeting_id,
        type=MeetingType.PERSONAL,
        status=MeetingStatus.LIVE,
        start_time=None,
        started_at=NOW,
    )

    response = client.post(f"/api/meetings/{room.meeting_code}/end")

    assert response.json()["status"] == "scheduled"
    assert response.json()["ended_at"] is not None


def test_ended_and_cancelled_meetings_cannot_be_started(
    client: TestClient, db_session: Session, me: User
) -> None:
    for status in (MeetingStatus.ENDED, MeetingStatus.CANCELLED):
        meeting = make_meeting(db_session, me, status=status)

        response = client.post(f"/api/meetings/{meeting.meeting_code}/start")

        assert response.status_code == 409


def test_cancelling_is_a_soft_delete(client: TestClient, db_session: Session, me: User) -> None:
    meeting = make_meeting(db_session, me)

    response = client.delete(f"/api/meetings/{meeting.meeting_code}")

    assert response.status_code == 204
    assert response.content == b""
    details = client.get(f"/api/meetings/{meeting.meeting_code}")
    assert details.status_code == 200
    assert details.json()["status"] == "cancelled"


def test_a_live_meeting_cannot_be_cancelled(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, me, status=MeetingStatus.LIVE)

    response = client.delete(f"/api/meetings/{meeting.meeting_code}")

    assert response.status_code == 409


def test_patch_changes_only_the_fields_sent(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, me, title="Old title", duration_minutes=30)

    response = client.patch(
        f"/api/meetings/{meeting.meeting_code}",
        json={"title": "New title", "settings": {"waiting_room_enabled": True}},
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["title"] == "New title"
    assert updated["duration_minutes"] == 30
    assert updated["settings"]["waiting_room_enabled"] is True
    assert updated["settings"]["chat_enabled"] is True


def test_editing_invitees_keeps_existing_ones_and_adds_new_ones(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, me)
    path = f"/api/meetings/{meeting.meeting_code}"
    client.patch(path, json={"invitees": ["sam@example.com", "kai@example.com"]})

    # "sam" stays, "kai" is removed, "lee" is added. A naive "replace the list" would
    # insert sam's new row before deleting the old one and break UNIQUE(meeting, email).
    response = client.patch(path, json={"invitees": ["sam@example.com", "lee@example.com"]})

    assert response.status_code == 200
    emails = sorted(invitee["email"] for invitee in response.json()["invitees"])
    assert emails == ["lee@example.com", "sam@example.com"]


def test_an_ended_meeting_cannot_be_edited(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, me, status=MeetingStatus.ENDED)

    response = client.patch(f"/api/meetings/{meeting.meeting_code}", json={"title": "x"})

    assert response.status_code == 409


def test_unknown_code_is_404_and_malformed_code_is_422(client: TestClient, me: User) -> None:
    assert client.get("/api/meetings/99999999999").status_code == 404
    assert client.get("/api/meetings/not-a-code").status_code == 422
