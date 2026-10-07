"""
Behaviors proven in this file (fixes from the security review, docs/DECISIONS.md D-090):
1. Knowing a meeting's ID is not enough to read its private parts: details (passcode,
   invite link, invitees), the .ics file, the summary and the chat history all answer
   403 to someone with no account and no join ticket.
2. The host's account, and a guest presenting a join ticket for that meeting, can read
   them. A join ticket from a different meeting can't.
3. Signing up with someone's email doesn't reveal the meetings that address was invited
   to (new accounts are unverified); a verified account sees them.
4. Password guessing: after 5 wrong passwords for an account, even the right one is
   refused for a while (429). Other accounts are unaffected.
5. Passcode guessing: after 10 wrong passcodes for a meeting, passcode joins are refused
   (429), while invite links still work.
6. The guessing limit forgets failures once the time window has passed.
7. An oversized meeting-room message is refused, and the connection stays usable.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Meeting, MeetingInvitee, User
from app.models.enums import MeetingStatus
from app.realtime.room_handler import MAX_MESSAGE_CHARACTERS
from app.services.attempt_limiter import AttemptLimiter
from app.services.errors import TooManyRequestsError
from tests.factories import make_meeting, make_user
from tests.room_helpers import PASSCODE, join, live_meeting, receive_until, room_url

PRIVATE_PATHS = ["", "/ics", "/summary", "/messages"]


def _anonymous(client: TestClient) -> TestClient:
    """The same app, but sending no sign-in token (a stranger's browser)."""
    client.headers.pop("Authorization", None)
    return client


@pytest.mark.parametrize("suffix", PRIVATE_PATHS)
def test_a_meeting_id_alone_reveals_nothing_private(
    client: TestClient, db_session: Session, me: User, suffix: str
) -> None:
    meeting = live_meeting(db_session, me)

    response = _anonymous(client).get(f"/api/meetings/{meeting.meeting_code}{suffix}")

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Only the host and people in this meeting can see its details"
    }


def test_the_host_and_guests_in_the_meeting_can_read_its_details(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me)
    other_meeting = live_meeting(db_session, me)
    guest = join(client, meeting, name="Sam")
    stranger = join(client, other_meeting, name="Kai")
    path = f"/api/meetings/{meeting.meeting_code}"

    as_host = client.get(path)
    anonymous = _anonymous(client)
    as_guest = anonymous.get(path, headers={"X-Session-Token": guest.session_token})
    guest_summary = anonymous.get(
        f"{path}/summary", headers={"X-Session-Token": guest.session_token}
    )
    with_other_ticket = anonymous.get(path, headers={"X-Session-Token": stranger.session_token})

    assert as_host.status_code == 200
    assert as_host.json()["passcode"] == PASSCODE
    assert as_guest.status_code == 200
    assert guest_summary.status_code == 200
    assert with_other_ticket.status_code == 403


def test_signing_up_with_someone_elses_email_reveals_no_invitations(
    client: TestClient, db_session: Session
) -> None:
    host = make_user(db_session)
    meeting = make_meeting(db_session, host)
    meeting.invitees.append(MeetingInvitee(email="victim@example.com"))
    db_session.commit()

    signed_up = client.post(
        "/api/auth/signup",
        json={"name": "Not Victim", "email": "victim@example.com", "password": "long-enough-1"},
    )
    headers = {"Authorization": f"Bearer {signed_up.json()['token']}"}
    listed = client.get("/api/meetings", params={"scope": "upcoming"}, headers=headers)
    details = client.get(f"/api/meetings/{meeting.meeting_code}", headers=headers)

    assert listed.json() == []
    assert details.status_code == 403


def test_a_verified_invitee_sees_the_invitation(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, make_user(db_session))
    meeting.invitees.append(MeetingInvitee(email=me.email))
    db_session.commit()

    details = client.get(f"/api/meetings/{meeting.meeting_code}")

    assert me.email_verified
    assert details.status_code == 200


def test_too_many_wrong_passwords_lock_that_account_for_a_while(
    client: TestClient, db_session: Session
) -> None:
    for email in ("target@example.com", "bystander@example.com"):
        client.post(
            "/api/auth/signup",
            json={"name": "Someone", "email": email, "password": "right-password"},
        )

    def log_in(email: str, password: str) -> int:
        response = client.post("/api/auth/login", json={"email": email, "password": password})
        return response.status_code

    wrong_answers = [log_in("target@example.com", f"guess-{n}") for n in range(5)]
    locked = client.post(
        "/api/auth/login", json={"email": "target@example.com", "password": "right-password"}
    )

    assert wrong_answers == [401] * 5
    assert locked.status_code == 429
    assert locked.json()["detail"].startswith("Too many failed attempts")
    assert log_in("bystander@example.com", "right-password") == 200


def test_too_many_wrong_passcodes_stop_passcode_joins_but_not_invite_links(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = live_meeting(db_session, me, invite_token="invite-token")
    path = f"/api/meetings/{meeting.meeting_code}/participants"

    wrong = [
        client.post(path, json={"display_name": "Bot", "passcode": f"x{n}"}).status_code
        for n in range(10)
    ]
    right_passcode = client.post(path, json={"display_name": "Sam", "passcode": PASSCODE})
    invite_link = client.post(path, json={"display_name": "Sam", "invite_token": "invite-token"})

    assert wrong == [403] * 10
    assert right_passcode.status_code == 429
    assert invite_link.status_code == 201


def test_the_guessing_limit_forgets_old_failures() -> None:
    now = [0.0]
    limiter = AttemptLimiter(max_failures=2, window_seconds=60, clock=lambda: now[0])
    limiter.record_failure("key")
    limiter.record_failure("key")

    with pytest.raises(TooManyRequestsError):
        limiter.check("key")
    now[0] = 61.0
    limiter.check("key")  # the window has passed: allowed again


def test_an_oversized_room_message_is_refused(
    live_client: TestClient, db_session: Session, me: User
) -> None:
    meeting: Meeting = live_meeting(db_session, me, status=MeetingStatus.LIVE)
    host = join(live_client, meeting, name="Alex Morgan", as_host=True)

    with live_client.websocket_connect(room_url(meeting, host)) as socket:
        socket.receive_json()  # welcome
        socket.send_text("x" * (MAX_MESSAGE_CHARACTERS + 1))
        refused = receive_until(socket, "error")
        socket.send_json({"type": "raise_hand"})
        still_working = receive_until(socket, "hand_changed")

    assert refused["message"] == "That message is too large"
    assert still_working["type"] == "hand_changed"
