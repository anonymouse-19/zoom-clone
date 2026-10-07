"""
Behaviors proven in this file (the meeting room WebSocket, /ws/meetings/{code}: connecting,
leaving and reconnecting):
1. Whoever connects first gets a "welcome" listing only themselves, plus the chat so
   far, the room settings, and whether the meeting is locked.
2. A newcomer's welcome lists everyone present, and everyone else is told they joined.
3. A WebRTC signal reaches only the participant it's addressed to, tagged with the sender.
4. Mic / camera changes reach everyone else.
5. Connections are refused (close code 4403, with a reason) for a wrong token or a
   participant of another meeting.
6. When the same join session connects again (another tab), the new connection takes
   over: the old one is closed with 4409, and nobody is told the person left.
7. Saying "leave" tells the others and records "left" at once; that session can't reconnect.
8. A connection that just drops is announced as gone at once, and recorded as "left"
   after the reconnect grace period...
9. ...but if it reconnects within the grace period, it keeps its seat (same participant),
   and the meeting stays live even if they were alone in it.
10. The host can end the meeting for everyone from the room; a guest can't.
11. A message the server doesn't understand gets an error, and the connection stays open.
12. Ending the meeting over REST also hangs up everyone in its room.
13. When the last person in the meeting leaves (or drops and doesn't come back), the
    meeting ends by itself, and anyone still in the waiting room is told.
"""

from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from app.models import Meeting, MeetingEvent, Participant, User
from app.models.enums import MeetingEventType, MeetingStatus, ParticipantStatus
from app.realtime.messages import CLOSE_NORMAL, CLOSE_REFUSED, CLOSE_REPLACED
from tests.room_helpers import (
    JoinedParticipant,
    join,
    live_meeting,
    names,
    receive_until,
    refusal,
    room_url,
    wait_until,
)


def test_the_first_person_in_is_welcomed_with_just_themselves(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        welcome = host_socket.receive_json()

    assert welcome["type"] == "welcome"
    assert welcome["your_participant_id"] == host.participant_id
    assert welcome["participants"] == [
        {
            "participant_id": host.participant_id,
            "display_name": "Alex Morgan",
            "role": "host",
            "is_mic_on": False,
            "is_camera_on": False,
            "is_screen_sharing": False,
            "hand_raised_at": None,
        }
    ]
    assert welcome["chat_history"] == []
    assert welcome["waiting"] == []
    assert welcome["settings"] == {
        "mute_on_entry": False,
        "chat_enabled": True,
        "screen_share": "all",
    }
    assert welcome["is_locked"] is False


def test_a_newcomer_sees_everyone_and_everyone_is_told_about_them(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        host_socket.receive_json()  # host's own welcome
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            guest_welcome = guest_socket.receive_json()
            joined_notice = host_socket.receive_json()

    assert names(guest_welcome["participants"]) == ["Alex Morgan", "Sam"]
    assert joined_notice["type"] == "participant_joined"
    assert joined_notice["participant"]["participant_id"] == guest.participant_id
    assert joined_notice["participant"]["role"] == "attendee"


def test_a_signal_reaches_only_its_addressee(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    sam = join(live_client, meeting, name="Sam")
    priya = join(live_client, meeting, name="Priya")
    offer = {"description": {"type": "offer", "sdp": "v=0..."}}

    # One at a time (each waits for its welcome), so the order of arrival is certain.
    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, sam)) as sam_socket:
            receive_until(sam_socket, "welcome")
            with live_client.websocket_connect(room_url(meeting, priya)) as priya_socket:
                receive_until(priya_socket, "welcome")
                sam_socket.send_json(
                    {"type": "signal", "to_participant_id": host.participant_id, "data": offer}
                )
                # Then a media change, which goes to everyone. Messages on one connection
                # arrive in order, so if Priya's next message is this one, the signal
                # never reached her.
                sam_socket.send_json(
                    {"type": "media_state", "is_mic_on": True, "is_camera_on": False}
                )
                to_host = receive_until(host_socket, "signal")
                priya_next = priya_socket.receive_json()

    assert to_host == {"type": "signal", "from_participant_id": sam.participant_id, "data": offer}
    assert priya_next["type"] == "media_state"


def test_mic_and_camera_changes_reach_everyone_else(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        host_socket.receive_json()  # welcome
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            guest_socket.receive_json()  # welcome
            guest_socket.send_json({"type": "media_state", "is_mic_on": True, "is_camera_on": True})
            change = receive_until(host_socket, "media_state")

    assert change == {
        "type": "media_state",
        "participant_id": guest.participant_id,
        "is_mic_on": True,
        "is_camera_on": True,
        "is_screen_sharing": False,
    }


def test_a_wrong_token_is_refused_with_a_reason(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    guest = join(live_client, meeting, name="Sam")
    forged = JoinedParticipant(participant_id=guest.participant_id, session_token="guessed")

    closed = refusal(live_client, room_url(meeting, forged))

    assert closed.code == CLOSE_REFUSED
    assert closed.reason == "This meeting link has expired. Join the meeting again."


def test_a_session_from_another_meeting_is_refused(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    other_meeting = live_meeting(db_session, me)
    guest_of_other = join(live_client, other_meeting, name="Sam")

    assert refusal(live_client, room_url(meeting, guest_of_other)).code == CLOSE_REFUSED


def test_a_second_connection_for_the_same_session_takes_over(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        host_socket.receive_json()  # welcome
        with live_client.websocket_connect(room_url(meeting, guest)) as first_tab:
            first_tab.receive_json()  # welcome
            receive_until(host_socket, "participant_joined")
            with live_client.websocket_connect(room_url(meeting, guest)) as second_tab:
                second_welcome = second_tab.receive_json()
                with pytest.raises(WebSocketDisconnect) as first_closed:
                    first_tab.receive_json()
                # The host hears "joined" again (the new connection), never "left".
                host_hears = host_socket.receive_json()

    assert second_welcome["type"] == "welcome"
    assert first_closed.value.code == CLOSE_REPLACED
    assert host_hears["type"] == "participant_joined"
    assert host_hears["participant"]["participant_id"] == guest.participant_id


def test_leaving_tells_the_others_and_is_recorded_at_once(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        host_socket.receive_json()  # welcome
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            guest_socket.receive_json()  # welcome
            guest_socket.send_json({"type": "leave"})
            left_notice = receive_until(host_socket, "participant_left")
        # That join session is over: its token no longer opens the room. (Checked while
        # the host is still in: once the host leaves too, the meeting itself is over.)
        rejoin = refusal(live_client, room_url(meeting, guest))

    assert left_notice == {"type": "participant_left", "participant_id": guest.participant_id}
    assert rejoin.reason == "You've left this meeting. Join again to come back."
    db_session.expire_all()  # re-read what the server committed
    participant = db_session.get(Participant, guest.participant_id)
    assert participant is not None
    assert participant.status == ParticipantStatus.LEFT
    assert participant.left_at is not None
    left_events = db_session.scalars(
        select(MeetingEvent).where(
            MeetingEvent.participant_id == guest.participant_id,
            MeetingEvent.event_type == MeetingEventType.LEFT,
        )
    ).all()
    assert len(left_events) == 1


def test_a_dropped_connection_is_announced_and_later_recorded_as_left(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        host_socket.receive_json()  # welcome
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            guest_socket.receive_json()  # welcome
            # The connection drops with no "leave" message, as when the network fails.
            # (Done inside the `with`: leaving the block would also *cancel* the server's
            # handler, a test-client shortcut that a real server doesn't take.)
            guest_socket.close()
            left_notice = receive_until(host_socket, "participant_left")
        # The test settings use a grace period of 0, so it's recorded almost at once.
        wait_until(lambda: _status_of(db_session, guest) == ParticipantStatus.LEFT)

    assert left_notice == {"type": "participant_left", "participant_id": guest.participant_id}


def test_reconnecting_within_the_grace_period_keeps_the_seat(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    room_manager = cast(FastAPI, live_client.app).state.room_manager
    room_manager.reconnect_grace_seconds = 60
    meeting = live_meeting(db_session, me)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, guest)) as first_connection:
        first_connection.receive_json()  # welcome
        first_connection.close()  # e.g. a page refresh or a Wi-Fi blip
    with live_client.websocket_connect(room_url(meeting, guest)) as second_connection:
        welcome = second_connection.receive_json()

    assert welcome["type"] == "welcome"
    assert welcome["your_participant_id"] == guest.participant_id
    assert _status_of(db_session, guest) == ParticipantStatus.ADMITTED
    # Alone in the meeting, but a refresh doesn't end it: the seat was kept.
    assert _meeting_status(db_session, meeting) == MeetingStatus.LIVE


def test_the_host_can_end_the_meeting_for_everyone(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        host_socket.receive_json()  # welcome
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            guest_socket.receive_json()  # welcome
            host_socket.send_json({"type": "end_meeting"})
            guest_notice = guest_socket.receive_json()
            with pytest.raises(WebSocketDisconnect) as guest_closed:
                guest_socket.receive_json()

    assert guest_notice == {"type": "meeting_ended"}
    assert guest_closed.value.code == CLOSE_NORMAL
    db_session.expire_all()
    saved_meeting = db_session.get(Meeting, meeting.id)
    assert saved_meeting is not None and saved_meeting.status == MeetingStatus.ENDED


def test_a_guest_cannot_end_the_meeting(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
        guest_socket.receive_json()  # welcome
        guest_socket.send_json({"type": "end_meeting"})
        answer = guest_socket.receive_json()

    assert answer == {"type": "error", "message": "Only the host can end the meeting for everyone"}
    db_session.expire_all()
    saved_meeting = db_session.get(Meeting, meeting.id)
    assert saved_meeting is not None and saved_meeting.status == MeetingStatus.LIVE


def test_a_message_that_isnt_understood_gets_an_error(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
        guest_socket.receive_json()  # welcome
        guest_socket.send_json({"type": "dance"})
        first_answer = guest_socket.receive_json()
        guest_socket.send_json({"type": "media_state", "is_mic_on": "maybe"})
        second_answer = guest_socket.receive_json()

    assert first_answer == {"type": "error", "message": "That message wasn't understood"}
    assert second_answer["type"] == "error"


def test_ending_over_rest_hangs_up_the_room(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
        guest_socket.receive_json()  # welcome
        response = live_client.post(f"/api/meetings/{meeting.meeting_code}/end")
        notice = guest_socket.receive_json()

    assert response.status_code == 200
    assert response.json()["status"] == "ended"
    assert notice == {"type": "meeting_ended"}


def test_the_meeting_ends_when_the_last_person_in_it_leaves(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        host_socket.receive_json()  # welcome
        host_socket.send_json({"type": "leave"})
        wait_until(lambda: _meeting_status(db_session, meeting) == MeetingStatus.ENDED)

    db_session.refresh(meeting)
    assert meeting.ended_at is not None
    ended_events = db_session.scalars(
        select(MeetingEvent).where(
            MeetingEvent.meeting_id == meeting.id,
            MeetingEvent.event_type == MeetingEventType.MEETING_ENDED,
        )
    ).all()
    assert len(ended_events) == 1


def test_the_meeting_ends_when_the_last_connection_drops_for_good(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        host_socket.receive_json()  # welcome
        host_socket.close()  # no "leave": e.g. the tab was closed
        # The test settings use a grace period of 0, so it ends almost at once.
        wait_until(lambda: _meeting_status(db_session, meeting) == MeetingStatus.ENDED)


def test_people_still_in_the_waiting_room_are_told_when_the_last_person_leaves(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    meeting.settings.waiting_room_enabled = True
    db_session.commit()
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        host_socket.receive_json()  # welcome
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            assert guest_socket.receive_json() == {"type": "waiting"}
            receive_until(host_socket, "waiting_room")
            host_socket.send_json({"type": "leave"})
            notice = guest_socket.receive_json()

    assert notice == {"type": "meeting_ended"}
    assert _meeting_status(db_session, meeting) == MeetingStatus.ENDED


def _meeting_status(db_session: Session, meeting: Meeting) -> MeetingStatus:
    db_session.expire_all()
    return db_session.scalars(select(Meeting.status).where(Meeting.id == meeting.id)).one()


def _status_of(db_session: Session, joined: JoinedParticipant) -> ParticipantStatus:
    db_session.expire_all()
    participant = db_session.get(Participant, joined.participant_id)
    assert participant is not None
    return participant.status
