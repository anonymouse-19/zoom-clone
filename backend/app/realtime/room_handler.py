"""
One browser's time in a meeting room, from connecting until it leaves.

    Step 1: accept the WebSocket, then check its participant id + session token
            (services/room_service.py). Refused → close with a code and a reason.
            If the same join session is already connected (another tab, or a reconnect
            the server hasn't noticed was needed), the newer connection takes over.
    Step 2: enter the room (a "welcome" with everyone present), or the waiting room.
    Step 3: handle its messages until it leaves, disconnects, or the meeting ends.
            Each message type has one handler function (MESSAGE_HANDLERS below).
    Step 4: always (even after a crash or a lost connection): leave the room, tell the
            others, and record the departure. A deliberate "leave" is recorded at once;
            a dropped connection only after the reconnect grace period, so a browser
            that comes back in time keeps its seat.

Called by: routers/room.py.
"""

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy.orm import Session, sessionmaker

from app.realtime import host_controls, meeting_features
from app.realtime.messages import (
    CLIENT_MESSAGE_PARSER,
    CLOSE_REFUSED,
    ClientAdmit,
    ClientAdmitAll,
    ClientAskAllToUnmute,
    ClientAskToUnmute,
    ClientChatMessage,
    ClientDeny,
    ClientEndMeeting,
    ClientLeave,
    ClientLockMeeting,
    ClientLowerHand,
    ClientMakeHost,
    ClientMediaState,
    ClientMuteAll,
    ClientMuteParticipant,
    ClientRaiseHand,
    ClientReaction,
    ClientRemoveParticipant,
    ClientSetCoHost,
    ClientSignal,
    ClientStartScreenShare,
    ClientStopScreenShare,
    RoomSettings,
    ServerParticipantLeft,
)
from app.realtime.room_context import RoomContext
from app.realtime.room_entry import enter_room, enter_waiting_room, send_waiting_list
from app.realtime.room_manager import RoomManager, RoomMember
from app.services import room_service
from app.services.errors import ServiceError

MessageHandler = Callable[[RoomContext, RoomMember, Any], Awaitable[None]]

# Which function handles each kind of message. Adding a feature = a message class in
# messages.py, a handler function, and one line here.
MESSAGE_HANDLERS: dict[type, MessageHandler] = {
    ClientSignal: meeting_features.relay_signal,
    ClientMediaState: meeting_features.update_media_state,
    ClientChatMessage: meeting_features.send_chat,
    ClientReaction: meeting_features.send_reaction,
    ClientRaiseHand: meeting_features.raise_hand,
    ClientLowerHand: meeting_features.lower_hand,
    ClientStartScreenShare: meeting_features.start_screen_share,
    ClientStopScreenShare: meeting_features.stop_screen_share,
    ClientLeave: meeting_features.leave,
    ClientAdmit: host_controls.admit,
    ClientAdmitAll: host_controls.admit_all,
    ClientDeny: host_controls.deny,
    ClientMuteParticipant: host_controls.mute_participant,
    ClientMuteAll: host_controls.mute_all,
    ClientAskToUnmute: host_controls.ask_to_unmute,
    ClientAskAllToUnmute: host_controls.ask_all_to_unmute,
    ClientRemoveParticipant: host_controls.remove_participant,
    ClientSetCoHost: host_controls.set_co_host,
    ClientMakeHost: host_controls.make_host,
    ClientLockMeeting: host_controls.lock_meeting,
    ClientEndMeeting: host_controls.end_meeting,
}


async def serve_participant(
    websocket: WebSocket,
    *,
    room_manager: RoomManager,
    session_factory: sessionmaker[Session],
    meeting_code: str,
    participant_id: int,
    session_token: str,
) -> None:
    context = RoomContext(
        room_manager=room_manager, session_factory=session_factory, meeting_code=meeting_code
    )
    # Step 1: accept first, so a refusal can carry a close code and a readable reason.
    await websocket.accept()
    try:
        identity = await context.in_database(
            room_service.authenticate_participant,
            meeting_code=meeting_code,
            participant_id=participant_id,
            session_token=session_token,
        )
    except ServiceError as error:
        await websocket.close(code=CLOSE_REFUSED, reason=str(error))
        return
    previous_connection = room_manager.connection_of(meeting_code, identity.participant_id)
    if previous_connection is not None:
        await room_manager.replace(meeting_code, previous_connection)
    room_manager.set_settings(
        meeting_code,
        RoomSettings(
            mute_on_entry=identity.mute_on_entry,
            chat_enabled=identity.chat_enabled,
            screen_share=identity.screen_share,
        ),
    )
    member = RoomMember(
        participant_id=identity.participant_id,
        display_name=identity.display_name,
        role=identity.role,
        websocket=websocket,
    )

    try:
        # Step 2
        if identity.is_waiting:
            await enter_waiting_room(context, member)
        else:
            await enter_room(context, member)
        # Step 3
        await _handle_messages(context, member)
    except WebSocketDisconnect:
        pass  # the browser closed the tab or lost its connection
    finally:
        # Step 4
        await _depart(context, member)


async def _handle_messages(context: RoomContext, member: RoomMember) -> None:
    """Read messages until the member leaves or the meeting ends. A disconnect raises
    WebSocketDisconnect out of receive_text(), which ends the loop too."""
    while not member.has_left_on_purpose:
        text = await member.websocket.receive_text()
        try:
            message = CLIENT_MESSAGE_PARSER.validate_json(text)
        except ValidationError:
            await context.send_error(member, "That message wasn't understood")
            continue
        if member.is_waiting and not isinstance(message, ClientLeave):
            await context.send_error(member, "You're still in the waiting room")
            continue
        handler = MESSAGE_HANDLERS[type(message)]
        try:
            await handler(context, member, message)
        except ServiceError as error:
            # A rule said no (e.g. "Only the host can do that"): tell the sender only.
            await context.send_error(member, str(error))


async def _depart(context: RoomContext, member: RoomMember) -> None:
    if member.departure_handled:
        return  # replaced, removed, denied, or the meeting ended: already dealt with
    context.room_manager.remove(context.meeting_code, member)
    if member.has_left_on_purpose:
        # Record first, so "you heard they left" means "it's recorded". Announce even if
        # the database write fails: their tile must disappear either way.
        try:
            await _record_leave(context, member.participant_id)
        finally:
            await _announce_departure(context, member)
        return
    await _announce_departure(context, member)
    context.room_manager.schedule(_record_leave_after_grace(context, member.participant_id))


async def _announce_departure(context: RoomContext, member: RoomMember) -> None:
    if member.is_waiting:
        await send_waiting_list(context)
    else:
        await context.broadcast(ServerParticipantLeft(participant_id=member.participant_id))


async def _record_leave_after_grace(context: RoomContext, participant_id: int) -> None:
    """A dropped connection keeps its seat for a short while. If the same join session
    hasn't reconnected by then, it has left."""
    await asyncio.sleep(context.room_manager.reconnect_grace_seconds)
    if not context.room_manager.is_connected(context.meeting_code, participant_id):
        await _record_leave(context, participant_id)


async def _record_leave(context: RoomContext, participant_id: int) -> None:
    meeting_ended = await context.in_database(
        room_service.record_leave, participant_id=participant_id
    )
    if meeting_ended:
        # The last person left. Anyone still in the waiting room is told it's over.
        await context.room_manager.end_room(context.meeting_code)
