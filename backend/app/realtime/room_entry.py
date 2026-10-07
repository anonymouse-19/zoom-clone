"""
The two ways a connection enters a meeting: straight into the room, or into the waiting
room until a host lets it in.

Called by: room_handler.py (when a browser connects) and host_controls.py (when a host
admits someone who is waiting).
"""

from app.realtime.messages import (
    ServerParticipantJoined,
    ServerWaiting,
    ServerWaitingRoom,
    ServerWelcome,
)
from app.realtime.room_context import RoomContext
from app.realtime.room_manager import RoomMember
from app.services import room_service


async def enter_room(context: RoomContext, member: RoomMember) -> None:
    """Add the member to the room, send them everything they need, and tell the others."""
    room_manager = context.room_manager
    room_manager.add_member(context.meeting_code, member)
    history = await context.in_database(
        room_service.chat_history,
        meeting_code=context.meeting_code,
        participant_id=member.participant_id,
    )
    waiting = []
    if member.is_moderator:
        waiting = room_manager.waiting_list(context.meeting_code)
    welcome = ServerWelcome(
        your_participant_id=member.participant_id,
        participants=room_manager.roster(context.meeting_code),
        waiting=waiting,
        chat_history=history,
        settings=room_manager.settings(context.meeting_code),
        is_locked=room_manager.is_locked(context.meeting_code),
    )
    await room_manager.send(member, welcome)
    await context.broadcast(
        ServerParticipantJoined(participant=member.roster_entry()),
        except_participant_id=member.participant_id,
    )


async def enter_waiting_room(context: RoomContext, member: RoomMember) -> None:
    context.room_manager.add_waiting(context.meeting_code, member)
    await context.room_manager.send(member, ServerWaiting())
    await send_waiting_list(context)


async def send_waiting_list(context: RoomContext) -> None:
    """Send hosts and co-hosts the full, current waiting list."""
    waiting = context.room_manager.waiting_list(context.meeting_code)
    await context.room_manager.send_to_moderators(
        context.meeting_code, ServerWaitingRoom(participants=waiting)
    )
