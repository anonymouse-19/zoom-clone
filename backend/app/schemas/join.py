"""
Response shape for GET /api/meetings/resolve ("can I join this?").

Deliberately minimal: it's safe to show anyone who has the ID, so it carries no
passcode, invite token or invitee list.
"""

from typing import Self

from pydantic import BaseModel

from app.services.codes import format_meeting_code
from app.services.join_service import JOIN_STATE_MESSAGES, JoinCheck, JoinState


class ResolveResponse(BaseModel):
    state: JoinState
    message: str  # human-readable, shown under the join input
    meeting_code: str | None
    formatted_code: str | None
    title: str | None
    host_name: str | None
    # False when the link carried a valid invite token or passcode.
    passcode_required: bool
    # True if the current user hosts it: the join page then offers "Start meeting".
    you_are_host: bool

    @classmethod
    def from_check(cls, check: JoinCheck) -> Self:
        meeting = check.meeting
        return cls(
            state=check.state,
            message=JOIN_STATE_MESSAGES[check.state],
            meeting_code=meeting.meeting_code if meeting else None,
            formatted_code=format_meeting_code(meeting.meeting_code) if meeting else None,
            title=meeting.title if meeting else None,
            host_name=meeting.host.name if meeting else None,
            passcode_required=check.passcode_required,
            you_are_host=check.you_are_host,
        )
