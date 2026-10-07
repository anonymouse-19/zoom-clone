"""
Behaviors proven in this file (the smart join input, GET /api/meetings/resolve):
1. Every input format resolves to the same code: spaces, dashes, bare digits, our
   invite links (with ?tk=), Zoom-style links (with ?pwd=), and links without "https://".
2. Garbage input is reported as invalid, not as an error.
3. The join state is right for each situation: live → ready; not started → waiting for
   host unless "join before host" is on; ended; cancelled; not found.
4. A passcode is required unless the link carried a valid invite token. A passcode in
   the link is never checked here (that would allow unlimited guessing; joining checks it).
5. /resolve answers as a guest (it serves the guest door), but tells the host they're the
   host so the page can offer "Start meeting" instead.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from app.models.enums import MeetingStatus
from app.services.join_service import ParsedJoinInput, parse_join_input
from tests.factories import make_meeting, make_user

CODE = "12345678901"


@pytest.mark.parametrize(
    ("raw_input", "expected"),
    [
        ("123 4567 8901", ParsedJoinInput(CODE)),
        ("12345678901", ParsedJoinInput(CODE)),
        ("  123-4567-8901 ", ParsedJoinInput(CODE)),
        ("1234567890", ParsedJoinInput("1234567890")),  # 10-digit personal meeting ID
        (f"http://localhost:3000/j/{CODE}?tk=abc", ParsedJoinInput(CODE, invite_token="abc")),
        (f"https://zoom.us/j/{CODE}?pwd=XyZ123", ParsedJoinInput(CODE, passcode="XyZ123")),
        (f"localhost:3000/j/{CODE}", ParsedJoinInput(CODE)),
        (f"https://example.com/room/{CODE}", ParsedJoinInput(CODE)),
    ],
)
def test_every_input_format_resolves_to_the_same_code(
    raw_input: str, expected: ParsedJoinInput
) -> None:
    assert parse_join_input(raw_input) == expected


@pytest.mark.parametrize(
    "raw_input",
    ["", "hello", "123", "123456789012", "https://example.com/about", "12345abc901"],
)
def test_unrecognisable_input_is_rejected(raw_input: str) -> None:
    assert parse_join_input(raw_input) is None


def _resolve(client: TestClient, raw_input: str) -> dict[str, object]:
    response = client.get("/api/meetings/resolve", params={"q": raw_input})
    assert response.status_code == 200
    return response.json()


def test_a_live_meeting_is_ready_to_join(client: TestClient, db_session: Session, me: User) -> None:
    host = make_user(db_session, name="Priya")
    meeting = make_meeting(db_session, host, status=MeetingStatus.LIVE, title="Standup")

    result = _resolve(client, meeting.meeting_code)

    assert result["state"] == "ready"
    assert result["title"] == "Standup"
    assert result["host_name"] == "Priya"


def test_a_meeting_that_has_not_started_waits_for_the_host(
    client: TestClient, db_session: Session, me: User
) -> None:
    host = make_user(db_session)
    meeting = make_meeting(db_session, host)

    result = _resolve(client, meeting.meeting_code)

    assert result["state"] == "waiting_for_host"
    assert result["message"] == "Waiting for the host to start this meeting"


def test_join_before_host_makes_an_unstarted_meeting_ready(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, make_user(db_session))
    meeting.settings.allow_join_before_host = True
    db_session.commit()

    assert _resolve(client, meeting.meeting_code)["state"] == "ready"


def test_resolve_answers_as_a_guest_but_tells_the_host_who_they_are(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, me)

    result = _resolve(client, meeting.meeting_code)

    # A guest would wait for the host; the page uses you_are_host to offer "Start" instead.
    assert result["state"] == "waiting_for_host"
    assert result["you_are_host"] is True


@pytest.mark.parametrize(
    ("status", "expected_state", "expected_message"),
    [
        (MeetingStatus.ENDED, "ended", "This meeting has ended"),
        (MeetingStatus.CANCELLED, "cancelled", "This meeting has been cancelled"),
    ],
)
def test_ended_and_cancelled_meetings_are_not_joinable(
    client: TestClient,
    db_session: Session,
    me: User,
    status: MeetingStatus,
    expected_state: str,
    expected_message: str,
) -> None:
    meeting = make_meeting(db_session, make_user(db_session), status=status)

    result = _resolve(client, meeting.meeting_code)

    assert result["state"] == expected_state
    assert result["message"] == expected_message


def test_unknown_and_invalid_inputs_get_clear_states(client: TestClient, me: User) -> None:
    assert _resolve(client, "999 9999 9999")["state"] == "not_found"
    assert _resolve(client, "hello")["state"] == "invalid_input"


def test_only_a_valid_invite_token_skips_the_passcode_prompt(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(
        db_session,
        make_user(db_session),
        status=MeetingStatus.LIVE,
        invite_token="secret-token",
        passcode="Pa55",
    )
    code = meeting.meeting_code

    assert _resolve(client, code)["passcode_required"] is True
    assert _resolve(client, f"/j/{code}?tk=wrong")["passcode_required"] is True
    assert _resolve(client, f"/j/{code}?tk=secret-token")["passcode_required"] is False
    # Right or wrong, a passcode gets the same answer: no guessing oracle.
    right = _resolve(client, f"/j/{code}?pwd=Pa55")
    wrong = _resolve(client, f"/j/{code}?pwd=nope")
    assert right["passcode_required"] is wrong["passcode_required"] is True


def test_resolve_never_reveals_the_passcode_or_token(
    client: TestClient, db_session: Session, me: User
) -> None:
    meeting = make_meeting(db_session, make_user(db_session), status=MeetingStatus.LIVE)

    result = _resolve(client, meeting.meeting_code)

    assert "passcode" not in result
    assert "invite_link" not in result
    assert meeting.invite_token not in str(result)
