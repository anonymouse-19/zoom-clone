"""
Behaviors proven in this file (joining: POST /api/meetings/{code}/participants):
1. A guest with the invite token, or with the passcode, joins as an anonymous attendee
   and gets a secret session token. A "joined" event is logged.
2. A guest without a credential, or with a wrong one, is refused (403).
3. A guest can't join before the host starts the meeting (409), unless "join before host" is on.
4. With a waiting room, a guest lands in it ("waiting"); the host never waits.
5. The host door starts a scheduled meeting and joins as host, linked to the user account.
6. Only the host may use the host door (403).
7. Ended and cancelled meetings can't be joined (409).
8. Every join is a new session: rejoining gives a new participant id and token.
9. A blank display name is rejected (422).
"""

import httpx2
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Meeting, MeetingEvent, User
from app.models.enums import MeetingEventType, MeetingStatus
from tests.factories import make_meeting, make_user

TOKEN = "invite-token-123"
PASSCODE = "Pa55wd"


def _live_meeting(db_session: Session, host: User, **overrides: object) -> Meeting:
    fields: dict[str, object] = {
        "status": MeetingStatus.LIVE,
        "invite_token": TOKEN,
        "passcode": PASSCODE,
    }
    fields.update(overrides)
    return make_meeting(db_session, host, **fields)


def _join(client: TestClient, meeting: Meeting, **body: object) -> httpx2.Response:
    request_body: dict[str, object] = {"display_name": "Sam"}
    request_body.update(body)
    return client.post(f"/api/meetings/{meeting.meeting_code}/participants", json=request_body)


def test_a_guest_with_the_invite_token_joins_as_an_attendee(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _live_meeting(db_session, make_user(db_session))

    response = _join(client, meeting, invite_token=TOKEN)

    assert response.status_code == 201
    joined = response.json()
    assert joined["role"] == "attendee"
    assert joined["status"] == "admitted"
    assert joined["display_name"] == "Sam"
    assert len(joined["session_token"]) >= 32
    event = db_session.scalar(select(MeetingEvent).where(MeetingEvent.meeting_id == meeting.id))
    assert event is not None and event.event_type == MeetingEventType.JOINED


def test_a_guest_with_the_passcode_joins(client: TestClient, db_session: Session, me: User) -> None:
    meeting = _live_meeting(db_session, make_user(db_session))

    assert _join(client, meeting, passcode=PASSCODE).status_code == 201


def test_a_guest_without_the_right_credential_is_refused(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _live_meeting(db_session, make_user(db_session))

    assert _join(client, meeting).status_code == 403
    wrong = _join(client, meeting, passcode="nope", invite_token="nope")
    assert wrong.status_code == 403
    assert wrong.json()["detail"] == "Incorrect meeting passcode"


def test_a_guest_waits_for_the_host_unless_join_before_host_is_on(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _live_meeting(db_session, make_user(db_session), status=MeetingStatus.SCHEDULED)

    refused = _join(client, meeting, invite_token=TOKEN)
    meeting.settings.allow_join_before_host = True
    db_session.commit()
    allowed = _join(client, meeting, invite_token=TOKEN)

    assert refused.status_code == 409
    assert refused.json()["detail"] == "Waiting for the host to start this meeting"
    assert allowed.status_code == 201


def test_with_a_waiting_room_a_guest_waits_but_the_host_does_not(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _live_meeting(db_session, me)
    meeting.settings.waiting_room_enabled = True
    db_session.commit()

    guest = _join(client, meeting, invite_token=TOKEN)
    host = _join(client, meeting, display_name="Alex Morgan", join_as="host")

    assert guest.json()["status"] == "waiting"
    assert host.json()["status"] == "admitted"


def test_the_host_door_starts_the_meeting_and_joins_as_host(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, me)  # scheduled, not started

    response = _join(client, meeting, display_name="Alex Morgan", join_as="host")

    assert response.status_code == 201
    assert response.json()["role"] == "host"
    assert response.json()["meeting"]["status"] == "live"


def test_only_the_host_may_use_the_host_door(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _live_meeting(db_session, make_user(db_session))

    assert _join(client, meeting, join_as="host").status_code == 403


def test_ended_and_cancelled_meetings_cannot_be_joined(
    client: TestClient, db_session: Session, me: User
) -> None:
    for status in (MeetingStatus.ENDED, MeetingStatus.CANCELLED):
        meeting = _live_meeting(
            db_session, make_user(db_session), status=status, invite_token=f"token-{status}"
        )

        assert _join(client, meeting, invite_token=meeting.invite_token).status_code == 409


def test_every_join_is_a_new_session_with_its_own_token(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _live_meeting(db_session, make_user(db_session))

    first = _join(client, meeting, invite_token=TOKEN).json()
    second = _join(client, meeting, invite_token=TOKEN).json()

    assert first["participant_id"] != second["participant_id"]
    assert first["session_token"] != second["session_token"]


def test_a_blank_display_name_is_rejected(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _live_meeting(db_session, make_user(db_session))

    assert _join(client, meeting, display_name="   ", invite_token=TOKEN).status_code == 422
