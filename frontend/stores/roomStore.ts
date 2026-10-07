/**
 * Everything the meeting room screen shows: the connection status, who is in the room
 * (and waiting to get in), their video streams, chat, reactions, the room's settings, and
 * my own mic / camera / screen share.
 *
 * A Zustand store: one shared object outside React, which components read with a
 * selector (`useRoomStore((state) => state.participants)`). Each component re-renders
 * only when the slice it selected changes. Writers: lib/roomConnection.ts (server
 * messages) and the room components (toolbar buttons, panels, layout).
 *
 * Why a store instead of useState in the room page: the toolbar, tiles, header and side
 * panels all need pieces of it, and the connection updates it from outside React
 * (docs/DECISIONS.md D-059). My own mic/camera live here too, because the host can
 * mute me: the connection turns my mic off by writing here.
 */

import { create } from "zustand";

import type { ChatMessage } from "@/lib/api";
import type { ReactionEmoji, RoomSettings, RosterEntry, WaitingEntry } from "@/lib/roomProtocol";

/**
 * - connecting:   opening the WebSocket
 * - waiting:      in the waiting room until a host lets me in
 * - connected:    in the meeting
 * - reconnecting: the connection dropped; trying again (the room stays on screen)
 * - ended:        the host ended the meeting
 * - removed:      a host removed me, or didn't let me in (statusMessage says which)
 * - refused:      the server said no (statusMessage says why)
 * - disconnected: couldn't (re)connect
 */
export type RoomStatus =
  | "connecting"
  | "waiting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "removed"
  | "refused"
  | "disconnected";

export type RoomLayout = "gallery" | "speaker";
export type SidePanel = "participants" | "chat";

/** An emoji floating up from someone's tile for a few seconds. */
export type FloatingReaction = { id: number; participantId: number; emoji: ReactionEmoji };

// Zoom shows a reaction for about 5 seconds.
const REACTION_SHOW_MS = 5000;
let nextReactionId = 1;

type RoomState = {
  status: RoomStatus;
  statusMessage: string | null;
  /** Everyone in the room, including me, in the order they arrived. */
  participants: RosterEntry[];
  /** Each other participant's audio + video, by participant id. */
  remoteStreams: Record<number, MediaStream>;
  /** Only filled in for hosts and co-hosts. */
  waiting: WaitingEntry[];
  settings: RoomSettings | null;
  isLocked: boolean;
  chatMessages: ChatMessage[];
  unreadChatCount: number;
  openPanel: SidePanel | null;
  reactions: FloatingReaction[];
  layout: RoomLayout;
  /** The other participant who spoke most recently. Speaker view shows them large. */
  activeSpeakerId: number | null;
  // My own media: what I *want* on (the tracks themselves come from useLocalMedia).
  isMicOn: boolean;
  isCameraOn: boolean;
  /** My screen, while I'm sharing it. */
  screenTrack: MediaStreamTrack | null;
  /** The devices I chose (before joining, or from the toolbar's ^ menus). "" = default. */
  cameraId: string;
  microphoneId: string;
  speakerId: string;
};

type EnterRoomDetails = Pick<
  RoomState,
  "participants" | "waiting" | "chatMessages" | "settings" | "isLocked"
>;

type RoomActions = {
  enterRoom: (details: EnterRoomDetails) => void;
  addParticipant: (participant: RosterEntry) => void;
  removeParticipant: (participantId: number) => void;
  updateParticipant: (participantId: number, changes: Partial<RosterEntry>) => void;
  setRemoteStream: (participantId: number, stream: MediaStream) => void;
  clearRemoteStreams: () => void;
  setWaiting: (waiting: WaitingEntry[]) => void;
  setLocked: (isLocked: boolean) => void;
  addChatMessage: (message: ChatMessage) => void;
  setOpenPanel: (panel: SidePanel | null) => void;
  addReaction: (participantId: number, emoji: ReactionEmoji) => void;
  setStatus: (status: RoomStatus, statusMessage?: string) => void;
  setLayout: (layout: RoomLayout) => void;
  setActiveSpeaker: (participantId: number) => void;
  setMicOn: (isMicOn: boolean) => void;
  setCameraOn: (isCameraOn: boolean) => void;
  setScreenTrack: (track: MediaStreamTrack) => void;
  stopScreenShare: () => void;
  setCameraId: (deviceId: string) => void;
  setMicrophoneId: (deviceId: string) => void;
  setSpeakerId: (deviceId: string) => void;
  reset: (myMedia: MyMediaChoices) => void;
};

/** What I chose on the pre-join screen: the room starts from these. */
type MyMediaChoices = Pick<
  RoomState,
  "isMicOn" | "isCameraOn" | "cameraId" | "microphoneId" | "speakerId"
>;

const INITIAL_STATE: RoomState = {
  status: "connecting",
  statusMessage: null,
  participants: [],
  remoteStreams: {},
  waiting: [],
  settings: null,
  isLocked: false,
  chatMessages: [],
  unreadChatCount: 0,
  openPanel: null,
  reactions: [],
  layout: "gallery",
  activeSpeakerId: null,
  isMicOn: false,
  isCameraOn: false,
  screenTrack: null,
  cameraId: "",
  microphoneId: "",
  speakerId: "",
};

export const useRoomStore = create<RoomState & RoomActions>()((set, get) => ({
  ...INITIAL_STATE,

  enterRoom: (details) => set({ ...details, status: "connected", statusMessage: null }),

  addParticipant: (participant) =>
    set((state) => ({
      participants: [
        ...state.participants.filter(
          (existing) => existing.participant_id !== participant.participant_id,
        ),
        participant,
      ],
    })),

  removeParticipant: (participantId) =>
    set((state) => {
      const remoteStreams = { ...state.remoteStreams };
      delete remoteStreams[participantId];
      const wasActiveSpeaker = state.activeSpeakerId === participantId;
      return {
        participants: state.participants.filter(
          (participant) => participant.participant_id !== participantId,
        ),
        remoteStreams,
        activeSpeakerId: wasActiveSpeaker ? null : state.activeSpeakerId,
      };
    }),

  updateParticipant: (participantId, changes) =>
    set((state) => ({
      participants: state.participants.map((participant) => {
        if (participant.participant_id !== participantId) {
          return participant;
        }
        return { ...participant, ...changes };
      }),
    })),

  setRemoteStream: (participantId, stream) =>
    set((state) => ({ remoteStreams: { ...state.remoteStreams, [participantId]: stream } })),

  clearRemoteStreams: () => set({ remoteStreams: {} }),

  setWaiting: (waiting) => set({ waiting }),

  setLocked: (isLocked) => set({ isLocked }),

  addChatMessage: (message) =>
    set((state) => {
      const isChatOpen = state.openPanel === "chat";
      return {
        chatMessages: [...state.chatMessages, message],
        unreadChatCount: isChatOpen ? 0 : state.unreadChatCount + 1,
      };
    }),

  setOpenPanel: (panel) =>
    set((state) => ({
      openPanel: panel,
      // Opening the chat counts as reading it.
      unreadChatCount: panel === "chat" ? 0 : state.unreadChatCount,
    })),

  addReaction: (participantId, emoji) => {
    const reaction = { id: nextReactionId++, participantId, emoji };
    set((state) => ({ reactions: [...state.reactions, reaction] }));
    setTimeout(() => {
      set((state) => ({ reactions: state.reactions.filter((shown) => shown.id !== reaction.id) }));
    }, REACTION_SHOW_MS);
  },

  setStatus: (status, statusMessage) => set({ status, statusMessage: statusMessage ?? null }),

  setLayout: (layout) => set({ layout }),

  setActiveSpeaker: (participantId) => set({ activeSpeakerId: participantId }),

  setMicOn: (isMicOn) => set({ isMicOn }),

  setCameraOn: (isCameraOn) => set({ isCameraOn }),

  setScreenTrack: (track) => set({ screenTrack: track }),

  /**
   * The one place a screen share ends, whoever ends it: the Share button, the browser's
   * own "Stop sharing" bar, or the server refusing the share.
   */
  stopScreenShare: () => {
    get().screenTrack?.stop();
    set({ screenTrack: null });
  },

  setCameraId: (cameraId) => set({ cameraId }),

  setMicrophoneId: (microphoneId) => set({ microphoneId }),

  setSpeakerId: (speakerId) => set({ speakerId }),

  reset: (myMedia) => set({ ...INITIAL_STATE, ...myMedia }),
}));
