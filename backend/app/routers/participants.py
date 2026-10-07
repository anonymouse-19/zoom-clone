"""
Participant routes: POST /api/meetings/{code}/participants (join a meeting).

Thin, like every router: validated input in, one service call, a response schema out.
"""

from fastapi import APIRouter, status

from app.deps import CurrentUser, DbSession, LiveRooms
from app.routers.params import MeetingCode
from app.schemas.errors import CONFLICT, FORBIDDEN, NOT_FOUND
from app.schemas.participant import JoinMeetingRequest, JoinMeetingResponse
from app.services import participant_service

router = APIRouter(prefix="/meetings", tags=["participants"])


@router.post(
    "/{meeting_code}/participants",
    response_model=JoinMeetingResponse,
    status_code=status.HTTP_201_CREATED,
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT},
)
def join_meeting(
    db: DbSession,
    user: CurrentUser,
    room_manager: LiveRooms,
    meeting_code: MeetingCode,
    request: JoinMeetingRequest,
) -> JoinMeetingResponse:
    """Join a meeting: creates one participant row (a join session) and returns the
    secret session token the meeting room's WebSocket will need.

    403 if a guest's passcode/token is wrong, or a non-host uses the host door.
    409 if the meeting ended, was cancelled, is waiting for its host, or was locked.
    """
    # Whether a meeting is locked is live state, kept by the room (not the database).
    is_locked = room_manager.is_locked(meeting_code)
    participant = participant_service.join_meeting(
        db, meeting_code, user, request, is_locked=is_locked
    )
    return JoinMeetingResponse.from_participant(participant)
