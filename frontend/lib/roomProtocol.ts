/**
 * The messages that cross the meeting room's WebSocket, in both directions.
 *
 * The exact mirror of backend/app/realtime/messages.py: read the two together. Every
 * message is one JSON object whose "type" field says what it is, so TypeScript can
 * narrow `ServerMessage` with a `switch (message.type)`.
 *
 * Called by: lib/roomConnection.ts, and components that send host controls.
 */

import type { ChatMessage, ParticipantRole, ScreenSharePermission } from "@/lib/api";
import { WS_URL } from "@/lib/config";

/** Why the server closed the connection (see CLOSE_* in messages.py). */
export const CLOSE_NORMAL = 1000;
export const CLOSE_REFUSED = 4403;
export const CLOSE_REPLACED = 4409;

/** Zoom's quick reactions; the server refuses anything else. */
export const REACTION_EMOJIS = ["👏", "👍", "❤️", "😂", "😮", "🎉"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** One person in the room, as everyone else sees them. */
export type RosterEntry = {
  participant_id: number;
  display_name: string;
  role: ParticipantRole;
  is_mic_on: boolean;
  is_camera_on: boolean;
  is_screen_sharing: boolean;
  /** When they raised their hand (null = hand down). Orders the hand queue. */
  hand_raised_at: string | null;
};

/** Someone in the waiting room, as hosts see them. */
export type WaitingEntry = {
  participant_id: number;
  display_name: string;
};

export type RoomSettings = {
  mute_on_entry: boolean;
  chat_enabled: boolean;
  screen_share: ScreenSharePermission;
};

/**
 * A WebRTC setup message between two browsers. The server passes it along without
 * reading it: either a session description (offer/answer) or a network candidate.
 */
export type SignalData = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

/** Browser → server. Host controls are refused by the server for non-hosts. */
export type ClientMessage =
  | { type: "signal"; to_participant_id: number; data: SignalData }
  | { type: "media_state"; is_mic_on: boolean; is_camera_on: boolean }
  | { type: "chat_message"; text: string; to_participant_id: number | null }
  | { type: "reaction"; emoji: ReactionEmoji }
  | { type: "raise_hand" }
  | { type: "lower_hand"; participant_id: number | null }
  | { type: "start_screen_share" }
  | { type: "stop_screen_share" }
  | { type: "leave" }
  | { type: "admit"; participant_id: number }
  | { type: "admit_all" }
  | { type: "deny"; participant_id: number }
  | { type: "mute_participant"; participant_id: number }
  | { type: "mute_all" }
  | { type: "ask_to_unmute"; participant_id: number }
  | { type: "ask_all_to_unmute" }
  | { type: "remove_participant"; participant_id: number }
  | { type: "set_co_host"; participant_id: number; is_co_host: boolean }
  | { type: "make_host"; participant_id: number }
  | { type: "lock_meeting"; is_locked: boolean }
  | { type: "end_meeting" };

/** Server → browser. */
export type ServerMessage =
  | {
      type: "welcome";
      your_participant_id: number;
      participants: RosterEntry[];
      waiting: WaitingEntry[];
      chat_history: ChatMessage[];
      settings: RoomSettings;
      is_locked: boolean;
    }
  | { type: "waiting" }
  | { type: "participant_joined"; participant: RosterEntry }
  | { type: "participant_left"; participant_id: number }
  | {
      type: "media_state";
      participant_id: number;
      is_mic_on: boolean;
      is_camera_on: boolean;
      is_screen_sharing: boolean;
    }
  | { type: "hand_changed"; participant_id: number; hand_raised_at: string | null }
  | { type: "signal"; from_participant_id: number; data: SignalData }
  | { type: "chat_message"; message: ChatMessage }
  | { type: "reaction"; participant_id: number; emoji: ReactionEmoji }
  | { type: "waiting_room"; participants: WaitingEntry[] }
  | { type: "muted_by_host" }
  | { type: "asked_to_unmute" }
  | { type: "removed"; reason: "removed" | "denied" }
  | { type: "role_changed"; participant_id: number; role: ParticipantRole }
  | { type: "meeting_locked"; is_locked: boolean }
  | { type: "meeting_ended" }
  | { type: "error"; message: string };

/** ws://…/ws/meetings/{code}?participant_id=…&session_token=… */
export function roomSocketUrl(
  meetingCode: string,
  participantId: number,
  sessionToken: string,
): string {
  const query = new URLSearchParams({
    participant_id: String(participantId),
    session_token: sessionToken,
  });
  return `${WS_URL}/ws/meetings/${meetingCode}?${query.toString()}`;
}
