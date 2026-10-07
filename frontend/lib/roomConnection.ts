/**
 * The browser side of a meeting room: one WebSocket to the server, plus one PeerLink
 * (a WebRTC connection) to each other participant.
 *
 * It turns server messages into updates of the room store (stores/roomStore.ts) and
 * into WebRTC actions:
 *   welcome              → show the room, and *call* everyone already here (I'm new,
 *                          so I send the first offer to each of them)
 *   participant_joined   → add them to the roster; they'll call me
 *   participant_left     → close their PeerLink, remove them
 *   signal               → hand it to the PeerLink for that participant (creating it
 *                          when a newcomer's first offer arrives)
 *   everything else      → a store update and/or a toast (see handleMessage)
 *
 * If the connection drops, it reconnects with growing pauses (1 s, 2 s, 4 s…) while the
 * room shows "Reconnecting…". The server keeps the seat for 30 s (D-066).
 *
 * Plain TypeScript, not a React hook: it holds things React shouldn't re-render for
 * (sockets, peer connections, timers). hooks/useRoomConnection.ts creates one per room
 * visit and closes it when the room page goes away.
 */

import { toast } from "sonner";

import type { MeetingSession } from "@/lib/meetingSession";
import { PeerLink } from "@/lib/peerLink";
import {
  CLOSE_NORMAL,
  CLOSE_REFUSED,
  CLOSE_REPLACED,
  roomSocketUrl,
  type ClientMessage,
  type ServerMessage,
} from "@/lib/roomProtocol";
import { useRoomStore } from "@/stores/roomStore";

/** My media right now. While I share my screen, it goes out instead of my camera. */
export type LocalTracks = {
  audio: MediaStreamTrack | null;
  camera: MediaStreamTrack | null;
  screen: MediaStreamTrack | null;
};

// Pause before each reconnect attempt: about 23 s in all, inside the server's 30 s
// grace period (RECONNECT_GRACE_SECONDS in the backend config).
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 8000];

export class RoomConnection {
  private readonly session: MeetingSession;
  private socket: WebSocket | null = null;
  /** One link per other participant, by their participant id. */
  private readonly links = new Map<number, PeerLink>();
  private localTracks: LocalTracks = { audio: null, camera: null, screen: null };
  /** True once we hang up ourselves, so the close isn't mistaken for a dropped line. */
  private isClosingOnPurpose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** "Mute on entry" applies to the first welcome only, not to every reconnect. */
  private hasBeenWelcomed = false;
  /** Between asking the server to share my screen and its yes (or no). */
  private isAwaitingShareApproval = false;
  /** In the meeting (welcomed), not waiting or reconnecting: only then can I send updates. */
  private isInRoom = false;

  constructor(session: MeetingSession) {
    this.session = session;
  }

  /** Open the WebSocket. The server answers "welcome" or "waiting" (or closes with a reason). */
  open(): void {
    const { meetingCode, participantId, sessionToken } = this.session;
    const socket = new WebSocket(roomSocketUrl(meetingCode, participantId, sessionToken));
    socket.onmessage = (event: MessageEvent<string>) => {
      this.handleMessage(JSON.parse(event.data) as ServerMessage);
    };
    socket.onclose = (event) => this.handleClose(event);
    this.socket = socket;
  }

  /** My camera/microphone/screen changed: send the new tracks to everyone, and say so. */
  setLocalTracks(tracks: LocalTracks): void {
    this.localTracks = tracks;
    for (const link of this.links.values()) {
      this.sendTracksTo(link);
    }
    this.announceMediaState();
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  startScreenShare(): void {
    this.isAwaitingShareApproval = true;
    this.send({ type: "start_screen_share" });
  }

  leave(): void {
    this.send({ type: "leave" });
    this.close();
  }

  /** Hang up everything. Safe to call more than once. */
  close(): void {
    this.isClosingOnPurpose = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }
    this.closeAllLinks();
    this.socket?.close(CLOSE_NORMAL);
  }

  // --- server messages --------------------------------------------------------

  private handleMessage(message: ServerMessage): void {
    const room = useRoomStore.getState();
    const myId = this.session.participantId;
    switch (message.type) {
      case "welcome":
        this.enterRoom(message);
        break;
      case "waiting":
        this.isInRoom = false;
        room.setStatus("waiting");
        break;
      case "participant_joined":
        // A reconnecting participant may still have an old link here: drop it, and
        // wait for their new offer ("signal" below answers it).
        this.closeLink(message.participant.participant_id);
        room.addParticipant(message.participant);
        toast(`${message.participant.display_name} joined`);
        break;
      case "participant_left":
        this.closeLink(message.participant_id);
        room.removeParticipant(message.participant_id);
        break;
      case "media_state":
        room.updateParticipant(message.participant_id, {
          is_mic_on: message.is_mic_on,
          is_camera_on: message.is_camera_on,
          is_screen_sharing: message.is_screen_sharing,
        });
        if (message.participant_id === myId && message.is_screen_sharing) {
          this.isAwaitingShareApproval = false; // the server said yes
        }
        break;
      case "hand_changed":
        room.updateParticipant(message.participant_id, { hand_raised_at: message.hand_raised_at });
        break;
      case "signal": {
        const senderId = message.from_participant_id;
        const link = this.links.get(senderId) ?? this.linkTo(senderId, { isInitiator: false });
        link.handleSignal(message.data);
        break;
      }
      case "chat_message":
        room.addChatMessage(message.message);
        break;
      case "reaction":
        room.addReaction(message.participant_id, message.emoji);
        break;
      case "waiting_room":
        room.setWaiting(message.participants);
        break;
      case "muted_by_host":
        room.setMicOn(false);
        toast("You were muted by the host");
        break;
      case "asked_to_unmute":
        toast("The host would like you to unmute", {
          action: { label: "Unmute", onClick: () => useRoomStore.getState().setMicOn(true) },
        });
        break;
      case "removed":
        this.closeAllLinks();
        room.setStatus("removed", message.reason);
        break;
      case "role_changed":
        room.updateParticipant(message.participant_id, { role: message.role });
        if (message.participant_id === myId) {
          toast(
            message.role === "attendee"
              ? "You are no longer a host"
              : `You are now the ${roleName(message.role)}`,
          );
        }
        break;
      case "meeting_locked":
        room.setLocked(message.is_locked);
        toast(message.is_locked ? "The meeting is now locked" : "The meeting is now unlocked");
        break;
      case "meeting_ended":
        this.closeAllLinks();
        room.setStatus("ended");
        break;
      case "error":
        if (this.isAwaitingShareApproval) {
          // The server refused the screen share (e.g. someone else is sharing).
          this.isAwaitingShareApproval = false;
          room.stopScreenShare();
        }
        toast.error(message.message);
        break;
    }
  }

  private enterRoom(message: Extract<ServerMessage, { type: "welcome" }>): void {
    const room = useRoomStore.getState();
    this.reconnectAttempts = 0;
    this.isInRoom = true;
    room.enterRoom({
      participants: message.participants,
      waiting: message.waiting,
      chatMessages: message.chat_history,
      settings: message.settings,
      isLocked: message.is_locked,
    });
    const me = message.participants.find(
      (participant) => participant.participant_id === this.session.participantId,
    );
    if (!this.hasBeenWelcomed && message.settings.mute_on_entry && me?.role === "attendee") {
      room.setMicOn(false);
      toast("You're muted: the host mutes everyone when they join");
    }
    this.hasBeenWelcomed = true;
    for (const participant of message.participants) {
      if (participant.participant_id !== this.session.participantId) {
        this.linkTo(participant.participant_id, { isInitiator: true });
      }
    }
    this.announceMediaState();
  }

  private handleClose(event: CloseEvent): void {
    this.isInRoom = false;
    this.closeAllLinks();
    const room = useRoomStore.getState();
    room.clearRemoteStreams();
    // We hung up ourselves, or the host ended the meeting / removed us (already on screen).
    if (this.isClosingOnPurpose || room.status === "ended" || room.status === "removed") {
      return;
    }
    if (event.code === CLOSE_REFUSED || event.code === CLOSE_REPLACED) {
      room.setStatus("refused", event.reason);
      return;
    }
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempts];
    if (delay !== undefined) {
      this.reconnectAttempts += 1;
      if (room.status === "connected") {
        room.setStatus("reconnecting");
      }
      this.reconnectTimer = setTimeout(() => this.open(), delay);
      return;
    }
    if (this.hasBeenWelcomed) {
      room.setStatus("disconnected", "You were disconnected from the meeting.");
    } else {
      room.setStatus("disconnected", "Couldn't connect to the meeting. Check your connection.");
    }
  }

  // --- peer links ---------------------------------------------------------------

  /**
   * Open a WebRTC link to another participant, and start sending them my media.
   * `isInitiator`: I'm the newcomer, so I send the first offer (lib/peerLink.ts).
   */
  private linkTo(participantId: number, { isInitiator }: { isInitiator: boolean }): PeerLink {
    const existing = this.links.get(participantId);
    if (existing !== undefined) {
      return existing;
    }
    const link = new PeerLink({
      isInitiator,
      // Ids grow as people join, so the newer participant of each pair is the polite one.
      isPolite: this.session.participantId > participantId,
      sendSignal: (data) => this.send({ type: "signal", to_participant_id: participantId, data }),
      onRemoteStream: (stream) => useRoomStore.getState().setRemoteStream(participantId, stream),
    });
    this.links.set(participantId, link);
    this.sendTracksTo(link);
    return link;
  }

  /** Audio through the audio slot; my screen (while sharing) or camera through the video slot. */
  private sendTracksTo(link: PeerLink): void {
    void link.setLocalTrack("audio", this.localTracks.audio);
    void link.setLocalTrack("video", this.localTracks.screen ?? this.localTracks.camera);
  }

  private closeLink(participantId: number): void {
    this.links.get(participantId)?.close();
    this.links.delete(participantId);
  }

  private closeAllLinks(): void {
    for (const link of this.links.values()) {
      link.close();
    }
    this.links.clear();
  }

  /** Tell everyone whether my mic and camera are on (they show icons / my name instead). */
  private announceMediaState(): void {
    const isMicOn = this.localTracks.audio !== null;
    const isCameraOn = this.localTracks.camera !== null;
    useRoomStore.getState().updateParticipant(this.session.participantId, {
      is_mic_on: isMicOn,
      is_camera_on: isCameraOn,
    });
    // While waiting to be let in there is nobody to tell (the server would refuse it);
    // "welcome" announces the state once I'm in.
    if (this.isInRoom) {
      this.send({ type: "media_state", is_mic_on: isMicOn, is_camera_on: isCameraOn });
    }
  }
}

function roleName(role: "host" | "co_host"): string {
  return role === "host" ? "host" : "co-host";
}
