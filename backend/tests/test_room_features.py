"""
Behaviors proven in this file (what any participant can do in the meeting room):
1. A chat message to everyone is saved and reaches everyone, the sender included.
2. A private message reaches only its sender and recipient.
3. A newcomer's welcome includes the chat so far, but not other people's private messages.
4. Chat is refused when the meeting has it turned off.
5. Reactions reach everyone, and only allowed emoji are accepted.
6. Raising a hand is broadcast with the time it went up (that's the queue order) and
   logged; lowering it is broadcast too.
7. Only a host can lower someone else's hand.
8. One person can share their screen at a time; everyone (sharer included) is told.
9. When a meeting allows only the host to share, an attendee's share is refused.
"""

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChatMessage, MeetingEvent, User
from app.models.enums import MeetingEventType, ScreenSharePermission
from tests.room_helpers import join, live_meeting, receive_until, room_url


def test_a_message_to_everyone_is_saved_and_reaches_everyone(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            receive_until(guest_socket, "welcome")
            guest_socket.send_json({"type": "chat_message", "text": "  Hello all!  "})
            to_sender = receive_until(guest_socket, "chat_message")
            to_host = receive_until(host_socket, "chat_message")

    assert to_sender == to_host
    message = to_host["message"]
    assert message["body"] == "Hello all!"  # surrounding spaces trimmed
    assert message["sender_name"] == "Sam"
    assert message["recipient_participant_id"] is None
    saved = db_session.scalars(select(ChatMessage)).one()
    assert saved.body == "Hello all!"


def test_a_private_message_reaches_only_sender_and_recipient(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    sam = join(live_client, meeting, name="Sam")
    priya = join(live_client, meeting, name="Priya")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, sam)) as sam_socket:
            receive_until(sam_socket, "welcome")
            with live_client.websocket_connect(room_url(meeting, priya)) as priya_socket:
                receive_until(priya_socket, "welcome")
                sam_socket.send_json(
                    {
                        "type": "chat_message",
                        "text": "psst",
                        "to_participant_id": priya.participant_id,
                    }
                )
                # Then a public one. If the host's next chat message is the public one,
                # the private one never reached the host.
                sam_socket.send_json({"type": "chat_message", "text": "hi everyone"})
                to_priya = receive_until(priya_socket, "chat_message")
                to_host = receive_until(host_socket, "chat_message")

    assert to_priya["message"]["body"] == "psst"
    assert to_priya["message"]["recipient_name"] == "Priya"
    assert to_host["message"]["body"] == "hi everyone"


def test_the_welcome_includes_chat_so_far_but_not_others_private_messages(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    sam = join(live_client, meeting, name="Sam")
    priya = join(live_client, meeting, name="Priya")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, sam)) as sam_socket:
            receive_until(sam_socket, "welcome")
            sam_socket.send_json({"type": "chat_message", "text": "public note"})
            sam_socket.send_json(
                {
                    "type": "chat_message",
                    "text": "for the host",
                    "to_participant_id": host.participant_id,
                }
            )
            receive_until(host_socket, "chat_message")
            receive_until(host_socket, "chat_message")  # both have been saved by now
            with live_client.websocket_connect(room_url(meeting, priya)) as priya_socket:
                priya_welcome = receive_until(priya_socket, "welcome")

    assert [message["body"] for message in priya_welcome["chat_history"]] == ["public note"]


def test_chat_is_refused_when_the_meeting_turned_it_off(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    meeting.settings.chat_enabled = False
    db_session.commit()
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
        receive_until(guest_socket, "welcome")
        guest_socket.send_json({"type": "chat_message", "text": "anyone?"})
        answer = receive_until(guest_socket, "error")

    assert answer["message"] == "The host has turned off chat for this meeting"


def test_reactions_reach_everyone_and_only_allowed_emoji_are_accepted(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            receive_until(guest_socket, "welcome")
            guest_socket.send_json({"type": "reaction", "emoji": "👏"})
            reaction = receive_until(host_socket, "reaction")
            guest_socket.send_json({"type": "reaction", "emoji": "hello"})
            refused = receive_until(guest_socket, "error")

    assert reaction == {"type": "reaction", "participant_id": guest.participant_id, "emoji": "👏"}
    assert refused["message"] == "That message wasn't understood"


def test_a_raised_hand_is_broadcast_with_its_time_and_logged(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            receive_until(guest_socket, "welcome")
            guest_socket.send_json({"type": "raise_hand"})
            raised = receive_until(host_socket, "hand_changed")
            guest_socket.send_json({"type": "lower_hand"})
            lowered = receive_until(host_socket, "hand_changed")

    assert raised["participant_id"] == guest.participant_id
    assert raised["hand_raised_at"] is not None
    assert lowered["hand_raised_at"] is None
    hand_events = db_session.scalars(
        select(MeetingEvent).where(MeetingEvent.event_type == MeetingEventType.HAND_RAISED)
    ).all()
    assert len(hand_events) == 1


def test_only_a_host_can_lower_someone_elses_hand(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    sam = join(live_client, meeting, name="Sam")
    priya = join(live_client, meeting, name="Priya")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, sam)) as sam_socket:
            receive_until(sam_socket, "welcome")
            with live_client.websocket_connect(room_url(meeting, priya)) as priya_socket:
                receive_until(priya_socket, "welcome")
                sam_socket.send_json({"type": "raise_hand"})
                receive_until(host_socket, "hand_changed")
                priya_socket.send_json({"type": "lower_hand", "participant_id": sam.participant_id})
                priya_refused = receive_until(priya_socket, "error")
                host_socket.send_json({"type": "lower_hand", "participant_id": sam.participant_id})
                lowered = receive_until(sam_socket, "hand_changed")
                lowered = receive_until(sam_socket, "hand_changed")  # 1st was Sam's own raise

    assert priya_refused["message"] == "Only the host can lower someone else's hand"
    assert lowered == {
        "type": "hand_changed",
        "participant_id": sam.participant_id,
        "hand_raised_at": None,
    }


def test_only_one_person_can_share_their_screen_at_a_time(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, host)) as host_socket:
        receive_until(host_socket, "welcome")
        with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
            receive_until(guest_socket, "welcome")
            guest_socket.send_json({"type": "start_screen_share"})
            accepted = receive_until(guest_socket, "media_state")
            seen_by_host = receive_until(host_socket, "media_state")
            host_socket.send_json({"type": "start_screen_share"})
            host_refused = receive_until(host_socket, "error")
            guest_socket.send_json({"type": "stop_screen_share"})
            stopped = receive_until(host_socket, "media_state")

    assert accepted["is_screen_sharing"] is True
    assert seen_by_host == accepted
    assert host_refused["message"] == "Sam is already sharing their screen"
    assert stopped["is_screen_sharing"] is False


def test_an_attendee_cannot_share_when_only_the_host_may(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    meeting.settings.allow_screen_share = ScreenSharePermission.HOST_ONLY
    db_session.commit()
    guest = join(live_client, meeting, name="Sam")

    with live_client.websocket_connect(room_url(meeting, guest)) as guest_socket:
        receive_until(guest_socket, "welcome")
        guest_socket.send_json({"type": "start_screen_share"})
        refused = receive_until(guest_socket, "error")

    assert refused["message"] == "Only the host can share their screen in this meeting"
