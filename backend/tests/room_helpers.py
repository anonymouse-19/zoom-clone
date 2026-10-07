"""
Helpers shared by the meeting-room tests (test_room_websocket.py, test_room_features.py,
test_host_controls.py): set up a live meeting, join it over REST, and talk to its WebSocket.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from starlette.testclient import WebSocketTestSession
from starlette.websockets import WebSocketDisconnect

from app.models import Meeting, User
from app.models.enums import MeetingStatus
from app.models.types import utc_now
from tests.factories import make_meeting

PASSCODE = "Pa55wd"


@dataclass
class JoinedParticipant:
    """What POST /participants hands a browser: who it is, and its secret token."""

    participant_id: int
    session_token: str


def live_meeting(db_session: Session, host: User, **overrides: object) -> Meeting:
    """A meeting that's running, as if its host started it a few minutes ago."""
    fields: dict[str, object] = {
        "status": MeetingStatus.LIVE,
        "passcode": PASSCODE,
        "started_at": utc_now() - timedelta(minutes=5),
    }
    fields.update(overrides)
    return make_meeting(db_session, host, **fields)


def join(
    client: TestClient, meeting: Meeting, *, name: str, as_host: bool = False
) -> JoinedParticipant:
    """Join over REST, like the pre-join screen (guest door) or Start (host door)."""
    join_as = "guest"
    if as_host:
        join_as = "host"
    response = client.post(
        f"/api/meetings/{meeting.meeting_code}/participants",
        json={"display_name": name, "join_as": join_as, "passcode": PASSCODE},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return JoinedParticipant(
        participant_id=body["participant_id"], session_token=body["session_token"]
    )


def room_url(meeting: Meeting, joined: JoinedParticipant) -> str:
    return (
        f"/ws/meetings/{meeting.meeting_code}"
        f"?participant_id={joined.participant_id}&session_token={joined.session_token}"
    )


def receive_until(socket: WebSocketTestSession, message_type: str) -> dict[str, Any]:
    """Read messages until one of `message_type` arrives, skipping others (e.g. the
    "participant_joined" notices a test doesn't care about). Returns that message."""
    while True:
        message: dict[str, Any] = socket.receive_json()
        if message["type"] == message_type:
            return message


def names(participants: list[dict[str, Any]]) -> list[str]:
    return sorted(entry["display_name"] for entry in participants)


def refusal(client: TestClient, url: str) -> WebSocketDisconnect:
    """Connect, expect to be closed straight away, and return the close details."""
    with client.websocket_connect(url) as socket, pytest.raises(WebSocketDisconnect) as closed:
        socket.receive_json()
    return closed.value


def wait_until(condition: Callable[[], bool], timeout_seconds: float = 3) -> None:
    """Some work happens in the background after a test's last message (e.g. recording a
    dropped connection's leave). Check `condition` until it holds, or fail."""
    deadline = time.monotonic() + timeout_seconds
    while not condition():
        if time.monotonic() > deadline:
            raise AssertionError("condition never became true")
        time.sleep(0.02)
