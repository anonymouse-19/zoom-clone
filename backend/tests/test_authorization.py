"""
Behaviors proven in this file (who may do what):
1. A non-host gets 403 for every host-only action (edit, cancel, start, end), and the
   meeting is left unchanged.
2. "Who is the current user" comes from one dependency: swap it, and the same request
   is allowed. That's the seam where real authentication would plug in.
3. GET /api/me returns the default user; if that user is missing, the API says so (503).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.models import Meeting, User
from app.models.enums import MeetingStatus
from tests.factories import make_meeting, make_user

HOST_ONLY_ACTIONS = [
    ("PATCH", "", MeetingStatus.SCHEDULED),
    ("DELETE", "", MeetingStatus.SCHEDULED),
    ("POST", "/start", MeetingStatus.SCHEDULED),
    ("POST", "/end", MeetingStatus.LIVE),
]


@pytest.mark.parametrize(("method", "path_suffix", "starting_status"), HOST_ONLY_ACTIONS)
def test_non_host_cannot_control_someone_elses_meeting(
    client: TestClient,
    db_session: Session,
    me: User,
    method: str,
    path_suffix: str,
    starting_status: MeetingStatus,
) -> None:
    someone_else = make_user(db_session)
    meeting = make_meeting(db_session, someone_else, status=starting_status, title="Theirs")
    path = f"/api/meetings/{meeting.meeting_code}{path_suffix}"
    body = {"title": "Hijacked"} if method == "PATCH" else None

    response = client.request(method, path, json=body)

    assert response.status_code == 403
    assert response.json() == {"detail": "Only the host can do this"}
    db_session.expire_all()
    unchanged = db_session.get(Meeting, meeting.id)
    assert unchanged is not None
    assert unchanged.title == "Theirs"
    assert unchanged.status == starting_status


def test_the_current_user_comes_from_a_single_dependency(
    client: TestClient, db_session: Session, me: User
) -> None:
    someone_else = make_user(db_session)
    meeting = make_meeting(db_session, someone_else)
    path = f"/api/meetings/{meeting.meeting_code}/start"
    assert client.post(path).status_code == 403

    # Pretend "someone_else" logged in. Only the one dependency changes.
    client.app.dependency_overrides[get_current_user] = lambda: someone_else  # type: ignore[attr-defined]

    assert client.post(path).status_code == 200


def test_me_returns_the_default_user(client: TestClient, me: User) -> None:
    response = client.get("/api/me")

    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert response.json()["name"] == "Alex Morgan"


def test_me_reports_a_missing_default_user_as_503(client: TestClient) -> None:
    response = client.get("/api/me")  # no `me` fixture, so user 1 doesn't exist

    assert response.status_code == 503
