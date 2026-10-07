"""
Behaviors proven in this file (the waiting room and host controls, all checked on the
server against the sender's role):
1. With a waiting room, a guest is told to wait, and the host sees them in the list.
2. Admitting brings the guest straight in (welcome), records it, and updates the list.
3. Denying turns them away (removed: denied) and deletes their row; Admit all lets
   everyone in.
4. Someone still waiting can't use the meeting (only leave).
5. An attendee can't use host controls.
6. A host can mute one person (they're told, it's logged) or everyone but hosts and
   co-hosts, and can ask someone to unmute.
7. Removing someone tells them, disconnects them, tells the others, and they can't
   reconnect. The host can't be removed.
8. The host can make someone a co-host, who can then use host controls (but not
   appoint co-hosts).
9. The host can hand over the host role; the new host (even a guest) can end the meeting.
10. A locked meeting refuses new guests over REST; the host can still get in.
"""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from app.models import MeetingEvent, Participant, User
from app.models.enums import MeetingEventType, ParticipantStatus
from tests.room_helpers import (
    PASSCODE,
    join,
    live_meeting,
    receive_until,
    refusal,
    room_url,
)


def _meeting_with_waiting_room(db_session: Session, host: User):  # noqa: ANN202
    meeting = live_meeting(db_session, host)
    meeting.settings.waiting_room_enabled = True
    db_session.commit()
    return meeting


def test_a_guest_waits_and_the_host_sees_them_in_the_list(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _meeting_with_waiting_room(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            told_to_wait = guest_socket.receive_json()
            waiting_list = receive_until(host_socket, "waiting_room")

    assert told_to_wait == {"type": "waiting"}
    assert waiting_list["participants"] == [
        {"participant_id": guest.participant_id, "display_name": "Sam"}
    ]


def test_admitting_brings_the_guest_in(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _meeting_with_waiting_room(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            receive_until(guest_socket, "waiting")
            receive_until(host_socket, "waiting_room")
            host_socket.send_json({"type": "admit", "participant_id": guest.participant_id})
            guest_welcome = receive_until(guest_socket, "welcome")
            joined = receive_until(host_socket, "participant_joined")
            emptied = receive_until(host_socket, "waiting_room")
            # Checked while still connected (leaving the block disconnects the guest).
            db_session.expire_all()
            participant = db_session.get(Participant, guest.participant_id)
            assert participant is not None and participant.status == ParticipantStatus.ADMITTED

    assert [p["display_name"] for p in guest_welcome["participants"]] == ["Alex Morgan", "Sam"]
    assert joined["participant"]["participant_id"] == guest.participant_id
    assert emptied["participants"] == []
    admitted_events = db_session.scalars(
        select(MeetingEvent).where(MeetingEvent.event_type == MeetingEventType.ADMITTED)
    ).all()
    assert len(admitted_events) == 1


def test_denying_turns_the_guest_away_and_admit_all_lets_everyone_in(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _meeting_with_waiting_room(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    sam = join(live_client, meeting, name="Sam")
    priya = join(live_client, meeting, name="Priya")
    lee = join(live_client, meeting, name="Lee")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with (
            live_client.websocket_connect(room_url(meeting, sam)) as sam_socket,
            live_client.websocket_connect(room_url(meeting, priya)) as priya_socket,
            live_client.websocket_connect(room_url(meeting, lee)) as lee_socket,
        ):
            for socket in (sam_socket, priya_socket, lee_socket):
                receive_until(socket, "waiting")
            host_socket.send_json({"type": "deny", "participant_id": sam.participant_id})
            sam_told = sam_socket.receive_json()
            sam_closed = _was_disconnected(sam_socket)
            host_socket.send_json({"type": "admit_all"})
            priya_welcome = receive_until(priya_socket, "welcome")
            lee_welcome = receive_until(lee_socket, "welcome")

    assert sam_told == {"type": "removed", "reason": "denied"}
    assert sam_closed
    db_session.expire_all()
    assert db_session.get(Participant, sam.participant_id) is None  # never got in
    assert priya_welcome["type"] == lee_welcome["type"] == "welcome"


def test_someone_waiting_can_only_leave(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _meeting_with_waiting_room(db_session, me)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
        receive_until(guest_socket, "waiting")
        guest_socket.send_json({"type": "chat_message", "text": "let me in"})
        answer = guest_socket.receive_json()

    assert answer == {"type": "error", "message": "You're still in the waiting room"}


def test_an_attendee_cannot_use_host_controls(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            receive_until(guest_socket, "welcome")
            guest_socket.send_json(
                {"type": "mute_participant", "participant_id": host.participant_id}
            )
            refused = receive_until(guest_socket, "error")

    assert refused["message"] == "Only the host or a co-host can do that"


def test_the_host_can_mute_one_person_or_everyone_and_ask_to_unmute(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    sam = join(live_client, meeting, name="Sam")
    priya = join(live_client, meeting, name="Priya")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        host_socket.send_json({"type": "media_state", "is_mic_on": True, "is_camera_on": True})
        with live_client.websocket_connect(room_url(meeting, sam)) as sam_socket:
            receive_until(sam_socket, "welcome")
            with live_client.websocket_connect(room_url(meeting, priya)) as priya_socket:
                receive_until(priya_socket, "welcome")
                for socket in (sam_socket, priya_socket):
                    socket.send_json(
                        {"type": "media_state", "is_mic_on": True, "is_camera_on": True}
                    )
                receive_until(host_socket, "media_state")
                receive_until(host_socket, "media_state")

                host_socket.send_json(
                    {"type": "mute_participant", "participant_id": sam.participant_id}
                )
                sam_muted = receive_until(sam_socket, "muted_by_host")
                host_socket.send_json({"type": "mute_all"})
                priya_muted = receive_until(priya_socket, "muted_by_host")
                host_socket.send_json(
                    {"type": "ask_to_unmute", "participant_id": priya.participant_id}
                )
                priya_asked = receive_until(priya_socket, "asked_to_unmute")

    assert sam_muted == {"type": "muted_by_host"}
    assert priya_muted == {"type": "muted_by_host"}
    assert priya_asked == {"type": "asked_to_unmute"}
    muted_events = db_session.scalars(
        select(MeetingEvent).where(MeetingEvent.event_type == MeetingEventType.MUTED_BY_HOST)
    ).all()
    muted_ids = sorted(event.participant_id for event in muted_events)
    # Sam (once alone, once by "mute all") and Priya; never the host.
    assert muted_ids == sorted([sam.participant_id, sam.participant_id, priya.participant_id])


def test_removing_someone_disconnects_them_for_good(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            receive_until(guest_socket, "welcome")
            guest_socket.send_json(
                {"type": "remove_participant", "participant_id": host.participant_id}
            )
            cant_remove_host = receive_until(guest_socket, "error")
            host_socket.send_json(
                {"type": "remove_participant", "participant_id": guest.participant_id}
            )
            guest_told = receive_until(guest_socket, "removed")
            guest_closed = _was_disconnected(guest_socket)
            left = receive_until(host_socket, "participant_left")
        # Checked while the host is still in (once the host leaves, the meeting is over).
        rejoin = refusal(live_client, room_url(meeting, guest))

    assert cant_remove_host["message"] == "Only the host or a co-host can do that"
    assert guest_told == {"type": "removed", "reason": "removed"}
    assert guest_closed
    assert left["participant_id"] == guest.participant_id
    db_session.expire_all()
    participant = db_session.get(Participant, guest.participant_id)
    assert participant is not None and participant.status == ParticipantStatus.REMOVED
    assert rejoin.reason == "You've left this meeting. Join again to come back."


def test_a_co_host_can_use_host_controls_but_not_appoint_co_hosts(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = _meeting_with_waiting_room(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    sam = join(live_client, meeting, name="Sam")
    host_socket_url = room_url(meeting, host)

    with live_client.websocket_connect(host_socket_url) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, sam)) as sam_socket:
            receive_until(sam_socket, "waiting")
            host_socket.send_json({"type": "admit", "participant_id": sam.participant_id})
            receive_until(sam_socket, "welcome")
            host_socket.send_json(
                {"type": "set_co_host", "participant_id": sam.participant_id, "is_co_host": True}
            )
            role_changed = receive_until(sam_socket, "role_changed")
            sam_socket.send_json({"type": "lock_meeting", "is_locked": True})
            locked = receive_until(host_socket, "meeting_locked")
            sam_socket.send_json(
                {"type": "set_co_host", "participant_id": host.participant_id, "is_co_host": True}
            )
            refused = receive_until(sam_socket, "error")

    assert role_changed == {
        "type": "role_changed",
        "participant_id": sam.participant_id,
        "role": "co_host",
    }
    assert locked == {"type": "meeting_locked", "is_locked": True}
    assert refused["message"] == "Only the host can do that"


def test_the_new_host_can_end_the_meeting_after_a_handover(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            receive_until(guest_socket, "welcome")
            host_socket.send_json({"type": "make_host", "participant_id": guest.participant_id})
            first_change = receive_until(guest_socket, "role_changed")
            second_change = receive_until(guest_socket, "role_changed")
            host_socket.send_json({"type": "leave"})
            receive_until(guest_socket, "participant_left")
            guest_socket.send_json({"type": "end_meeting"})
            ended = receive_until(guest_socket, "meeting_ended")

    assert first_change == {
        "type": "role_changed",
        "participant_id": guest.participant_id,
        "role": "host",
    }
    assert second_change == {
        "type": "role_changed",
        "participant_id": host.participant_id,
        "role": "attendee",
    }
    assert ended == {"type": "meeting_ended"}


def test_a_locked_meeting_refuses_new_guests_but_not_the_host(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    join_url = f"/api/meetings/{meeting.meeting_code}/participants"

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        host_socket.send_json({"type": "lock_meeting", "is_locked": True})
        receive_until(host_socket, "meeting_locked")
        guest_attempt = live_client.post(
            join_url, json={"display_name": "Late", "join_as": "guest", "passcode": PASSCODE}
        )
        host_attempt = live_client.post(join_url, json={"display_name": "Alex", "join_as": "host"})

    assert guest_attempt.status_code == 409
    assert guest_attempt.json()["detail"] == "This meeting has been locked by the host"
    assert host_attempt.status_code == 201


def _was_disconnected(socket) -> bool:  # noqa: ANN001
    try:
        socket.receive_json()
    except WebSocketDisconnect:
        return True
    return False
