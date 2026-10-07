/**
 * Sharing my screen.
 *
 *   Start: the browser's own picker (getDisplayMedia) → the chosen screen goes into the
 *          room store → lib/roomConnection.ts sends it through the *video* slot of every
 *          peer connection instead of my camera (replaceTrack: no renegotiation) → the
 *          server is told, checks I'm allowed, and tells everyone (D-071).
 *   Stop:  our Stop button, the browser's "Stop sharing" bar, or the server saying no.
 *          All three end up in the store's stopScreenShare, and the camera comes back.
 */

import { useEffect } from "react";

import type { RoomActions } from "@/hooks/useRoomConnection";
import { useRoomStore } from "@/stores/roomStore";

/** Phones and some browsers can't share a screen; the Share button is then disabled. */
export function canBrowserShareScreen(): boolean {
  return typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

export function useScreenShare(actions: RoomActions) {
  const screenTrack = useRoomStore((state) => state.screenTrack);

  // Leaving the room page ends any share, so the browser stops capturing the screen.
  useEffect(() => {
    return () => useRoomStore.getState().stopScreenShare();
  }, []);

  async function startSharing() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      return; // the person closed the picker, or the browser said no
    }
    const track = stream.getVideoTracks()[0];
    if (track === undefined) {
      return;
    }
    // Chrome's own "Stop sharing" bar ends the track: treat it like our Stop button.
    track.addEventListener("ended", stopSharing);
    useRoomStore.getState().setScreenTrack(track);
    actions.startScreenShare();
  }

  function stopSharing() {
    if (useRoomStore.getState().screenTrack === null) {
      return;
    }
    useRoomStore.getState().stopScreenShare();
    actions.send({ type: "stop_screen_share" });
  }

  return { screenTrack, startSharing, stopSharing };
}
