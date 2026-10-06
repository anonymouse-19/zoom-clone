/**
 * The "join ticket" handed from the pre-join screen (or the dashboard's Start) to the
 * meeting room: who we joined as, the secret session token, and the mic/camera choices.
 *
 * Stored in sessionStorage, which is per browser *tab*: two tabs on the same meeting are
 * two separate participants, each with its own ticket. A refresh keeps the ticket, so the
 * room can reconnect. Closing the tab forgets it.
 *
 * Called by: hooks/useMeetingActions.ts (host Start) and components/prejoin/PrejoinScreen.tsx
 * (write); the meeting room (read).
 */

import type { ParticipantRole, ParticipantStatus } from "@/lib/api";

export type MeetingSession = {
  meetingCode: string;
  participantId: number;
  sessionToken: string;
  displayName: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  isMicOn: boolean;
  isCameraOn: boolean;
  /** Chosen on the pre-join screen; empty string = the browser's default device. */
  cameraId: string;
  microphoneId: string;
  speakerId: string;
};

function storageKey(meetingCode: string): string {
  return `zoom-clone:meeting-session:${meetingCode}`;
}

export function saveMeetingSession(session: MeetingSession): void {
  try {
    window.sessionStorage.setItem(storageKey(session.meetingCode), JSON.stringify(session));
  } catch {
    // Storage blocked: the room will send the user back to the pre-join screen.
  }
}

export function loadMeetingSession(meetingCode: string): MeetingSession | null {
  try {
    const saved = window.sessionStorage.getItem(storageKey(meetingCode));
    return saved === null ? null : (JSON.parse(saved) as MeetingSession);
  } catch {
    return null;
  }
}

export function clearMeetingSession(meetingCode: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(meetingCode));
  } catch {
    // Nothing to clear.
  }
}
