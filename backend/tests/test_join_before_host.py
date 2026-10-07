"""
Behaviors proven in this file ("Allow participants to join before host"):
1. With it on, a guest's join starts the meeting (it goes live, "meeting started" is
   logged), and the meeting room lets the guest in.
2. With a waiting room as well, guests still wait for the host: nobody could admit them.
3. If every guest leaves before the host comes, the meeting goes back to "waiting for
   the host" (not "ended"), and the host can still start it.
4. Once the host has been in, the last person leaving ends the meeting as usual.
5. Without it, the room refuses a not-yet-started meeting with "The host hasn't started
   this meeting yet", not "This meeting has ended".
6. The link lookup includes the scheduled start time, for the waiting screen.
"""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Meeting, MeetingEvent, User
from app.models.enums import MeetingEventType, MeetingStatus
from tests.factories import make_meeting, make_participant
from tests.room_helpers import (
    PASSCODE,
    JoinedParticipant,
    join,
    receive_until,
    refusal,
    room_url,
    wait_until,
)


def _scheduled_meeting(db_session: Session, host: User, *, join_before_host: bool) -> Meeting:
    meeting = make_meeting(db_session, host, passcode=PASSCODE)
    meeting.settings.allow_join_before_host = join_before_host
    db_session.commit()
    return meeting


def _status(db_session: Session, meeting: Meeting) -> MeetingStatus:
    db_session.expire_all()
    return db_session.scalars(select(Meeting.status).where(Meeting.id == meeting.id)).one()


def test_a_guest_joining_before_the_host_starts_the_meeting(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _scheduled_meeting(db_session, me, join_before_host=True)

    guest = join(live_client, meeting, name="Sam")
    with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
        welcome = guest_socket.receive_json()
        assert _status(db_session, meeting) == MeetingStatus.LIVE

    assert welcome["type"] == "welcome"
    started = db_session.scalars(
        select(MeetingEvent).where(
            MeetingEvent.meeting_id == meeting.id,
            MeetingEvent.event_type == MeetingEventType.MEETING_STARTED,
        )
    ).all()
    assert len(started) == 1


def test_with_a_waiting_room_guests_still_wait_for_the_host(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _scheduled_meeting(db_session, me, join_before_host=True)
    meeting.settings.waiting_room_enabled = True
    db_session.commit()

    response = client.post(
        f"/api/meetings/{meeting.meeting_code}/participants",
        json={"display_name": "Sam", "passcode": PASSCODE},
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Waiting for the host to start this meeting"}
    assert _status(db_session, meeting) == MeetingStatus.SCHEDULED


def test_if_guests_leave_before_the_host_comes_the_host_can_still_start_it(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _scheduled_meeting(db_session, me, join_before_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
        guest_socket.receive_json()  # welcome
        guest_socket.send_json({"type": "leave"})
        wait_until(lambda: _status(db_session, meeting) == MeetingStatus.SCHEDULED)

    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        assert host_socket.receive_json()["type"] == "welcome"
        assert _status(db_session, meeting) == MeetingStatus.LIVE


def test_once_the_host_has_been_in_the_last_person_leaving_ends_it(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _scheduled_meeting(db_session, me, join_before_host=True)
    guest = join(live_client, meeting, name="Sam")
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        host_socket.receive_json()  # welcome
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            guest_socket.receive_json()  # welcome
            receive_until(host_socket, "participant_joined")
            host_socket.send_json({"type": "leave"})
            receive_until(guest_socket, "participant_left")
            guest_socket.send_json({"type": "leave"})
            wait_until(lambda: _status(db_session, meeting) == MeetingStatus.ENDED)


def test_the_room_says_the_host_has_not_started_yet(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _scheduled_meeting(db_session, me, join_before_host=False)
    # A join session for a meeting that isn't running (e.g. an old tab after it reopened).
    participant = make_participant(db_session, meeting, session_token="old-tab-token")
    old_tab = JoinedParticipant(participant_id=participant.id, session_token="old-tab-token")

    refused = refusal(live_client, room_url(meeting, old_tab))

    assert refused.reason == "The host hasn't started this meeting yet"


def test_the_link_lookup_includes_the_scheduled_start(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _scheduled_meeting(db_session, me, join_before_host=False)

    response = client.get("/api/meetings/resolve", params={"q": meeting.meeting_code})

    assert response.json()["state"] == "waiting_for_host"
    assert response.json()["start_time"] is not None
