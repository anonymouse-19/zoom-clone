"""
Request and response shapes for joining a meeting:
POST /api/meetings/{code}/participants.
"""

from typing import Annotated, Self

from pydantic import BaseModel, StringConstraints

from app.models import Participant
from app.models.enums import JoinAs, ParticipantRole, ParticipantStatus
from app.schemas.meeting import MeetingDetail

MAX_DISPLAY_NAME_LENGTH = 100
MAX_CREDENTIAL_LENGTH = 64

DisplayName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_DISPLAY_NAME_LENGTH)
]
Credential = Annotated[str, StringConstraints(max_length=MAX_CREDENTIAL_LENGTH)]


class JoinMeetingRequest(BaseModel):
    """What the pre-join screen (guest door) or the dashboard's Start (host door) sends."""

    display_name: DisplayName
    join_as: JoinAs = JoinAs.GUEST
    # A guest must present one of these: the token from an invite link, or the passcode.
    invite_token: Credential | None = None
    passcode: Credential | None = None


class JoinMeetingResponse(BaseModel):
    """Everything the meeting room needs to connect (Phase 5)."""

    participant_id: int
    # Secret proof that this browser tab owns `participant_id`. Sent when opening the
    # WebSocket; never shown to anyone else.
    session_token: str
    display_name: str
    role: ParticipantRole
    # "admitted", or "waiting" if the meeting has a waiting room.
    status: ParticipantStatus
    meeting: MeetingDetail

    @classmethod
    def from_participant(cls, participant: Participant) -> Self:
        assert participant.session_token is not None  # always set for live joins
        return cls(
            participant_id=participant.id,
            session_token=participant.session_token,
            display_name=participant.display_name,
            role=participant.role,
            status=participant.status,
            meeting=MeetingDetail.from_meeting(participant.meeting),
        )
