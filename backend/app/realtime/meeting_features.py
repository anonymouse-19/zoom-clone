"""
What any participant can do in a meeting: pass WebRTC signals, report their mic and
camera, chat, react, raise a hand, share their screen, and leave.

Every function has the same shape, `(context, sender, message)`, so room_handler.py can
pick one from a table by message type. A rule saying "no" raises a ServiceError; the
handler turns it into an "error" message for the sender.
"""

from app.models.enums import MeetingEventType, ScreenSharePermission
from app.models.types import utc_now
from app.realtime.messages import (
    ClientChatMessage,
    ClientLeave,
    ClientLowerHand,
    ClientMediaState,
    ClientRaiseHand,
    ClientReaction,
    ClientSignal,
    ClientStartScreenShare,
    ClientStopScreenShare,
    ServerChatMessage,
    ServerHandChanged,
    ServerMediaState,
    ServerReaction,
    ServerSignal,
)
from app.realtime.room_context import RoomContext
from app.realtime.room_manager import RoomMember
from app.services import room_service
from app.services.errors import ConflictError, ForbiddenError


async def relay_signal(context: RoomContext, sender: RoomMember, message: ClientSignal) -> None:
    """Forward a WebRTC setup message to the one participant it's for, unread."""
    relayed = ServerSignal(from_participant_id=sender.participant_id, data=message.data)
    await context.room_manager.send_to_participant(
        context.meeting_code, message.to_participant_id, relayed
    )


async def update_media_state(
    context: RoomContext, sender: RoomMember, message: ClientMediaState
) -> None:
    sender.is_mic_on = message.is_mic_on
    sender.is_camera_on = message.is_camera_on
    await context.broadcast(media_state_of(sender), except_participant_id=sender.participant_id)


def media_state_of(member: RoomMember) -> ServerMediaState:
    return ServerMediaState(
        participant_id=member.participant_id,
        is_mic_on=member.is_mic_on,
        is_camera_on=member.is_camera_on,
        is_screen_sharing=member.is_screen_sharing,
    )


async def send_chat(context: RoomContext, sender: RoomMember, message: ClientChatMessage) -> None:
    """Save the message, then deliver it: to everyone, or privately to sender + recipient."""
    if not context.room_manager.settings(context.meeting_code).chat_enabled:
        raise ForbiddenError("The host has turned off chat for this meeting")
    recipient = None
    if message.to_participant_id is not None:
        recipient = context.room_manager.member(context.meeting_code, message.to_participant_id)
        if recipient is None:
            raise ConflictError("That person is no longer in the meeting")

    saved = await context.in_database(
        room_service.save_chat_message,
        sender_id=sender.participant_id,
        recipient_id=message.to_participant_id,
        text=message.text,
    )
    outgoing = ServerChatMessage(message=saved)
    if recipient is None:
        await context.broadcast(outgoing)
        return
    await context.room_manager.send(sender, outgoing)
    if recipient is not sender:
        await context.room_manager.send(recipient, outgoing)


async def send_reaction(context: RoomContext, sender: RoomMember, message: ClientReaction) -> None:
    """Reactions are ephemeral: shown for a few seconds, never saved."""
    await context.broadcast(
        ServerReaction(participant_id=sender.participant_id, emoji=message.emoji)
    )


async def raise_hand(context: RoomContext, sender: RoomMember, message: ClientRaiseHand) -> None:
    if sender.hand_raised_at is not None:
        return  # already up
    sender.hand_raised_at = utc_now()
    await context.in_database(
        room_service.log_event,
        participant_id=sender.participant_id,
        event_type=MeetingEventType.HAND_RAISED,
    )
    await context.broadcast(
        ServerHandChanged(
            participant_id=sender.participant_id, hand_raised_at=sender.hand_raised_at
        )
    )


async def lower_hand(context: RoomContext, sender: RoomMember, message: ClientLowerHand) -> None:
    """Lower my own hand, or (hosts only) someone else's."""
    target = sender
    if message.participant_id is not None and message.participant_id != sender.participant_id:
        if not sender.is_moderator:
            raise ForbiddenError("Only the host can lower someone else's hand")
        target = context.room_manager.member(context.meeting_code, message.participant_id)
        if target is None:
            return
    if target.hand_raised_at is None:
        return
    target.hand_raised_at = None
    await context.broadcast(
        ServerHandChanged(participant_id=target.participant_id, hand_raised_at=None)
    )


async def start_screen_share(
    context: RoomContext, sender: RoomMember, message: ClientStartScreenShare
) -> None:
    """Allowed if the meeting lets this person share and nobody else is sharing.
    Everyone, the sender included, gets the new media state: for the sender it's the "yes"."""
    settings = context.room_manager.settings(context.meeting_code)
    if settings.screen_share == ScreenSharePermission.HOST_ONLY and not sender.is_moderator:
        raise ForbiddenError("Only the host can share their screen in this meeting")
    current_sharer = context.room_manager.screen_sharer(context.meeting_code)
    if current_sharer is not None and current_sharer is not sender:
        raise ConflictError(f"{current_sharer.display_name} is already sharing their screen")

    sender.is_screen_sharing = True
    await context.in_database(
        room_service.log_event,
        participant_id=sender.participant_id,
        event_type=MeetingEventType.SCREEN_SHARE_STARTED,
    )
    await context.broadcast(media_state_of(sender))


async def stop_screen_share(
    context: RoomContext, sender: RoomMember, message: ClientStopScreenShare
) -> None:
    if not sender.is_screen_sharing:
        return
    sender.is_screen_sharing = False
    await context.in_database(
        room_service.log_event,
        participant_id=sender.participant_id,
        event_type=MeetingEventType.SCREEN_SHARE_STOPPED,
    )
    await context.broadcast(media_state_of(sender))


async def leave(context: RoomContext, sender: RoomMember, message: ClientLeave) -> None:
    """Saying "leave" (instead of just disconnecting) skips the reconnect grace period."""
    sender.has_left_on_purpose = True
