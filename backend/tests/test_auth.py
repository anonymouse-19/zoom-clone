"""
Behaviors proven in this file (accounts: /api/auth/signup, /login, /logout):
1. Signing up creates the account and its Personal Meeting Room, and signs it in: the
   returned token works for GET /api/me. The email is stored lowercase.
2. An email that already has an account is refused (409); a short password, a bad
   email or a blank name is rejected (422).
3. The database never holds the password or the token, only their hashes.
4. Logging in with the right password signs in; a wrong password and an unknown email
   get the same 401 message. The email's case doesn't matter.
5. Logging out ends that session (its token gets 401 afterwards), and only that one.
6. An expired session, or a made-up token, counts as not signed in (401).
7. Signed-in routes refuse requests without a token (401).
8. Guests need no account: they can look up an invite link and join by it. The host
   door, though, needs the host to be signed in.
9. Passwords: the same password hashes differently each time (salt), and only the
   right password verifies.
"""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuthSession, Meeting, User
from app.models.enums import MeetingStatus, MeetingType
from app.models.types import utc_now
from app.services.passwords import hash_password, verify_password
from tests.factories import make_meeting, make_user

PASSWORD = "correct-horse-1"


def _sign_up(client: TestClient, **overrides: object) -> dict:  # type: ignore[type-arg]
    body: dict[str, object] = {
        "name": "Sam Lee",
        "email": "Sam.Lee@Example.com",
        "password": PASSWORD,
        "timezone": "Europe/London",
    }
    body.update(overrides)
    response = client.post("/api/auth/signup", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_signing_up_creates_the_account_and_signs_it_in(
    client: TestClient, db_session: Session
) -> None:
    signed_up = _sign_up(client)

    assert signed_up["user"]["name"] == "Sam Lee"
    assert signed_up["user"]["email"] == "sam.lee@example.com"
    assert signed_up["user"]["timezone"] == "Europe/London"
    me = client.get("/api/me", headers=_bearer(signed_up["token"]))
    assert me.status_code == 200
    assert me.json() == signed_up["user"]
    # Their Personal Meeting Room exists, under their Personal Meeting ID.
    personal_room = db_session.scalar(
        select(Meeting).where(Meeting.meeting_code == signed_up["user"]["personal_meeting_id"])
    )
    assert personal_room is not None
    assert personal_room.type == MeetingType.PERSONAL
    assert personal_room.host_id == signed_up["user"]["id"]


def test_an_email_can_only_have_one_account(client: TestClient) -> None:
    _sign_up(client)

    again = client.post(
        "/api/auth/signup",
        json={"name": "Other", "email": "sam.lee@EXAMPLE.com", "password": PASSWORD},
    )

    assert again.status_code == 409
    assert again.json() == {"detail": "An account with this email already exists. Log in instead."}


@pytest.mark.parametrize(
    "bad_field",
    [{"password": "short"}, {"email": "not-an-email"}, {"name": "   "}],
)
def test_invalid_sign_up_details_are_rejected(
    client: TestClient, bad_field: dict[str, str]
) -> None:
    body = {"name": "Sam", "email": "sam@example.com", "password": PASSWORD, **bad_field}

    assert client.post("/api/auth/signup", json=body).status_code == 422


def test_the_database_keeps_only_hashes(client: TestClient, db_session: Session) -> None:
    signed_up = _sign_up(client)

    user = db_session.get(User, signed_up["user"]["id"])
    assert user is not None and user.password_hash is not None
    assert PASSWORD not in user.password_hash
    assert user.password_hash.startswith("scrypt$")
    session = db_session.scalar(select(AuthSession).where(AuthSession.user_id == user.id))
    assert session is not None
    assert session.token_hash != signed_up["token"]


def test_logging_in_with_the_right_password(client: TestClient) -> None:
    _sign_up(client)

    response = client.post(
        "/api/auth/login", json={"email": "SAM.LEE@example.com", "password": PASSWORD}
    )

    assert response.status_code == 200
    me = client.get("/api/me", headers=_bearer(response.json()["token"]))
    assert me.json()["email"] == "sam.lee@example.com"


@pytest.mark.parametrize(
    "credentials",
    [
        {"email": "sam.lee@example.com", "password": "wrong-password"},
        {"email": "nobody@example.com", "password": PASSWORD},
    ],
)
def test_a_wrong_password_and_an_unknown_email_look_the_same(
    client: TestClient, credentials: dict[str, str]
) -> None:
    _sign_up(client)

    response = client.post("/api/auth/login", json=credentials)

    assert response.status_code == 401
    assert response.json() == {"detail": "Incorrect email or password"}


def test_logging_out_ends_only_that_session(client: TestClient) -> None:
    first_browser = _sign_up(client)["token"]
    login = client.post(
        "/api/auth/login", json={"email": "sam.lee@example.com", "password": PASSWORD}
    )
    second_browser = login.json()["token"]

    logout = client.post("/api/auth/logout", headers=_bearer(first_browser))

    assert logout.status_code == 204
    assert client.get("/api/me", headers=_bearer(first_browser)).status_code == 401
    assert client.get("/api/me", headers=_bearer(second_browser)).status_code == 200
    # Logging out again is harmless.
    assert client.post("/api/auth/logout", headers=_bearer(first_browser)).status_code == 204


def test_an_expired_or_made_up_token_is_not_signed_in(
    client: TestClient, db_session: Session
) -> None:
    token = _sign_up(client)["token"]
    session = db_session.scalars(select(AuthSession)).one()
    session.expires_at = utc_now() - timedelta(minutes=1)
    db_session.commit()

    assert client.get("/api/me", headers=_bearer(token)).status_code == 401
    assert client.get("/api/me", headers=_bearer("made-up-token")).status_code == 401
    # The expired session was tidied away.
    db_session.expire_all()
    assert db_session.scalars(select(AuthSession)).all() == []


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/meetings"),
        ("POST", "/api/meetings/instant"),
        ("POST", "/api/meetings"),
    ],
)
def test_signed_in_routes_refuse_requests_without_a_token(
    client: TestClient, method: str, path: str
) -> None:
    response = client.request(method, path, json={})

    assert response.status_code == 401


def test_guests_join_by_link_without_an_account(client: TestClient, db_session: Session) -> None:
    host = make_user(db_session)
    meeting = make_meeting(db_session, host, status=MeetingStatus.LIVE, invite_token="tok")
    link = f"http://frontend.test/j/{meeting.meeting_code}?tk=tok"

    looked_up = client.get("/api/meetings/resolve", params={"q": link})
    joined = client.post(
        f"/api/meetings/{meeting.meeting_code}/participants",
        json={"display_name": "Guest", "invite_token": "tok"},
    )

    assert looked_up.status_code == 200
    assert looked_up.json()["state"] == "ready"
    assert looked_up.json()["you_are_host"] is False
    assert joined.status_code == 201
    assert joined.json()["role"] == "attendee"


def test_the_host_door_needs_the_host_to_be_signed_in(
    client: TestClient, db_session: Session
) -> None:
    host = make_user(db_session)
    meeting = make_meeting(db_session, host)

    response = client.post(
        f"/api/meetings/{meeting.meeting_code}/participants",
        json={"display_name": "Someone", "join_as": "host"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Log in as the host to start this meeting"}


def test_a_password_hash_is_salted_and_verifies_only_the_right_password() -> None:
    first = hash_password(PASSWORD)
    second = hash_password(PASSWORD)

    assert first != second  # a new random salt each time
    assert verify_password(PASSWORD, first)
    assert verify_password(PASSWORD, second)
    assert not verify_password("wrong-password", first)
