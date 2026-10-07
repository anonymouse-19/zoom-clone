"""
The meeting room's WebSocket: ws://<api>/ws/meetings/{code}?participant_id=…&session_token=…

The browser opens it after joining (POST /api/meetings/{code}/participants gave it the id
and token). Everything that happens on the connection lives in realtime/room_handler.py;
this route only collects the inputs.

Why the token is in the URL: browsers can't add custom headers to a WebSocket request,
so the query string is the standard place. The token is random, belongs to one join
session, and stops working once that session leaves (docs/DECISIONS.md D-053).
"""

from fastapi import APIRouter, WebSocket

from app.deps import LiveRooms, SessionFactory
from app.realtime import room_handler
from app.routers.params import MeetingCode

router = APIRouter(prefix="/meetings", tags=["room"])


@router.websocket("/{meeting_code}")
async def meeting_room(
    websocket: WebSocket,
    meeting_code: MeetingCode,
    participant_id: int,
    session_token: str,
    room_manager: LiveRooms,
    session_factory: SessionFactory,
) -> None:
    await room_handler.serve_participant(
        websocket,
        room_manager=room_manager,
        session_factory=session_factory,
        meeting_code=meeting_code,
        participant_id=participant_id,
        session_token=session_token,
    )
