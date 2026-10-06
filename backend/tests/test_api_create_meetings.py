"""
Behaviors proven in this file (creating meetings through the API):
1. An instant meeting is live at once, with an 11-digit code, a default title and an invite link
   (or a given title, used by "Start again").
2. "Use my Personal Meeting ID" starts the user's personal room instead.
3. If a generated code is already taken, the server retries with a new one.
4. If it can never find a free code, it answers 503 rather than crashing.
5. Scheduling stores settings and invitees (lowercased, without duplicates).
6. An empty title becomes "<host>'s Zoom Meeting".
7. Invalid schedule input is rejected with 422: a start time in the past or without a
   timezone, a bad duration, an unknown timezone, a bad passcode, or a bad email.
"""

import re
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from app.models.enums import MeetingType
from app.services import codes
from tests.factories import make_meeting

TWO_DAYS_FROM_NOW = datetime.now(UTC) + timedelta(days=2)


def _schedule_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "title": "Sprint Planning",
        "start_time": TWO_DAYS_FROM_NOW.isoformat(),
        "duration_minutes": 45,
        "timezone": "Asia/Kolkata",
    }
    body.update(overrides)
    return body


def test_instant_meeting_is_live_with_a_code_title_and_invite_link(
    client: TestClient, me: User
) -> None:
    response = client.post("/api/meetings/instant")

    assert response.status_code == 201
    meeting = response.json()
    assert meeting["status"] == "live"
    assert meeting["type"] == "instant"
    assert re.fullmatch(r"\d{11}", meeting["meeting_code"])
    assert meeting["title"] == "Alex Morgan's Zoom Meeting"
    expected_link_start = f"http://frontend.test/j/{meeting['meeting_code']}?tk="
    assert meeting["invite_link"].startswith(expected_link_start)
    assert meeting["started_at"] is not None


def test_instant_meeting_can_reuse_a_title_for_start_again(client: TestClient, me: User) -> None:
    response = client.post("/api/meetings/instant", json={"title": "Weekly Team Sync"})

    assert response.status_code == 201
    assert response.json()["title"] == "Weekly Team Sync"


def test_instant_meeting_can_use_the_personal_room(
    client: TestClient, db_session: Session, me: User
) -> None:
    make_meeting(
        db_session,
        me,
        meeting_code=me.personal_meeting_id,
        type=MeetingType.PERSONAL,
        start_time=None,
    )

    response = client.post("/api/meetings/instant", json={"use_personal_meeting_id": True})

    assert response.status_code == 201
    assert response.json()["meeting_code"] == me.personal_meeting_id
    assert response.json()["status"] == "live"


def test_a_taken_code_is_retried_with_a_new_one(
    client: TestClient, db_session: Session, me: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_meeting(db_session, me, meeting_code="11111111111")
    codes_to_hand_out = iter(["11111111111", "22222222222"])
    monkeypatch.setattr(codes, "generate_meeting_code", lambda: next(codes_to_hand_out))

    response = client.post("/api/meetings/instant")

    assert response.status_code == 201
    assert response.json()["meeting_code"] == "22222222222"


def test_gives_up_with_503_when_no_free_code_is_found(
    client: TestClient, db_session: Session, me: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    make_meeting(db_session, me, meeting_code="11111111111")
    monkeypatch.setattr(codes, "generate_meeting_code", lambda: "11111111111")

    response = client.post("/api/meetings/instant")

    assert response.status_code == 503


def test_scheduling_stores_settings_and_deduplicated_invitees(client: TestClient, me: User) -> None:
    body = _schedule_body(
        settings={"waiting_room_enabled": True, "mute_on_entry": True},
        invitees=["Sam@Example.com", "sam@example.com", "kai@example.com"],
    )

    response = client.post("/api/meetings", json=body)

    assert response.status_code == 201
    meeting = response.json()
    assert meeting["status"] == "scheduled"
    assert meeting["settings"]["waiting_room_enabled"] is True
    assert meeting["settings"]["mute_on_entry"] is True
    assert meeting["settings"]["chat_enabled"] is True  # untouched default
    invited_emails = [invitee["email"] for invitee in meeting["invitees"]]
    assert sorted(invited_emails) == ["kai@example.com", "sam@example.com"]
    assert "Meeting ID:" in meeting["invitation"]


def test_an_empty_title_becomes_the_default_title(client: TestClient, me: User) -> None:
    response = client.post("/api/meetings", json=_schedule_body(title="   "))

    assert response.status_code == 201
    assert response.json()["title"] == "Alex Morgan's Zoom Meeting"


@pytest.mark.parametrize(
    ("field", "bad_value"),
    [
        ("start_time", (datetime.now(UTC) - timedelta(hours=1)).isoformat()),
        ("start_time", "2030-01-01T10:00:00"),  # no timezone
        ("duration_minutes", 0),
        ("duration_minutes", 24 * 60 + 1),
        ("timezone", "Mars/Olympus_Mons"),
        ("passcode", "has spaces"),
        ("invitees", ["not-an-email"]),
    ],
)
def test_invalid_schedule_input_is_rejected_with_422(
    client: TestClient, me: User, field: str, bad_value: object
) -> None:
    response = client.post("/api/meetings", json=_schedule_body(**{field: bad_value}))

    assert response.status_code == 422
    # FastAPI's 422 body says where each error is, e.g. ["body", "invitees", 0].
    error_locations = [error["loc"] for error in response.json()["detail"]]
    assert any(field in location for location in error_locations)
